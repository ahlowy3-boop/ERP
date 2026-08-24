import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types, QueryOptions } from 'mongoose';
import { RfqsRepository } from './rfqs.repository';
import { QuotationsRepository } from './quotations.repository';
import { NumberingService } from 'src/shared/services/numbering.service';
import { PurchaseRequestRepository } from '../purchase-requests/purchase-requests.repository';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service';
import { CreateRfqDto, RfqVendorDto } from './dto/create-rfq.dto';
import { AddQuotationDto } from './dto/add-quotation.dto';
@Injectable()
export class RfqsService {
  constructor(
    private readonly _RfqsRepository: RfqsRepository,
    private readonly _QuotationsRepository: QuotationsRepository,
    private readonly _PRRepository: PurchaseRequestRepository,
    private readonly _NumberingService: NumberingService,
    private readonly _POService: PurchaseOrdersService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async createRfq(data: CreateRfqDto) {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      // 1. التحقق من وجود طلب الشراء
      const pr = await this._PRRepository.findOne({
        _id: data.purchaseRequestId,
      });
      if (!pr) throw new NotFoundException('Purchase Request not found');

      // 2. استخراج سنة ورقم طلب الشراء من requestNumber (e.g., PR-2026-0001)
      const prParts = pr.requestNumber!.split('-');
      const prSeq = prParts[2];

      // 3. توليد رقم الـ RFQ الهرمي
      const documentNumber = await this._NumberingService.generateRFQNumber(
        pr.requestNumber!,
        session,
      );
      const docParts = documentNumber.split('-');
      const rfqSeq = docParts[docParts.length - 1];

      // 4. إنشاء الـ RFQ
      const rfq = await this._RfqsRepository.create(
        {
          ...data,
          rfqNumber: `${pr.requestNumber}-${rfqSeq}`,
          documentNumber,
          procurementChain: `${prSeq}-${rfqSeq}`,
          rootProcurementNumber: pr.rootProcurementNumber,
          chainId: pr.chainId,
          parentDocumentId: pr._id,
          parentDocumentNumber: pr.requestNumber,
          purchaseRequestNumber: pr.requestNumber,
          status: 'Sent',
          chargeType: pr.chargeType,
          projectId: pr.projectId,
          projectName: pr.projectName,
          assetId: pr.assetId,
          assetName: pr.assetName,
          costCenter: pr.costCenter,
          vendors: data.vendors.map((v: any) => ({
            ...v,
            status: 'Pending',
            invitationSentDate: new Date(),
          })),
        },
        { session },
      );

      // 5. تطبيق Business Rule: تغيير حالة الـ PR إلى 'RFQ Created'
      await this._PRRepository.update(
        { _id: pr._id },
        { $set: { status: 'RFQ Created' } },
        { session },
      );

      await session.commitTransaction();
      return { message: 'RFQ created successfully', data: rfq };
    } catch (error) {
      await session.abortTransaction();
      throw new InternalServerErrorException(
        `Failed to create RFQ: ${error.message}`,
      );
    } finally {
      session.endSession();
    }
  }

  // إضافة تسعيرة (Quotation) من مورد
  async addQuotation(rfqId: string, data: AddQuotationDto) {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const rfq = await this._RfqsRepository.findOne({
        filter: { _id: rfqId },
        options: { session },
      });
      if (!rfq) throw new NotFoundException('RFQ not found');

      // العثور على المورد داخل الـ RFQ
      const vendorIndex = rfq.vendors.findIndex(
        (v) => v.vendorId === data.vendorId,
      );
      if (vendorIndex === -1)
        throw new BadRequestException('Vendor is not invited to this RFQ');

      // حساب التسلسل لعروض الأسعار (quotationSequence)
      const quotationsCount = (
        await this._QuotationsRepository.findAll({
          filter: { rfqId },
          session,
        })
      ).length;
      const quotationSeq = quotationsCount + 1;
      const paddedQuotationSeq = quotationSeq.toString().padStart(4, '0');

      const quotationNumber = `QTN-${rfq.rfqNumber.replace('RFQ-', '')}-${paddedQuotationSeq}`;

      // إنشاء عرض السعر
      const quotation = await this._QuotationsRepository.create(
        {
          ...data,
          rfqId,
          quotationNumber,
          quotationSequence: quotationSeq,
          procurementChain: `${rfq.procurementChain}-${paddedQuotationSeq}`,
          submissionDate: new Date(),
        },
        { session },
      );

      // تحديث حالة المورد داخل الـ RFQ إلى Submitted
      rfq.vendors[vendorIndex].status = 'Submitted';
      rfq.vendors[vendorIndex].quotationSubmittedDate = new Date();
      rfq.status = 'Partially Responded'; // يمكن وضع منطق لفحص هل جميع الموردين ردوا لتصبح Fully Responded

      await rfq.save({ session });

      await session.commitTransaction();
      return { message: 'Quotation added successfully', data: quotation };
    } catch (error) {
      await session.abortTransaction();
      throw new InternalServerErrorException(
        `Failed to add Quotation: ${error.message}`,
      );
    } finally {
      session.endSession();
    }
  }

  // الترسية على مورد (Award)
  async awardQuotation(rfqId: string, quotationId: string, vendorId: string) {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const rfq = await this._RfqsRepository.findOne({
        filter: { _id: rfqId },
        options: { session },
      });
      if (!rfq) throw new NotFoundException('RFQ not found');

      const quotation = await this._QuotationsRepository.findOne({
        filter: { _id: quotationId, vendorId },
        options: { session },
      });
      if (!quotation)
        throw new NotFoundException(
          'Quotation not found or does not belong to vendor',
        );

      // 1. تحديث حالة RFQ والمورد الفائز
      rfq.status = 'Awarded';
      rfq.awardedVendorId = vendorId;
      rfq.awardedVendorName = quotation.vendorName;
      rfq.awardedQuotationId = quotation._id.toString();
      rfq.awardedQuotationNumber = quotation.quotationNumber;
      await rfq.save({ session });

      // 2. تحديث حالات جميع عروض الأسعار (الفائز = Accepted، الباقي = Rejected)
      await this._QuotationsRepository.model.updateMany(
        { rfqId, _id: { $ne: quotationId } },
        { $set: { status: 'Rejected' } },
        { session },
      );

      await this._QuotationsRepository.update(
        { _id: quotationId },
        { $set: { status: 'Accepted' } },
        { session },
      );
      await this._POService.createAutoFromQuotation(rfq, quotation, session);
      await session.commitTransaction();
      return { message: 'RFQ Awarded successfully', data: rfq };
    } catch (error) {
      await session.abortTransaction();
      throw new InternalServerErrorException(
        `Failed to award RFQ: ${error.message}`,
      );
    } finally {
      session.endSession();
    }
  }

  // دعوة موردين إضافيين لـ RFQ موجود
  async inviteVendors(
    rfqId: string,
    vendors: RfqVendorDto[],
    session?: QueryOptions['session'],
  ) {
    const rfq = await this._RfqsRepository.findOne({ filter: { _id: rfqId } });
    if (!rfq) throw new NotFoundException('RFQ not found');

    const newVendors = vendors.map((v) => ({
      ...v,
      status: 'Pending',
      invitationSentDate: new Date(),
    }));
    rfq.vendors.push(...(newVendors as any));

    await rfq.save({ session });
    return { message: 'Vendors invited successfully', data: rfq };
  }

  // تحديث حالة عرض سعر محدد (مثلاً: Request Revision)
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
    return {
      message: `Quotation status updated to ${status}`,
      data: quotation,
    };
  }
  // NOTE: vendors are stored as embedded plain objects (not Mongoose ObjectId refs),
  // so .populate() is not applicable. Each vendor entry already contains vendorId (string),
  // vendorName, contactEmail, status, invitationSentDate as set at creation time.
  async findAll(page: number = 1, limit: number = 20) {
    return await this._RfqsRepository.findAll({
      paginate: { page, limit },
      sort: { createdAt: -1 },
    });
  }

  async findOne(id: string) {
    const rfq = await this._RfqsRepository.findOne({ filter: { _id: id } });
    if (!rfq) throw new NotFoundException('RFQ not found');

    // vendors[] is already embedded inline — full vendor objects are returned as-is.
    // quotations are fetched separately and merged into the response.
    const quotations = await this._QuotationsRepository.findAll({
      filter: { rfqId: id },
    });

    return { data: { ...rfq.toJSON(), quotations } };
  }

  // إضافة دالة رفع مرفقات عروض الأسعار
  async uploadQuotationAttachment(
    rfqId: string,
    quotationId: string,
    file: Express.Multer.File,
  ) {
    const quotation = await this._QuotationsRepository.findOne({
      filter: { _id: quotationId, rfqId },
    });
    if (!quotation) throw new NotFoundException('Quotation not found');

    // const uploadResult = await this._FileUploadService.uploadFile(file);
    const fakeFileUrl = `https://storage.petroflow.com/quotations/${quotationId}-${file.originalname}`; // Placeholder

    // إضافة المرفق لمصفوفة المرفقات (تأكد من وجود مصفوفة attachments في Schema عرض السعر)
    if (!quotation.attachments) {
      quotation.attachments = [];
    }
    quotation.attachments.push(fakeFileUrl as any);

    await quotation.save();
    return {
      message: 'Attachment uploaded successfully',
      data: { attachmentUrl: fakeFileUrl },
    };
  }
}
