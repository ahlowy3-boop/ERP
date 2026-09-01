import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CostCenterModelName } from './entities/cost-center.model';
import { ProjectBudgetModelName } from '../finance/entities/budget.model';
import { JournalEntryModelName } from '../billing/invoices/entities/billing.model';
import { SupplierInvoiceModelName } from '../finance/entities/ap.model';
import { PurchaseOrderModelName } from '../procurement/purchase-orders/entities/purchase-order.model';

@Injectable()
export class CostCentersService {
  private readonly logger = new Logger(CostCentersService.name);

  constructor(
    @InjectModel(CostCenterModelName) private ccModel: Model<any>,
    @InjectModel(ProjectBudgetModelName) private budgetModel: Model<any>,
    @InjectModel(JournalEntryModelName) private journalModel: Model<any>,
    @InjectModel(SupplierInvoiceModelName) private apInvoiceModel: Model<any>,
    @InjectModel(PurchaseOrderModelName) private poModel: Model<any>,
  ) {}

  // ─── Helpers: Calculate Metrics ──────────────────────────────────────────
  private calcAlertLevel(budget: number, spent: number): string {
    if (!budget || budget <= 0) return 'none';
    const pct = (spent / budget) * 100;
    if (pct >= 95) return 'danger';
    if (pct >= 80) return 'warning';
    return 'ok';
  }

  private async computeMetricsForCenter(cc: any) {
    const code = cc.code;

    // 1. Spent amount from Journal Entries
    const jeAgg = await this.journalModel.aggregate([
      { $match: { status: 'Posted', 'lines.costCenterCode': code } },
      { $unwind: '$lines' },
      { $match: { 'lines.costCenterCode': code } },
      {
        $group: {
          _id: null,
          debit: { $sum: { $cond: [{ $eq: ['$lines.type', 'Debit'] }, '$lines.amount', 0] } },
          credit: { $sum: { $cond: [{ $eq: ['$lines.type', 'Credit'] }, '$lines.amount', 0] } },
        },
      },
    ]);
    const glSpent = jeAgg[0] ? (jeAgg[0].debit - jeAgg[0].credit) : 0;

    // 2. Spent amount from AP Invoices (if not already posted to GL)
    const apAgg = await this.apInvoiceModel.aggregate([
      { $match: { costCenter: code, status: { $in: ['Approved', 'Ready for Payment', 'Paid'] } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]);
    const apSpent = apAgg[0]?.total || 0;

    const actualSpent = Math.max(glSpent, apSpent, cc.spentAmount || 0);

    // 3. Committed amount from open POs
    const poAgg = await this.poModel.aggregate([
      { $match: { costCenter: code, status: { $in: ['Approved', 'Issued', 'Partially Received'] } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]);
    const committed = poAgg[0]?.total || 0;

    const budget = cc.budgetAmount || 0;
    const available = budget - actualSpent - committed;
    const utilPct = budget > 0 ? Number(((actualSpent / budget) * 100).toFixed(1)) : 0;
    const alertLevel = this.calcAlertLevel(budget, actualSpent);

    return {
      spentAmount: actualSpent,
      committedAmount: committed,
      availableAmount: available,
      utilizationPct: utilPct,
      alertLevel,
    };
  }

  // ─── Find All (Hierarchical / Slim / Filtered) ───────────────────────────
  async findAll(query: {
    isActive?: any;
    status?: string;
    type?: string;
    parentCode?: string;
    level?: number | string;
    branch?: string;
    sourceType?: string;
    slim?: any;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const {
      isActive,
      status,
      type,
      parentCode,
      level,
      branch,
      sourceType,
      slim,
      search,
      page = 1,
      limit = 50,
    } = query;

    const filter: any = {};
    if (isActive !== undefined) filter.isActive = isActive === 'true' || isActive === true;
    if (status) filter.status = status;
    if (type) filter.type = type;
    if (branch) filter.branch = branch;
    if (sourceType) filter.sourceType = sourceType;
    if (level !== undefined) filter.level = Number(level);
    if (parentCode !== undefined) filter.parentCode = parentCode === 'null' ? null : parentCode;

    if (search) {
      filter.$or = [
        { code: { $regex: search, $options: 'i' } },
        { nameEn: { $regex: search, $options: 'i' } },
        { nameAr: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
        { manager: { $regex: search, $options: 'i' } },
      ];
    }

    // Slim Mode for Dropdowns & Cascaded Pickers
    if (slim === 'true' || slim === true) {
      const items = await this.ccModel
        .find(filter)
        .select('code nameEn nameAr name type parentCode level branch status')
        .sort({ level: 1, code: 1 })
        .lean();
      return {
        success: true,
        data: items.map((i: any) => ({
          id: i._id?.toString(),
          _id: i._id?.toString(),
          code: i.code,
          nameEn: i.nameEn || i.name,
          nameAr: i.nameAr || i.nameEn || i.name,
          type: i.type,
          parentCode: i.parentCode,
          level: i.level || 1,
          branch: i.branch || 'HeadOffice',
          status: i.status,
        })),
      };
    }

    const isTreeMode = !parentCode && !search && !type;
    const skip = (Number(page) - 1) * Number(limit);

    // In tree mode, fetch ALL items (no pagination) so children aren't cut off by the limit
    const [rawItems, totalItems] = await Promise.all([
      isTreeMode
        ? this.ccModel.find(filter).sort({ level: 1, code: 1 }).lean()
        : this.ccModel.find(filter).sort({ level: 1, code: 1 }).skip(skip).limit(Number(limit)).lean(),
      this.ccModel.countDocuments(filter),
    ]);

    // Count children for all items dynamically from DB
    const allCounts = await this.ccModel.aggregate([
      { $match: { parentCode: { $ne: null } } },
      { $group: { _id: '$parentCode', count: { $sum: 1 } } },
    ]);
    const countMap = new Map<string, number>();
    for (const c of allCounts) countMap.set(c._id, c.count);

    // Enrich all items with dynamic metrics
    const enriched = await Promise.all(
      rawItems.map(async (item: any) => {
        const metrics = await this.computeMetricsForCenter(item);
        const childrenCount = countMap.get(item.code) || 0;
        return {
          ...item,
          id: item._id?.toString(),
          _id: item._id?.toString(),
          nameEn: item.nameEn || item.name,
          nameAr: item.nameAr || item.nameEn || item.name,
          childrenCount,
          ...metrics,
        };
      }),
    );

    // Build hierarchical tree
    let dataResult = enriched;
    if (isTreeMode) {
      const itemMap = new Map<string, any>();
      for (const item of enriched) {
        item.children = [];
        itemMap.set(item.code, item);
      }
      const tree: any[] = [];
      for (const item of enriched) {
        if (item.parentCode && itemMap.has(item.parentCode)) {
          itemMap.get(item.parentCode).children.push(item);
        } else if (!item.parentCode || item.level === 1) {
          tree.push(item);
        }
      }
      if (tree.length > 0) dataResult = tree;
    }

    // Portfolio summary stats
    const totalBudget = enriched.reduce((s, c) => s + (c.budgetAmount || 0), 0);
    const totalSpent = enriched.reduce((s, c) => s + (c.spentAmount || 0), 0);
    const totalActive = await this.ccModel.countDocuments({ status: 'Active' });
    const totalInactive = await this.ccModel.countDocuments({ status: { $ne: 'Active' } });

    const stats = {
      totalActive,
      totalInactive,
      totalBudget,
      totalSpent,
      totalUtilPct: totalBudget > 0 ? Number(((totalSpent / totalBudget) * 100).toFixed(1)) : 0,
    };

    return {
      success: true,
      data: dataResult,
      stats,
      total: totalItems,
      page: Number(page),
    };
  }

  // ─── Find One by Code ────────────────────────────────────────────────────
  async findByCode(code: string) {
    const cc = await this.ccModel.findOne({ code: code.toUpperCase() }).lean();
    if (!cc) throw new NotFoundException(`Cost center "${code}" not found`);

    const metrics = await this.computeMetricsForCenter(cc);
    const childrenCount = await this.ccModel.countDocuments({ parentCode: cc.code });

    // Recent Transactions from GL and AP
    const [recentGL, recentAP] = await Promise.all([
      this.journalModel
        .find({ status: 'Posted', 'lines.costCenterCode': cc.code })
        .sort({ date: -1 })
        .limit(5)
        .lean(),
      this.apInvoiceModel
        .find({ costCenter: cc.code })
        .sort({ invoiceDate: -1 })
        .limit(5)
        .lean(),
    ]);

    const recentTransactions = [
      ...recentGL.map((j: any) => ({
        date: j.date,
        type: 'GL',
        ref: j.journalNumber || j.reference,
        description: j.description,
        amount: j.totalDebit || 0,
      })),
      ...recentAP.map((a: any) => ({
        date: a.invoiceDate,
        type: 'AP',
        ref: a.invoiceNumber,
        description: `Vendor: ${a.vendorName}`,
        amount: a.totalAmount || 0,
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10);

    // Spend by category
    const budgets = await this.budgetModel.find({ costCenterCode: cc.code }).lean();
    const spendByCategory: any[] = [];
    const catMap = new Map<string, number>();
    for (const b of budgets) {
      for (const line of b.lines || []) {
        const cat = line.category || 'General';
        catMap.set(cat, (catMap.get(cat) || 0) + (line.actualAmount || 0));
      }
    }
    for (const [category, amount] of catMap.entries()) {
      spendByCategory.push({ category, amount });
    }

    const monthlyBudget = (cc.budgetAmount || 0) > 0 ? Number(((cc.budgetAmount || 0) / 12).toFixed(2)) : 0;

    return {
      success: true,
      data: {
        ...cc,
        id: cc._id?.toString(),
        _id: cc._id?.toString(),
        nameEn: cc.nameEn || cc.name,
        nameAr: cc.nameAr || cc.nameEn || cc.name,
        childrenCount,
        monthlyBudget,
        recentTransactions,
        spendByCategory,
        ...metrics,
      },
    };
  }

  // ─── Create Manual ───────────────────────────────────────────────────────
  async create(dto: any, userId?: string) {
    const code = (dto.code || '').toUpperCase().trim();
    if (!code) throw new BadRequestException('Cost center code is required');

    const exists = await this.ccModel.findOne({ code });
    if (exists) throw new ConflictException(`Cost center code "${code}" already exists`);

    const parentCode = dto.parentCode || dto.parentCostCenter || null;
    let level = 1;

    if (parentCode) {
      const parent = await this.ccModel.findOne({ code: parentCode });
      if (!parent) throw new BadRequestException(`Parent code "${parentCode}" not found`);
      level = (parent.level || 1) + 1;
      // Increment parent's children count
      await this.ccModel.findByIdAndUpdate(parent._id, { $inc: { childrenCount: 1 } });
    }

    const status = dto.status || 'Active';
    const isActive = status === 'Active';

    const costCenter = await this.ccModel.create({
      ...dto,
      code,
      nameEn: dto.nameEn || dto.name,
      nameAr: dto.nameAr || dto.nameEn || dto.name,
      name: dto.name || dto.nameEn,
      parentCode: parentCode || null,
      level,
      branch: dto.branch || 'HeadOffice',
      status,
      isActive,
      sourceType: dto.sourceType || 'Manual',
      autoCreated: dto.autoCreated || false,
      createdBy: userId,
    });

    this.logger.log(`Cost center ${code} created successfully`);
    return {
      success: true,
      data: {
        ...costCenter.toObject(),
        id: costCenter._id?.toString(),
        _id: costCenter._id?.toString(),
      },
      message: 'Cost center created successfully',
    };
  }

  // ─── Update by Code ──────────────────────────────────────────────────────
  async updateByCode(code: string, dto: any) {
    const cc = await this.ccModel.findOne({ code: code.toUpperCase() });
    if (!cc) throw new NotFoundException(`Cost center "${code}" not found`);

    // Protected fields
    const { code: _c, sourceType: _st, sourceId: _si, autoCreated: _ac, ...allowedDto } = dto;

    if (cc.autoCreated && allowedDto.parentCode && allowedDto.parentCode !== cc.parentCode) {
      throw new BadRequestException('Cannot modify parent of auto-created cost center');
    }

    const parentCode = allowedDto.parentCode || allowedDto.parentCostCenter;
    if (parentCode) {
      if (parentCode === cc.code) throw new BadRequestException('A cost center cannot be its own parent');
      let currentParent = parentCode;
      for (let i = 0; i < 10; i++) {
        const parent = await this.ccModel.findOne({ code: currentParent }).lean();
        if (!parent) break;
        if (parent.parentCode === cc.code) throw new BadRequestException('Circular parent-child reference detected');
        currentParent = parent.parentCode;
        if (!currentParent) break;
      }
    }

    if (allowedDto.status !== undefined) {
      allowedDto.isActive = allowedDto.status === 'Active';
    }

    const updated = await this.ccModel
      .findOneAndUpdate({ code: code.toUpperCase() }, { $set: allowedDto }, { new: true })
      .lean();

    return {
      success: true,
      data: { ...(updated as any), id: (updated as any)._id?.toString() },
      message: 'Cost center updated successfully',
    };
  }

  // ─── Toggle Status ───────────────────────────────────────────────────────
  async toggleStatus(code: string) {
    const cc = await this.ccModel.findOne({ code: code.toUpperCase() });
    if (!cc) throw new NotFoundException(`Cost center "${code}" not found`);

    const newStatus = cc.status === 'Active' ? 'Inactive' : 'Active';

    // If deactivating, check open transactions
    if (newStatus === 'Inactive') {
      const openPOs = await this.poModel.countDocuments({
        costCenter: cc.code,
        status: { $in: ['Approved', 'Issued', 'Partially Received'] },
      });
      if (openPOs > 0) {
        throw new BadRequestException(`Cannot deactivate: Cost center has ${openPOs} open purchase orders`);
      }
    }

    cc.status = newStatus;
    cc.isActive = newStatus === 'Active';
    await cc.save();

    // If root/division deactivated, cascade deactivate children
    if (cc.level === 1 && newStatus === 'Inactive') {
      await this.ccModel.updateMany(
        { parentCode: cc.code },
        { $set: { status: 'Inactive', isActive: false } },
      );
    }

    return {
      success: true,
      data: { code: cc.code, status: cc.status },
      message: `Cost center ${cc.code} is now ${cc.status}`,
    };
  }

  // ─── Delete ──────────────────────────────────────────────────────────────
  async removeByCode(code: string) {
    const cc = await this.ccModel.findOne({ code: code.toUpperCase() });
    if (!cc) throw new NotFoundException(`Cost center "${code}" not found`);

    if (cc.autoCreated) {
      throw new BadRequestException('Auto-created cost centers cannot be deleted directly');
    }

    // Check children
    const childrenCount = await this.ccModel.countDocuments({ parentCode: cc.code });
    if (childrenCount > 0) {
      throw new BadRequestException('Cannot delete: Cost center has active child cost centers');
    }

    // Check transactions
    const jeCount = await this.journalModel.countDocuments({ 'lines.costCenterCode': cc.code });
    const apCount = await this.apInvoiceModel.countDocuments({ costCenter: cc.code });
    if (jeCount > 0 || apCount > 0 || (cc.spentAmount || 0) > 0) {
      throw new BadRequestException('Cannot delete: Cost center has financial transactions recorded');
    }

    await this.ccModel.deleteOne({ code: cc.code });
    return { success: true, message: `Cost center ${cc.code} deleted successfully` };
  }

  // ─── Seed Default Hierarchy ──────────────────────────────────────────────
  async seedDefaultCostCenters() {
    const SEED_DATA = [
      {
        code: 'CC-OPS-000',
        nameEn: 'Operations',
        nameAr: 'العمليات',
        type: 'Department',
        parentCode: null,
        level: 1,
        branch: 'HeadOffice',
        status: 'Active',
      },
      {
        code: 'CC-DRL-000',
        nameEn: 'Drilling Division',
        nameAr: 'قسم الحفر',
        type: 'Drilling',
        parentCode: 'CC-OPS-000',
        level: 2,
        branch: 'HeadOffice',
        status: 'Active',
      },
      {
        code: 'CC-PRJ-000',
        nameEn: 'Projects Division',
        nameAr: 'قسم المشاريع',
        type: 'Project',
        parentCode: 'CC-OPS-000',
        level: 2,
        branch: 'HeadOffice',
        status: 'Active',
      },
      {
        code: 'CC-MNT-000',
        nameEn: 'Maintenance',
        nameAr: 'الصيانة',
        type: 'Maintenance',
        parentCode: 'CC-OPS-000',
        level: 2,
        branch: 'HeadOffice',
        status: 'Active',
      },
      {
        code: 'CC-LOG-000',
        nameEn: 'Logistics',
        nameAr: 'اللوجستيات',
        type: 'Logistics',
        parentCode: 'CC-OPS-000',
        level: 2,
        branch: 'HeadOffice',
        status: 'Active',
      },
      {
        code: 'CC-HSE-000',
        nameEn: 'HSE & Safety',
        nameAr: 'الصحة والسلامة',
        type: 'HSE',
        parentCode: 'CC-OPS-000',
        level: 2,
        branch: 'HeadOffice',
        status: 'Active',
      },
      {
        code: 'CC-ADM-000',
        nameEn: 'Administration',
        nameAr: 'الإدارة',
        type: 'Administrative',
        parentCode: null,
        level: 1,
        branch: 'HeadOffice',
        status: 'Active',
      },
      {
        code: 'CC-FIN-000',
        nameEn: 'Finance',
        nameAr: 'المالية',
        type: 'Department',
        parentCode: 'CC-ADM-000',
        level: 2,
        branch: 'HeadOffice',
        status: 'Active',
      },
      {
        code: 'CC-HR-000',
        nameEn: 'Human Resources',
        nameAr: 'الموارد البشرية',
        type: 'Department',
        parentCode: 'CC-ADM-000',
        level: 2,
        branch: 'HeadOffice',
        status: 'Active',
      },
      {
        code: 'CC-IT-000',
        nameEn: 'Information Technology',
        nameAr: 'تقنية المعلومات',
        type: 'Department',
        parentCode: 'CC-ADM-000',
        level: 2,
        branch: 'HeadOffice',
        status: 'Active',
      },
      {
        code: 'CC-PRO-000',
        nameEn: 'Procurement',
        nameAr: 'المشتريات',
        type: 'Department',
        parentCode: 'CC-ADM-000',
        level: 2,
        branch: 'HeadOffice',
        status: 'Active',
      },
      {
        code: 'CC-GEN-000',
        nameEn: 'General & Admin',
        nameAr: 'المصاريف العامة',
        type: 'Overhead',
        parentCode: 'CC-ADM-000',
        level: 2,
        branch: 'HeadOffice',
        status: 'Active',
      },
    ];

    const results: any[] = [];
    for (const seed of SEED_DATA) {
      const existing = await this.ccModel.findOne({ code: seed.code });
      if (!existing) {
        const created = await this.ccModel.create({
          ...seed,
          name: seed.nameEn,
          isActive: true,
          autoCreated: false,
          budgetAmount: 0,
          spentAmount: 0,
          committedAmount: 0,
          availableAmount: 0,
          utilizationPct: 0,
        });
        results.push(created);
      } else {
        results.push(existing);
      }
    }

    return {
      success: true,
      message: `${results.length} cost centers verified / seeded successfully`,
      data: results.map((r) => ({ ...r.toObject?.() || r, id: r._id?.toString() })),
    };
  }

  // ─── Transactions for specific Cost Center ───────────────────────────────
  async getTransactions(
    code: string,
    query: { dateFrom?: string; dateTo?: string; type?: string; page?: number; limit?: number },
  ) {
    const { dateFrom, dateTo, type, page = 1, limit = 20 } = query;
    const cc = await this.ccModel.findOne({ code: code.toUpperCase() });
    if (!cc) throw new NotFoundException(`Cost center "${code}" not found`);

    const dateFilter: any = {};
    if (dateFrom) dateFilter.$gte = new Date(dateFrom);
    if (dateTo) dateFilter.$lte = new Date(dateTo);

    const transactions: any[] = [];

    // 1. GL Transactions
    if (!type || type === 'GL') {
      const glFilter: any = { status: 'Posted', 'lines.costCenterCode': cc.code };
      if (dateFrom || dateTo) glFilter.date = dateFilter;
      const entries = await this.journalModel.find(glFilter).lean();
      for (const entry of entries) {
        for (const line of (entry as any).lines || []) {
          if (line.costCenterCode === cc.code) {
            transactions.push({
              date: (entry as any).date,
              type: 'GL',
              ref: (entry as any).journalNumber || (entry as any).reference,
              description: line.notes || (entry as any).description,
              amount: line.amount,
              debit: line.type === 'Debit' ? line.amount : 0,
              credit: line.type === 'Credit' ? line.amount : 0,
            });
          }
        }
      }
    }

    // 2. AP Transactions
    if (!type || type === 'AP') {
      const apFilter: any = { costCenter: cc.code };
      if (dateFrom || dateTo) apFilter.invoiceDate = dateFilter;
      const apInvoices = await this.apInvoiceModel.find(apFilter).lean();
      for (const inv of apInvoices) {
        transactions.push({
          date: (inv as any).invoiceDate,
          type: 'AP',
          ref: (inv as any).invoiceNumber,
          description: `Supplier Invoice: ${(inv as any).vendorName}`,
          amount: (inv as any).totalAmount,
          debit: (inv as any).totalAmount,
          credit: 0,
        });
      }
    }

    transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const totalDebit = transactions.reduce((s, t) => s + (t.debit || 0), 0);
    const totalCredit = transactions.reduce((s, t) => s + (t.credit || 0), 0);
    const skip = (Number(page) - 1) * Number(limit);
    const paginated = transactions.slice(skip, skip + Number(limit));

    return {
      success: true,
      data: paginated,
      totals: { totalDebit, totalCredit },
      total: transactions.length,
      page: Number(page),
    };
  }

  // ─── Auto-Creation: Project Trigger ──────────────────────────────────────
  async autoCreateForProject(project: any, userId?: string) {
    const existing = await this.ccModel.findOne({ sourceId: project._id });
    if (existing) return existing;

    // ─── Resolve parent cost center ──────────────────────────────────────────
    // Priority: project.parentCostCenterCode > project.parentCostCenter
    //         > project.costCenterCode > 'CC-PRJ-000'
    const parentCode =
      project.parentCostCenterCode ||
      project.parentCostCenter ||
      project.costCenterCode ||
      'CC-PRJ-000';

    // Lookup the parent document to get its _id and level
    const parentCCDoc = await this.ccModel.findOne({ code: parentCode }).lean();
    const parentId = parentCCDoc ? (parentCCDoc as any)._id : null;
    const level = parentCCDoc ? ((parentCCDoc as any).level || 1) + 1 : 2;
    const branch = (parentCCDoc as any)?.branch || 'HeadOffice';

    // ─── Generate unique code for this project's CC ──────────────────────────
    // If a projectCode exists, use it directly as the CC code to ensure uniqueness
    const projectCode = project.code || project.projectCode;
    const code = projectCode
      ? `CC-${projectCode}`
      : `CC-PRJ-${((await this.ccModel.countDocuments({ code: { $regex: /^CC-PRJ-/ } })) + 1).toString().padStart(3, '0')}`;

    const cc = await this.ccModel.create({
      code,
      nameEn: project.name || project.projectName || `Project ${projectCode}`,
      nameAr: project.nameAr || project.projectNameAr || project.name || `مشروع ${projectCode}`,
      name: project.name,
      type: 'Project',
      parentCode,
      parentId,
      level,
      branch,
      status: 'Active',
      isActive: true,
      sourceType: 'Project',
      sourceId: project._id,
      sourceCode: projectCode,
      autoCreated: true,
      budgetAmount: project.budgetValue || project.budget || 0,
      createdBy: userId,
    });

    // ─── Increment parent's childrenCount ────────────────────────────────────
    if (parentId) {
      await this.ccModel.findByIdAndUpdate(parentId, { $inc: { childrenCount: 1 } });
    }

    this.logger.log(
      `Auto-created Cost Center ${code} for Project ${projectCode} under parent ${parentCode}`,
    );
    return cc;
  }

  // ─── Auto-Creation: Rig Trigger ──────────────────────────────────────────
  async autoCreateForRig(rig: any, userId?: string) {
    const existing = await this.ccModel.findOne({ sourceId: rig._id });
    if (existing) return existing;

    const count = await this.ccModel.countDocuments({ code: { $regex: /^CC-DRL-/ } });
    const code = `CC-DRL-${(count + 1).toString().padStart(3, '0')}`;

    const cc = await this.ccModel.create({
      code,
      nameEn: `${rig.rigName || rig.name || 'Rig'} — Drilling`,
      nameAr: `${rig.rigNameAr || rig.nameAr || rig.rigName || 'حفارة'} — حفر`,
      name: rig.rigName || rig.name,
      type: 'Drilling',
      parentCode: 'CC-DRL-000',
      level: 3,
      branch: 'HeadOffice',
      status: 'Active',
      isActive: true,
      sourceType: 'Rig',
      sourceId: rig._id,
      sourceCode: rig.rigNumber || rig.code,
      autoCreated: true,
      createdBy: userId,
    });

    this.logger.log(`Auto-created Cost Center ${code} for Rig ${rig.rigNumber || rig.code}`);
    return cc;
  }
}
