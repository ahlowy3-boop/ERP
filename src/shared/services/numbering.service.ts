import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryOptions } from 'mongoose';
import { CounterDocument, CounterModelName } from '../models/counter.model';

@Injectable()
export class NumberingService {
  constructor(
    @InjectModel(CounterModelName)
    private readonly counterModel: Model<CounterDocument>,
  ) {}

  // دالة النواة لزيادة وجلب الرقم التسلسلي بشكل آمن
  private async getNextSequence(
    sequenceName: string,
    session?: QueryOptions['session'],
  ): Promise<string> {
    const counter = await this.counterModel.findByIdAndUpdate(
      sequenceName,
      { $inc: { seq: 1 } },
      { new: true, upsert: true, session }, // upsert: true ينشئ العداد إذا لم يكن موجوداً
    );

    // تحويل الرقم إلى صيغة 4 خانات (مثال: 1 -> 0001)
    return counter.seq.toString().padStart(4, '0');
  }

  // دوال التوليد الخاصة بكل موديول (والتي استدعيناها سابقاً في الـ Services)

  async generatePRNumber(session?: QueryOptions['session']): Promise<string> {
    const seq = await this.getNextSequence('PR', session);
    const year = new Date().getFullYear();
    return `PR-${year}-${seq}`;
  }

  async generateRFQNumber(
    prNumber: string,
    session?: QueryOptions['session'],
  ): Promise<string> {
    const seq = await this.getNextSequence('RFQ', session);
    const prParts = prNumber.split('-'); // ["PR", "2026", "0001"]
    return `RFQ-${prParts[1]}-${prParts[2]}-${seq}`;
  }

  async generatePONumber(session?: QueryOptions['session']): Promise<string> {
    const seq = await this.getNextSequence('PO', session);
    return seq; // أرجعنا الـ seq فقط لأننا نقوم بدمجه مع سلسلة معقدة داخل الـ POService
  }

  async generateMRVNumber(session?: QueryOptions['session']): Promise<string> {
    const seq = await this.getNextSequence('MRV', session);
    const year = new Date().getFullYear();
    return `MRV-${year}-${seq}`;
  }

  async generateMIVNumber(session?: QueryOptions['session']): Promise<string> {
    const seq = await this.getNextSequence('MIV', session);
    const year = new Date().getFullYear();
    return `MIV-${year}-${seq}`;
  }

  // (يمكنك إضافة الباقي بنفس النمط: TRN, ADJ, RSV, CNT)
  // إضافة هذه الدوال داخل كلاس NumberingService

  async generateTRNNumber(session?: QueryOptions['session']): Promise<string> {
    const seq = await this.getNextSequence('TRN', session);
    const year = new Date().getFullYear();
    return `TRN-${year}-${seq}`;
  }

  async generateADJNumber(session?: QueryOptions['session']): Promise<string> {
    const seq = await this.getNextSequence('ADJ', session);
    const year = new Date().getFullYear();
    return `ADJ-${year}-${seq}`;
  }

  async generateRSVNumber(session?: QueryOptions['session']): Promise<string> {
    const seq = await this.getNextSequence('RSV', session);
    const year = new Date().getFullYear();
    return `RSV-${year}-${seq}`;
  }

  async generateCNTNumber(session?: QueryOptions['session']): Promise<string> {
    const seq = await this.getNextSequence('CNT', session);
    const year = new Date().getFullYear();
    return `CNT-${year}-${seq}`;
  }

  async generateNCRNumber(session?: QueryOptions['session']): Promise<string> {
    const seq = await this.getNextSequence('NCR', session);
    const year = new Date().getFullYear();
    return `NCR-${year}-${seq}`;
  }

  async generateIRNumber(session?: QueryOptions['session']): Promise<string> {
    const seq = await this.getNextSequence('IR', session);
    const year = new Date().getFullYear();
    return `IR-${year}-${seq}`;
  }
}
