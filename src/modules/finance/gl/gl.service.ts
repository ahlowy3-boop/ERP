import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection, Types } from 'mongoose';
import { JournalEntryModelName } from '../../billing/invoices/entities/billing.model';
import { ChartOfAccountModelName } from '../entities/coa.model';

@Injectable()
export class GlService {
  private readonly logger = new Logger(GlService.name);

  constructor(
    @InjectModel(JournalEntryModelName) private readonly journalEntryModel: Model<any>,
    @InjectModel(ChartOfAccountModelName) private readonly coaModel: Model<any>,
    @InjectConnection() private readonly connection: Connection
  ) {}

  private async nextJENumber(session?: any): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `JE-${year}-`;
    
    for (let i = 0; i < 5; i++) {
        const lastEntry = await this.journalEntryModel.findOne({ journalNumber: { $regex: `^${prefix}` } }, {}, { sort: { journalNumber: -1 }, session });
        let nextNum = 1;
        if (lastEntry && lastEntry.journalNumber) {
            const parts = lastEntry.journalNumber.split('-');
            if (parts.length === 3) {
                nextNum = parseInt(parts[2], 10) + 1;
            }
        }
        const journalNumber = `${prefix}${nextNum.toString().padStart(4, '0')}`;
        
        const exists = await this.journalEntryModel.exists({ journalNumber }).session(session);
        if (!exists) {
            return journalNumber;
        }
    }
    throw new Error('Could not generate unique Journal Entry number');
  }

  async findAll(query: { status?: string; dateFrom?: string; dateTo?: string; reference?: string; accountCode?: string; page?: number; limit?: number }) {
    const filter: any = {};
    if (query.status) filter.status = query.status;
    if (query.reference) filter.reference = { $regex: query.reference, $options: 'i' };
    if (query.dateFrom || query.dateTo) {
      filter.date = {};
      if (query.dateFrom) filter.date.$gte = new Date(query.dateFrom);
      if (query.dateTo) filter.date.$lte = new Date(query.dateTo);
    }
    if (query.accountCode) {
      filter['lines.accountCode'] = query.accountCode;
    }

    const page = query.page ? Number(query.page) : 1;
    const limit = query.limit ? Number(query.limit) : 10;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.journalEntryModel.find(filter).sort({ date: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.journalEntryModel.countDocuments(filter)
    ]);

    return { data, total, page };
  }

  async findOne(id: string) {
    const entry = await this.journalEntryModel.findById(id).lean();
    if (!entry) throw new NotFoundException('Journal entry not found');
    return entry;
  }

  async createManual(dto: { date: string; reference?: string; description: string; lines: { accountCode: string; accountName: string; debit: number; credit: number; description?: string; projectCode?: string; costCenterCode?: string }[] }, userId: string) {
    if (!dto.lines || dto.lines.length < 2) {
      throw new BadRequestException('Journal entry must have at least 2 lines');
    }

    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      let totalDebit = 0;
      let totalCredit = 0;
      const formattedLines: any[] = [];

      for (const line of dto.lines) {
        const account = await this.coaModel.findOne({ code: line.accountCode }).session(session);
        if (!account) throw new BadRequestException(`Account ${line.accountCode} not found`);
        if (!account.isActive) throw new BadRequestException(`Account ${line.accountCode} is not active`);

        if (line.debit > 0) {
          totalDebit += line.debit;
          formattedLines.push({
            accountCode: line.accountCode,
            accountName: line.accountName || account.name,
            type: 'Debit',
            amount: line.debit,
            costCenterCode: line.costCenterCode,
            notes: line.description
          });
        }
        if (line.credit > 0) {
          totalCredit += line.credit;
          formattedLines.push({
            accountCode: line.accountCode,
            accountName: line.accountName || account.name,
            type: 'Credit',
            amount: line.credit,
            costCenterCode: line.costCenterCode,
            notes: line.description
          });
        }
      }

      if (totalDebit !== totalCredit) {
        throw new BadRequestException(`Total Debit (${totalDebit}) must equal Total Credit (${totalCredit})`);
      }
      if (totalDebit <= 0) {
        throw new BadRequestException('Total amount must be greater than 0');
      }

      const journalNumber = await this.nextJENumber(session);

      const entry = new this.journalEntryModel({
        journalNumber,
        date: dto.date,
        reference: dto.reference,
        description: dto.description,
        sourceType: 'Manual',
        status: 'Posted',
        lines: formattedLines,
        createdBy: userId
      });

      await entry.save({ session });

      for (const line of formattedLines) {
        const account = await this.coaModel.findOne({ code: line.accountCode }).session(session);
        let balanceChange = 0;
        
        if (['Asset', 'Expense'].includes(account.type)) {
          balanceChange = line.type === 'Debit' ? line.amount : -line.amount;
        } else {
          balanceChange = line.type === 'Credit' ? line.amount : -line.amount;
        }

        await this.coaModel.updateOne(
          { code: line.accountCode },
          { $inc: { balance: balanceChange } },
          { session }
        );
      }

      await session.commitTransaction();
      return { message: 'Journal entry created successfully', data: entry };
    } catch (error) {
      await session.abortTransaction();
      this.logger.error('Error creating manual journal entry', error);
      throw error;
    } finally {
      session.endSession();
    }
  }

  async voidEntry(id: string, userId: string) {
    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      const original = await this.journalEntryModel.findById(id).session(session);
      if (!original) throw new NotFoundException('Journal entry not found');
      if (original.status !== 'Posted') throw new BadRequestException('Only posted entries can be voided');

      original.status = 'Voided';
      await original.save({ session });

      const reversalLines = original.lines.map(line => ({
        ...line.toObject(),
        type: line.type === 'Debit' ? 'Credit' : 'Debit'
      }));

      const journalNumber = await this.nextJENumber(session);

      const reversalEntry = new this.journalEntryModel({
        journalNumber,
        date: new Date(),
        reference: `VOID-${original.journalNumber}`,
        description: `Reversal of ${original.journalNumber}`,
        sourceType: 'Adjustment',
        status: 'Posted',
        lines: reversalLines,
        createdBy: userId
      });

      await reversalEntry.save({ session });

      for (const line of reversalLines) {
        const account = await this.coaModel.findOne({ code: line.accountCode }).session(session);
        if (account) {
            let balanceChange = 0;
            if (['Asset', 'Expense'].includes(account.type)) {
            balanceChange = line.type === 'Debit' ? line.amount : -line.amount;
            } else {
            balanceChange = line.type === 'Credit' ? line.amount : -line.amount;
            }

            await this.coaModel.updateOne(
            { code: line.accountCode },
            { $inc: { balance: balanceChange } },
            { session }
            );
        }
      }

      await session.commitTransaction();
      return { message: 'Journal entry voided successfully', data: original, reversalEntry };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async autoPost(data: { date: Date; reference: string; description: string; sourceType: string; sourceId?: string; lines: { accountCode: string; accountName: string; type: 'Debit' | 'Credit'; amount: number; costCenterCode?: string; notes?: string }[]; userId?: string }) {
    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      const journalNumber = await this.nextJENumber(session);

      const entry = new this.journalEntryModel({
        journalNumber,
        date: data.date,
        reference: data.reference,
        description: data.description,
        sourceType: data.sourceType,
        sourceId: data.sourceId,
        status: 'Posted',
        lines: data.lines,
        createdBy: data.userId
      });

      await entry.save({ session });

      for (const line of data.lines) {
        const account = await this.coaModel.findOne({ code: line.accountCode }).session(session);
        if (account) {
            let balanceChange = 0;
            if (['Asset', 'Expense'].includes(account.type)) {
            balanceChange = line.type === 'Debit' ? line.amount : -line.amount;
            } else {
            balanceChange = line.type === 'Credit' ? line.amount : -line.amount;
            }

            await this.coaModel.updateOne(
            { code: line.accountCode },
            { $inc: { balance: balanceChange } },
            { session }
            );
        }
      }

      await session.commitTransaction();
      return entry;
    } catch (error) {
      await session.abortTransaction();
      this.logger.error('Error auto-posting journal entry', error);
      throw error;
    } finally {
      session.endSession();
    }
  }

  async getLedgerAccounts(query: { accountCode?: string; dateFrom?: string; dateTo?: string; costCenterCode?: string; page?: number; limit?: number }) {
    const { accountCode, dateFrom, dateTo, costCenterCode, page = 1, limit = 20 } = query;
    const dateFilter: any = {};
    if (dateFrom) dateFilter.$gte = new Date(dateFrom);
    if (dateTo) dateFilter.$lte = new Date(dateTo);
    const lineFilter: any = {};
    if (accountCode) lineFilter['lines.accountCode'] = accountCode;
    if (costCenterCode) lineFilter['lines.costCenterCode'] = costCenterCode;
    if (Object.keys(dateFilter).length) lineFilter.date = dateFilter;
    const entries = await this.journalEntryModel.find({ status: 'Posted', ...lineFilter }).sort({ date: -1 }).lean();
    const accountMap = new Map<string, any>();
    for (const entry of entries) {
      for (const line of (entry as any).lines || []) {
        if (accountCode && line.accountCode !== accountCode) continue;
        const key = line.accountCode;
        if (!accountMap.has(key)) {
          accountMap.set(key, {
            accountCode: key,
            accountName: line.accountName,
            type: '',
            openingBalance: 0,
            totalDebit: 0,
            totalCredit: 0,
            closingBalance: 0,
            lines: [],
          });
        }
        const acc = accountMap.get(key);
        const isDebit = line.type === 'Debit';
        if (isDebit) acc.totalDebit += line.amount;
        else acc.totalCredit += line.amount;
        acc.lines.push({
          date: (entry as any).date,
          journalNumber: (entry as any).journalNumber,
          description: `${(entry as any).description || ''} — ${(entry as any).reference || ''}`.trim(),
          debit: isDebit ? line.amount : 0,
          credit: isDebit ? 0 : line.amount,
          costCenterCode: line.costCenterCode,
          projectCode: line.projectCode,
        });
      }
    }
    const result = Array.from(accountMap.values());
    for (const acc of result) {
      acc.closingBalance = acc.openingBalance + acc.totalDebit - acc.totalCredit;
      let running = acc.openingBalance;
      for (const line of acc.lines) {
        running += line.debit - line.credit;
        line.runningBalance = running;
      }
    }
    const total = result.length;
    const skip = (Number(page) - 1) * Number(limit);
    return { data: result.slice(skip, skip + Number(limit)), total, page: Number(page) };
  }
}
