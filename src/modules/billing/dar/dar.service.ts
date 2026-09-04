import {
  Injectable, NotFoundException, BadRequestException, Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DARModelName } from './entities/dar.model';
import { ContractModelName } from '../../workflow/contracts/entities/contract.model';
import { EquipmentModelName } from '../../assets/equipment/entities/equipment.model';
import { ProjectModelName } from '../../projects/entities/project.model';

// Guard: only convert strings that are valid 24-hex ObjectIds
const toObjId = (v?: string) =>
  v && v !== 'undefined' && v !== 'null' && Types.ObjectId.isValid(v)
    ? new Types.ObjectId(v)
    : null;

@Injectable()
export class DARService {
  private readonly logger = new Logger(DARService.name);

  constructor(
    @InjectModel(DARModelName) private darModel: Model<any>,
    @InjectModel(ContractModelName) private contractModel: Model<any>,
    @InjectModel(EquipmentModelName) private equipmentModel: Model<any>,
    @InjectModel(ProjectModelName) private projectModel: Model<any>,
  ) {}

  // ─── Get All ───────────────────────────────────────────────────────────────
  async findAll(query: {
    contractId?: string; rigId?: string; status?: string;
    projectCode?: string; from?: string; to?: string;
    page?: number; limit?: number;
  }) {
    const { contractId, rigId, status, projectCode, from, to, page = 1, limit = 20 } = query;
    const filter: any = {};
    const cid = toObjId(contractId);
    const rid = toObjId(rigId);
    if (cid) filter.contractId = cid;
    if (rid) filter.rigId      = rid;
    if (status) filter.status  = status;
    if (projectCode) filter.projectCode = projectCode;
    if (from || to) {
      filter.reportDate = {};
      if (from) filter.reportDate.$gte = new Date(from);
      if (to)   filter.reportDate.$lte = new Date(to);
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [items, totalItems] = await Promise.all([
      this.darModel.find(filter).sort({ reportDate: -1 }).skip(skip).limit(Number(limit)).lean(),
      this.darModel.countDocuments(filter),
    ]);
    return {
      success: true,
      message: 'DARs fetched successfully',
      data: items,
      items,
      totalItems,
      currentPage: Number(page),
      totalPages: Math.ceil(totalItems / Number(limit)),
    };
  }

  // ─── Get One ──────────────────────────────────────────────────────────────
  async findOne(id: string) {
    let dar: any = null;
    if (Types.ObjectId.isValid(id)) {
      dar = await this.darModel.findById(id).lean();
    }
    // Fallback: frontend may send darNumber like "DAR-2026-001" or a custom string id
    if (!dar) {
      dar = await this.darModel.findOne({
        $or: [{ darNumber: id }, { _id: toObjId(id) }],
      }).lean();
    }
    if (!dar) throw new NotFoundException('DAR not found');
    return { success: true, data: dar };
  }

  // ─── Create ───────────────────────────────────────────────────────────────
  async create(dto: any, userId: string) {
    const contract = await this.contractModel.findById(dto.contractId).lean();
    if (!contract) throw new NotFoundException(`Contract "${dto.contractId}" not found`);
    if ((contract as any).status !== 'Active') {
      throw new BadRequestException('DAR can only be created for Active contracts');
    }

    const rig = await this.equipmentModel.findById(dto.rigId).lean();
    if (!rig) throw new NotFoundException(`Rig "${dto.rigId}" not found`);

    // Validate hours ≤ 24
    const totalHours = (dto.operatingHours || 0) + (dto.standbyHours || 0) +
                       (dto.repairHours || 0) + (dto.downtimeHours || 0);
    if (totalHours > 24) {
      throw new BadRequestException(`Total hours (${totalHours}) must not exceed 24`);
    }

    // Check for duplicate DAR (same rig + same date)
    const existing = await this.darModel.findOne({
      contractId: new Types.ObjectId(dto.contractId),
      rigId: new Types.ObjectId(dto.rigId),
      reportDate: new Date(dto.reportDate),
    });
    if (existing) throw new BadRequestException(`A DAR already exists for this rig on ${dto.reportDate}`);

    const dar = await this.darModel.create({
      contractId: new Types.ObjectId(dto.contractId),
      contractNumber: (contract as any).contractNumber,
      rigId: new Types.ObjectId(dto.rigId),
      rigName: (rig as any).equipmentName,
      projectId: (contract as any).projectId || null,
      projectCode: (contract as any).projectCode || null,
      costCenterCode: (contract as any).costCenterCode || null,
      reportDate: new Date(dto.reportDate),
      shift: dto.shift || 'Full Day',
      operatingHours: dto.operatingHours || 0,
      standbyHours: dto.standbyHours || 0,
      repairHours: dto.repairHours || 0,
      downtimeHours: dto.downtimeHours || 0,
      fuelConsumption: dto.fuelConsumption || 0,
      activitiesPerformed: dto.activitiesPerformed || '',
      hseIncidents: dto.hseIncidents || 'None',
      weatherConditions: dto.weatherConditions || '',
      preparedBy: dto.preparedBy || '',
      materialsUsed: dto.materialsUsed || [],
      status: 'Submitted',
      createdBy: new Types.ObjectId(userId),
    });

    this.logger.log(`DAR created: ${(contract as any).contractNumber} — ${dto.reportDate}`);
    return {
      success: true,
      message: 'DAR created successfully',
      data: dar,
    };
  }

  // ─── Safe lookup (supports ObjectId OR darNumber OR custom string) ─────────
  private async findDar(id: string) {
    if (Types.ObjectId.isValid(id)) {
      const doc = await this.darModel.findById(id);
      if (doc) return doc;
    }
    // Fallback: match darNumber or any string field the frontend might pass
    return this.darModel.findOne({ $or: [{ darNumber: id }] });
  }

  // ─── Submit ───────────────────────────────────────────────────────────────
  async submit(id: string, userId: string) {
    const dar = await this.findDar(id);
    if (!dar) throw new NotFoundException('DAR not found');
    if (dar.status === 'Submitted') throw new BadRequestException('DAR is already submitted');
    if (dar.status === 'Approved') throw new BadRequestException('Approved DAR cannot be re-submitted');

    const updated = await this.darModel.findByIdAndUpdate(
      dar._id,
      { $set: { status: 'Submitted', submittedBy: new Types.ObjectId(userId), submittedAt: new Date() } },
      { new: true },
    ).lean();

    this.logger.log(`DAR submitted: ${dar._id} by ${userId}`);
    return { success: true, message: 'DAR submitted for approval', data: updated };
  }

  // ─── Approve ──────────────────────────────────────────────────────────────
  async approve(id: string, dto: { clientRepName?: string; clientSignature?: string }, userId: string) {
    const dar = await this.findDar(id);
    if (!dar) throw new NotFoundException('DAR not found');
    if (dar.status === 'Approved') throw new BadRequestException('DAR is already approved');

    const updated = await this.darModel.findByIdAndUpdate(
      dar._id,
      {
        $set: {
          status: 'Approved',
          approvedBy: new Types.ObjectId(userId),
          approvedAt: new Date(),
          clientRepName: dto.clientRepName || dar.clientRepName,
          clientSignature: dto.clientSignature || dar.clientSignature,
        },
      },
      { new: true },
    ).lean();

    this.logger.log(`DAR approved: ${dar._id} by ${userId}`);
    return { success: true, message: 'DAR approved successfully', data: updated };
  }

  // ─── Reject ───────────────────────────────────────────────────────────────
  async reject(id: string, reason: string, userId: string) {
    const dar = await this.findDar(id);
    if (!dar) throw new NotFoundException('DAR not found');

    const updated = await this.darModel.findByIdAndUpdate(
      dar._id,
      { $set: { status: 'Rejected', rejectionReason: reason, approvedBy: new Types.ObjectId(userId), approvedAt: new Date() } },
      { new: true },
    ).lean();
    return { success: true, message: 'DAR rejected', data: updated };
  }
}
