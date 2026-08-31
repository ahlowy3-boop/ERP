import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CostCenterModelName } from './entities/cost-center.model';
import { ProjectBudgetModelName } from '../finance/entities/budget.model';

@Injectable()
export class CostCentersService {
  private readonly logger = new Logger(CostCentersService.name);

  constructor(
    @InjectModel(CostCenterModelName) private ccModel: Model<any>,
    @InjectModel(ProjectBudgetModelName) private budgetModel: Model<any>,
  ) {}

  async findAll(query: { type?: string; status?: string; search?: string; page?: number; limit?: number }) {
    const { type, status, search, page = 1, limit = 50 } = query;
    const filter: any = {};
    if (type) filter.type = type;
    if (status) filter.isActive = status === 'Active';
    if (search) {
      filter.$or = [
        { code: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [items, totalItems] = await Promise.all([
      this.ccModel.find(filter).sort({ code: 1 }).skip(skip).limit(Number(limit)).lean().exec(),
      this.ccModel.countDocuments(filter),
    ]);

    // Build a set of all parent codes to detect level
    const allCodes = items.map(i => i.code);

    // For each cost center, pull budget data
    const enriched = await Promise.all(items.map(async cc => {
      // Compute level
      let level = 0;
      let parent = cc.parentCode;
      while (parent) {
        level++;
        const parentCC = await this.ccModel.findOne({ code: parent }).lean();
        parent = parentCC?.parentCode || null;
        if (level > 10) break;
      }

      // Pull budget totals for this cost center across all projects
      const budgets = await this.budgetModel.find({ costCenterCode: cc.code }).lean();
      const totalBudget = budgets.reduce((s, b) => s + (b.totalBudget || 0), 0);
      const projectsCount = budgets.length;

      // Aggregate actuals from budget lines
      let totalSpent = 0;
      let materialCost = 0;
      let laborCost = 0;
      let transferCost = 0;

      for (const b of budgets) {
        for (const line of (b.lines || [])) {
          const actual = line.actualAmount || 0;
          totalSpent += actual;
          if (line.category === 'Materials') materialCost += actual;
          else if (line.category === 'Labor') laborCost += actual;
          else if (line.category === 'Equipment') transferCost += actual;
        }
      }

      return {
        ...cc,
        status: cc.isActive ? 'Active' : 'Inactive',
        level,
        projectsCount,
        totalBudget,
        totalSpent,
        remaining: totalBudget - totalSpent,
        materialCost,
        laborCost,
        transferCost,
      };
    }));

    // Portfolio totals
    const financeTotals = {
      totalBudget:     enriched.reduce((s, c) => s + c.totalBudget, 0),
      totalSpent:      enriched.reduce((s, c) => s + c.totalSpent, 0),
      totalRemaining:  enriched.reduce((s, c) => s + c.remaining, 0),
      projectsCount:   enriched.reduce((s, c) => s + c.projectsCount, 0),
    };

    return { data: enriched, financeTotals, totalItems, currentPage: Number(page) };
  }

  async findOne(id: string) {
    const cc = await this.ccModel.findById(id).lean().exec();
    if (!cc) throw new NotFoundException('Cost center not found');
    return { ...cc, status: cc.isActive ? 'Active' : 'Inactive' };
  }

  async findByCode(code: string) {
    return this.ccModel.findOne({ code }).lean().exec();
  }

  async create(dto: any, userId: string) {
    const parentCode = dto.parentCode || dto.parentCostCenter;
    const exists = await this.ccModel.findOne({ code: dto.code });
    if (exists) throw new ConflictException(`Cost center code "${dto.code}" already exists`);

    // Validate no circular parent
    if (parentCode) {
      const parent = await this.ccModel.findOne({ code: parentCode });
      if (!parent) throw new BadRequestException(`Parent code "${parentCode}" not found`);
    }

    const isActive = dto.status ? dto.status === 'Active' : true;
    return this.ccModel.create({ ...dto, parentCode, isActive, createdBy: userId });
  }

  async updateByCode(code: string, dto: any) {
    const cc = await this.ccModel.findOne({ code });
    if (!cc) throw new NotFoundException(`Cost center "${code}" not found`);

    const parentCode = dto.parentCode || dto.parentCostCenter;

    // Circular reference check
    if (parentCode) {
      if (parentCode === code) throw new BadRequestException('A cost center cannot be its own parent');
      let currentParent = parentCode;
      for (let i = 0; i < 10; i++) {
        const parent = await this.ccModel.findOne({ code: currentParent }).lean();
        if (!parent) break;
        if (parent.parentCode === code) throw new BadRequestException('Circular parent-child reference detected');
        currentParent = parent.parentCode;
        if (!currentParent) break;
      }
    }

    const payload = { ...dto };
    if (parentCode) payload.parentCode = parentCode;
    if (dto.status !== undefined) payload.isActive = dto.status === 'Active';
    const updated = await this.ccModel.findOneAndUpdate({ code }, { $set: payload }, { new: true }).lean();
    return updated;
  }

  async removeByCode(code: string) {
    const cc = await this.ccModel.findOne({ code });
    if (!cc) throw new NotFoundException(`Cost center "${code}" not found`);

    // Check if linked to projects via budget
    const hasBudget = await this.budgetModel.exists({ costCenterCode: code });
    if (hasBudget) throw new BadRequestException('Cannot delete: cost center has associated project budgets');

    // Check if has children
    const hasChildren = await this.ccModel.exists({ parentCode: code });
    if (hasChildren) throw new BadRequestException('Cannot delete: cost center has child cost centers');

    await this.ccModel.deleteOne({ code });
    return { message: `Cost center ${code} deleted successfully` };
  }

  async toggleStatus(code: string) {
    const cc = await this.ccModel.findOne({ code });
    if (!cc) throw new NotFoundException(`Cost center "${code}" not found`);
    cc.isActive = !cc.isActive;
    await cc.save();
    return { message: `Cost center ${code} is now ${cc.isActive ? 'Active' : 'Inactive'}`, status: cc.isActive ? 'Active' : 'Inactive', data: cc };
  }

  // Internal: used by Contract Auto-Engine
  async createInternal(data: {
    code: string; name: string; type: string; parentCode?: string;
    contractId?: string; contractNumber?: string; projectCode?: string; createdBy?: string;
  }) {
    return this.ccModel.create({ ...data, isActive: true });
  }

  async update(id: string, dto: any) {
    const cc = await this.ccModel.findByIdAndUpdate(id, { $set: dto }, { new: true }).lean().exec();
    if (!cc) throw new NotFoundException('Cost center not found');
    return cc;
  }
}
