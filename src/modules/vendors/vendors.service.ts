import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { VendorModelName } from './entities/vendor.model';
import { VendorDocumentModelName } from './entities/vendor-document.model';
import { VendorTimelineModelName } from './entities/vendor-timeline.model';
import { VendorEvaluationModelName } from './entities/vendor-evaluation.model';
import { VendorLedgerModelName } from './entities/vendor-ledger.model';

@Injectable()
export class VendorsService {
  private readonly logger = new Logger(VendorsService.name);

  constructor(
    @InjectModel(VendorModelName)           private vendorModel:     Model<any>,
    @InjectModel(VendorDocumentModelName)   private docModel:        Model<any>,
    @InjectModel(VendorTimelineModelName)   private timelineModel:   Model<any>,
    @InjectModel(VendorEvaluationModelName) private evalModel:       Model<any>,
    @InjectModel(VendorLedgerModelName)     private ledgerModel:     Model<any>,
  ) {}

  // ─── Generate Vendor Code VND-YYYY-XXXX ───────────────────────────────────
  async generateVendorCode(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `VND-${year}-`;
    for (let attempt = 0; attempt < 20; attempt++) {
      const last = await this.vendorModel
        .findOne({ vendorCode: { $regex: `^${prefix}` } })
        .sort({ vendorCode: -1 })
        .lean();
      let nextSeq = 1;
      if (last) {
        const parts = ((last as any).vendorCode || '').split('-');
        nextSeq = (parseInt(parts[parts.length - 1], 10) || 0) + 1 + attempt;
      }
      const code = `${prefix}${String(nextSeq).padStart(4, '0')}`;
      const exists = await this.vendorModel.findOne({ vendorCode: code });
      if (!exists) return code;
    }
    throw new BadRequestException('Could not generate unique vendor code');
  }

  // ─── Add Timeline Event (internal helper) ─────────────────────────────────
  async addTimelineEvent(
    vendorId: string | Types.ObjectId,
    event: {
      eventType: string;
      title: string;
      description?: string;
      referenceNumber?: string;
      amount?: number;
      performedBy?: string | Types.ObjectId;
      performedByName?: string;
    },
  ) {
    return this.timelineModel.create({
      vendorId: new Types.ObjectId(vendorId.toString()),
      date: new Date(),
      ...event,
    });
  }

  // ─── KPI Summary ──────────────────────────────────────────────────────────
  async getSummaryKpis() {
    const [total, active, pending, approved, blacklisted, spendAgg] =
      await Promise.all([
        this.vendorModel.countDocuments({ isDeleted: false }),
        this.vendorModel.countDocuments({ isDeleted: false, status: 'Active' }),
        this.vendorModel.countDocuments({ isDeleted: false, status: 'Pending' }),
        this.vendorModel.countDocuments({ isDeleted: false, approvalStatus: 'Approved' }),
        this.vendorModel.countDocuments({ isDeleted: false, approvalStatus: 'Blacklisted' }),
        this.vendorModel.aggregate([
          { $match: { isDeleted: false } },
          { $group: { _id: null, totalSpend: { $sum: '$totalSpend' } } },
        ]),
      ]);
    return {
      success: true,
      statusCode: 200,
      data: {
        total,
        active,
        pending,
        approved,
        blacklisted,
        totalSpend: spendAgg[0]?.totalSpend ?? 0,
      },
    };
  }

  // ─── Find All ─────────────────────────────────────────────────────────────
  async findAll(query: {
    search?: string;
    status?: string;
    approvalStatus?: string;
    category?: string;
    sortBy?: string;
    sortOrder?: string;
    page?: number;
    limit?: number;
  }) {
    const {
      search, status, approvalStatus, category,
      sortBy = 'createdAt', sortOrder = 'desc',
      page = 1, limit = 50,
    } = query;

    const filter: any = { isDeleted: false };
    if (search) {
      filter.$or = [
        { vendorName:   { $regex: search, $options: 'i' } },
        { arabicName:   { $regex: search, $options: 'i' } },
        { vendorCode:   { $regex: search, $options: 'i' } },
        { taxNumber:    { $regex: search, $options: 'i' } },
        { commercialRegistration: { $regex: search, $options: 'i' } },
        { commercialRegNo:        { $regex: search, $options: 'i' } },
      ];
    }
    if (status)         filter.status         = status;
    if (approvalStatus) filter.approvalStatus = approvalStatus;
    if (category)       filter.category       = category;

    const sortDir = sortOrder === 'asc' ? 1 : -1;
    const skip = (Number(page) - 1) * Number(limit);

    const [data, total] = await Promise.all([
      this.vendorModel
        .find(filter)
        .sort({ [sortBy]: sortDir })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      this.vendorModel.countDocuments(filter),
    ]);

    return {
      statusCode: 200,
      message: 'Vendors retrieved successfully',
      data,
      meta: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    };
  }

  // ─── Find One ─────────────────────────────────────────────────────────────
  async findOne(id: string) {
    const vendor = await this.vendorModel
      .findOne({ _id: id, isDeleted: false })
      .lean();
    if (!vendor) throw new NotFoundException('Vendor not found');
    return { success: true, data: vendor };
  }

  // ─── Create ───────────────────────────────────────────────────────────────
  async create(dto: any, userId?: string) {
    if (dto.commercialRegistration || dto.commercialRegNo) {
      const crNum = dto.commercialRegistration || dto.commercialRegNo;
      const exists = await this.vendorModel.findOne({
        $or: [{ commercialRegistration: crNum }, { commercialRegNo: crNum }],
        isDeleted: false,
      });
      if (exists) throw new ConflictException('Commercial registration number already exists');
    }
    if (dto.taxNumber) {
      const exists = await this.vendorModel.findOne({ taxNumber: dto.taxNumber, isDeleted: false });
      if (exists) throw new ConflictException('Tax number already exists');
    }

    const vendorCode = await this.generateVendorCode();
    const vendor = await this.vendorModel.create({
      ...dto,
      vendorCode,
      status: dto.status || 'Active',
      approvalStatus: dto.approvalStatus || 'Pending',
      performanceScore: 0,
      totalPOsValue: 0,
      totalPOsCount: 0,
      createdBy: userId ? new Types.ObjectId(userId) : undefined,
    });

    // Timeline: Vendor Created
    await this.addTimelineEvent(vendor._id, {
      eventType: 'Created',
      title: `Vendor ${vendorCode} created via Admin Console`,
      description: `Vendor "${vendor.vendorName}" registered with code ${vendorCode}`,
      performedByName: 'Admin',
    });

    this.logger.log(`Vendor ${vendorCode} created by ${userId}`);
    return { success: true, message: 'Vendor created successfully', data: vendor };
  }

  // ─── Update ───────────────────────────────────────────────────────────────
  async update(id: string, dto: any, userId?: string) {
    const vendor = await this.vendorModel.findOne({ _id: id, isDeleted: false });
    if (!vendor) throw new NotFoundException('Vendor not found');

    const { vendorCode: _vc, ...safeDto } = dto;
    const updated = await this.vendorModel
      .findByIdAndUpdate(id, { $set: safeDto }, { new: true })
      .lean();

    this.logger.log(`Vendor ${vendor.vendorCode} updated by ${userId}`);
    return { success: true, message: 'Vendor updated successfully', data: updated };
  }

  // ─── Update Status & Approval ─────────────────────────────────────────────
  async updateStatus(
    id: string,
    dto: { status?: string; approvalStatus?: string; reason?: string },
    userId?: string,
    performedByName?: string,
  ) {
    const vendor = await this.vendorModel.findOne({ _id: id, isDeleted: false });
    if (!vendor) throw new NotFoundException('Vendor not found');

    const isBlacklisting =
      dto.approvalStatus === 'Blacklisted' || dto.status === 'Blacklisted';

    if (isBlacklisting && !dto.reason) {
      throw new BadRequestException('Blacklist reason is required');
    }

    const updateData: any = {};
    if (dto.status)         updateData.status         = dto.status;
    if (dto.approvalStatus) updateData.approvalStatus = dto.approvalStatus;
    if (dto.reason)         updateData.blacklistReason = dto.reason;

    if (dto.approvalStatus === 'Approved') {
      updateData.approvedBy = userId ? new Types.ObjectId(userId) : undefined;
      updateData.approvedAt = new Date();
    }

    await this.vendorModel.findByIdAndUpdate(id, { $set: updateData });

    // Timeline event
    const eventTitle = isBlacklisting
      ? `Vendor Blacklisted — Reason: ${dto.reason}`
      : dto.approvalStatus === 'Approved'
        ? `Vendor Approved by ${performedByName || 'Admin'}`
        : `Vendor status changed to ${dto.status || dto.approvalStatus}`;

    await this.addTimelineEvent(id, {
      eventType: 'Status Changed',
      title: eventTitle,
      performedByName: performedByName || 'Admin',
    });

    return { success: true, message: 'Vendor status updated', data: updateData };
  }

  // ─── Soft Delete ──────────────────────────────────────────────────────────
  async remove(id: string) {
    const vendor = await this.vendorModel.findOne({ _id: id, isDeleted: false });
    if (!vendor) throw new NotFoundException('Vendor not found');

    await this.vendorModel.findByIdAndUpdate(id, {
      $set: { isDeleted: true, status: 'Inactive' },
    });
    return { success: true, message: 'Vendor deactivated successfully' };
  }

  // ─── Leaderboard ──────────────────────────────────────────────────────────
  async getLeaderboard(limit = 10) {
    const vendors = await this.vendorModel
      .find({ isDeleted: false, approvalStatus: 'Approved' })
      .sort({ rating: -1 })
      .limit(limit)
      .select('vendorCode vendorName category rating totalOrders totalSpend onTimeDeliveries totalDeliveries')
      .lean();
    return { success: true, data: vendors };
  }

  // ─── Timeline ─────────────────────────────────────────────────────────────
  async getTimeline(vendorId: string) {
    const vendor = await this.vendorModel.findOne({ _id: vendorId, isDeleted: false });
    if (!vendor) throw new NotFoundException('Vendor not found');

    const events = await this.timelineModel
      .find({ vendorId: new Types.ObjectId(vendorId) })
      .sort({ date: -1 })
      .lean();
    return { statusCode: 200, data: events };
  }

  async addCustomTimeline(vendorId: string, dto: any, userId?: string, userName?: string) {
    const vendor = await this.vendorModel.findOne({ _id: vendorId, isDeleted: false });
    if (!vendor) throw new NotFoundException('Vendor not found');

    const event = await this.addTimelineEvent(vendorId, {
      eventType: dto.eventType || 'Custom',
      title: dto.title,
      description: dto.description,
      referenceNumber: dto.referenceNumber,
      amount: dto.amount,
      performedBy: userId ? new Types.ObjectId(userId) : undefined,
      performedByName: userName || dto.performedByName,
    });
    return { success: true, data: event };
  }

  // ─── Ledger ───────────────────────────────────────────────────────────────
  async getLedger(
    vendorId: string,
    query: { startDate?: string; endDate?: string; transactionType?: string },
  ) {
    const vendor = await this.vendorModel.findOne({ _id: vendorId, isDeleted: false });
    if (!vendor) throw new NotFoundException('Vendor not found');

    const filter: any = { vendorId: new Types.ObjectId(vendorId) };
    if (query.startDate || query.endDate) {
      filter.date = {};
      if (query.startDate) filter.date.$gte = new Date(query.startDate);
      if (query.endDate)   filter.date.$lte = new Date(query.endDate);
    }
    if (query.transactionType) filter.transactionType = query.transactionType;

    const entries = await this.ledgerModel
      .find(filter)
      .sort({ date: 1 })
      .lean();

    // Compute running balance
    let runningBalance = 0;
    let totalDebit = 0;
    let totalCredit = 0;

    const enriched = entries.map((e: any) => {
      runningBalance += (e.debit || 0) - (e.credit || 0);
      totalDebit  += e.debit  || 0;
      totalCredit += e.credit || 0;
      return { ...e, balance: runningBalance };
    });

    return {
      statusCode: 200,
      data: {
        totalDebit,
        totalCredit,
        currentPayableBalance: runningBalance,
        entries: enriched,
      },
    };
  }

  async addLedgerEntry(vendorId: string, dto: any) {
    const vendor = await this.vendorModel.findOne({ _id: vendorId, isDeleted: false });
    if (!vendor) throw new NotFoundException('Vendor not found');

    const entry = await this.ledgerModel.create({
      vendorId: new Types.ObjectId(vendorId),
      ...dto,
    });

    // Update vendor totalSpend on payment
    if (dto.credit > 0) {
      await this.vendorModel.findByIdAndUpdate(vendorId, {
        $inc: { totalSpend: dto.credit },
        $set: { lastTransactionDate: new Date() },
      });
    }

    return { success: true, data: entry };
  }

  // ─── Documents ────────────────────────────────────────────────────────────
  async listDocuments(vendorId: string) {
    const vendor = await this.vendorModel.findOne({ _id: vendorId, isDeleted: false });
    if (!vendor) throw new NotFoundException('Vendor not found');

    const docs = await this.docModel
      .find({ vendorId: new Types.ObjectId(vendorId) })
      .sort({ uploadedDate: -1 })
      .lean();
    return { success: true, data: docs };
  }

  async uploadDocument(vendorId: string, file: Express.Multer.File, dto: any, userId?: string) {
    const vendor = await this.vendorModel.findOne({ _id: vendorId, isDeleted: false });
    if (!vendor) throw new NotFoundException('Vendor not found');

    if (!file) throw new BadRequestException('File is required');

    const fileSize = file.size
      ? `${(file.size / 1024 / 1024).toFixed(2)} MB`
      : 'Unknown';

    const doc = await this.docModel.create({
      vendorId:     new Types.ObjectId(vendorId),
      documentType: dto.documentType || 'Other',
      fileName:     file.originalname,
      originalName: file.originalname,
      mimeType:     file.mimetype,
      fileSize,
      fileUrl:      null, // Would be S3 URL in production
      uploadedBy:   userId ? new Types.ObjectId(userId) : undefined,
      uploadedDate: new Date(),
      expiryDate:   dto.expiryDate ? new Date(dto.expiryDate) : undefined,
      status:       'Valid',
      notes:        dto.notes,
    });

    await this.addTimelineEvent(vendorId, {
      eventType: 'Document Uploaded',
      title: `Document uploaded: ${dto.documentType || 'Other'}`,
      description: `File: ${file.originalname}`,
      performedByName: 'Admin',
    });

    return { success: true, data: doc };
  }

  async deleteDocument(vendorId: string, documentId: string) {
    const doc = await this.docModel.findOne({
      _id: documentId,
      vendorId: new Types.ObjectId(vendorId),
    });
    if (!doc) throw new NotFoundException('Document not found');
    await this.docModel.findByIdAndDelete(documentId);
    return { success: true, message: 'Document deleted successfully' };
  }

  async downloadDocument(vendorId: string, documentId: string) {
    const doc = await this.docModel.findOne({
      _id: documentId,
      vendorId: new Types.ObjectId(vendorId),
    });
    if (!doc) throw new NotFoundException('Document not found');
    return { success: true, data: doc };
  }

  // ─── Evaluations ──────────────────────────────────────────────────────────
  async submitEvaluation(vendorId: string, dto: any, userId?: string) {
    const vendor = await this.vendorModel.findOne({ _id: vendorId, isDeleted: false });
    if (!vendor) throw new NotFoundException('Vendor not found');

    // Composite Score = (delivery × 0.40) + (quality × 0.40) + (price × 0.20)
    const compositeScore =
      (dto.deliveryScore * 0.4) +
      (dto.qualityScore  * 0.4) +
      (dto.priceScore    * 0.2);

    const calculatedRating = parseFloat((compositeScore / 20).toFixed(2));

    const evaluation = await this.evalModel.create({
      vendorId:          new Types.ObjectId(vendorId),
      evaluatorId:       userId ? new Types.ObjectId(userId) : undefined,
      deliveryScore:     dto.deliveryScore,
      qualityScore:      dto.qualityScore,
      priceScore:        dto.priceScore,
      communicationScore: dto.communicationScore,
      compositeScore:    parseFloat(compositeScore.toFixed(2)),
      calculatedRating,
      comments:          dto.comments,
      period:            dto.period,
    });

    // Update vendor rating (latest evaluation)
    await this.vendorModel.findByIdAndUpdate(vendorId, {
      $set: { rating: calculatedRating, performanceScore: compositeScore },
    });

    await this.addTimelineEvent(vendorId, {
      eventType: 'Evaluation Completed',
      title: `Performance Evaluation — ${dto.period || 'Current Period'}`,
      description: `Composite: ${compositeScore.toFixed(1)}% → Rating: ${calculatedRating}/5`,
    });

    return {
      success: true,
      message: 'Evaluation submitted successfully',
      data: evaluation,
    };
  }

  async getEvaluations(vendorId: string) {
    const vendor = await this.vendorModel.findOne({ _id: vendorId, isDeleted: false });
    if (!vendor) throw new NotFoundException('Vendor not found');

    const evals = await this.evalModel
      .find({ vendorId: new Types.ObjectId(vendorId) })
      .sort({ evaluationDate: -1 })
      .lean();
    return { success: true, data: evals };
  }

  // ─── Performance Scorecard ────────────────────────────────────────────────
  async getPerformance(vendorId: string) {
    const vendor = await this.vendorModel
      .findOne({ _id: vendorId, isDeleted: false })
      .lean() as any;
    if (!vendor) throw new NotFoundException('Vendor not found');

    const onTimeRate = vendor.totalDeliveries > 0
      ? parseFloat(((vendor.onTimeDeliveries / vendor.totalDeliveries) * 100).toFixed(2))
      : 0;

    const qualityRate = vendor.totalDeliveredQty > 0
      ? parseFloat(((vendor.acceptedQty / vendor.totalDeliveredQty) * 100).toFixed(2))
      : 0;

    const winRate = vendor.participatedRFQs > 0
      ? parseFloat(((vendor.awardedRFQs / vendor.participatedRFQs) * 100).toFixed(2))
      : 0;

    return {
      success: true,
      data: {
        vendorCode:       vendor.vendorCode,
        vendorName:       vendor.vendorName,
        rating:           vendor.rating,
        totalOrders:      vendor.totalOrders,
        totalSpend:       vendor.totalSpend,
        onTimeDeliveryRate:     `${onTimeRate}%`,
        qualityAcceptanceRate:  `${qualityRate}%`,
        winRate:                `${winRate}%`,
        totalDeliveries:        vendor.totalDeliveries,
        onTimeDeliveries:       vendor.onTimeDeliveries,
        lateDeliveries:         vendor.lateDeliveries,
        rejectedDeliveries:     vendor.rejectedDeliveries,
        totalRFQs:              vendor.totalRFQs,
        participatedRFQs:       vendor.participatedRFQs,
        awardedRFQs:            vendor.awardedRFQs,
        openInvoices:           vendor.openInvoices,
        paidInvoices:           vendor.paidInvoices,
      },
    };
  }
}
