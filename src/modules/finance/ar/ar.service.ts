import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection, Types } from 'mongoose';
import { SalesInvoiceModelName, JournalEntryModelName } from '../../billing/invoices/entities/billing.model';
import { CollectionVoucherModelName } from '../entities/budget.model';
import { BankAccountModelName, CashAccountModelName } from '../entities/cash-bank.model';
import { ChartOfAccountModelName } from '../entities/coa.model';
import { ArCustomerModelName } from '../entities/ap.model';

@Injectable()
export class ArService {
  private readonly logger = new Logger(ArService.name);

  constructor(
    @InjectModel(SalesInvoiceModelName) private salesInvoiceModel: Model<any>,
    @InjectModel(CollectionVoucherModelName) private collectionVoucherModel: Model<any>,
    @InjectModel(JournalEntryModelName) private journalEntryModel: Model<any>,
    @InjectModel(BankAccountModelName) private bankAccountModel: Model<any>,
    @InjectModel(CashAccountModelName) private cashAccountModel: Model<any>,
    @InjectModel(ChartOfAccountModelName) private coaModel: Model<any>,
    @InjectModel(ArCustomerModelName) private arCustomerModel: Model<any>,
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
    const year   = new Date().getFullYear();
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

  async findAllInvoices(query: { status?: string; clientName?: string; search?: string; page?: number; limit?: number }) {
    const filter: any = {};
    if (query.status) filter.status = query.status;
    if (query.clientName) filter.clientName = query.clientName;
    if (query.search) {
      filter.$or = [
        { invoiceNumber: { $regex: query.search, $options: 'i' } },
        { clientName: { $regex: query.search, $options: 'i' } }
      ];
    }

    const page = query.page ? Number(query.page) : 1;
    const limit = query.limit ? Number(query.limit) : 10;
    const skip = (page - 1) * limit;

    const [data, allInvoices] = await Promise.all([
      this.salesInvoiceModel.find(filter).skip(skip).limit(limit).exec(),
      this.salesInvoiceModel.find(filter).exec()
    ]);

    const totalOutstanding = allInvoices.reduce((sum, i) => sum + (i.balanceDue || 0), 0);
    const totalCollected = allInvoices.reduce((sum, i) => sum + (i.totalCollected || 0), 0);
    const today = new Date();
    const overdueCount = allInvoices.filter(i => 
      new Date(i.dueDate) < today && i.status !== 'Paid' && i.status !== 'Cancelled'
    ).length;
    const activeClients = new Set(allInvoices.map(i => i.clientName).filter(Boolean));

    return {
      data,
      kpis: {
        totalOutstanding,
        totalCollected,
        overdueCount,
        totalClients: activeClients.size
      }
    };
  }

  async getAging() {
    const invoices = await this.salesInvoiceModel.find({ status: { $nin: ['Paid', 'Cancelled'] } }).exec();
    const today = new Date();
    const agingByClient: Record<string, any> = {};

    invoices.forEach(inv => {
      const client = inv.clientName || 'unknown';
      if (!agingByClient[client]) {
        agingByClient[client] = {
          clientName: client,
          totalDue: 0,
          current: 0,
          thirtyToSixty: 0,
          sixtyToNinety: 0,
          overNinety: 0
        };
      }
      
      const c = agingByClient[client];
      const due = inv.balanceDue || 0;
      c.totalDue += due;

      const dueDate = new Date(inv.dueDate);
      const diffTime = today.getTime() - dueDate.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays <= 0) {
        c.current += due;       // Not yet due
      } else if (diffDays <= 30) {
        c.thirtyToSixty += due; // 1–30 days overdue
      } else if (diffDays <= 60) {
        c.sixtyToNinety += due; // 31–60 days overdue
      } else {
        c.overNinety += due;    // 61+ days overdue
      }
    });

    return { data: Object.values(agingByClient) };
  }

  async findAllCollectionVouchers(query: { page?: number; limit?: number }) {
    const filter: any = {};
    const page = query.page ? Number(query.page) : 1;
    const limit = query.limit ? Number(query.limit) : 10;
    const skip = (page - 1) * limit;

    const data = await this.collectionVoucherModel.find(filter).skip(skip).limit(limit).exec();
    return { data };
  }

  async createCollectionVoucher(dto: any, userId: string) {
    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      const amount = dto.invoicesCollected?.reduce((sum: number, inv: any) => sum + (inv.amountCollected || 0), 0) || 0;
      
      let account;
      if (dto.paymentMethod === 'Cash') {
        account = await this.cashAccountModel.findById(dto.bankAccountId).session(session);
      } else {
        account = await this.bankAccountModel.findById(dto.bankAccountId).session(session);
      }

      if (!account) throw new NotFoundException('Bank/Cash account not found');

      account.balance = (account.balance || 0) + amount;
      await account.save({ session });

      for (const invCol of (dto.invoicesCollected || [])) {
        const inv = await this.salesInvoiceModel.findById(invCol.invoiceId).session(session);
        if (inv) {
          inv.totalCollected = (inv.totalCollected || 0) + invCol.amountCollected;
          inv.balanceDue = (inv.netPayable || 0) - inv.totalCollected;
          
          if (inv.balanceDue <= 0) {
            inv.status = 'Paid';
          } else if (inv.totalCollected > 0) {
            inv.status = 'Partially Paid';
          }
          await inv.save({ session });
        }
      }

      const voucherNumber = await this.nextNumber(this.collectionVoucherModel, 'voucherNumber', 'CV', session);

      const voucher = new this.collectionVoucherModel({
        ...dto,
        amount,
        voucherNumber,
        status: 'Posted',
        createdBy: userId,
      });

      await voucher.save({ session });

      const bankCoaCode = account.coaCode || '111000';

      // Auto-post GL: DR bank coaCode, CR 121000 (A/R)
      const glLines = [
        { accountCode: bankCoaCode, accountName: account.bankName || 'Bank/Cash', type: 'Debit',  amount, notes: `Collection from ${dto.customerName}` },
        { accountCode: '121000',    accountName: 'Accounts Receivable (A/R)',     type: 'Credit', amount, notes: `Collection from ${dto.customerName}` },
      ];

      const journalNumber = await this.nextJENumber(session);
      const glEntry = new this.journalEntryModel({
        journalNumber,
        date:        dto.collectionDate ? new Date(dto.collectionDate) : new Date(),
        reference:   voucherNumber,
        sourceType:  'AR_Collection',
        description: `AR Collection from ${dto.customerName}`,
        totalDebit:  amount,
        totalCredit: amount,
        status:      'Posted',
        lines:       glLines,
        createdBy:   userId,
      });

      await glEntry.save({ session });

      // Update COA balances
      await this.coaModel.updateOne({ code: bankCoaCode }, { $inc: { balance: amount  } }, { session });
      await this.coaModel.updateOne({ code: '121000'   }, { $inc: { balance: -amount } }, { session });

      await session.commitTransaction();
      return { message: 'Collection voucher created successfully', data: voucher, glEntry };
    } catch (error: any) {
      await session.abortTransaction();
      this.logger.error('Error creating AR collection voucher', error);
      throw new BadRequestException(error.message);
    } finally {
      session.endSession();
    }
  }

  // ─── AR Customers ─────────────────────────────────────────────────────────
  async findAllCustomers(query: { status?: string; search?: string; slim?: boolean; page?: number; limit?: number }) {
    const { status, search, slim, page = 1, limit = 20 } = query;
    const filter: any = { isDeleted: false };
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { nameEn: { $regex: search, $options: 'i' } },
        { nameAr: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
      ];
    }
    const skip = (Number(page) - 1) * Number(limit);
    if (slim) {
      const data = await this.arCustomerModel.find(filter).select('code nameEn nameAr').lean();
      return { data: data.map(d => ({ ...d, id: (d as any)._id?.toString() })) };
    }
    const [data, total] = await Promise.all([
      this.arCustomerModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      this.arCustomerModel.countDocuments(filter),
    ]);
    return { data: data.map(d => ({ ...d, id: (d as any)._id?.toString() })), total, page: Number(page) };
  }

  async createCustomer(dto: any) {
    const count = await this.arCustomerModel.countDocuments();
    const code = `CUS-${(count + 1).toString().padStart(4, '0')}`;
    const customer = await this.arCustomerModel.create({ ...dto, code });
    return { ...customer.toObject(), id: customer._id?.toString() };
  }

  async updateCustomer(id: string, dto: any) {
    const updated = await this.arCustomerModel.findByIdAndUpdate(id, { $set: dto }, { new: true }).lean();
    if (!updated) throw new NotFoundException('Customer not found');
    return { ...updated, id: (updated as any)._id?.toString() };
  }

  async toggleCustomerStatus(id: string) {
    const customer = await this.arCustomerModel.findById(id);
    if (!customer) throw new NotFoundException('Customer not found');
    const newStatus = customer.status === 'Active' ? 'Inactive' : 'Active';
    await this.arCustomerModel.findByIdAndUpdate(id, { $set: { status: newStatus } });
    return { message: 'Status updated', status: newStatus };
  }

  async updateInvoiceStatus(id: string, dto: { status: string; comments?: string }, userId: string) {
    const invoice = await this.salesInvoiceModel.findById(id);
    if (!invoice) throw new NotFoundException('Invoice not found');
    const allowed = ['Draft', 'Sent', 'Cancelled'];
    if (!allowed.includes(dto.status)) throw new BadRequestException(`Status must be one of: ${allowed.join(', ')}`);
    const updated = await this.salesInvoiceModel.findByIdAndUpdate(id, { $set: { status: dto.status, statusComments: dto.comments } }, { new: true }).lean();
    return { ...updated, id: (updated as any)?._id?.toString() };
  }
}
