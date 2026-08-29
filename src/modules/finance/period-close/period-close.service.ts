import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PeriodCloseModelName } from './period-close.model';

@Injectable()
export class PeriodCloseService {
  constructor(@InjectModel(PeriodCloseModelName) private periodModel: Model<any>) {}

  async findAll(query: { page?: number; limit?: number }) {
    const { page = 1, limit = 20 } = query;
    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
      this.periodModel.find().sort({ periodStart: -1 }).skip(skip).limit(Number(limit)).lean(),
      this.periodModel.countDocuments(),
    ]);
    return { data: data.map(d => ({ ...d, id: (d as any)._id?.toString() })), total, page: Number(page) };
  }

  async create(dto: { periodStart: string; periodEnd: string; fiscalYear: number }) {
    const start = new Date(dto.periodStart);
    const end = new Date(dto.periodEnd);
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    const periodName = `${monthNames[start.getMonth()]} ${start.getFullYear()}`;
    const period = await this.periodModel.create({
      ...dto,
      periodStart: start,
      periodEnd: end,
      periodName,
    });
    return { ...period.toObject(), id: period._id?.toString() };
  }

  async closePeriod(id: string, dto: { closedBy: string; notes?: string }) {
    const period = await this.periodModel.findById(id);
    if (!period) throw new NotFoundException('Period not found');
    if (period.status === 'Closed') throw new BadRequestException('Period is already closed');
    const hasIncomplete = period.checklist.some((c: any) => !c.completed);
    if (hasIncomplete) throw new BadRequestException('All checklist items must be completed before closing');
    const updated = await this.periodModel
      .findByIdAndUpdate(
        id,
        { $set: { status: 'Closed', closedBy: dto.closedBy, closedAt: new Date(), notes: dto.notes } },
        { new: true },
      )
      .lean();
    return { ...updated, id: (updated as any)?._id?.toString() };
  }

  async reopenPeriod(id: string) {
    const period = await this.periodModel.findById(id);
    if (!period) throw new NotFoundException('Period not found');
    const updated = await this.periodModel
      .findByIdAndUpdate(
        id,
        { $set: { status: 'Open', closedBy: null, closedAt: null } },
        { new: true },
      )
      .lean();
    return { ...updated, id: (updated as any)?._id?.toString() };
  }

  async getChecklist(id: string) {
    const period = await this.periodModel.findById(id).lean();
    if (!period) throw new NotFoundException('Period not found');
    return {
      periodId: id,
      checklist: (period as any).checklist,
      validationIssues: (period as any).validationIssues,
    };
  }
}
