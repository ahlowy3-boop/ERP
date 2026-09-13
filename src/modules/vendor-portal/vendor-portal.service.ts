import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { VendorModelName } from '../vendors/entities/vendor.model';
import { VendorTimelineModelName } from '../vendors/entities/vendor-timeline.model';
import { RFQModelName } from '../procurement/rfqs/entities/rfq.model';
import { QuotationModelName } from '../procurement/rfqs/entities/quotation.model';

@Injectable()
export class VendorPortalService {
  private readonly logger = new Logger(VendorPortalService.name);

  constructor(
    @InjectModel(VendorModelName)         private vendorModel:    Model<any>,
    @InjectModel(VendorTimelineModelName) private timelineModel:  Model<any>,
    @InjectModel(RFQModelName)            private rfqModel:       Model<any>,
    @InjectModel(QuotationModelName)      private quotationModel: Model<any>,
  ) {}

  // ─── Resolve vendor from logged-in user ───────────────────────────────────
  private async resolveVendor(vendorId: string) {
    const vendor = await this.vendorModel.findOne({
      _id: vendorId,
      isDeleted: false,
    }).lean();
    if (!vendor) throw new NotFoundException('Vendor profile not found');
    return vendor;
  }

  // ─── Dashboard KPIs ───────────────────────────────────────────────────────
  async getDashboard(vendorId: string) {
    const vendor = await this.resolveVendor(vendorId) as any;

    const [openRFQs, totalRFQsInSystem] = await Promise.all([
      this.rfqModel.countDocuments({
        'vendors.vendorId': vendorId,
        'vendors.status': { $in: ['Pending', 'Invited'] },
        status: { $in: ['Published', 'Partially Responded'] },
        isDeleted: { $ne: true },
      }),
      this.rfqModel.countDocuments({
        'vendors.vendorId': vendorId,
        isDeleted: { $ne: true },
      }),
    ]);

    const submittedBids = await this.rfqModel.countDocuments({
      'vendors.vendorId': vendorId,
      'vendors.status': 'Submitted',
      isDeleted: { $ne: true },
    });

    return {
      success: true,
      data: {
        vendorCode:      vendor.vendorCode,
        vendorName:      vendor.vendorName,
        approvalStatus:  vendor.approvalStatus,
        rating:          vendor.rating,
        openRFQs,
        submittedBids,
        awardedContracts: vendor.awardedRFQs || 0,
        rejectedBids:    totalRFQsInSystem - submittedBids - (vendor.awardedRFQs || 0),
        totalSpend:      vendor.totalSpend || 0,
        openInvoices:    vendor.openInvoices || 0,
      },
    };
  }

  // ─── List RFQs assigned to vendor ─────────────────────────────────────────
  async listRfqs(vendorId: string, query: { status?: string; page?: number; limit?: number }) {
    await this.resolveVendor(vendorId);

    const { status, page = 1, limit = 20 } = query;
    const filter: any = {
      'vendors.vendorId': vendorId,
      isDeleted: { $ne: true },
    };
    if (status) filter['vendors.status'] = status;

    const skip = (Number(page) - 1) * Number(limit);
    const [rfqs, total] = await Promise.all([
      this.rfqModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      this.rfqModel.countDocuments(filter),
    ]);

    // Enrich with this vendor's specific status
    const enriched = rfqs.map((rfq: any) => {
      const vendorEntry = (rfq.vendors || []).find(
        (v: any) => v.vendorId?.toString() === vendorId,
      );
      return {
        ...rfq,
        myStatus: vendorEntry?.status || 'Invited',
      };
    });

    return {
      statusCode: 200,
      data: enriched,
      meta: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) },
    };
  }

  // ─── Get RFQ details for bidding ──────────────────────────────────────────
  async getRfqDetails(vendorId: string, rfqId: string) {
    await this.resolveVendor(vendorId);

    const rfq = await this.rfqModel.findOne({
      _id: rfqId,
      'vendors.vendorId': vendorId,
      isDeleted: { $ne: true },
    }).lean() as any;

    if (!rfq) throw new NotFoundException('RFQ not found or not assigned to your account');

    const vendorEntry = (rfq.vendors || []).find(
      (v: any) => v.vendorId?.toString() === vendorId,
    );

    return {
      statusCode: 200,
      data: {
        ...rfq,
        myStatus: vendorEntry?.status || 'Invited',
        myQuotation: vendorEntry?.quotation || null,
      },
    };
  }

  // ─── Submit Quotation / Bid ────────────────────────────────────────────────
  async submitQuotation(vendorId: string, rfqId: string, dto: any) {
    const vendor = await this.resolveVendor(vendorId) as any;

    const rfq = await this.rfqModel.findOne({
      _id: rfqId,
      isDeleted: { $ne: true },
    }) as any;

    if (!rfq) throw new NotFoundException('RFQ not found');

    if (!['Published', 'Partially Responded'].includes(rfq.status)) {
      throw new BadRequestException(`RFQ is ${rfq.status} and cannot accept quotations`);
    }

    if (rfq.deadlineDate && new Date() > new Date(rfq.deadlineDate)) {
      throw new BadRequestException('RFQ deadline has passed');
    }

    // Find or create vendor entry in RFQ
    const vendorIndex = (rfq.vendors || []).findIndex(
      (v: any) => v.vendorId?.toString() === vendorId,
    );

    // Sequential Quotation Number QTN-YYYY-XXXX (or based on RFQ Number)
    const quotationsCount = await this.quotationModel.countDocuments({ rfqId: rfq._id });
    const quotationSeq = quotationsCount + 1;
    const paddedSeq = quotationSeq.toString().padStart(4, '0');
    const rfqCode = (rfq.rfqNumber || '').replace(/^RFQ-/, '');
    const quotationNumber = `QTN-${rfqCode}-${paddedSeq}`;

    // Create Quotation record in procurement quotations collection
    const createdQuotation = await this.quotationModel.create({
      rfqId: rfq._id,
      quotationNumber,
      quotationSequence: quotationSeq,
      procurementChain: `${rfq.procurementChain || rfqCode}-${paddedSeq}`,
      vendorId: vendor._id.toString(),
      vendorName: vendor.vendorName,
      vendorContactPerson: vendor.contactPerson,
      vendorPhone: vendor.contactPhone,
      vendorEmail: vendor.contactEmail,
      submissionDate: new Date(),
      currency: dto.currency || vendor.currency || 'USD',
      deliveryWeeks: dto.deliveryWeeks || 2,
      paymentTerms: dto.paymentTerms || vendor.paymentTerms || 'Net 30',
      remarks: dto.notes,
      price: dto.subtotal || dto.totalAmount || 0,
      subtotal: dto.subtotal || dto.totalAmount || 0,
      taxPercent: dto.taxPercent ?? 15,
      taxAmount: dto.taxAmount ?? 0,
      totalAmount: dto.totalAmount ?? 0,
      status: 'Submitted',
      items: dto.items || [],
      attachments: (dto.attachments || []).map((att: any) => ({
        fileName: att.name || att.fileName,
        fileSize: att.size || att.fileSize,
        fileType: att.type || att.mimeType,
        fileUrl: att.url || att.fileUrl,
      })),
    });

    const quotationData = {
      ...dto,
      quotationId: createdQuotation._id,
      quotationNumber,
      submittedAt: new Date(),
      vendorId,
      vendorName: vendor.vendorName,
      vendorCode: vendor.vendorCode,
    };

    if (vendorIndex >= 0) {
      rfq.vendors[vendorIndex].status = 'Submitted';
      rfq.vendors[vendorIndex].quotationSubmittedDate = new Date();
      rfq.vendors[vendorIndex].quotation = quotationData;
    } else {
      rfq.vendors = rfq.vendors || [];
      rfq.vendors.push({
        vendorId,
        vendorName: vendor.vendorName,
        status: 'Submitted',
        quotationSubmittedDate: new Date(),
        quotation: quotationData,
      });
    }

    // Update RFQ status
    const allVendors = rfq.vendors || [];
    const anySubmitted = allVendors.some((v: any) => v.status === 'Submitted');
    if (anySubmitted && ['Published', 'Sent'].includes(rfq.status)) {
      rfq.status = 'Partially Responded';
    }

    await rfq.save();

    // Increment vendor's participatedRFQs counter
    await this.vendorModel.findByIdAndUpdate(vendorId, {
      $inc: { participatedRFQs: 1 },
    });

    // Timeline event on vendor profile
    await this.timelineModel.create({
      vendorId:      new Types.ObjectId(vendorId),
      date:          new Date(),
      eventType:     'Quotation Submitted',
      title:         `Quotation submitted for ${rfq.rfqNumber}`,
      description:   `Total amount: ${dto.totalAmount || 0} ${dto.currency || 'USD'} (Ref: ${quotationNumber})`,
      referenceNumber: rfq.rfqNumber,
      amount:        dto.totalAmount,
      performedByName: vendor.vendorName,
    });

    // Real-time Notification dispatch to Procurement Department
    this.logger.log(
      `[NOTIFICATION -> Procurement Department] Title: "New Quotation Received" | Details: "${vendor.vendorName}" submitted quotation ${quotationNumber} for RFQ #${rfq.rfqNumber}`,
    );

    return {
      success: true,
      message: 'Quotation submitted successfully',
      data: quotationData,
    };
  }

  // ─── Quotation History ────────────────────────────────────────────────────
  async getHistory(vendorId: string, query: { page?: number; limit?: number }) {
    await this.resolveVendor(vendorId);

    const { page = 1, limit = 20 } = query;
    const skip = (Number(page) - 1) * Number(limit);

    const rfqs = await this.rfqModel
      .find({
        'vendors.vendorId': vendorId,
        'vendors.status': { $in: ['Submitted', 'Accepted', 'Rejected'] },
        isDeleted: { $ne: true },
      })
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean() as any[];

    const history = rfqs.map((rfq: any) => {
      const vendorEntry = (rfq.vendors || []).find(
        (v: any) => v.vendorId?.toString() === vendorId,
      );
      const quotation = vendorEntry?.quotation || {};
      return {
        rfqId:          rfq._id,
        rfqNumber:      rfq.rfqNumber,
        title:          rfq.title,
        submissionDate: quotation.submittedAt,
        status:         vendorEntry?.status || 'Unknown',
        totalAmount:    quotation.totalAmount || 0,
      };
    });

    return {
      statusCode: 200,
      data: history,
    };
  }
}
