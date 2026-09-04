import {
  Injectable, NotFoundException, BadRequestException, ConflictException, Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TimesheetModelName } from './entities/timesheet.model';
import { EquipmentModelName } from '../../assets/equipment/entities/equipment.model';
import { ProjectModelName } from '../../projects/entities/project.model';

@Injectable()
export class TimesheetsService {
  private readonly logger = new Logger(TimesheetsService.name);

  constructor(
    @InjectModel(TimesheetModelName) private timesheetModel: Model<any>,
    @InjectModel(EquipmentModelName) private equipmentModel: Model<any>,
    @InjectModel(ProjectModelName) private projectModel: Model<any>,
  ) {}

  // ─── Get All Rigs (category = Rig) ────────────────────────────────────────
  async getRigs(query: { status?: string; projectCode?: string }) {
    const filter: any = { category: 'Rig' };
    if (query.status) filter.status = query.status;
    if (query.projectCode) filter.projectAssignment = query.projectCode;

    // When fetching Available rigs: exclude those already assigned to an active project/contract
    if (query.status === 'Available') {
      filter.$and = [
        { $or: [{ currentProjectId: null }, { currentProjectId: { $exists: false } }] },
        { $or: [{ assignedContractId: null }, { assignedContractId: { $exists: false } }] },
      ];
    }

    const rigs = await this.equipmentModel.find(filter).sort({ createdAt: -1 }).lean();
    return {
      success: true,
      data: rigs,
    };
  }

  async updateRigStatus(id: string, status: string, userId: string) {
    const rig = await this.equipmentModel.findById(id);
    if (!rig) throw new NotFoundException('Rig not found');
    return this.equipmentModel.findByIdAndUpdate(
      id, { $set: { status } }, { new: true },
    ).lean();
  }

  // ─── Get All Timesheets ────────────────────────────────────────────────────
  async findAll(query: { rigId?: string; projectCode?: string; month?: string; page?: number; limit?: number }) {
    const { rigId, projectCode, month, page = 1, limit = 20 } = query;
    const filter: any = {};
    if (rigId) filter.rigId = new Types.ObjectId(rigId);
    if (projectCode) filter.projectCode = projectCode;
    if (month) filter.month = month;

    const skip = (Number(page) - 1) * Number(limit);
    const [items, totalItems] = await Promise.all([
      this.timesheetModel.find(filter).sort({ month: -1 }).skip(skip).limit(Number(limit)).lean(),
      this.timesheetModel.countDocuments(filter),
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

  // ─── Get One ──────────────────────────────────────────────────────────────
  async findOne(id: string) {
    const ts = await this.timesheetModel.findById(id).lean();
    if (!ts) throw new NotFoundException('Timesheet not found');
    return { success: true, data: ts };
  }

  // ─── Create Timesheet for a Month ─────────────────────────────────────────
  async create(dto: { rigId: string; month: string; projectCode?: string }, userId: string) {
    const rig = await this.equipmentModel.findById(dto.rigId).lean();
    if (!rig) throw new NotFoundException(`Rig "${dto.rigId}" not found`);

    const existing = await this.timesheetModel.findOne({ rigId: new Types.ObjectId(dto.rigId), month: dto.month });
    if (existing) throw new ConflictException(`Timesheet for rig ${(rig as any).equipmentCode} in ${dto.month} already exists`);

    const [year, monthNum] = dto.month.split('-').map(Number);
    const daysInMonth = new Date(year, monthNum, 0).getDate();

    // Pre-fill all days with 0 hours
    const days = Array.from({ length: daysInMonth }, (_, i) => ({
      dayNumber: i + 1,
      date: new Date(year, monthNum - 1, i + 1),
      operatingHours: 0,
      standbyHours: 0,
      repairHours: 0,
      downtimeHours: 0,
      rigMoveHours: 0,
      totalHours: 0,
      comments: '',
      status: 'Draft',
    }));

    // Resolve project
    let projectId, costCenterCode;
    if (dto.projectCode) {
      const project = await this.projectModel.findOne({ code: dto.projectCode.toUpperCase() }).lean();
      if (project) { projectId = project._id; costCenterCode = (project as any).costCenterCode; }
    } else if ((rig as any).projectAssignment) {
      const project = await this.projectModel.findOne({ code: (rig as any).projectAssignment }).lean();
      if (project) { projectId = project._id; costCenterCode = (project as any).costCenterCode; }
    }

    const ts = await this.timesheetModel.create({
      rigId: new Types.ObjectId(dto.rigId),
      rigName: (rig as any).equipmentName,
      projectId: projectId || null,
      projectCode: dto.projectCode || (rig as any).projectAssignment || null,
      costCenterCode: costCenterCode || null,
      month: dto.month,
      year,
      monthNumber: monthNum,
      days,
      status: 'Draft',
      createdBy: new Types.ObjectId(userId),
    });

    this.logger.log(`Timesheet created for rig ${(rig as any).equipmentCode} — ${dto.month}`);
    return ts;
  }

  // ─── Update a Single Day (24-Hour Invariant) ──────────────────────────────
  async updateDay(id: string, dayNumber: number, dto: {
    operatingHours?: number; standbyHours?: number; repairHours?: number;
    downtimeHours?: number; rigMoveHours?: number; comments?: string;
  }) {
    const ts = await this.timesheetModel.findById(id);
    if (!ts) throw new NotFoundException('Timesheet not found');

    const dayIdx = ts.days.findIndex((d: any) => d.dayNumber === dayNumber);
    if (dayIdx === -1) throw new NotFoundException(`Day ${dayNumber} not found in timesheet`);

    const day = ts.days[dayIdx];
    const updated = {
      operatingHours: dto.operatingHours ?? day.operatingHours,
      standbyHours:   dto.standbyHours   ?? day.standbyHours,
      repairHours:    dto.repairHours    ?? day.repairHours,
      downtimeHours:  dto.downtimeHours  ?? day.downtimeHours,
      rigMoveHours:   dto.rigMoveHours   ?? day.rigMoveHours,
    };

    const total = Object.values(updated).reduce((s: number, v) => s + (v as number), 0);

    // ⚡ 24-Hour Invariant
    if (total > 24) {
      throw new BadRequestException(
        `Total hours for day ${dayNumber} is ${total}. Must not exceed 24. ` +
        `(Operating: ${updated.operatingHours} + Standby: ${updated.standbyHours} + ` +
        `Repair: ${updated.repairHours} + Downtime: ${updated.downtimeHours} + ` +
        `RigMove: ${updated.rigMoveHours} = ${total})`,
      );
    }

    ts.days[dayIdx] = { ...day.toObject(), ...updated, totalHours: total, comments: dto.comments ?? day.comments };

    // Recalculate monthly totals
    ts.totalOperatingHours = ts.days.reduce((s: number, d: any) => s + d.operatingHours, 0);
    ts.totalStandbyHours   = ts.days.reduce((s: number, d: any) => s + d.standbyHours, 0);
    ts.totalRepairHours    = ts.days.reduce((s: number, d: any) => s + d.repairHours, 0);
    ts.totalDowntimeHours  = ts.days.reduce((s: number, d: any) => s + d.downtimeHours, 0);
    ts.totalRigMoveHours   = ts.days.reduce((s: number, d: any) => s + d.rigMoveHours, 0);

    await ts.save();
    return ts;
  }

  // ─── Submit / Approve ─────────────────────────────────────────────────────
  async updateStatus(id: string, status: string, userId: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid timesheet id: "${id}"`);
    }
    const setFields: any = { status };
    if (status === 'Approved' && userId && Types.ObjectId.isValid(userId)) {
      setFields.approvedBy = new Types.ObjectId(userId);
      setFields.approvedAt = new Date();
    }
    const ts = await this.timesheetModel.findByIdAndUpdate(
      id, { $set: setFields }, { new: true },
    ).lean();
    if (!ts) throw new NotFoundException('Timesheet not found');
    return { success: true, message: `Timesheet status updated to ${status}`, data: ts };
  }
}
