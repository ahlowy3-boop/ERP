import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  HseIncidentModelName,
  HsePtwModelName,
  HseInspectionModelName,
  HseRiskModelName,
} from './entities/hse.model';

@Injectable()
export class HseService {
  private readonly logger = new Logger(HseService.name);

  constructor(
    @InjectModel(HseIncidentModelName)   private incidentModel: Model<any>,
    @InjectModel(HsePtwModelName)        private ptwModel: Model<any>,
    @InjectModel(HseInspectionModelName) private inspectionModel: Model<any>,
    @InjectModel(HseRiskModelName)       private riskModel: Model<any>,
  ) {}

  // ─── 1. INCIDENTS ─────────────────────────────────────────────────────────
  async findAllIncidents(query: { status?: string; type?: string; severity?: string; dateFrom?: string; dateTo?: string; page?: number; limit?: number }) {
    const { status, type, severity, dateFrom, dateTo, page = 1, limit = 20 } = query;
    const filter: any = { isDeleted: false };
    if (status) filter.status = status;
    if (type) filter.type = type;
    if (severity) filter.severity = severity;
    if (dateFrom || dateTo) {
      filter.date = {};
      if (dateFrom) filter.date.$gte = new Date(dateFrom);
      if (dateTo) filter.date.$lte = new Date(dateTo);
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
      this.incidentModel.find(filter).sort({ date: -1 }).skip(skip).limit(Number(limit)).lean(),
      this.incidentModel.countDocuments(filter),
    ]);
    const kpis = {
      totalIncidents: total,
      ltiCount: await this.incidentModel.countDocuments({ type: 'Lost Time Injury (LTI)', isDeleted: false }),
      nearMissCount: await this.incidentModel.countDocuments({ type: 'Near Miss', isDeleted: false }),
      openCount: await this.incidentModel.countDocuments({ status: { $ne: 'Closed' }, isDeleted: false }),
    };
    return { data: data.map((d: any) => ({ ...d, id: d._id?.toString() })), kpis, total, page: Number(page) };
  }

  async createIncident(dto: any) {
    const count = await this.incidentModel.countDocuments();
    const incidentNumber = `INC-${new Date().getFullYear()}-${(count + 1).toString().padStart(4, '0')}`;
    const item = await this.incidentModel.create({ ...dto, incidentNumber });
    return { ...item.toObject(), id: item._id?.toString() };
  }

  async updateIncident(id: string, dto: any) {
    const updated = await this.incidentModel.findByIdAndUpdate(id, { $set: dto }, { new: true }).lean();
    if (!updated) throw new NotFoundException('Incident not found');
    return { ...updated, id: (updated as any)._id?.toString() };
  }

  // ─── 2. PERMIT TO WORK (PTW) ──────────────────────────────────────────────
  async findAllPtws(query: { status?: string; type?: string; page?: number; limit?: number }) {
    const { status, type, page = 1, limit = 20 } = query;
    const filter: any = { isDeleted: false };
    if (status) filter.status = status;
    if (type) filter.type = type;
    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
      this.ptwModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      this.ptwModel.countDocuments(filter),
    ]);
    return { data: data.map((d: any) => ({ ...d, id: d._id?.toString() })), total, page: Number(page) };
  }

  async createPtw(dto: any) {
    const count = await this.ptwModel.countDocuments();
    const ptwNumber = `PTW-${new Date().getFullYear()}-${(count + 1).toString().padStart(4, '0')}`;
    const item = await this.ptwModel.create({ ...dto, ptwNumber });
    return { ...item.toObject(), id: item._id?.toString() };
  }

  async approvePtw(id: string, dto: { approverRole?: string; gasTestResults?: string; notes?: string }, userId: string) {
    const ptw = await this.ptwModel.findById(id);
    if (!ptw) throw new NotFoundException('PTW not found');
    const updated = await this.ptwModel.findByIdAndUpdate(
      id,
      {
        $set: {
          status: 'Approved',
          approverRole: dto.approverRole,
          gasTestResults: dto.gasTestResults,
          notes: dto.notes,
          approvedBy: userId,
          approvedAt: new Date(),
        },
      },
      { new: true },
    ).lean();
    return { ...updated, id: (updated as any)?._id?.toString() };
  }

  // ─── 3. SAFETY INSPECTIONS ────────────────────────────────────────────────
  async findAllInspections(query: { page?: number; limit?: number }) {
    const { page = 1, limit = 20 } = query;
    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
      this.inspectionModel.find({ isDeleted: false }).sort({ date: -1 }).skip(skip).limit(Number(limit)).lean(),
      this.inspectionModel.countDocuments({ isDeleted: false }),
    ]);
    return { data: data.map((d: any) => ({ ...d, id: d._id?.toString() })), total, page: Number(page) };
  }

  async createInspection(dto: any) {
    const count = await this.inspectionModel.countDocuments();
    const inspectionNumber = `INSP-${new Date().getFullYear()}-${(count + 1).toString().padStart(4, '0')}`;
    const item = await this.inspectionModel.create({ ...dto, inspectionNumber });
    return { ...item.toObject(), id: item._id?.toString() };
  }

  // ─── 4. RISK REGISTER ─────────────────────────────────────────────────────
  async findAllRisks(query: { status?: string; page?: number; limit?: number }) {
    const { status, page = 1, limit = 20 } = query;
    const filter: any = { isDeleted: false };
    if (status) filter.status = status;
    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
      this.riskModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      this.riskModel.countDocuments(filter),
    ]);
    return { data: data.map((d: any) => ({ ...d, id: d._id?.toString() })), total, page: Number(page) };
  }

  async createRisk(dto: any) {
    const count = await this.riskModel.countDocuments();
    const riskNumber = `RSK-${new Date().getFullYear()}-${(count + 1).toString().padStart(4, '0')}`;
    const item = await this.riskModel.create({ ...dto, riskNumber });
    return { ...item.toObject(), id: item._id?.toString() };
  }
}
