import {
  Injectable, NotFoundException, BadRequestException, ConflictException, Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { WCCModelName } from './entities/wcc.model';
import { DARModelName } from '../dar/entities/dar.model';
import { ContractModelName } from '../../workflow/contracts/entities/contract.model';

// Guard: only convert strings that are valid 24-hex ObjectIds
const toObjId = (v?: string) =>
  v && v !== 'undefined' && v !== 'null' && Types.ObjectId.isValid(v)
    ? new Types.ObjectId(v)
    : null;

@Injectable()
export class WCCService {
  private readonly logger = new Logger(WCCService.name);

  constructor(
    @InjectModel(WCCModelName) private wccModel: Model<any>,
    @InjectModel(DARModelName) private darModel: Model<any>,
    @InjectModel(ContractModelName) private contractModel: Model<any>,
  ) {}

  // ─── Auto-Number ───────────────────────────────────────────────────────────
  private async generateWCCNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `WCC-${year}-`;
    const last = await this.wccModel
      .findOne({ wccNumber: { $regex: `^${prefix}` } })
      .sort({ wccNumber: -1 }).lean();
    let seq = 1;
    if (last) {
      const parts = (last as any).wccNumber.split('-');
      seq = parseInt(parts[parts.length - 1], 10) + 1;
    }
    return `${prefix}${String(seq).padStart(3, '0')}`;
  }

  // ─── Get All ──────────────────────────────────────────────────────────────
  async findAll(query: { contractId?: string; status?: string; page?: number; limit?: number }) {
    const { contractId, status, page = 1, limit = 20 } = query;
    const filter: any = {};
    const cid = toObjId(contractId);
    if (cid)    filter.contractId = cid;
    if (status) filter.status     = status;
    const skip = (Number(page) - 1) * Number(limit);
    const [items, totalItems] = await Promise.all([
      this.wccModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      this.wccModel.countDocuments(filter),
    ]);
    return {
      success: true,
      data: items,
      items,
      totalItems,
      currentPage: Number(page),
      totalPages: Math.ceil(totalItems / Number(limit)),
    };
  }

  async findOne(id: string) {
    let wcc: any = null;
    if (Types.ObjectId.isValid(id)) {
      wcc = await this.wccModel.findById(id).lean();
    }
    if (!wcc) {
      wcc = await this.wccModel.findOne({ wccNumber: id }).lean();
    }
    if (!wcc) throw new NotFoundException('WCC not found');
    return { success: true, data: wcc };
  }

  // ─── Generate WCC from Approved DARs ─────────────────────────────────────────────────
  async generate(dto: { contractId: string; periodFrom: string; periodTo: string }, userId: string) {
    // Guard: reject if contractId is not a valid ObjectId
    if (!toObjId(dto.contractId)) {
      throw new BadRequestException(`Invalid contractId: "${dto.contractId}"`);
    }
    const contract = await this.contractModel.findById(dto.contractId).lean();
    if (!contract) throw new NotFoundException(`Contract "${dto.contractId}" not found`);

    // Collect approved DARs in the period
    const dars = await this.darModel.find({
      contractId: new Types.ObjectId(dto.contractId),
      status: 'Approved',
      reportDate: {
        $gte: new Date(dto.periodFrom),
        $lte: new Date(dto.periodTo),
      },
    }).lean();

    // Note: We allow generating a WCC even with 0 approved DARs
    // (the frontend can still generate a draft with 0 amounts)

    // Sum hours from DARs
    let totalOperatingHours = 0;
    let totalStandbyHours = 0;
    let totalRepairHours = 0;
    let totalDowntimeHours = 0;

    for (const dar of dars) {
      totalOperatingHours += (dar as any).operatingHours || 0;
      totalStandbyHours   += (dar as any).standbyHours   || 0;
      totalRepairHours    += (dar as any).repairHours    || 0;
      totalDowntimeHours  += (dar as any).downtimeHours  || 0;
    }

    // Convert hours to day fractions
    const totalOperatingDays = +(totalOperatingHours / 24).toFixed(4);
    const totalStandbyDays   = +(totalStandbyHours   / 24).toFixed(4);

    // Extract rates from rateSheet
    const rateSheet = (contract as any).rateSheet || [];
    const opRate  = rateSheet.find((r: any) => r.description?.toLowerCase().includes('operating'))?.rate || 0;
    const stRate  = rateSheet.find((r: any) => r.description?.toLowerCase().includes('standby'))?.rate  || 0;
    const mobilFee = rateSheet.find((r: any) => r.description?.toLowerCase().includes('mobilization') && !r.description?.toLowerCase().includes('de'))?.rate || 0;
    const demobilFee = rateSheet.find((r: any) => r.description?.toLowerCase().includes('demobilization'))?.rate || 0;

    const operatingAmount = +(totalOperatingDays * opRate).toFixed(2);
    const standbyAmount   = +(totalStandbyDays   * stRate).toFixed(2);
    const subtotal        = +(operatingAmount + standbyAmount + mobilFee + demobilFee).toFixed(2);

    const wccNumber = await this.generateWCCNumber();

    const wcc = await this.wccModel.create({
      wccNumber,
      contractId: new Types.ObjectId(dto.contractId),
      contractNumber: (contract as any).contractNumber,
      clientName: (contract as any).clientName,
      projectId: (contract as any).projectId || null,
      projectCode: (contract as any).projectCode || null,
      costCenterCode: (contract as any).costCenterCode || null,
      periodFrom: new Date(dto.periodFrom),
      periodTo: new Date(dto.periodTo),
      approvedDarIds: dars.map((d: any) => d._id),
      totalOperatingHours,
      totalStandbyHours,
      totalRepairHours,
      totalDowntimeHours,
      totalOperatingDays,
      totalStandbyDays,
      operatingDayRate: opRate,
      standbyDayRate: stRate,
      operatingAmount,
      standbyAmount,
      mobilizationFee: mobilFee,
      demobilizationFee: demobilFee,
      otherCharges: 0,
      subtotal,
      retentionPercent: (contract as any).retentionPercent || 10,
      status: 'Draft',
      createdBy: new Types.ObjectId(userId),
    });

    this.logger.log(
      `WCC ${wccNumber} generated from ${dars.length} DARs. Total: $${subtotal}`,
    );
    return {
      success: true,
      message: 'WCC generated successfully from approved DARs',
      data: wcc,
    };
  }

  // ─── Approve WCC ──────────────────────────────────────────────────────────────
  async approve(id: string, userId: string) {
    let wcc: any = null;
    if (Types.ObjectId.isValid(id)) {
      wcc = await this.wccModel.findById(id);
    }
    if (!wcc) {
      wcc = await this.wccModel.findOne({ wccNumber: id });
    }
    if (!wcc) throw new NotFoundException('WCC not found');
    if (wcc.status === 'Approved') throw new BadRequestException('WCC already approved');
    if (wcc.status === 'Invoiced') throw new BadRequestException('WCC already invoiced');

    const updated = await this.wccModel.findByIdAndUpdate(
      wcc._id,
      { $set: { status: 'Approved', approvedBy: new Types.ObjectId(userId), approvedAt: new Date() } },
      { new: true },
    ).lean();
    return { success: true, message: 'WCC approved successfully', data: updated };
  }
}
