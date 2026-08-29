import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ProjectBudgetModelName } from '../entities/budget.model';
import { ProjectModelName } from '../../projects/entities/project.model';

@Injectable()
export class BudgetService {
  private readonly logger = new Logger(BudgetService.name);

  constructor(
    @InjectModel(ProjectBudgetModelName) private readonly budgetModel: Model<any>,
    @InjectModel(ProjectModelName) private readonly projectModel: Model<any>,
  ) {}

  async findAll(query: { fiscalYear?: string; projectCode?: string; status?: string; page?: number; limit?: number }) {
    const { fiscalYear, projectCode, status, page = 1, limit = 10 } = query;
    const filter: any = {};
    if (fiscalYear) filter.fiscalYear = fiscalYear;
    if (projectCode) filter.projectCode = projectCode;
    if (status) filter.status = status;

    const skip = (page - 1) * limit;
    const budgets = await this.budgetModel.find(filter).skip(skip).limit(limit).lean();
    const totalCount = await this.budgetModel.countDocuments(filter);

    let portfolioTotalBudget = 0;
    let portfolioTotalActual = 0;
    let portfolioTotalCommitted = 0;
    let portfolioOverBudgetCount = 0;
    let portfolioWarningCount = 0;

    const processedBudgets = budgets.map(budget => {
      let totalActual = 0;
      let totalCommitted = 0;

      if (budget.lines && Array.isArray(budget.lines)) {
        for (const line of budget.lines) {
          totalActual += line.actualAmount || 0;
          totalCommitted += line.committedAmount || 0;
        }
      }

      const totalUsed = totalActual + totalCommitted;
      const totalBudget = budget.totalBudget || 0;
      const totalVariance = totalBudget - totalUsed;
      const totalUtilPct = totalBudget > 0 ? Math.round((totalUsed / totalBudget) * 1000) / 10 : 0;
      const isOverBudget = totalUsed > totalBudget;

      let alertLevel = 'ok';
      if (totalUtilPct >= 100) alertLevel = 'danger';
      else if (totalUtilPct >= 80) alertLevel = 'warning';

      portfolioTotalBudget += totalBudget;
      portfolioTotalActual += totalActual;
      portfolioTotalCommitted += totalCommitted;
      if (isOverBudget) portfolioOverBudgetCount++;
      if (alertLevel === 'warning') portfolioWarningCount++;

      return {
        ...budget,
        totalActual,
        totalCommitted,
        totalUsed,
        totalVariance,
        totalUtilPct,
        isOverBudget,
        alertLevel,
      };
    });

    const portfolioTotalUsed = portfolioTotalActual + portfolioTotalCommitted;
    const portfolioTotalVariance = portfolioTotalBudget - portfolioTotalUsed;
    const portfolioTotalUtilPct = portfolioTotalBudget > 0 
      ? Math.round((portfolioTotalUsed / portfolioTotalBudget) * 1000) / 10 
      : 0;

    return {
      data: processedBudgets,
      portfolioTotals: {
        totalBudget:      portfolioTotalBudget,
        totalActual:      portfolioTotalActual,
        totalCommitted:   portfolioTotalCommitted,
        totalUsed:        portfolioTotalActual + portfolioTotalCommitted,
        totalVariance:    portfolioTotalBudget - (portfolioTotalActual + portfolioTotalCommitted),
        overBudgetProjects: portfolioOverBudgetCount,
        warningCount:     portfolioWarningCount,
      },
      meta: { total: totalCount, page, limit }
    };
  }

  async create(dto: { projectCode: string; fiscalYear: string; status?: string; lines: Record<string, number> }, userId: string) {
    const existing = await this.budgetModel.findOne({ projectCode: dto.projectCode, fiscalYear: dto.fiscalYear });
    if (existing) {
      throw new ConflictException(`Budget for project ${dto.projectCode} and fiscal year ${dto.fiscalYear} already exists.`);
    }

    const project = await this.projectModel.findOne({ code: dto.projectCode });
    const projectName = project ? project.name : 'Unknown Project';

    const linesArray: any[] = [];
    let totalBudget = 0;

    for (const [category, budgetAmount] of Object.entries(dto.lines || {})) {
      linesArray.push({
        category,
        budgetAmount,
        actualAmount: 0,
        committedAmount: 0
      });
      totalBudget += budgetAmount;
    }

    const newBudget = new this.budgetModel({
      projectCode: dto.projectCode,
      projectName,
      fiscalYear: dto.fiscalYear,
      status: dto.status || 'Draft',
      lines: linesArray,
      totalBudget,
      createdBy: userId,
    });

    await newBudget.save();
    return { message: 'Budget created successfully', data: newBudget };
  }

  async update(id: string, dto: { status?: string; lines?: Record<string, number> }) {
    const budget = await this.budgetModel.findById(id);
    if (!budget) {
      throw new NotFoundException('Budget not found');
    }

    if (dto.status) budget.status = dto.status;

    if (dto.lines) {
      const linesArray: any[] = [];
      let totalBudget = 0;
      for (const [category, budgetAmount] of Object.entries(dto.lines)) {
        linesArray.push({
          category,
          budgetAmount,
          actualAmount: 0,
          committedAmount: 0
        });
        totalBudget += budgetAmount;
      }
      budget.lines = linesArray;
      budget.totalBudget = totalBudget;
    }

    await budget.save();
    return { message: 'Budget updated successfully', data: budget };
  }

  async remove(id: string) {
    const result = await this.budgetModel.findByIdAndDelete(id);
    if (!result) {
      throw new NotFoundException('Budget not found');
    }
    return { message: 'Budget deleted successfully' };
  }

  async updateStatus(id: string, dto: { status: string; comments?: string; approvedBy?: string }, userId: string) {
    const budget = await this.budgetModel.findById(id);
    if (!budget) throw new NotFoundException('Budget not found');
    const allowedTransitions: Record<string, string[]> = {
      Draft: ['Submitted', 'Cancelled'],
      Submitted: ['Approved', 'Cancelled', 'Draft'],
      Approved: ['Active', 'Cancelled'],
      Active: ['Closed', 'Cancelled'],
    };
    const allowed = allowedTransitions[budget.status] || [];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(`Cannot transition from ${budget.status} to ${dto.status}`);
    }
    const updateData: any = { status: dto.status };
    if (dto.status === 'Approved') {
      updateData.approvedBy = dto.approvedBy || userId;
      updateData.approvalDate = new Date();
    }
    const updated = await this.budgetModel.findByIdAndUpdate(id, { $set: updateData }, { new: true }).lean();
    return { ...updated, id: (updated as any)?._id?.toString() };
  }
}
