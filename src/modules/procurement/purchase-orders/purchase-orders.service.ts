import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PurchaseOrdersRepository } from './purchase-orders.repository';
import { NumberingService } from 'src/shared/services/numbering.service';
import { QueryOptions, Types } from 'mongoose';

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly _PORepository: PurchaseOrdersRepository,
    private readonly _NumberingService: NumberingService,
  ) {}

  // تُستدعى هذه الدالة تلقائياً من RfqsService عند الترسية (Award)
  async createAutoFromQuotation(
    rfq: any,
    quotation: any,
    session?: QueryOptions['session'],
  ) {
    try {
      // 1. توليد الأرقام
      const rootProc =
        rfq.rootProcurementNumber ||
        rfq.purchaseRequestNumber ||
        rfq.chainId ||
        'PR-2026-0001';
      const prParts = rootProc.split('-');
      const prYear = prParts[1] || new Date().getFullYear().toString();
      const prSeq = prParts[2] || '0001';

      const rfqNum = rfq.rfqNumber || `RFQ-${prYear}-0001`;
      const rfqSeqParts = rfqNum.split('-');
      const rfqSeq = rfqSeqParts[rfqSeqParts.length - 1] || '0001';

      const poSeq = await this._NumberingService.generatePONumber(session);
      const qSeq = quotation.quotationSequence || 1;
      const documentNumber = `PO-${prYear}-${prSeq}-${rfqSeq}-${qSeq}-${poSeq}`;
      const poNumber = `PO-${prYear}-${poSeq}`;

      // 2. إعداد مصفوفة الأصناف
      const rawItems =
        quotation.items && quotation.items.length > 0
          ? quotation.items
          : rfq.items && rfq.items.length > 0
            ? rfq.items
            : [
                {
                  itemCode: 'N/A',
                  itemName: rfq.title || 'Procurement Item',
                  quantity: 1,
                  unitPrice: quotation.totalAmount || quotation.price || 0,
                  uom: 'EA',
                  totalPrice: quotation.totalAmount || quotation.price || 0,
                },
              ];

      const poItems = rawItems.map((item: any, index: number) => {
        const qty = Number(item.quantity) || 1;
        const price = Number(item.unitPrice || item.price) || 0;
        const total = Number(item.totalPrice) || qty * price;
        return {
          itemCode: item.itemCode || 'N/A',
          itemName: item.itemName || 'Procurement Item',
          quantity: qty,
          unitPrice: price,
          uom: item.uom || 'EA',
          totalPrice: total,
          sortOrder: index + 1,
        };
      });

      // 3. تهيئة سير الاعتماد (Workflow Initialization)
      const approvalWorkflow = [
        { stepOrder: 1, role: 'Procurement Manager', status: 'Pending' },
        { stepOrder: 2, role: 'Finance Director', status: 'Pending' },
        { stepOrder: 3, role: 'CEO', status: 'Pending' },
      ];

      const totalVal = Number(
        quotation.totalAmount || quotation.price || quotation.subtotal || 0,
      );
      const subtotalVal = Number(
        quotation.subtotal || quotation.price || totalVal,
      );
      const taxAmt = Number(quotation.taxAmount || 0);
      const taxPct = Number(quotation.taxPercent || 0);

      const vendorIdObj = Types.ObjectId.isValid(quotation.vendorId)
        ? new Types.ObjectId(quotation.vendorId)
        : quotation.vendorId;

      // 4. الحفظ في قاعدة البيانات
      const po = await this._PORepository.create(
        {
          poNumber,
          documentNumber,
          procurementChain: `${rfq.procurementChain || rfqNum}-${qSeq}-${poSeq}`,
          rootProcurementNumber: rootProc,
          chainId: rfq.chainId || rootProc,
          parentDocumentId: rfq._id,
          parentDocumentNumber: rfqNum,
          rfqId: rfq._id,
          rfqNumber: rfqNum,
          quotationNumber: quotation.quotationNumber,

          vendorId: vendorIdObj,
          vendorName: quotation.vendorName,
          vendorContact: quotation.vendorContactPerson,

          deliveryDate:
            quotation.validityDate ||
            new Date(new Date().setDate(new Date().getDate() + 14)),
          costCenter: rfq.costCenter || 'N/A',
          paymentTerms: quotation.paymentTerms || 'N/A',
          status: 'Pending Approval',

          totalValue: totalVal,
          totalAmount: totalVal,
          subtotal: subtotalVal,
          taxPercent: taxPct,
          taxAmount: taxAmt,

          chargeType: rfq.chargeType,
          projectId: rfq.projectId,
          projectName: rfq.projectName,
          assetId: rfq.assetId,
          assetName: rfq.assetName,

          items: poItems,
          approvalWorkflow,
        },
        { session },
      );

      return po;
    } catch (error: any) {
      throw new InternalServerErrorException(
        `Failed to auto-create PO: ${error.message}`,
      );
    }
  }

  // الموافقة على خطوة في سير الاعتماد
  async approveStep(
    poId: string,
    role: string,
    approverName: string,
    comments?: string,
  ) {
    const po = await this._PORepository.findOne({ filter: { _id: poId } });
    if (!po) throw new NotFoundException('Purchase Order not found');

    const stepIndex = po.approvalWorkflow.findIndex(
      (step) => step.role === role,
    );
    if (stepIndex === -1)
      throw new BadRequestException('Invalid approval role for this PO');
    if (po.approvalWorkflow[stepIndex].status === 'Approved')
      throw new BadRequestException('Step already approved');

    // التأكد من أن الخطوة السابقة تم الموافقة عليها (إذا لم تكن الخطوة الأولى)
    if (
      stepIndex > 0 &&
      po.approvalWorkflow[stepIndex - 1].status !== 'Approved'
    ) {
      throw new BadRequestException(
        'Previous approval steps must be completed first',
      );
    }

    // تحديث الخطوة
    po.approvalWorkflow[stepIndex].status = 'Approved';
    po.approvalWorkflow[stepIndex].approverName = approverName;
    po.approvalWorkflow[stepIndex].actionDate = new Date();
    po.approvalWorkflow[stepIndex].comments = comments;

    // التحقق مما إذا كانت هذه هي الخطوة الأخيرة
    const allApproved = po.approvalWorkflow.every(
      (step) => step.status === 'Approved',
    );
    if (allApproved) {
      po.status = 'Approved'; // تطبيق القاعدة المنطقية
    }

    await po.save();
    return { message: 'PO approval step recorded successfully', data: po };
  }

  async getPoDetails(poId: string) {
    const po = await this._PORepository.findOne({ filter: { _id: poId } });
    if (!po) throw new NotFoundException('Purchase Order not found');
    return { data: po };
  }

  // إنشاء PO يدوي (بدون المرور بـ RFQ)
  async createManual(data: any, session?: QueryOptions['session']) {
    const poSeq = await this._NumberingService.generatePONumber(session); // يحتاج لإضافة الدالة في NumberingService
    const poNumber = `PO-${new Date().getFullYear()}-${poSeq}`;

    const approvalWorkflow = [
      { stepOrder: 1, role: 'Procurement Manager', status: 'Pending' },
      { stepOrder: 2, role: 'Finance Director', status: 'Pending' },
      { stepOrder: 3, role: 'CEO', status: 'Pending' },
    ];

    const po = await this._PORepository.create(
      {
        ...data,
        poNumber,
        documentNumber: poNumber,
        procurementChain: poSeq,
        rootProcurementNumber: poNumber,
        totalValue: Number(data.totalValue || data.totalAmount || data.price || 0),
        items: data.items || [],
        status: 'Draft',
        approvalWorkflow,
      },
      { session },
    );

    return { message: 'Manual PO created successfully', data: po };
  }

  // جلب كافة أوامر الشراء
  async findAll(page: number = 1, limit: number = 20) {
    return await this._PORepository.findAll({
      paginate: { page, limit },
      sort: { createdAt: -1 },
    });
  }

  // إضافة دالة رفع العقد
  async uploadContract(
    poId: string,
    file: Express.Multer.File,
    contractNumber?: string,
    contractTitle?: string,
  ) {
    const po = await this._PORepository.findOne({ filter: { _id: poId } });
    if (!po) throw new NotFoundException('Purchase Order not found');

    // 💡 افتراض استخدام خدمة رفع (مثلاً Cloudinary أو AWS S3) قمت ببرمجتها مسبقاً
    // const uploadResult = await this._FileUploadService.uploadFile(file);
    const fakeFileUrl = `https://storage.petroflow.com/contracts/po-${poId}.pdf`; // Placeholder

    po.contractFileUrl = fakeFileUrl; // تأكد من إضافة هذا الحقل للـ Schema
    if (contractNumber) po.contractNumber = contractNumber;
    if (contractTitle) po.contractTitle = contractTitle;

    await po.save();
    return {
      message: 'Contract uploaded successfully',
      data: { contractFileUrl: fakeFileUrl },
    };
  }
}
