import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection, Types } from 'mongoose';
import { BankAccountModelName, CashAccountModelName, BankReconciliationModelName, TreasuryTransferModelName } from '../entities/cash-bank.model';
import { PaymentVoucherModelName } from '../entities/ap.model';

@Injectable()
export class CashBankService {
  private readonly logger = new Logger(CashBankService.name);

  constructor(
    @InjectModel(BankAccountModelName) private bankAccountModel: Model<any>,
    @InjectModel(CashAccountModelName) private cashAccountModel: Model<any>,
    @InjectModel(BankReconciliationModelName) private bankReconciliationModel: Model<any>,
    @InjectModel(TreasuryTransferModelName) private treasuryTransferModel: Model<any>,
    @InjectModel(PaymentVoucherModelName) private paymentVoucherModel: Model<any>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async findAllBankAccounts() {
    const [bankAccounts, cashAccounts, pendingRecs] = await Promise.all([
      this.bankAccountModel.find().lean().exec(),
      this.cashAccountModel.find().lean().exec(),
      this.bankReconciliationModel.countDocuments({ status: 'Unreconciled' })
    ]);

    const bankBalance = bankAccounts.reduce((s, a) => s + (a.balance || 0), 0);
    const cashBalance = cashAccounts.reduce((s, a) => s + (a.balance || 0), 0);
    const totalBalance = bankBalance + cashBalance;
    const activeAccounts = bankAccounts.filter(a => a.status !== 'Inactive').length
                         + cashAccounts.filter(a => a.status !== 'Inactive').length;

    return {
      data: bankAccounts,
      kpis: {
        totalBalance,
        bankBalance,
        cashBalance,
        activeAccounts,
        pendingRecsCount: pendingRecs,
      }
    };
  }

  async createBankAccount(dto: any, userId: string) {
    const newAccount = new this.bankAccountModel({
      ...dto,
      createdBy: userId
    });
    await newAccount.save();
    return { message: 'Bank account created successfully', data: newAccount };
  }

  async findAllCashAccounts() {
    const data = await this.cashAccountModel.find().exec();
    return { data };
  }

  async createCashAccount(dto: any, userId: string) {
    const newAccount = new this.cashAccountModel({
      ...dto,
      createdBy: userId
    });
    await newAccount.save();
    return { message: 'Cash account created successfully', data: newAccount };
  }

  async findAllReconciliations(query: { bankAccountId?: string }) {
    const filter: any = {};
    if (query.bankAccountId) filter.bankAccountId = query.bankAccountId;
    const data = await this.bankReconciliationModel.find(filter).exec();
    return { data };
  }

  async createReconciliation(dto: any, userId: string) {
    const bankAccount = await this.bankAccountModel.findById(dto.bankAccountId);
    if (!bankAccount) throw new NotFoundException('Bank account not found');

    const bookBalance = bankAccount.balance || 0;
    const statementBalance = dto.statementBalance || 0;
    const difference = Math.abs(bookBalance - statementBalance);

    const status = difference < 0.01 ? 'Reconciled' : 'Unreconciled';
    
    const recData: any = {
      ...dto,
      bookBalance,
      difference,
      status,
      createdBy: userId
    };

    if (status === 'Reconciled') {
      recData.reconciledDate = new Date();
      recData.reconciledBy = userId;
    }

    const reconciliation = new this.bankReconciliationModel(recData);
    await reconciliation.save();

    return {
      message: 'Reconciliation processed',
      data: reconciliation,
      status,
      difference
    };
  }

  async updateBankBalance(id: string, dto: { operation: 'credit'|'debit', amount: number, reference?: string }) {
    const account = await this.bankAccountModel.findById(id);
    if (!account) throw new NotFoundException('Bank account not found');

    if (dto.operation === 'debit' && account.balance < dto.amount) {
      throw new BadRequestException('Insufficient balance for debit operation');
    }

    if (dto.operation === 'credit') {
      account.balance += dto.amount;
    } else if (dto.operation === 'debit') {
      account.balance -= dto.amount;
    }

    await account.save();
    return { message: 'Balance updated successfully', newBalance: account.balance };
  }

  // ─── Treasury Transfers ───────────────────────────────────────────────────
  private async nextTransferNumber(session?: any): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `TRF-${year}-`;
    for (let i = 0; i < 5; i++) {
      const last = await this.treasuryTransferModel.findOne(
        { transferNumber: { $regex: `^${prefix}` } },
        null, { session, sort: { transferNumber: -1 } }
      ).lean();
      const lastNum = last ? parseInt((last as any).transferNumber.split('-')[2], 10) : 0;
      const next = `${prefix}${(lastNum + 1 + i).toString().padStart(4, '0')}`;
      const exists = await this.treasuryTransferModel.findOne({ transferNumber: next }, null, { session });
      if (!exists) return next;
    }
    throw new BadRequestException('Could not generate transfer number');
  }

  async findAllTransfers(query: { status?: string; branchId?: string; dateFrom?: string; dateTo?: string; page?: number; limit?: number }) {
    const { status, branchId, dateFrom, dateTo, page = 1, limit = 20 } = query;
    const filter: any = {};
    if (status) filter.status = status;
    if (branchId) filter.branchId = branchId;
    if (dateFrom || dateTo) {
      filter.transferDate = {};
      if (dateFrom) filter.transferDate.$gte = new Date(dateFrom);
      if (dateTo) filter.transferDate.$lte = new Date(dateTo);
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
      this.treasuryTransferModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      this.treasuryTransferModel.countDocuments(filter),
    ]);
    const kpis = {
      totalDraft: await this.treasuryTransferModel.countDocuments({ status: 'Draft' }),
      totalApproved: await this.treasuryTransferModel.countDocuments({ status: 'Approved' }),
      totalExecuted: await this.treasuryTransferModel.countDocuments({ status: 'Executed' }),
    };
    return { data: data.map(d => ({ ...d, id: (d as any)._id?.toString() })), kpis, total, page: Number(page) };
  }

  async createTransfer(dto: any, userId: string) {
    if (dto.fromAccountId === dto.toAccountId) throw new BadRequestException('From and To accounts must be different');
    if (dto.amount <= 0) throw new BadRequestException('Amount must be greater than 0');
    const transferNumber = await this.nextTransferNumber();
    let fromAccountName = '';
    let toAccountName = '';
    if (dto.fromAccountType === 'Bank') {
      const acc = await this.bankAccountModel.findById(dto.fromAccountId).lean();
      fromAccountName = acc ? `${(acc as any).bankName} — ${(acc as any).currency}` : '';
      if (acc && (acc as any).balance < dto.amount) throw new BadRequestException('Insufficient balance in source account');
    } else {
      const acc = await this.cashAccountModel.findById(dto.fromAccountId).lean();
      fromAccountName = acc ? `${(acc as any).officeLocation} Cash Box` : '';
      if (acc && (acc as any).balance < dto.amount) throw new BadRequestException('Insufficient balance in source account');
    }
    if (dto.toAccountType === 'Bank') {
      const acc = await this.bankAccountModel.findById(dto.toAccountId).lean();
      toAccountName = acc ? `${(acc as any).bankName} — ${(acc as any).currency}` : '';
    } else {
      const acc = await this.cashAccountModel.findById(dto.toAccountId).lean();
      toAccountName = acc ? `${(acc as any).officeLocation} Cash Box` : '';
    }
    const transfer = await this.treasuryTransferModel.create({
      ...dto, transferNumber, fromAccountName, toAccountName, createdBy: userId,
    });
    return { ...transfer.toObject(), id: transfer._id?.toString() };
  }

  async approveTransfer(id: string, dto: { approverName?: string; comments?: string }, userId: string) {
    const transfer = await this.treasuryTransferModel.findById(id);
    if (!transfer) throw new NotFoundException('Transfer not found');
    if (transfer.status !== 'Draft') throw new BadRequestException('Only Draft transfers can be approved');
    const updated = await this.treasuryTransferModel.findByIdAndUpdate(
      id,
      { $set: { status: 'Approved', approvedBy: dto?.approverName || userId, approvedAt: new Date() } },
      { new: true },
    ).lean();
    return { ...updated, id: (updated as any)?._id?.toString() };
  }

  async executeTransfer(id: string, userId: string) {
    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      const transfer = await this.treasuryTransferModel.findById(id).session(session);
      if (!transfer) throw new NotFoundException('Transfer not found');
      if (transfer.status !== 'Approved') throw new BadRequestException('Transfer must be Approved before executing');
      if (transfer.fromAccountType === 'Bank') {
        await this.bankAccountModel.findByIdAndUpdate(transfer.fromAccountId, { $inc: { balance: -transfer.amount } }, { session });
      } else {
        await this.cashAccountModel.findByIdAndUpdate(transfer.fromAccountId, { $inc: { balance: -transfer.amount } }, { session });
      }
      if (transfer.toAccountType === 'Bank') {
        await this.bankAccountModel.findByIdAndUpdate(transfer.toAccountId, { $inc: { balance: transfer.amount } }, { session });
      } else {
        await this.cashAccountModel.findByIdAndUpdate(transfer.toAccountId, { $inc: { balance: transfer.amount } }, { session });
      }
      const updated = await this.treasuryTransferModel.findByIdAndUpdate(
        id,
        { $set: { status: 'Executed', executedBy: userId, executedAt: new Date() } },
        { new: true, session },
      ).lean();
      await session.commitTransaction();
      return { ...updated, id: (updated as any)?._id?.toString() };
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }

  async cancelTransfer(id: string) {
    const transfer = await this.treasuryTransferModel.findById(id);
    if (!transfer) throw new NotFoundException('Transfer not found');
    if (transfer.status !== 'Draft') throw new BadRequestException('Only Draft transfers can be cancelled');
    const updated = await this.treasuryTransferModel.findByIdAndUpdate(id, { $set: { status: 'Cancelled' } }, { new: true }).lean();
    return { ...updated, id: (updated as any)?._id?.toString() };
  }

  // ─── Account Movements ─────────────────────────────────────────────────────
  async getBankAccountMovements(id: string, query: { dateFrom?: string; dateTo?: string; page?: number; limit?: number }) {
    const { dateFrom, dateTo, page = 1, limit = 20 } = query;
    const account = await this.bankAccountModel.findById(id).lean();
    if (!account) throw new NotFoundException('Bank account not found');
    const dateFilter: any = {};
    if (dateFrom) dateFilter.$gte = new Date(dateFrom);
    if (dateTo) dateFilter.$lte = new Date(dateTo);
    const movements: any[] = [];
    const paymentFilter: any = { bankAccountId: (account as any)._id };
    if (dateFrom || dateTo) paymentFilter.paymentDate = dateFilter;
    const payments = await this.paymentVoucherModel.find(paymentFilter).lean();
    for (const p of payments) {
      movements.push({
        id: (p as any)._id?.toString(), _id: (p as any)._id?.toString(),
        date: (p as any).paymentDate, type: 'Payment',
        reference: (p as any).voucherNumber || (p as any).referenceNumber,
        description: `Supplier Payment — ${(p as any).vendorName}`,
        debit: 0, credit: (p as any).amount,
      });
    }
    const total = movements.length;
    const openingBalance = (account as any).balance + movements.reduce((s, m) => s + (m.credit - m.debit), 0);
    const skip = (Number(page) - 1) * Number(limit);
    const paged = movements.slice(skip, skip + Number(limit));
    let running = openingBalance;
    for (const m of paged) { running = running + m.debit - m.credit; m.runningBalance = running; }
    return {
      data: paged,
      openingBalance,
      closingBalance: (account as any).balance,
      totalDebit: movements.reduce((s, m) => s + m.debit, 0),
      totalCredit: movements.reduce((s, m) => s + m.credit, 0),
      total, page: Number(page),
    };
  }

  async getCashAccountMovements(id: string, query: { dateFrom?: string; dateTo?: string; page?: number; limit?: number }) {
    const { page = 1, limit = 20 } = query;
    const account = await this.cashAccountModel.findById(id).lean();
    if (!account) throw new NotFoundException('Cash account not found');
    return {
      data: [], openingBalance: (account as any).balance, closingBalance: (account as any).balance,
      totalDebit: 0, totalCredit: 0, total: 0, page: Number(page),
    };
  }
}
