import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { InspectionRequestsRepository } from './inspection-requests.repository';
import { NcrsRepository } from './ncrs.repository';
import { NumberingService } from 'src/shared/services/numbering.service';
import { MrvsService } from 'src/modules/inventory/mrvs/mrvs.service';
import { PurchaseOrdersService } from 'src/modules/procurement/purchase-orders/purchase-orders.service';
import {
  PurchaseOrderModelName,
  PurchaseOrderDocument,
} from 'src/modules/procurement/purchase-orders/entities/purchase-order.model';
import { SubmitInspectionDto } from './dto/submit-inspection.dto';
import { CreateNcrDto } from './dto/create-ncr.dto';

@Injectable()
export class InspectionService {
  constructor(
    private readonly _InspectionRepository: InspectionRequestsRepository,
    private readonly _NcrsRepository: NcrsRepository,
    private readonly _NumberingService: NumberingService,
    private readonly _MrvsService: MrvsService,
    private readonly _PurchaseOrdersService: PurchaseOrdersService,
    @InjectModel(PurchaseOrderModelName)
    private readonly poModel: Model<PurchaseOrderDocument>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  // 1. تسليم نتيجة الفحص (Submit Inspection Result)
  async submitInspection(id: string, data: SubmitInspectionDto) {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      let inspection: any = null;

      // أ) البحث المباشر في طلبات الفحص: بالـ requestNumber أو poNumber أو _id أو poId
      const conditions: any[] = [
        { requestNumber: id },
        { poNumber: id },
      ];

      if (Types.ObjectId.isValid(id)) {
        const objId = new Types.ObjectId(id);
        conditions.push({ _id: objId });
        conditions.push({ poId: objId });
        conditions.push({ poId: id });
      }

      // إعطاء الأولوية للطلب المعلق (Pending) إن وُجد
      inspection = await this._InspectionRepository.model
        .findOne({
          $or: conditions,
          status: 'Pending',
        })
        .session(session);

      // إن لم نجد طلباً معلقاً، نبحث عن أي طلب مطابق للشروط
      if (!inspection) {
        inspection = await this._InspectionRepository.model
          .findOne({ $or: conditions })
          .sort({ createdAt: -1 })
          .session(session);
      }

      // ب) في حال لم يتم العثور على طلب الفحص مباشرة، نفحص إن كان الـ id يخص أمر الشراء (PO)
      if (!inspection) {
        let po: any = null;
        if (Types.ObjectId.isValid(id)) {
          po = await this.poModel.findById(id).session(session);
        }
        if (!po) {
          po = await this.poModel.findOne({ poNumber: id }).session(session);
        }

        if (po) {
          // نبحث أولاً إن كان هناك طلب فحص مسجل مسبقاً لهذا الـ PO!
          inspection = await this._InspectionRepository.model
            .findOne({
              $or: [
                { poId: po._id },
                { poId: po._id.toString() },
                { poNumber: po.poNumber },
              ],
              status: 'Pending',
            })
            .session(session);

          if (!inspection) {
            inspection = await this._InspectionRepository.model
              .findOne({
                $or: [
                  { poId: po._id },
                  { poId: po._id.toString() },
                  { poNumber: po.poNumber },
                ],
              })
              .sort({ createdAt: -1 })
              .session(session);
          }

          // فقط في حال عدم وجود أي طلب فحص إطلاقاً لهذا الـ PO، ننشئ طلباً جديداً
          if (!inspection) {
            const requestNumber = await this._NumberingService.generateIRNumber(session);
            const createdDocs = await this._InspectionRepository.model.create(
              [
                {
                  requestNumber,
                  poId: po._id,
                  poNumber: po.poNumber,
                  vendorId: po.vendorId,
                  vendorName: po.vendorName || 'Vendor',
                  requestDate: new Date(),
                  requestedDate: new Date(),
                  status: 'Pending',
                  items: (po.items || []).map((it: any) => ({
                    itemId: it.itemId,
                    itemCode: it.itemCode,
                    itemName: it.itemName || it.arabicName || 'Material',
                    uom: it.uom || 'EA',
                    quantityOrdered: it.quantity,
                    quantityReceived: it.quantity,
                    quantityAccepted: 0,
                    quantityRejected: 0,
                    status: 'Pending',
                  })),
                },
              ] as any[],
              { session },
            );
            inspection = createdDocs[0];
          }
        }
      }

      if (!inspection) {
        throw new NotFoundException(
          'Inspection Request not found for the given ID or PO ID',
        );
      }

      // جـ) تحديث سجل الفحص الأصلي نفسه (In-place update)
      inspection.inspectorName = data.inspectorName;
      inspection.inspectionDate = data.inspectionDate
        ? new Date(data.inspectionDate)
        : new Date();
      inspection.status = data.status; // Accepted | Rejected | Conditional
      inspection.notes = data.notes;

      if (data.items && Array.isArray(data.items)) {
        inspection.items = data.items.map((it: any) => {
          const qtyOrdered = it.quantityOrdered ?? 0;
          const qtyReceived = it.quantityReceived ?? qtyOrdered;
          const qtyAccepted = it.quantityAccepted ?? 0;
          const qtyRejected = it.quantityRejected ?? 0;
          return {
            itemId: it.itemId,
            itemCode: it.itemCode,
            itemName: it.itemName || 'Material',
            uom: it.uom || 'EA',
            quantityOrdered: qtyOrdered,
            quantityReceived: qtyReceived,
            quantityAccepted: qtyAccepted,
            quantityRejected: qtyRejected,
            status: it.status || (qtyRejected > 0 ? 'Failed' : 'Passed'),
            remarks: it.remarks || '',
          };
        });
      }

      await inspection.save({ session });

      // د) تنظيف أي سجلات مكررة بحالة Pending لنفس الـ PO لضمان بقاء السجل المعتمد فقط
      if (inspection.poId || inspection.poNumber) {
        const poFilters: any[] = [];
        if (inspection.poId) {
          poFilters.push({ poId: inspection.poId });
          poFilters.push({ poId: inspection.poId.toString() });
        }
        if (inspection.poNumber) {
          poFilters.push({ poNumber: inspection.poNumber });
        }
        if (poFilters.length > 0) {
          await this._InspectionRepository.model.deleteMany(
            {
              _id: { $ne: inspection._id },
              status: 'Pending',
              $or: poFilters,
            },
            { session },
          );
        }
      }

      // هـ) إذا كان الفحص مقبولاً أو مقبولاً بشرط: إنشاء مسودة إذن إضافة مخزني MRV تلقائياً بالكميات المقبولة
      if (
        inspection.status === 'Accepted' ||
        inspection.status === 'Conditional'
      ) {
        let poDetails: any = null;
        if (inspection.poId) {
          const poResult = await this._PurchaseOrdersService.getPoDetails(
            inspection.poId.toString(),
          );
          poDetails = poResult?.data;
        }

        await this._MrvsService.createAutoFromInspection(
          inspection,
          poDetails || {},
          session,
        );
      }

      await session.commitTransaction();

      return {
        success: true,
        message: `Inspection submitted successfully with status: ${inspection.status}`,
        data: inspection,
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // 2. إنشاء تقرير عدم مطابقة (NCR)
  async createNcr(inspectionId: string, data: CreateNcrDto) {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const conditions: any[] = [
        { requestNumber: inspectionId },
        { poNumber: inspectionId },
      ];
      if (Types.ObjectId.isValid(inspectionId)) {
        const objId = new Types.ObjectId(inspectionId);
        conditions.push({ _id: objId });
        conditions.push({ poId: objId });
        conditions.push({ poId: inspectionId });
      }

      const inspection = await this._InspectionRepository.model
        .findOne({ $or: conditions })
        .session(session);

      if (!inspection) {
        throw new NotFoundException(
          'Inspection Request not found for the given ID or PO ID',
        );
      }

      const ncrNumber = await this._NumberingService.generateNCRNumber(session);

      const ncr = await this._NcrsRepository.create(
        {
          ...data,
          ncrNumber,
          inspectionRequestId: inspection._id,
          poId: inspection.poId,
          poNumber: inspection.poNumber,
          vendorId: inspection.vendorId,
          vendorName: inspection.vendorName,
          issueDate: new Date(),
          status: 'Open',
        },
        { session },
      );

      inspection.ncrId = ncr._id;
      await inspection.save({ session });

      await session.commitTransaction();

      return {
        success: true,
        message: 'NCR created successfully',
        data: ncr,
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // 3. إغلاق تقرير عدم المطابقة (NCR)
  async resolveNcr(ncrId: string, resolvedBy: string) {
    const ncr = await this._NcrsRepository.findOneAndUpdate(
      { _id: ncrId },
      {
        status: 'Closed',
        resolvedDate: new Date(),
        resolvedBy,
      },
    );
    if (!ncr) throw new NotFoundException('NCR not found');
    return { success: true, message: 'NCR resolved', data: ncr };
  }

  // 4. جلب كل طلبات الفحص (Get Inspections) مع المزامنة التلقائية لأوامر الشراء المعتمدة
  async findAllInspections(page: number = 1, limit: number = 20, status?: string) {
    try {
      // مزامنة أي أوامر شراء معتمدة لم يتم إنشاء طلب فحص لها بعد
      const approvedPos = await this.poModel
        .find({
          status: { $in: ['Approved', 'Partially Received'] },
        })
        .lean();

      for (const po of approvedPos) {
        // فحص فريد ومؤكد: هل يوجد طلب فحص مسجل مسبقاً لهذا الـ PO (بـ poId كـ ObjectId أو String أو poNumber)؟
        const existingList = await this._InspectionRepository.model
          .find({
            $or: [
              { poId: po._id },
              { poId: po._id.toString() },
              { poNumber: po.poNumber },
            ],
          })
          .sort({ createdAt: 1 });

        if (existingList.length === 0) {
          // لم يتم إنشاء أي طلب فحص لهذا الـ PO من قبل: ننشئ طلباً واحداً فقط بحالة Pending
          const requestNumber = await this._NumberingService.generateIRNumber();
          await this._InspectionRepository.model.create({
            requestNumber,
            poId: po._id,
            poNumber: po.poNumber,
            vendorId: po.vendorId,
            vendorName: po.vendorName || 'Vendor',
            requestDate: new Date(),
            requestedDate: new Date(),
            status: 'Pending',
            items: (po.items || []).map((it: any) => ({
              itemId: it.itemId,
              itemCode: it.itemCode,
              itemName: it.itemName || it.arabicName || 'Material',
              uom: it.uom || 'EA',
              quantityOrdered: it.quantity,
              quantityReceived: it.quantity,
              quantityAccepted: 0,
              quantityRejected: 0,
              status: 'Pending',
            })),
          });
        } else if (existingList.length > 1) {
          // في حال وجود سجلات مكررة لنفس الـ PO:
          // إذا كان أحد السجلات معتمداً (Accepted / Conditional / Rejected)، نحذف السجلات المعلقة المكررة
          const hasProcessed = existingList.some((doc) => doc.status !== 'Pending');
          if (hasProcessed) {
            const pendingDuplicates = existingList.filter((doc) => doc.status === 'Pending');
            for (const dup of pendingDuplicates) {
              await this._InspectionRepository.model.deleteOne({ _id: dup._id });
            }
          }
        }
      }
    } catch {
      // Ignore background sync errors to not block the endpoint
    }

    const filter: any = {};
    if (status) {
      filter.status = status;
    }

    const totalItems = await this._InspectionRepository.model.countDocuments(filter);
    const items = await this._InspectionRepository.model
      .find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return {
      success: true,
      data: {
        items,
        totalItems,
        currentPage: page,
        totalPages: Math.ceil(totalItems / limit) || 1,
      },
    };
  }

  // 5. جلب تفاصيل طلب فحص محدد
  async findOneInspection(id: string) {
    const conditions: any[] = [
      { requestNumber: id },
      { poNumber: id },
    ];
    if (Types.ObjectId.isValid(id)) {
      const objId = new Types.ObjectId(id);
      conditions.push({ _id: objId });
      conditions.push({ poId: objId });
      conditions.push({ poId: id });
    }

    const inspection = await this._InspectionRepository.model
      .findOne({ $or: conditions })
      .sort({ createdAt: -1 });

    if (!inspection) {
      throw new NotFoundException('Inspection Request not found');
    }
    return { success: true, data: inspection };
  }

  // 6. جلب كل تقارير عدم المطابقة (NCRs)
  async findAllNcrs(page: number = 1, limit: number = 20) {
    const total = await this._NcrsRepository.model.countDocuments();
    const ncrs = await this._NcrsRepository.findAll({
      paginate: { page, limit },
      sort: { issueDate: -1 },
    });
    return {
      success: true,
      data: ncrs,
      total,
      page,
      limit,
    };
  }
}
