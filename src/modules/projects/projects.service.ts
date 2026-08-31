import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ProjectModelName } from './entities/project.model';
import { CostCentersService } from '../cost-centers/cost-centers.service';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    @InjectModel(ProjectModelName) private projectModel: Model<any>,
    private readonly costCentersService: CostCentersService,
  ) {}

  // ─── Get All ───────────────────────────────────────────────────────────────
  async findAll(query: {
    search?: string;
    status?: string;
    customer?: string;
    page?: number;
    limit?: number;
  }) {
    const { search, status, customer, page = 1, limit = 20 } = query;
    const filter: any = {};

    if (search) {
      filter.$or = [
        { code: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
        { customer: { $regex: search, $options: 'i' } },
        { contractNumber: { $regex: search, $options: 'i' } },
      ];
    }
    if (status) filter.status = status;
    if (customer) filter.customer = { $regex: customer, $options: 'i' };

    const skip = (Number(page) - 1) * Number(limit);
    const [items, totalItems] = await Promise.all([
      this.projectModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean()
        .exec(),
      this.projectModel.countDocuments(filter),
    ]);

    return {
      items,
      totalItems,
      currentPage: Number(page),
      totalPages: Math.ceil(totalItems / Number(limit)),
    };
  }

  // ─── Get One by code ───────────────────────────────────────────────────────
  async findByCode(code: string) {
    const project = await this.projectModel
      .findOne({ code: code.toUpperCase() })
      .lean()
      .exec();
    if (!project) throw new NotFoundException(`Project "${code}" not found`);
    return project;
  }

  // ─── Get One by _id ────────────────────────────────────────────────────────
  async findById(id: string) {
    const project = await this.projectModel.findById(id).lean().exec();
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  // ─── Cost Summary ──────────────────────────────────────────────────────────
  async getCostSummary(code: string) {
    const project = await this.findByCode(code);
    return {
      projectCode: project.code,
      projectName: project.name,
      contractValue: project.contractValue,
      budgetValue: project.budgetValue,
      consumedValue: project.consumedValue,
      remainingValue: project.remainingValue,
      progressPercent: project.progressPercent,
      utilizationPercent:
        project.budgetValue > 0
          ? +((project.consumedValue / project.budgetValue) * 100).toFixed(2)
          : 0,
    };
  }

  // ─── Update Status ─────────────────────────────────────────────────────────
  async updateStatus(
    code: string,
    status: string,
    progressPercent: number | undefined,
    userId: string,
  ) {
    const project = await this.projectModel.findOne({ code: code.toUpperCase() });
    if (!project) throw new NotFoundException(`Project "${code}" not found`);

    const update: any = { status };
    if (progressPercent !== undefined) update.progressPercent = progressPercent;

    const updated = await this.projectModel
      .findOneAndUpdate({ code: code.toUpperCase() }, { $set: update }, { new: true })
      .lean()
      .exec();

    this.logger.log(`Project ${code} status → ${status} by ${userId}`);
    return updated;
  }

  // ─── Create (Manual) ───────────────────────────────────────────────────────
  async create(dto: any, userId: string) {
    const code = (dto.code || '').toUpperCase();
    const existing = await this.projectModel.findOne({ code });
    if (existing) {
      throw new Error(`Project with code "${code}" already exists`);
    }
    const project = await this.projectModel.create({
      ...dto,
      code,
      createdBy: userId,
    });

    // Auto-create Cost Center for Project
    try {
      const cc = await this.costCentersService.autoCreateForProject(project, userId);
      if (cc) {
        project.costCenterCode = cc.code;
        project.costCenterId = cc._id;
        await project.save();
      }
    } catch (err: any) {
      this.logger.warn(`Failed to auto-create cost center for project ${code}: ${err.message}`);
    }

    this.logger.log(`Project ${code} created manually by ${userId}`);
    return project;
  }

  // ─── Update (Full / Partial) ───────────────────────────────────────────────
  async update(code: string, dto: any, userId: string) {
    const project = await this.projectModel.findOne({ code: code.toUpperCase() });
    if (!project) throw new NotFoundException(`Project "${code}" not found`);

    // Prevent overwriting protected fields
    const { code: _c, createdBy: _cb, ...safeDto } = dto;

    const updated = await this.projectModel
      .findOneAndUpdate(
        { code: code.toUpperCase() },
        { $set: safeDto },
        { new: true },
      )
      .lean()
      .exec();

    this.logger.log(`Project ${code} updated by ${userId}`);
    return updated;
  }

  // ─── Internal: update consumed value (called by field ops) ─────────────────
  async addToConsumedValue(projectId: string, amount: number) {
    return this.projectModel.findByIdAndUpdate(
      projectId,
      {
        $inc: { consumedValue: amount },
        $set: {
          remainingValue: 0, // will be recalculated below
        },
      },
      { new: true },
    ).then(async (proj) => {
      if (proj) {
        proj.remainingValue = proj.budgetValue - proj.consumedValue;
        proj.progressPercent = proj.budgetValue > 0
          ? Math.min(100, Math.round((proj.consumedValue / proj.budgetValue) * 100))
          : 0;
        await proj.save();
      }
      return proj;
    });
  }
}
