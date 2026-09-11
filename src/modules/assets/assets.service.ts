import {
  Injectable, NotFoundException, BadRequestException, Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AssetAssignmentModelName,
  AssetTransferModelName,
  AssetDisposalModelName,
  AssetHistoryModelName,
} from './entities/assets.model';
import { EquipmentModelName } from './equipment/entities/equipment.model';

@Injectable()
export class AssetsService {
  private readonly logger = new Logger(AssetsService.name);

  constructor(
    @InjectModel(EquipmentModelName)       private equipmentModel:  Model<any>,
    @InjectModel(AssetAssignmentModelName) private assignmentModel: Model<any>,
    @InjectModel(AssetTransferModelName)   private transferModel:   Model<any>,
    @InjectModel(AssetDisposalModelName)   private disposalModel:   Model<any>,
    @InjectModel(AssetHistoryModelName)    private historyModel:    Model<any>,
  ) {}

  // ─── Internal: Log history ───────────────────────────────────────────
  private async logHistory(data: {

    assetId: string | Types.ObjectId;
    equipmentCode: string;
    changeType: 'Location Change' | 'Status Change' | 'Project Assignment' | 'Maintenance';
    oldValue?: string;
    newValue?: string;
    changedBy: string;
    notes?: string;
    userId?: string;
  }) {
    await this.historyModel.create({
      assetId: new Types.ObjectId(String(data.assetId)),
      equipmentCode: data.equipmentCode,
      changeType: data.changeType,
      oldValue: data.oldValue ?? null,
      newValue: data.newValue ?? null,
      changedBy: data.changedBy,
      notes: data.notes ?? null,
      createdBy: data.userId ? new Types.ObjectId(data.userId) : null,
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ASSIGNMENTS
  // ══════════════════════════════════════════════════════════════════════════

  async listAssignments(query: {
    assetId?: string;
    assignedToType?: string;
    assignedToId?: string;
  }) {
    const filter: any = {};
    if (query.assetId)       filter.assetId       = new Types.ObjectId(query.assetId);
    if (query.assignedToType) filter.assignedToType = query.assignedToType;
    if (query.assignedToId)   filter.assignedToId   = query.assignedToId;

    const data = await this.assignmentModel.find(filter).sort({ createdAt: -1 }).lean();
    return { data };
  }

  async createAssignment(dto: {
    assetId: string;
    assignedToType: string;
    assignedToId: string;
    assignedToName: string;
    assignmentDate: string;
    conditionOnAssign?: string;
    notes?: string;
  }, userId: string) {
    const eq = await this.equipmentModel.findById(dto.assetId).lean();
    if (!eq) throw new NotFoundException(`Equipment "${dto.assetId}" not found`);

    const oldLocation = (eq as any).location || '';

    // Auto-update equipment: location → assignedToName, status → Active
    await this.equipmentModel.findByIdAndUpdate(dto.assetId, {
      $set: {
        location: dto.assignedToName,
        status: 'Active',
        projectAssignment: dto.assignedToType === 'Project' ? dto.assignedToId : (eq as any).projectAssignment,
      },
    });

    const assignment = await this.assignmentModel.create({
      assetId: new Types.ObjectId(dto.assetId),
      assetNumber: (eq as any).assetNumber,
      equipmentName: (eq as any).equipmentName,
      assignedToType: dto.assignedToType,
      assignedToId: dto.assignedToId,
      assignedToName: dto.assignedToName,
      assignmentDate: new Date(dto.assignmentDate),
      conditionOnAssign: dto.conditionOnAssign ?? 'Good',
      notes: dto.notes ?? null,
      createdBy: new Types.ObjectId(userId),
    });

    // Auto-create history
    await this.logHistory({
      assetId: dto.assetId,
      equipmentCode: (eq as any).equipmentCode,
      changeType: 'Project Assignment',
      oldValue: oldLocation,
      newValue: dto.assignedToName,
      changedBy: 'System',
      notes: `Assigned to ${dto.assignedToType}: ${dto.assignedToName}. Condition: ${dto.conditionOnAssign ?? 'Good'}`,
      userId,
    });

    this.logger.log(`✅ Asset ${(eq as any).equipmentCode} assigned to ${dto.assignedToType}: ${dto.assignedToName}`);
    return { message: 'Asset assigned successfully', data: assignment };
  }

  async releaseAssignment(id: string, dto: { releaseDate?: string; notes?: string }, userId: string) {
    const assignment = await this.assignmentModel.findById(id);
    if (!assignment) throw new NotFoundException(`Assignment "${id}" not found`);
    if (assignment.releaseDate) throw new BadRequestException('Assignment already released');

    assignment.releaseDate = dto.releaseDate ? new Date(dto.releaseDate) : new Date();
    if (dto.notes) assignment.notes = dto.notes;
    await assignment.save();

    // Return equipment to Standby
    await this.equipmentModel.findByIdAndUpdate(assignment.assetId, {
      $set: { status: 'Standby', location: 'Warehouse / Base' },
    });

    return { message: 'Asset released successfully' };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TRANSFERS
  // ══════════════════════════════════════════════════════════════════════════

  async listTransfers(query: { assetId?: string; status?: string }) {
    const filter: any = {};
    if (query.assetId) filter.assetId = new Types.ObjectId(query.assetId);
    if (query.status)  filter.status  = query.status;

    const data = await this.transferModel.find(filter).sort({ transferDate: -1 }).lean();
    return { data };
  }

  async createTransfer(dto: {
    assetId: string;
    toLocation: string;
    transferDate: string;
    authorizedBy: string;
    notes?: string;
  }, userId: string) {
    const eq = await this.equipmentModel.findById(dto.assetId).lean();
    if (!eq) throw new NotFoundException(`Equipment "${dto.assetId}" not found`);
    if ((eq as any).status === 'Out Of Service') {
      throw new BadRequestException('Cannot transfer an asset with status "Out Of Service"');
    }

    const fromLocation = (eq as any).location || 'Unknown';

    // Auto-update equipment location
    await this.equipmentModel.findByIdAndUpdate(dto.assetId, {
      $set: { location: dto.toLocation },
    });

    const transfer = await this.transferModel.create({
      assetId: new Types.ObjectId(dto.assetId),
      assetNumber: (eq as any).assetNumber,
      equipmentName: (eq as any).equipmentName,
      fromLocation,
      toLocation: dto.toLocation,
      transferDate: new Date(dto.transferDate),
      authorizedBy: dto.authorizedBy,
      status: 'Completed',
      notes: dto.notes ?? null,
      createdBy: new Types.ObjectId(userId),
    });

    // Auto-create history
    await this.logHistory({
      assetId: dto.assetId,
      equipmentCode: (eq as any).equipmentCode,
      changeType: 'Location Change',
      oldValue: fromLocation,
      newValue: dto.toLocation,
      changedBy: dto.authorizedBy,
      notes: dto.notes,
      userId,
    });

    this.logger.log(`✅ Asset ${(eq as any).equipmentCode} transferred: ${fromLocation} → ${dto.toLocation}`);
    return { message: 'Transfer recorded successfully', data: transfer };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DISPOSALS
  // ══════════════════════════════════════════════════════════════════════════

  async listDisposals(query: { assetId?: string }) {
    const filter: any = {};
    if (query.assetId) filter.assetId = new Types.ObjectId(query.assetId);

    const data = await this.disposalModel.find(filter).sort({ disposalDate: -1 }).lean();
    return { data };
  }

  async createDisposal(dto: {
    assetId: string;
    disposalDate: string;
    disposalMethod: string;
    disposalCost?: number;
    revenueReceived?: number;
    reason: string;
    authorizedBy: string;
  }, userId: string) {
    const eq = await this.equipmentModel.findById(dto.assetId).lean();
    if (!eq) throw new NotFoundException(`Equipment "${dto.assetId}" not found`);
    if ((eq as any).status === 'Out Of Service') {
      throw new BadRequestException('Asset is already disposed (Out Of Service)');
    }

    const oldStatus = (eq as any).status;

    // Auto-update equipment status to Out Of Service
    await this.equipmentModel.findByIdAndUpdate(dto.assetId, {
      $set: { status: 'Out Of Service', projectAssignment: null },
    });

    const disposal = await this.disposalModel.create({
      assetId: new Types.ObjectId(dto.assetId),
      assetNumber: (eq as any).assetNumber,
      equipmentName: (eq as any).equipmentName,
      disposalDate: new Date(dto.disposalDate),
      disposalMethod: dto.disposalMethod,
      disposalCost: dto.disposalCost ?? 0,
      revenueReceived: dto.revenueReceived ?? 0,
      reason: dto.reason,
      authorizedBy: dto.authorizedBy,
      status: 'Approved',
      createdBy: new Types.ObjectId(userId),
    });

    // Auto-create history
    await this.logHistory({
      assetId: dto.assetId,
      equipmentCode: (eq as any).equipmentCode,
      changeType: 'Status Change',
      oldValue: oldStatus,
      newValue: 'Out Of Service',
      changedBy: dto.authorizedBy,
      notes: `Disposal: ${dto.disposalMethod}. Reason: ${dto.reason}`,
      userId,
    });

    this.logger.log(`✅ Asset ${(eq as any).equipmentCode} disposed via ${dto.disposalMethod}`);
    return { message: 'Asset disposal recorded successfully', data: disposal };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HISTORY
  // ══════════════════════════════════════════════════════════════════════════

  async listHistory(query: { assetId?: string; changeType?: string }) {
    const filter: any = {};
    if (query.assetId)    filter.assetId    = new Types.ObjectId(query.assetId);
    if (query.changeType) filter.changeType = query.changeType;

    const data = await this.historyModel.find(filter).sort({ date: -1 }).lean();
    return { data };
  }

  async addHistory(dto: {
    assetId: string;
    equipmentCode: string;
    changeType: string;
    oldValue?: string;
    newValue?: string;
    changedBy: string;
    notes?: string;
  }, userId: string) {
    const record = await this.historyModel.create({
      assetId: new Types.ObjectId(dto.assetId),
      equipmentCode: dto.equipmentCode,
      changeType: dto.changeType,
      oldValue: dto.oldValue ?? null,
      newValue: dto.newValue ?? null,
      changedBy: dto.changedBy,
      notes: dto.notes ?? null,
      createdBy: new Types.ObjectId(userId),
    });
    return { message: 'History record added', data: record };
  }
}

