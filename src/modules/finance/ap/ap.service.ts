import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection } from 'mongoose';
import { SupplierInvoiceModelName, PaymentVoucherModelName } from '../entities/ap.model';
import { JournalEntryModelName } from '../../billing/invoices/entities/billing.model';
import { BankAccountModelName, CashAccountModelName } from '../entities/cash-bank.model';
import { ChartOfAccountModelName } from '../entities/coa.model';

@Injectable()
export class ApService {
  private readonly logger = new Logger(ApService.name);

  constructor(
    @InjectModel(SupplierInvoiceModelName) private supplierInvoiceModel: Model<any>,
    @InjectModel(PaymentVoucherModelName) private paymentVoucherModel: Model<any>,
    @InjectModel(JournalEntryModelName) private journalEntryModel: Model<any>,
    @InjectModel(BankAccountModelName) private bankAccountModel: Model<any>,
    @InjectModel(CashAccountModelName) private cashAccountModel: Model<any>,
    @InjectModel(ChartOfAccountModelName) private coaModel: Model<any>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  private async nextNumber(model: Model<any>, field: string, prefix: string, session?: any): Promise<string> {
    const year = new Date().getFullYear();
    for (let i = 0; i < 5; i++) {
      const count = await model.countDocuments({}, { session });
      const nextNum = count + 1 + i;
      const id = `${prefix}-${year}-${nextNum.toString().padStart(4, '0')}`;
      const existing = await model.findOne({ [field]: id }, null, { session });
      if (!existing) return id;
    }
    throw new BadRequestException(`Could not generate next number for ${prefix}`);
  }

  private async nextJENumber(session?: any): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `JE-${year}-`;
    for (let i = 0; i < 5; i++) {
      const last = await this.journalEntryModel.findOne(
        { journalNumber: { $regex: `^${prefix}` } },
        {},
        { sort: { journalNumber: -1 }, session }
      );
      let nextNum = 1;
      if (last?.journalNumber) {
        const parts = last.journalNumber.split('-');
        if (parts.length === 3) nextNum = parseInt(parts[2], 10) + 1;
      }
      const journalNumber = `${prefix}${nextNum.toString().padStart(4, '0')}`;
      const exists = await this.journalEntryModel.exists({ journalNumber }).session?.(session);
      if (!exists) return journalNumber;
    }
    throw new Error('Could not generate unique JE number');
  }

  // ─── AP Invoices ──────────────────────────────────────────────────────────

  async findAllInvoices(query: {
    status?: string; vendorId?: string; search?: string;
    dateFrom?: string; dateTo?: string; page?: number; limit?: number;
  }) {
    const filter: any = {};
    if (query.status) filter.status = query.status;
    if (query.vendorId) filter.vendorId = query.vendorId;
    if (query.search) {
      filter.$or = [
        { invoiceNumber: { $regex: query.search, $options: 'i' } },
        { vendorName:    { $regex: query.search, $options: 'i' } },
        { poNumber:      { $regex: query.search, $options: 'i' } },
      ];
    }
    if (query.dateFrom || query.dateTo) {
      filter.invoiceDate = {};
      if (query.dateFrom) filter.invoiceDate.$gte = new Date(query.dateFrom);
      if (query.dateTo)   filter.invoiceDate.$lte = new Date(query.dateTo);
    }

    const page  = query.page  ? Number(query.page)  : 1;
    const limit = query.limit ? Number(query.limit) : 10;
    const skip  = (page - 1) * limit;

    const [data, allInvoices] = await Promise.all([
      this.supplierInvoiceModel.find(filter).sort({ invoiceDate: -1 }).skip(skip).limit(limit).lean(),
      this.supplierInvoiceModel.find(filter).lean(),
    ]);

    const today = new Date();
    const totalOutstanding = allInvoices
      .filter(i => i.status !== 'Paid' && i.status !== 'Cancelled')
      .reduce((s, i) => s + (i.balanceDue || 0), 0);
    const totalPaid       = allInvoices.reduce((s, i) => s + (i.paidAmount || 0), 0);
    const overdueCount    = allInvoices.filter(i =>
      new Date(i.dueDate) < today && (i.status === 'Unpaid' || i.status === 'Partially Paid')
    ).length;
    const activeVendors   = new Set(allInvoices.map(i => i.vendorId?.toString()).filter(Boolean));

    return {
      data,
      kpis: { totalOutstanding, totalPaid, overdueCount, activeVendorCount: activeVendors.size },
    };
  }

  async createInvoice(dto: any, userId: string) {
    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      const subTotal    = dto.subTotal   || 0;
      const taxAmount   = dto.taxAmount  || 0;
      const totalAmount = subTotal + taxAmount;

      let invoiceNumber = dto.invoiceNumber;
      if (!invoiceNumber) {
        invoiceNumber = await this.nextNumber(this.supplierInvoiceModel, 'invoiceNumber', 'SINV', session);
      }

      const invoice = new this.supplierInvoiceModel({
        ...dto,
        invoiceNumber,
        totalAmount,
        balanceDue: totalAmount,
        paidAmount: 0,
        status: 'Unpaid',
        createdBy: userId,
      });
      await invoice.save({ session });

      // ── Auto-post GL ────────────────────────────────────────────────────
      // DR chargeAccount (expense)  = subTotal
      // DR 215000 (VAT Receivable)  = taxAmount  (input VAT is an asset)
      // CR 211000 (A/P)             = totalAmount
      const chargeAccountCode = dto.chargeAccountCode || '521000';
      const glLines: any[] = [
        { accountCode: chargeAccountCode, accountName: 'Charge Account', type: 'Debit',  amount: subTotal   },
        { accountCode: '211000',          accountName: 'Accounts Payable (A/P)',  type: 'Credit', amount: totalAmount },
      ];
      if (taxAmount > 0) {
        glLines.splice(1, 0,
          { accountCode: '215000', accountName: 'VAT Receivable', type: 'Debit', amount: taxAmount }
        );
      }

      const journalNumber = await this.nextJENumber(session);
      const glEntry = new this.journalEntryModel({
        journalNumber,
        date: dto.invoiceDate ? new Date(dto.invoiceDate) : new Date(),
        reference: invoiceNumber,
        sourceType: 'AP_Invoice',
        description: `AP Invoice — ${dto.vendorName}`,
        status: 'Posted',
        totalDebit:  subTotal + taxAmount,
        totalCredit: totalAmount,
        lines: glLines,
        createdBy: userId,
      });
      await glEntry.save({ session });

      // ── Update COA balances ──────────────────────────────────────────────
      for (const line of glLines) {
        const inc = line.type === 'Debit' ? line.amount : -line.amount;
        await this.coaModel.updateOne({ code: line.accountCode }, { $inc: { balance: inc } }, { session });
      }

      // Save GL ref on invoice
      invoice.glEntryId     = glEntry._id;
      invoice.glEntryNumber = journalNumber;
      await invoice.save({ session });

      await session.commitTransaction();
      return { message: 'Invoice created successfully', data: invoice, glEntry };
    } catch (err: any) {
      await session.abortTransaction();
      this.logger.error('Error creating AP invoice', err);
      throw new BadRequestException(err.message);
    } finally {
      session.endSession();
    }
  }

  // ─── AP Aging ──────────────────────────────────────────────────────────────

  async getAging() {
    const invoices = await this.supplierInvoiceModel
      .find({ status: { $in: ['Unpaid', 'Partially Paid'] } })
      .lean();
    const today = new Date();
    const agingByVendor: Record<string, any> = {};

    for (const inv of invoices) {
      const key = inv.vendorId?.toString() || inv.vendorName || 'unknown';
      if (!agingByVendor[key]) {
        agingByVendor[key] = {
          vendorId:      inv.vendorId,
          vendorName:    inv.vendorName,
          totalDue:      0,
          current:       0,   // not yet due
          thirtyToSixty: 0,   // 30–60 days overdue
          sixtyToNinety: 0,   // 60–90 days overdue
          overNinety:    0,   // 90+ days overdue
        };
      }
      const v   = agingByVendor[key];
      const due = inv.balanceDue || 0;
      v.totalDue += due;

      const dueDate  = new Date(inv.dueDate);
      const diffDays = Math.ceil((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays <= 0)        v.current       += due;  // dueDate >= today
      else if (diffDays <= 60)  v.thirtyToSixty += due;  // 1–60 days (docs say 30-60)
      else if (diffDays <= 90)  v.sixtyToNinety += due;  // 61–90 days
      else                      v.overNinety    += due;  // 90+ days
    }

    return { data: Object.values(agingByVendor) };
  }

  // ─── Payment Vouchers ─────────────────────────────────────────────────────

  async findAllVouchers(query: { vendorId?: string; status?: string }) {
    const filter: any = {};
    if (query.vendorId) filter.vendorId = query.vendorId;
    if (query.status)   filter.status   = query.status;
    const data = await this.paymentVoucherModel.find(filter).sort({ paymentDate: -1 }).lean();
    return { data };
  }

  async createVoucher(dto: any, userId: string) {
    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      const amount = (dto.invoicesPaid || []).reduce((s: number, i: any) => s + (i.amountPaid || 0), 0);

      // Fetch bank / cash account
      let account: any;
      if (dto.paymentMethod === 'Cash') {
        account = await this.cashAccountModel.findById(dto.bankAccountId).session(session);
      } else {
        account = await this.bankAccountModel.findById(dto.bankAccountId).session(session);
      }
      if (!account) throw new NotFoundException('Bank/Cash account not found');

      if ((account.balance || 0) < amount) {
        throw new BadRequestException(
          JSON.stringify({ message: 'Insufficient balance in selected account', available: account.balance, required: amount })
        );
      }

      // Deduct from account
      account.balance -= amount;
      await account.save({ session });

      // Update each paid invoice
      for (const invPaid of (dto.invoicesPaid || [])) {
        const inv = await this.supplierInvoiceModel.findById(invPaid.invoiceId).session(session);
        if (inv) {
          inv.paidAmount = (inv.paidAmount || 0) + invPaid.amountPaid;
          inv.balanceDue = (inv.totalAmount || 0) - inv.paidAmount;
          inv.status = inv.balanceDue <= 0 ? 'Paid' : 'Partially Paid';
          await inv.save({ session });
        }
      }

      const voucherNumber = await this.nextNumber(this.paymentVoucherModel, 'voucherNumber', 'PV', session);

      const voucher = new this.paymentVoucherModel({
        ...dto,
        amount,
        voucherNumber,
        status: 'Posted',
        createdBy: userId,
      });
      await voucher.save({ session });

      // ── Auto-post GL ────────────────────────────────────────────────────
      // DR 211000 (A/P)              = amount
      // CR bankCOACode (111000 etc.) = amount
      const bankCoaCode = account.coaCode || '111000';
      const glLines: any[] = [
        { accountCode: '211000',    accountName: 'Accounts Payable (A/P)', type: 'Debit',  amount },
        { accountCode: bankCoaCode, accountName: account.bankName || 'Bank/Cash', type: 'Credit', amount },
      ];

      const journalNumber = await this.nextJENumber(session);
      const glEntry = new this.journalEntryModel({
        journalNumber,
        date: dto.paymentDate ? new Date(dto.paymentDate) : new Date(),
        reference: voucherNumber,
        sourceType: 'AP_Payment',
        description: `AP Payment — ${dto.vendorName}`,
        status: 'Posted',
        totalDebit:  amount,
        totalCredit: amount,
        lines: glLines,
        createdBy: userId,
      });
      await glEntry.save({ session });

      for (const line of glLines) {
        const inc = line.type === 'Debit' ? line.amount : -line.amount;
        await this.coaModel.updateOne({ code: line.accountCode }, { $inc: { balance: inc } }, { session });
      }

      voucher.glEntryId     = glEntry._id;
      voucher.glEntryNumber = journalNumber;
      await voucher.save({ session });

      await session.commitTransaction();
      return { message: 'Payment voucher posted successfully', data: voucher, glEntry };
    } catch (err: any) {
      await session.abortTransaction();
      this.logger.error('Error creating AP voucher', err);
      throw new BadRequestException(err.message);
    } finally {
      session.endSession();
    }
  }

  // ─── Approve Invoice ───────────────────────────────────────────────────────
  async approveInvoice(id: string, dto: { approvalNotes?: string }, userId: string) {
    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      const invoice = await this.supplierInvoiceModel.findById(id).session(session);
      if (!invoice) throw new NotFoundException('Invoice not found');
      if (!['Draft', 'Pending'].includes(invoice.status)) {
        throw new BadRequestException(`Invoice cannot be approved in status: ${invoice.status}`);
      }

      // Create GL Journal Entry
      // DR 520000 Purchases/Expense = subTotal
      // DR 215000 VAT Receivable = taxAmount
      // CR 210000 Accounts Payable = totalAmount
      const subTotal    = invoice.subTotal    || invoice.amount || 0;
      const taxAmount   = invoice.taxAmount   || invoice.vatAmount || 0;
      const totalAmount = invoice.totalAmount || (subTotal + taxAmount);

      const journalNumber = await this.nextJENumber(session);
      const [glEntry] = await this.journalEntryModel.create([{
        journalNumber,
        entryDate: new Date(),
        description: `AP Invoice Approval: ${invoice.invoiceNumber || id}`,
        reference: invoice.invoiceNumber || id,
        sourceType: 'APInvoice',
        sourceId: invoice._id,
        lines: [
          { accountCode: '520000', accountName: 'Purchases / Expense',  type: 'Debit',  amount: subTotal  },
          { accountCode: '215000', accountName: 'VAT Receivable',        type: 'Debit',  amount: taxAmount  },
          { accountCode: '210000', accountName: 'Accounts Payable',      type: 'Credit', amount: totalAmount },
        ],
        totalDebit:  +(subTotal + taxAmount).toFixed(2),
        totalCredit: +totalAmount.toFixed(2),
        status: 'Posted',
        createdBy: userId,
      }], { session });

      const updated = await this.supplierInvoiceModel.findByIdAndUpdate(
        id,
        {
          $set: {
            status: 'Approved',
            approvedBy: userId,
            approvedAt: new Date(),
            approvalNotes: dto.approvalNotes,
            glEntryId: glEntry._id,
            glEntryNumber: glEntry.journalNumber,
          },
        },
        { new: true, session },
      ).lean();

      await session.commitTransaction();
      this.logger.log(`AP Invoice ${invoice.invoiceNumber} approved by ${userId}`);
      return { ...updated, glEntry: { journalNumber: glEntry.journalNumber, _id: glEntry._id } };
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }

  // ─── Reject Invoice ────────────────────────────────────────────────────────
  async rejectInvoice(id: string, dto: { rejectionReason: string }, userId: string) {
    const invoice = await this.supplierInvoiceModel.findById(id);
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (!['Draft', 'Pending', 'Approved'].includes(invoice.status)) {
      throw new BadRequestException(`Invoice cannot be rejected in status: ${invoice.status}`);
    }
    if (!dto.rejectionReason) throw new BadRequestException('Rejection reason is required');

    const updated = await this.supplierInvoiceModel.findByIdAndUpdate(
      id,
      { $set: { status: 'Rejected', rejectionReason: dto.rejectionReason, rejectedBy: userId, rejectedAt: new Date() } },
      { new: true },
    ).lean();

    this.logger.log(`AP Invoice ${invoice.invoiceNumber} rejected by ${userId}`);
    return { status: 'Rejected', rejectionReason: dto.rejectionReason, data: updated };
  }
}
