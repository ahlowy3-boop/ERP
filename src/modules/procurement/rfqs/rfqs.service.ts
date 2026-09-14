import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Types, QueryOptions, Model } from 'mongoose';
import { RfqsRepository } from './rfqs.repository';
import { QuotationsRepository } from './quotations.repository';
import { NumberingService } from 'src/shared/services/numbering.service';
import { PurchaseRequestRepository } from '../purchase-requests/purchase-requests.repository';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service';
import { CreateRfqDto, RfqVendorDto } from './dto/create-rfq.dto';
import { AddQuotationDto } from './dto/add-quotation.dto';
import { VendorTimelineModelName } from 'src/modules/vendors/entities/vendor-timeline.model';

@Injectable()
export class RfqsService {
  private readonly logger = new Logger(RfqsService.name);

  constructor(
    private readonly _RfqsRepository: RfqsRepository,
    private readonly _QuotationsRepository: QuotationsRepository,
    private readonly _PRRepository: PurchaseRequestRepository,
    private readonly _NumberingService: NumberingService,
    private readonly _POService: PurchaseOrdersService,
    @InjectModel(VendorTimelineModelName)
    private readonly timelineModel: Model<any>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  // ─── 1. Create RFQ from Approved Purchase Request ──────────────────────────
  async createRfq(data: CreateRfqDto, userId?: string) {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      // 1. Verify PR existence and status (with populated items)
      const pr = await this._PRRepository.findOne(
        { filter: { _id: data.purchaseRequestId } },
        [
          {
            path: 'items.itemId',
            select: 'itemCode itemName arabicName uom category unitPrice quantity',
            model: 'InventoryItem',
          },
        ],
      );
      if (!pr) throw new NotFoundException('Purchase Request not found');

      // 2. Generate hierarchical RFQ Number (RFQ-YYYY-XXXX-XXXX)
      const documentNumber = await this._NumberingService.generateRFQNumber(
        pr.requestNumber!,
        session,
      );
      const docParts = documentNumber.split('-');
      const rfqSeq = docParts[docParts.length - 1];
      const prParts = (pr.requestNumber || '').split('-');
      const prSeq = prParts[2] || '0001';

      // 3. Prepare invited vendors
      const vendors = (data.vendors || []).map((v: any) => ({
        vendorId: Types.ObjectId.isValid(v.vendorId) ? new Types.ObjectId(v.vendorId) : v.vendorId,
        vendorName: v.vendorName,
        contactEmail: v.contactEmail,
        status: 'Pending',
        invitationSentDate: new Date(),
      }));

      // Map and snapshot PR items into RFQ
      const rfqItems = (pr.items || []).map((it: any) => {
        const popItem = it.itemId && typeof it.itemId === 'object' ? it.itemId : null;
        return {
          itemId: popItem ? popItem._id : it.itemId,
          itemCode: (it.itemCode && it.itemCode !== 'N/A') ? it.itemCode : (popItem?.itemCode || it.itemCode || 'N/A'),
          itemName: (it.itemName && it.itemName !== 'Item' && it.itemName !== 'Procurement Item') ? it.itemName : (popItem?.itemName || it.itemName || 'Item'),
          arabicName: it.arabicName || popItem?.arabicName,
          uom: it.uom || popItem?.uom || 'EA',
          quantity: it.quantity || 1,
          unitPrice: it.unitPrice !== undefined ? it.unitPrice : (popItem?.unitPrice || 0),
          totalPrice: it.totalPrice !== undefined ? it.totalPrice : ((it.quantity || 1) * (it.unitPrice || popItem?.unitPrice || 0)),
          category: it.category || popItem?.category,
          notes: it.notes,
        };
      });

      // 4. Create RFQ document
      const rfq = await this._RfqsRepository.create(
        {
          rfqNumber: documentNumber,
          documentNumber,
          procurementChain: `${prSeq}-${rfqSeq}`,
          rootProcurementNumber: pr.rootProcurementNumber || pr.requestNumber,
          chainId: pr.chainId || pr.requestNumber,
          purchaseRequestId: pr._id,
          purchaseRequestNumber: pr.requestNumber,
          title: data.title,
          createdDate: new Date(),
          deadlineDate: new Date(data.deadlineDate),
          requiredDeliveryDate: data.requiredDeliveryDate ? new Date(data.requiredDeliveryDate) : undefined,
          requester: (pr as any).requestedBy || (pr as any).requesterName,
          status: 'Sent',
          items: rfqItems,
          vendors,
          quotations: [],
          chargeType: pr.chargeType,
          projectId: pr.projectId,
          projectName: pr.projectName,
          assetId: pr.assetId,
          assetName: pr.assetName,
          costCenter: pr.costCenter,
          createdBy: userId && Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : undefined,
        },
        { session },
      );

      // 5. Update PR status to 'RFQ Created'
      await this._PRRepository.update(
        { _id: pr._id },
        { $set: { status: 'RFQ Created' } },
        { session },
      );

      // 6. Log Timeline events for invited vendors
      for (const v of data.vendors || []) {
        if (v.vendorId && Types.ObjectId.isValid(v.vendorId)) {
          await this.timelineModel.create(
            [
              {
                vendorId: new Types.ObjectId(v.vendorId),
                date: new Date(),
                eventType: 'RFQ Sent',
                title: `Invitation for ${documentNumber}`,
                description: `Invited to participate in RFQ: "${data.title}"`,
                referenceNumber: documentNumber,
                performedByName: 'Procurement Department',
              },
            ],
            { session },
          );
        }
      }

      await session.commitTransaction();
      this.logger.log(`RFQ ${documentNumber} created from PR ${pr.requestNumber}`);

      return {
        statusCode: 201,
        message: 'RFQ created successfully and invitations dispatched.',
        data: rfq,
      };
    } catch (error: any) {
      await session.abortTransaction();
      throw new InternalServerErrorException(
        `Failed to create RFQ: ${error.message}`,
      );
    } finally {
      session.endSession();
    }
  }

  // ── Helper to ensure full item snapshot details even for legacy RFQs ────────
  private formatRfqItems(rfq: any) {
    if (!rfq) return rfq;
    const rfqObj =
      typeof rfq.toJSON === 'function'
        ? rfq.toJSON()
        : rfq.toObject
          ? rfq.toObject()
          : { ...rfq };
    if (Array.isArray(rfqObj.items)) {
      rfqObj.items = rfqObj.items.map((it: any) => {
        const popItem =
          it.itemId && typeof it.itemId === 'object' ? it.itemId : null;
        return {
          ...it,
          itemId: popItem ? popItem._id : it.itemId,
          itemCode:
            it.itemCode && it.itemCode !== 'N/A'
              ? it.itemCode
              : popItem?.itemCode || it.itemCode || 'N/A',
          itemName:
            it.itemName &&
            it.itemName !== 'Item' &&
            it.itemName !== 'Procurement Item'
              ? it.itemName
              : popItem?.itemName || it.itemName || 'Item',
          arabicName: it.arabicName || popItem?.arabicName,
          uom: it.uom || popItem?.uom || 'EA',
          quantity: it.quantity || 1,
          unitPrice:
            it.unitPrice !== undefined
              ? it.unitPrice
              : popItem?.unitPrice || 0,
          totalPrice:
            it.totalPrice !== undefined
              ? it.totalPrice
              : (it.quantity || 1) * (it.unitPrice || popItem?.unitPrice || 0),
          category: it.category || popItem?.category,
        };
      });
    }
    return rfqObj;
  }

  // ─── 2. List RFQs with Filter, Search & Pagination ─────────────────────────
  async findAll(query: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: string;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 50;
    const { status, search, sortBy = 'createdAt', sortOrder = 'DESC' } = query;

    const filter: any = { isDeleted: { $ne: true } };

    if (status) {
      filter.status = status;
    }

    if (search) {
      filter.$or = [
        { rfqNumber: { $regex: search, $options: 'i' } },
        { title: { $regex: search, $options: 'i' } },
        { purchaseRequestNumber: { $regex: search, $options: 'i' } },
      ];
    }

    const sortDir = (sortOrder || '').toUpperCase() === 'ASC' ? 1 : -1;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this._RfqsRepository.model
        .find(filter)
        .populate({
          path: 'items.itemId',
          select: 'itemCode itemName arabicName uom category unitPrice quantity',
          model: 'InventoryItem',
        })
        .sort({ [sortBy]: sortDir })
        .skip(skip)
        .limit(limit)
        .lean(),
      this._RfqsRepository.model.countDocuments(filter),
    ]);

    return {
      statusCode: 200,
      message: 'RFQs retrieved successfully',
      data: items.map((it) => this.formatRfqItems(it)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ─── 3. Get RFQ Details by ID ─────────────────────────────────────────────
  async findOne(id: string) {
    const rfq = await this._RfqsRepository.findOne(
      { filter: { _id: id } },
      [
        {
          path: 'items.itemId',
          select: 'itemCode itemName arabicName uom category unitPrice quantity',
          model: 'InventoryItem',
        },
      ],
    );
    if (!rfq) throw new NotFoundException('RFQ not found');

    // Fetch quotations associated with this RFQ
    const quotations = await this._QuotationsRepository.findAll({
      filter: { rfqId: id },
      sort: { createdAt: -1 },
    });

    const rfqObj = this.formatRfqItems(rfq);

    return {
      statusCode: 200,
      message: 'RFQ retrieved successfully',
      data: {
        ...rfqObj,
        quotations: quotations && quotations.length ? quotations : (rfqObj.quotations || []),
      },
    };
  }

  // ─── 4. Log Vendor Quotation / Bid ────────────────────────────────────────
  async addQuotation(rfqId: string, data: any) {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const rfq = await this._RfqsRepository.findOne({
        filter: { _id: rfqId },
        options: { session },
      });
      if (!rfq) throw new NotFoundException('RFQ not found');

      // Locate vendor inside RFQ
      let vendorIndex = (rfq.vendors || []).findIndex(
        (v: any) => v.vendorId?.toString() === data.vendorId?.toString(),
      );

      // If vendor not in list, auto-add
      if (vendorIndex === -1) {
        rfq.vendors = rfq.vendors || [];
        rfq.vendors.push({
          vendorId: Types.ObjectId.isValid(data.vendorId) ? new Types.ObjectId(data.vendorId) : data.vendorId,
          vendorName: data.vendorName,
          contactEmail: data.vendorEmail,
          status: 'Pending',
          invitationSentDate: new Date(),
        });
        vendorIndex = rfq.vendors.length - 1;
      }

      // Generate sequential quotation number: QT-YYYY-XXXX-XXXX-XXXX
      const quotationsCount = await this._QuotationsRepository.model
        .countDocuments({ rfqId })
        .session(session);
      const quotationSeq = quotationsCount + 1;
      const paddedSeq = quotationSeq.toString().padStart(4, '0');
      const rfqCode = (rfq.rfqNumber || '').replace(/^RFQ-/, '');
      const quotationNumber = `QT-${rfqCode}-${paddedSeq}`;

      // Calculate financial amounts
      const price = Number(data.price || data.subtotal || 0);
      const discountPercent = Number(data.discountPercent || 0);
      const discountAmount = Number(data.discountAmount || (price * discountPercent / 100));
      const subtotal = price - discountAmount;
      const taxPercent = Number(data.taxPercent !== undefined ? data.taxPercent : 15);
      const taxAmount = Number(data.taxAmount !== undefined ? data.taxAmount : (subtotal * taxPercent / 100));
      const totalAmount = Number(data.totalAmount !== undefined ? data.totalAmount : (subtotal + taxAmount));

      const quotationPayload = {
        rfqId,
        quotationNumber,
        quotationSequence: quotationSeq,
        procurementChain: `${rfq.procurementChain || rfqCode}-${paddedSeq}`,
        vendorId: data.vendorId?.toString(),
        vendorName: data.vendorName,
        vendorContactPerson: data.vendorContactPerson,
        vendorPhone: data.vendorPhone,
        vendorEmail: data.vendorEmail,
        quotationDate: data.quotationDate ? new Date(data.quotationDate) : new Date(),
        validityDate: data.validityDate ? new Date(data.validityDate) : undefined,
        currency: data.currency || 'USD',
        deliveryWeeks: Number(data.deliveryWeeks || 2),
        deliveryLocation: data.deliveryLocation,
        paymentTerms: data.paymentTerms || 'Net 30',
        warrantyPeriod: data.warrantyPeriod,
        notes: data.notes,
        price,
        subtotal,
        discountPercent,
        discountAmount,
        taxPercent,
        taxAmount,
        totalAmount,
        status: 'Submitted',
        items: data.items || [],
        attachments: data.attachments || [],
        submissionDate: new Date(),
      };

      // Create Quotation record
      const quotation = await this._QuotationsRepository.create(
        quotationPayload,
        { session },
      );

      // Update vendor status inside RFQ
      rfq.vendors[vendorIndex].status = 'Submitted';
      rfq.vendors[vendorIndex].quotationSubmittedDate = new Date();

      // Add to rfq.quotations array
      rfq.quotations = rfq.quotations || [];
      rfq.quotations.push({
        _id: quotation._id,
        ...quotationPayload,
      });

      // Check if all invited vendors submitted
      const allSubmitted = (rfq.vendors || []).every(
        (v: any) => v.status === 'Submitted' || v.status === 'Declined',
      );
      rfq.status = allSubmitted ? 'Fully Responded' : 'Partially Responded';

      await rfq.save({ session });

      // Add timeline event on vendor profile
      if (Types.ObjectId.isValid(data.vendorId)) {
        await this.timelineModel.create(
          [
            {
              vendorId: new Types.ObjectId(data.vendorId),
              date: new Date(),
              eventType: 'Quotation Submitted',
              title: `Quotation ${quotationNumber} Submitted for ${rfq.rfqNumber}`,
              description: `Submitted bid of ${totalAmount} ${data.currency || 'USD'} with lead time ${data.deliveryWeeks || 2} weeks.`,
              referenceNumber: quotationNumber,
              amount: totalAmount,
              performedByName: data.vendorName,
            },
          ],
          { session },
        );
      }

      await session.commitTransaction();
      return {
        statusCode: 201,
        message: 'Quotation added successfully',
        data: quotation,
      };
    } catch (error: any) {
      await session.abortTransaction();
      throw new InternalServerErrorException(
        `Failed to add Quotation: ${error.message}`,
      );
    } finally {
      session.endSession();
    }
  }

  // ─── 5. Invite Additional Vendors to Existing RFQ ──────────────────────────
  async inviteVendors(
    rfqId: string,
    vendors: RfqVendorDto[],
    session?: QueryOptions['session'],
  ) {
    const rfq = await this._RfqsRepository.findOne({ filter: { _id: rfqId } });
    if (!rfq) throw new NotFoundException('RFQ not found');

    const newVendors = (vendors || []).map((v) => ({
      vendorId: Types.ObjectId.isValid(v.vendorId) ? new Types.ObjectId(v.vendorId) : v.vendorId,
      vendorName: v.vendorName,
      contactEmail: v.contactEmail,
      status: 'Pending',
      invitationSentDate: new Date(),
    }));

    rfq.vendors = rfq.vendors || [];
    rfq.vendors.push(...(newVendors as any));

    await rfq.save({ session });

    // Timeline event for new vendors
    for (const v of vendors || []) {
      if (v.vendorId && Types.ObjectId.isValid(v.vendorId)) {
        await this.timelineModel.create({
          vendorId: new Types.ObjectId(v.vendorId),
          date: new Date(),
          eventType: 'RFQ Sent',
          title: `Invitation for ${rfq.rfqNumber}`,
          description: `Invited to participate in RFQ: "${rfq.title}"`,
          referenceNumber: rfq.rfqNumber,
          performedByName: 'Procurement Department',
        });
      }
    }

    return {
      statusCode: 200,
      message: 'Vendors invited successfully',
      data: rfq,
    };
  }

  // ─── 6. Update Quotation Status ───────────────────────────────────────────
  async updateQuotationStatus(
    rfqId: string,
    quotationId: string,
    status: string,
  ) {
    const quotation = await this._QuotationsRepository.findOneAndUpdate(
      { _id: quotationId, rfqId },
      { status },
    );
    if (!quotation) throw new NotFoundException('Quotation not found');

    // Also update in RFQ quotations embedded array if present
    await this._RfqsRepository.model.updateOne(
      { _id: rfqId, 'quotations._id': new Types.ObjectId(quotationId) },
      { $set: { 'quotations.$.status': status } },
    );

    return {
      statusCode: 200,
      message: `Quotation status updated to ${status}`,
      data: quotation,
    };
  }

  // ─── 7. Award RFQ & Generate Purchase Order (PO) ──────────────────────────
  async awardQuotation(rfqId: string, quotationId?: string, vendorId?: string) {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const rfq = await this._RfqsRepository.findOne({
        filter: {
          $or: [
            { _id: rfqId },
            ...(Types.ObjectId.isValid(rfqId)
              ? [{ _id: new Types.ObjectId(rfqId) }]
              : []),
          ],
        },
        options: { session },
      });
      if (!rfq) throw new NotFoundException('RFQ not found');

      // 1. Locate Quotation
      let quotation: any = null;

      // 1a. Try repository with quotationId
      if (quotationId) {
        quotation = await this._QuotationsRepository.findOne({
          filter: {
            $or: [
              { _id: quotationId },
              ...(Types.ObjectId.isValid(quotationId)
                ? [{ _id: new Types.ObjectId(quotationId) }]
                : []),
            ],
          },
          options: { session },
        });
      }

      // 1b. Try search within rfq.quotations array
      if (!quotation && rfq.quotations && rfq.quotations.length > 0) {
        if (quotationId) {
          quotation = (rfq.quotations as any[]).find(
            (q: any) =>
              q._id?.toString() === quotationId?.toString() ||
              q.id?.toString() === quotationId?.toString() ||
              q.quotationNumber === quotationId,
          );
        }
        if (!quotation && vendorId) {
          quotation = (rfq.quotations as any[]).find(
            (q: any) => q.vendorId?.toString() === vendorId?.toString(),
          );
        }
      }

      // 1c. Try repository with vendorId & rfqId
      if (!quotation && vendorId) {
        quotation = await this._QuotationsRepository.findOne({
          filter: {
            rfqId: rfqId.toString(),
            $or: [
              { vendorId: vendorId.toString() },
              ...(Types.ObjectId.isValid(vendorId)
                ? [{ vendorId: new Types.ObjectId(vendorId) }]
                : []),
            ],
          },
          options: { session },
        });
      }

      // 1d. Fallback if single quotation exists on RFQ
      if (!quotation && rfq.quotations && rfq.quotations.length === 1) {
        quotation = rfq.quotations[0];
      }

      if (!quotation) {
        throw new NotFoundException('Quotation not found for this RFQ');
      }

      const targetQuotationId = quotation._id?.toString() || quotationId;
      const targetVendorId =
        vendorId ||
        quotation.vendorId?.toString() ||
        (rfq.vendors?.[0]?.vendorId?.toString());

      // 2. Backfill RFQ procurement chain fields if missing
      if (!rfq.rootProcurementNumber && rfq.purchaseRequestId) {
        try {
          const pr = await this._PRRepository.findOne({
            filter: { _id: rfq.purchaseRequestId },
            options: { session },
          });
          if (pr) {
            rfq.rootProcurementNumber =
              pr.rootProcurementNumber || pr.requestNumber || 'PR-2026-0001';
            if (pr.requestNumber) {
              rfq.purchaseRequestNumber = pr.requestNumber;
            }
            rfq.chainId = pr.chainId || pr.requestNumber || rfq.rootProcurementNumber;
          }
        } catch (e: any) {
          this.logger.warn(`Could not backfill PR chain: ${e.message}`);
        }
      }
      if (!rfq.rootProcurementNumber) {
        rfq.rootProcurementNumber =
          rfq.rfqNumber || `RFQ-${new Date().getFullYear()}-0001`;
      }
      if (!rfq.chainId) {
        rfq.chainId = rfq.rootProcurementNumber;
      }
      if (!rfq.procurementChain) {
        rfq.procurementChain = rfq.rfqNumber || rfq.rootProcurementNumber;
      }

      // 3. Update RFQ status & award info
      rfq.status = 'Awarded';
      rfq.awardedVendorId = Types.ObjectId.isValid(targetVendorId)
        ? new Types.ObjectId(targetVendorId)
        : undefined;
      rfq.awardedVendorName = quotation.vendorName;
      rfq.awardedQuotationId = quotation._id;
      rfq.awardedQuotationNumber = quotation.quotationNumber;
      rfq.awardedAt = new Date();

      // 4. Mark winning quotation as Accepted, others as Rejected
      try {
        if (rfqId) {
          await this._QuotationsRepository.model.updateMany(
            {
              rfqId,
              ...(targetQuotationId ? { _id: { $ne: targetQuotationId } } : {}),
            },
            { $set: { status: 'Rejected' } },
            { session },
          );
        }

        if (targetQuotationId) {
          await this._QuotationsRepository.model.updateOne(
            {
              $or: [
                { _id: targetQuotationId },
                ...(Types.ObjectId.isValid(targetQuotationId)
                  ? [{ _id: new Types.ObjectId(targetQuotationId) }]
                  : []),
              ],
            },
            { $set: { status: 'Accepted' } },
            { session },
          );
        }
      } catch (qUpdateErr: any) {
        this.logger.warn(`Quotation status update note: ${qUpdateErr.message}`);
      }

      // Update statuses in rfq.quotations array
      if (rfq.quotations && rfq.quotations.length > 0) {
        rfq.quotations.forEach((q: any) => {
          if (
            q._id?.toString() === targetQuotationId?.toString() ||
            q.quotationNumber === quotation.quotationNumber
          ) {
            q.status = 'Accepted';
          } else {
            q.status = 'Rejected';
          }
        });
      }

      // Update vendor status in rfq.vendors
      if (rfq.vendors && rfq.vendors.length > 0) {
        rfq.vendors.forEach((v: any) => {
          if (v.vendorId?.toString() === targetVendorId?.toString()) {
            v.status = 'Awarded';
          }
        });
      }

      // 5. Automatically create Purchase Order (PO)
      const po = await this._POService.createAutoFromQuotation(
        rfq,
        quotation,
        session,
      );

      rfq.generatedPurchaseOrderId = po._id;
      rfq.generatedPurchaseOrderNumber = po.poNumber;
      await rfq.save({ session });

      // 6. Add Timeline Event to the winning vendor
      if (targetVendorId && Types.ObjectId.isValid(targetVendorId)) {
        try {
          await this.timelineModel.create(
            [
              {
                vendorId: new Types.ObjectId(targetVendorId),
                date: new Date(),
                eventType: 'PO Issued',
                title: `PO Issued from Awarded RFQ: ${po.poNumber}`,
                description: `Awarded contract for ${rfq.rfqNumber} (Quotation: ${quotation.quotationNumber || 'N/A'}). Total value: ${quotation.totalAmount || quotation.price || 0}.`,
                referenceNumber: po.poNumber,
                amount: quotation.totalAmount || quotation.price || 0,
                performedByName: 'Procurement Manager',
              },
            ],
            { session },
          );
        } catch (timelineErr: any) {
          this.logger.warn(
            `Failed to create vendor timeline event: ${timelineErr.message}`,
          );
        }
      }

      await session.commitTransaction();
      this.logger.log(
        `RFQ ${rfq.rfqNumber} awarded to ${quotation.vendorName}. Generated PO: ${po.poNumber}`,
      );

      return {
        statusCode: 200,
        message: 'RFQ awarded successfully. Purchase Order created.',
        data: {
          _id: rfq._id,
          rfqNumber: rfq.rfqNumber,
          status: 'Awarded',
          awardedVendorId: rfq.awardedVendorId,
          awardedVendorName: rfq.awardedVendorName,
          awardedQuotationId: rfq.awardedQuotationId,
          awardedQuotationNumber: rfq.awardedQuotationNumber,
          generatedPurchaseOrderId: po._id,
          generatedPurchaseOrderNumber: po.poNumber,
          purchaseOrder: po,
        },
      };
    } catch (error: any) {
      await session.abortTransaction();
      this.logger.error(
        `Failed to award RFQ ${rfqId}: ${error.message}`,
        error.stack,
      );
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to award RFQ: ${error.message}`,
      );
    } finally {
      session.endSession();
    }
  }

  // ─── 8. Upload Quotation Attachment ───────────────────────────────────────
  async uploadQuotationAttachment(
    rfqId: string,
    quotationId: string,
    file: Express.Multer.File,
  ) {
    const quotation = await this._QuotationsRepository.findOne({
      filter: { _id: quotationId, rfqId },
    });
    if (!quotation) throw new NotFoundException('Quotation not found');

    const fakeFileUrl = `https://storage.petroflow.com/quotations/${quotationId}-${file.originalname}`;

    if (!quotation.attachments) {
      quotation.attachments = [];
    }
    quotation.attachments.push({
      fileName: file.originalname,
      fileSize: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
      fileType: file.mimetype,
      fileUrl: fakeFileUrl,
    } as any);

    await quotation.save();
    return {
      statusCode: 200,
      message: 'Attachment uploaded successfully',
      data: { attachmentUrl: fakeFileUrl },
    };
  }
}
