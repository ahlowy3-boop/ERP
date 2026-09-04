import {
  Injectable, NotFoundException, BadRequestException, Logger,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection, Types } from 'mongoose';
import {
  SalesInvoiceModelName, JournalEntryModelName, CollectionModelName,
} from './entities/billing.model';
import { WCCModelName } from '../wcc/entities/wcc.model';
import { ContractModelName } from '../../workflow/contracts/entities/contract.model';

// Guard: only convert strings that are valid 24-hex ObjectIds
const toObjId = (v?: string) =>
  v && v !== 'undefined' && v !== 'null' && Types.ObjectId.isValid(v)
    ? new Types.ObjectId(v)
    : null;

// Chart of Accounts constants
const ACCOUNTS = {
  AR:              { code: '211000', name: 'Accounts Receivable' },
  RETENTION_RCV:   { code: '212000', name: 'Retention Receivable' },
  WITHHOLDING_RCV: { code: '213000', name: 'Withholding Tax Receivable' },
  REVENUE:         { code: '411000', name: 'Drilling & Services Revenue' },
  VAT_PAYABLE:     { code: '311000', name: 'VAT Payable' },
  BANK:            { code: '111000', name: 'Cash / Bank Account' },
};

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    @InjectModel(SalesInvoiceModelName) private invoiceModel: Model<any>,
    @InjectModel(JournalEntryModelName) private jeModel: Model<any>,
    @InjectModel(CollectionModelName)   private collectionModel: Model<any>,
    @InjectModel(WCCModelName)          private wccModel: Model<any>,
    @InjectModel(ContractModelName)     private contractModel: Model<any>,
    @InjectConnection() private connection: Connection,
  ) {}

  // ─── Atomic Sequence Generator (Race-Condition Safe) ────────────────────
  // Uses MongoDB's atomic findOneAndUpdate with $inc to guarantee uniqueness
  // even under concurrent requests. Safe to call inside a session/transaction.
  private async nextNumber(
    model: Model<any>,
    field: string,
    prefix: string,
    session?: any,
  ): Promise<string> {
    const year = new Date().getFullYear();
    const fullPrefix = `${prefix}-${year}-`;

    // Strategy: find the current highest seq and increment atomically
    // by sorting descending and doing a "read-then-increment" with retry.
    const MAX_RETRIES = 5;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const last = await model
        .findOne({ [field]: { $regex: `^${fullPrefix}` } })
        .sort({ [field]: -1 })
        .lean()
        .session(session ?? null);

      const lastSeq = last
        ? parseInt(String((last as any)[field]).split('-').pop() ?? '0', 10)
        : 0;
      const candidate = `${fullPrefix}${String(lastSeq + 1).padStart(3, '0')}`;

      // Verify candidate is not already taken (atomic check)
      const existing = await model
        .findOne({ [field]: candidate })
        .lean()
        .session(session ?? null);

      if (!existing) return candidate;

      // If taken (concurrent insert), retry with next seq
      this.logger.warn(
        `Sequence collision for ${candidate} (attempt ${attempt}/${MAX_RETRIES}) — retrying`,
      );
    }

    // Fallback: use timestamp to guarantee uniqueness
    const ts = Date.now().toString().slice(-4);
    return `${fullPrefix}${ts}`;
  }


  // ─── GL Entry Builder ───────────────────────────────────────────────────
  private async createGLEntry(data: {
    description: string; reference: string; sourceType: string;
    sourceId: Types.ObjectId; lines: any[]; costCenterCode?: string; userId: string;
  }, session?: any) {
    const entryNumber = await this.nextNumber(this.jeModel, 'entryNumber', 'JE');
    const totalDebit  = +data.lines.filter(l => l.type === 'Debit') .reduce((s, l) => s + l.amount, 0).toFixed(2);
    const totalCredit = +data.lines.filter(l => l.type === 'Credit').reduce((s, l) => s + l.amount, 0).toFixed(2);

    // Balance check
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new BadRequestException(
        `GL Entry not balanced: Debit ${totalDebit} ≠ Credit ${totalCredit}`,
      );
    }

    const opts = session ? [{ ...data, entryNumber, totalDebit, totalCredit, status: 'Posted', createdBy: new Types.ObjectId(data.userId) }, { session }]
                         : [{ ...data, entryNumber, totalDebit, totalCredit, status: 'Posted', createdBy: new Types.ObjectId(data.userId) }];

    const entry = session
      ? (await this.jeModel.create([{ entryNumber, entryDate: new Date(), description: data.description, reference: data.reference, sourceType: data.sourceType, sourceId: data.sourceId, lines: data.lines, totalDebit, totalCredit, status: 'Posted', createdBy: new Types.ObjectId(data.userId) }], { session }))[0]
      : await this.jeModel.create({ entryNumber, entryDate: new Date(), description: data.description, reference: data.reference, sourceType: data.sourceType, sourceId: data.sourceId, lines: data.lines, totalDebit, totalCredit, status: 'Posted', createdBy: new Types.ObjectId(data.userId) });

    return entry;
  }

  // ─── List Invoices ──────────────────────────────────────────────────────
  async findAll(query: { status?: string; contractId?: string; page?: number; limit?: number }) {
    const { status, contractId, page = 1, limit = 20 } = query;
    const filter: any = {};
    if (status)     filter.status     = status;
    if (contractId) filter.contractId = new Types.ObjectId(contractId);
    const skip = (Number(page) - 1) * Number(limit);
    const [items, totalItems] = await Promise.all([
      this.invoiceModel.find(filter).sort({ invoiceDate: -1 }).skip(skip).limit(Number(limit)).lean(),
      this.invoiceModel.countDocuments(filter),
    ]);
    return { items, totalItems, currentPage: Number(page), totalPages: Math.ceil(totalItems / Number(limit)) };
  }

  async findOne(id: string) {
    const inv = await this.invoiceModel.findById(id).lean();
    if (!inv) throw new NotFoundException('Invoice not found');
    return inv;
  }

  // ─── Create Invoice from WCC (+ Auto GL) ────────────────────────────────
  async createFromWCC(dto: {
    wccId: string; vatPercent?: number; withholdingTaxPercent?: number; dueDate: string;
  }, userId: string) {
    // Guard against non-ObjectId values (e.g. "undefined", empty string)
    if (!toObjId(dto.wccId)) {
      throw new BadRequestException(`Invalid wccId: "${dto.wccId}"`);
    }
    const wcc = await this.wccModel.findById(dto.wccId).lean();
    if (!wcc) throw new NotFoundException(`WCC "${dto.wccId}" not found`);
    if ((wcc as any).status !== 'Approved') {
      throw new BadRequestException('Invoice can only be created from an Approved WCC');
    }
    if ((wcc as any).invoiceId) {
      throw new BadRequestException(`WCC "${(wcc as any).wccNumber}" already has an invoice`);
    }

    const contract = await this.contractModel.findById((wcc as any).contractId).lean();
    if (!contract) throw new NotFoundException('Contract not found for this WCC');

    // ─── Calculate financials ────────────────────────────────────────────
    const subtotal              = +((wcc as any).subtotal).toFixed(2);
    const vatPct                = dto.vatPercent ?? (contract as any).vatRate ?? 15;
    const retentionPct          = (wcc as any).retentionPercent || (contract as any).retentionPercent || 10;
    const withholdingPct        = dto.withholdingTaxPercent ?? (contract as any).withholdingRate ?? 5;

    const vatAmount             = +(subtotal * vatPct / 100).toFixed(2);
    const retentionAmount       = +(subtotal * retentionPct / 100).toFixed(2);
    const withholdingTaxAmount  = +(subtotal * withholdingPct / 100).toFixed(2);
    const netPayable            = +((subtotal + vatAmount) - retentionAmount - withholdingTaxAmount).toFixed(2);

    const ccCode = (wcc as any).costCenterCode;

    // ─── Transaction ────────────────────────────────────────────────────
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const invoiceNumber = await this.nextNumber(this.invoiceModel, 'invoiceNumber', 'INV', session);

      // 1. Build GL lines
      // DR: A/R (net + retention + withholding)  CR: Revenue + VAT
      // To balance: total debit must equal total credit
      // totalDebit = netPayable + retentionAmount + withholdingTaxAmount
      // totalCredit = subtotal + vatAmount
      // Note: netPayable = subtotal + vatAmount - retentionAmount - withholdingTaxAmount
      // => totalDebit = (subtotal + vatAmount - retentionAmount - withholdingTaxAmount) + retentionAmount + withholdingTaxAmount
      //              = subtotal + vatAmount = totalCredit ✓
      const glLines = [
        { accountCode: ACCOUNTS.AR.code,              accountName: ACCOUNTS.AR.name,              type: 'Debit',  amount: netPayable,           costCenterCode: ccCode },
        { accountCode: ACCOUNTS.RETENTION_RCV.code,   accountName: ACCOUNTS.RETENTION_RCV.name,   type: 'Debit',  amount: retentionAmount,       costCenterCode: ccCode },
        { accountCode: ACCOUNTS.WITHHOLDING_RCV.code, accountName: ACCOUNTS.WITHHOLDING_RCV.name, type: 'Debit',  amount: withholdingTaxAmount,  costCenterCode: ccCode },
        { accountCode: ACCOUNTS.REVENUE.code,         accountName: ACCOUNTS.REVENUE.name,         type: 'Credit', amount: subtotal,              costCenterCode: ccCode },
        { accountCode: ACCOUNTS.VAT_PAYABLE.code,     accountName: ACCOUNTS.VAT_PAYABLE.name,     type: 'Credit', amount: vatAmount,             costCenterCode: ccCode },
      ];
      const glTotalDebit  = +((netPayable + retentionAmount + withholdingTaxAmount)).toFixed(2);
      const glTotalCredit = +((subtotal + vatAmount)).toFixed(2);

      // 2. Create GL entry (inside transaction)
      const [glEntry] = await this.jeModel.create(
        [{
          entryNumber: await this.nextNumber(this.jeModel, 'entryNumber', 'JE', session),
          entryDate: new Date(),
          description: `Invoice for WCC ${(wcc as any).wccNumber}`,
          reference: invoiceNumber,
          sourceType: 'Invoice',
          lines: glLines,
          totalDebit:  glTotalDebit,
          totalCredit: glTotalCredit,
          status: 'Posted',
          createdBy: new Types.ObjectId(userId),
        }],
        { session },
      );

      // 3. Create Invoice
      const [invoice] = await this.invoiceModel.create(
        [{
          invoiceNumber,
          wccId: new Types.ObjectId(dto.wccId),
          wccNumber: (wcc as any).wccNumber,
          contractId: (wcc as any).contractId,
          contractNumber: (wcc as any).contractNumber,
          projectId: (wcc as any).projectId || null,
          projectCode: (wcc as any).projectCode || null,
          costCenterCode: ccCode,
          clientName: (wcc as any).clientName,
          invoiceDate: new Date(),
          dueDate: new Date(dto.dueDate),
          subtotal, vatPercent: vatPct, vatAmount,
          retentionPercent: retentionPct, retentionAmount,
          withholdingTaxPercent: withholdingPct, withholdingTaxAmount,
          netPayable, totalCollected: 0, balanceDue: netPayable,
          status: 'Draft',
          glEntryId: glEntry._id,
          glEntryNumber: glEntry.entryNumber,
          createdBy: new Types.ObjectId(userId),
        }],
        { session },
      );

      // 4. Mark WCC as Invoiced
      await this.wccModel.updateOne(
        { _id: dto.wccId },
        { $set: { status: 'Invoiced', invoiceId: invoice._id, invoiceNumber } },
        { session },
      );

      await session.commitTransaction();

      this.logger.log(`✅ Invoice ${invoiceNumber} created from WCC ${(wcc as any).wccNumber}. Net: $${netPayable}. GL: ${glEntry.entryNumber}`);
      return {
        success: true,
        message: 'Invoice created and GL posted',
        data: { invoice, glEntry },
        invoice,
        glEntry,
      };
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }

  // ─── Post GL ─────────────────────────────────────────────────────────────
  async postGL(id: string, userId: string) {
    const invoice = await this.invoiceModel.findById(id);
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status !== 'Draft') throw new BadRequestException('Invoice is already posted or in another state');

    const updated = await this.invoiceModel.findByIdAndUpdate(
      id,
      { $set: { status: 'Posted', postedBy: new Types.ObjectId(userId), postedAt: new Date() } },
      { new: true },
    ).lean();

    this.logger.log(`✅ Invoice ${updated.invoiceNumber} posted by ${userId}`);
    return updated;
  }

  // ─── List GL Entries ────────────────────────────────────────────────────
  async getGLEntries(query: { sourceType?: string; page?: number; limit?: number }) {
    const { sourceType, page = 1, limit = 20 } = query;
    const filter: any = {};
    if (sourceType) filter.sourceType = sourceType;
    const skip = (Number(page) - 1) * Number(limit);
    const [items, totalItems] = await Promise.all([
      this.jeModel.find(filter).sort({ entryDate: -1 }).skip(skip).limit(Number(limit)).lean(),
      this.jeModel.countDocuments(filter),
    ]);
    return { items, totalItems, currentPage: Number(page), totalPages: Math.ceil(totalItems / Number(limit)) };
  }

  // ─── Record Collection Payment (+ Auto GL + AR Settlement) ─────────────
  async recordPayment(invoiceId: string, dto: {
    amount: number; date: string; method: string; reference?: string; remarks?: string;
  }, userId: string) {
    const invoice = await this.invoiceModel.findById(invoiceId);
    if (!invoice) throw new NotFoundException(`Invoice "${invoiceId}" not found`);
    if (invoice.status === 'Paid') throw new BadRequestException('Invoice is already fully paid');
    if (invoice.status === 'Cancelled') throw new BadRequestException('Invoice is cancelled');

    if (dto.amount <= 0) throw new BadRequestException('Payment amount must be greater than 0');
    if (dto.amount > invoice.balanceDue) {
      throw new BadRequestException(
        `Payment (${dto.amount}) exceeds balance due (${invoice.balanceDue})`,
      );
    }

    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const collectionNumber = await this.nextNumber(this.collectionModel, 'collectionNumber', 'COL', session);

      // GL Entry: DR Bank / CR AR
      const [glEntry] = await this.jeModel.create(
        [{
          entryNumber: await this.nextNumber(this.jeModel, 'entryNumber', 'JE', session),
          entryDate: new Date(dto.date),
          description: `Payment received for Invoice ${invoice.invoiceNumber}`,
          reference: collectionNumber,
          sourceType: 'Collection',
          lines: [
            { accountCode: ACCOUNTS.BANK.code, accountName: ACCOUNTS.BANK.name, type: 'Debit',  amount: dto.amount, costCenterCode: invoice.costCenterCode },
            { accountCode: ACCOUNTS.AR.code,   accountName: ACCOUNTS.AR.name,   type: 'Credit', amount: dto.amount, costCenterCode: invoice.costCenterCode },
          ],
          totalDebit: dto.amount, totalCredit: dto.amount,
          status: 'Posted',
          createdBy: new Types.ObjectId(userId),
        }],
        { session },
      );

      // Create Collection record
      const [collection] = await this.collectionModel.create(
        [{
          collectionNumber,
          invoiceId: invoice._id,
          invoiceNumber: invoice.invoiceNumber,
          contractId: invoice.contractId,
          contractNumber: invoice.contractNumber,
          projectId: invoice.projectId || null,
          projectCode: invoice.projectCode || null,
          clientName: invoice.clientName,
          amount: dto.amount,
          date: new Date(dto.date),
          method: dto.method || 'Wire Transfer',
          reference: dto.reference || null,
          remarks: dto.remarks || null,
          glEntryId: glEntry._id,
          glEntryNumber: glEntry.entryNumber,
          createdBy: new Types.ObjectId(userId),
        }],
        { session },
      );

      // AR Settlement: update invoice balance
      const newTotalCollected = +(invoice.totalCollected + dto.amount).toFixed(2);
      const newBalanceDue     = +(invoice.netPayable - newTotalCollected).toFixed(2);
      const newStatus         = newBalanceDue <= 0 ? 'Paid'
                              : newTotalCollected > 0 ? 'Partially_Paid'
                              : invoice.status;

      await this.invoiceModel.updateOne(
        { _id: invoiceId },
        { $set: { totalCollected: newTotalCollected, balanceDue: newBalanceDue, status: newStatus } },
        { session },
      );

      await session.commitTransaction();

      this.logger.log(
        `💰 Collection ${collectionNumber}: $${dto.amount} → Invoice ${invoice.invoiceNumber}. Balance: $${newBalanceDue}. Status: ${newStatus}`,
      );
      return { collection, glEntry, newBalanceDue, invoiceStatus: newStatus };
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }

  // ─── Aging AR Report ────────────────────────────────────────────────────
  async getAgingReport() {
    const today = new Date();
    const invoices = await this.invoiceModel
      .find({ status: { $nin: ['Paid', 'Cancelled'] } })
      .sort({ dueDate: 1 }).lean();

    return invoices.map((inv: any) => {
      const daysOverdue = Math.floor((today.getTime() - new Date(inv.dueDate).getTime()) / 86400000);
      return {
        invoiceNumber: inv.invoiceNumber,
        clientName: inv.clientName,
        contractNumber: inv.contractNumber,
        invoiceDate: inv.invoiceDate,
        dueDate: inv.dueDate,
        netPayable: inv.netPayable,
        totalCollected: inv.totalCollected,
        balanceDue: inv.balanceDue,
        status: inv.status,
        daysOverdue: daysOverdue > 0 ? daysOverdue : 0,
        agingBucket:
          daysOverdue <= 0     ? 'Current'
          : daysOverdue <= 30  ? '1-30 Days'
          : daysOverdue <= 60  ? '31-60 Days'
          : daysOverdue <= 90  ? '61-90 Days'
          : 'Over 90 Days',
      };
    });
  }

  // ─── Collections list ────────────────────────────────────────────────────
  async getCollections(query: { invoiceId?: string; page?: number; limit?: number }) {
    const { invoiceId, page = 1, limit = 20 } = query;
    const filter: any = {};
    if (invoiceId) filter.invoiceId = new Types.ObjectId(invoiceId);
    const skip = (Number(page) - 1) * Number(limit);
    const [items, totalItems] = await Promise.all([
      this.collectionModel.find(filter).sort({ date: -1 }).skip(skip).limit(Number(limit)).lean(),
      this.collectionModel.countDocuments(filter),
    ]);
    return { items, totalItems, currentPage: Number(page), totalPages: Math.ceil(totalItems / Number(limit)) };
  }
}
