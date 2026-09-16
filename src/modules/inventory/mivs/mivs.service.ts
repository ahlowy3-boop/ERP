import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection, Types } from 'mongoose';
import { NumberingService } from 'src/shared/services/numbering.service';
import { InventoryEngineService } from 'src/shared/services/inventory-engine.service';
import { AuditLogService } from 'src/shared/audit-logs/audit-logs.service';
import { MivsRepository } from './mivs.repository';
import { MIVDocument, MIVModelName } from './entities/miv.model';
import { InventoryItemRepository } from 'src/DB/repositories/inventory-item.repository';
import { ItemLedgerRepository } from 'src/modules/inventory/reports/item-ledger.repository';
import { ItemStatus } from 'src/DB/models/inventory-item.model';

@Injectable()
export class MivsService {
  constructor(
    @InjectModel(MIVModelName) private readonly mivModel: Model<MIVDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly numberingService: NumberingService,
    private readonly inventoryEngineService: InventoryEngineService,
    private readonly auditLogService: AuditLogService,
    private readonly _Repository: MivsRepository,
    private readonly _InventoryItemRepository: InventoryItemRepository,
    private readonly _ItemLedgerRepository: ItemLedgerRepository,
  ) {}

  async create(createDto: any, userId: string) {
    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      const mivNumber = await this.numberingService.generateMIVNumber(session);
      const voucherNumber = createDto.voucherNumber || mivNumber;
      const documentNumber = createDto.documentNumber || mivNumber;

      // حساب إجمالي المبلغ وتنسيق البنود
      let totalAmount = createDto.totalAmount || 0;
      const items = (createDto.items || []).map((it: any) => {
        const qty = it.quantity ?? it.quantityIssued ?? it.quantityRequested ?? 1;
        const unitPrice = it.unitPrice ?? it.unitCost ?? 0;
        const totalPrice = it.totalPrice ?? qty * unitPrice;
        totalAmount += totalPrice;
        return {
          ...it,
          quantity: qty,
          quantityRequested: it.quantityRequested ?? qty,
          quantityIssued: it.quantityIssued ?? qty,
          unitPrice,
          totalPrice,
        };
      });

      const miv = new this.mivModel({
        ...createDto,
        mivNumber,
        voucherNumber,
        documentNumber,
        items,
        totalAmount: createDto.totalAmount || totalAmount,
        status: createDto.status || 'Draft',
        requestedBy:
          createDto.requestedBy ||
          (Types.ObjectId.isValid(userId)
            ? new Types.ObjectId(userId)
            : undefined),
        createdBy: userId,
        isDeleted: false,
      });

      await miv.save({ session });

      await this.auditLogService.log({
        userId,
        action: 'CREATE',
        entity: 'MIV',
        entityId: miv._id,
        details: `Created MIV ${mivNumber}`,
      });

      await session.commitTransaction();
      return { message: 'MIV created successfully', data: miv };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async findAll(query?: any) {
    const filter: any = { isDeleted: { $ne: true } };

    // 1. تصفية الحالة فقط إذا تم تمريرها وليست نصاً فارغاً
    if (
      query?.status &&
      typeof query.status === 'string' &&
      query.status.trim() !== ''
    ) {
      filter.status = query.status.trim();
    }

    // 2. تصفية المخزن
    if (
      query?.warehouseId &&
      typeof query.warehouseId === 'string' &&
      query.warehouseId.trim() !== ''
    ) {
      const whId = query.warehouseId.trim();
      if (Types.ObjectId.isValid(whId)) {
        filter.warehouseId = new Types.ObjectId(whId);
      } else {
        filter.warehouseId = whId;
      }
    }

    // 3. تصفية المشروع
    if (
      query?.projectId &&
      typeof query.projectId === 'string' &&
      query.projectId.trim() !== ''
    ) {
      const pId = query.projectId.trim();
      if (Types.ObjectId.isValid(pId)) {
        filter.projectId = new Types.ObjectId(pId);
      } else {
        filter.projectId = pId;
      }
    }

    // 4. تصفية مركز التكلفة
    if (
      query?.costCenter &&
      typeof query.costCenter === 'string' &&
      query.costCenter.trim() !== ''
    ) {
      filter.costCenter = query.costCenter.trim();
    }

    // 5. تصفية نوع الصرف
    if (
      query?.chargeType &&
      typeof query.chargeType === 'string' &&
      query.chargeType.trim() !== ''
    ) {
      filter.chargeType = query.chargeType.trim();
    }

    // 6. البحث في أرقام السندات والمشاريع ومراكز التكلفة والملاحظات
    if (
      query?.search &&
      typeof query.search === 'string' &&
      query.search.trim() !== ''
    ) {
      const searchRegex = new RegExp(query.search.trim(), 'i');
      filter.$or = [
        { mivNumber: searchRegex },
        { voucherNumber: searchRegex },
        { documentNumber: searchRegex },
        { projectName: searchRegex },
        { projectCode: searchRegex },
        { costCenter: searchRegex },
        { remarks: searchRegex },
        { recipientName: searchRegex },
        { 'items.itemCode': searchRegex },
        { 'items.itemName': searchRegex },
      ];
    }

    // استخراج معلومات الـ Pagination إن وُجدت بدون إدخالها في فلتر مونجو
    const page = query?.page ? parseInt(query.page) : undefined;
    const limit = query?.limit ? parseInt(query.limit) : undefined;

    const findQuery = this.mivModel
      .find(filter)
      .populate('warehouseId')
      .populate('projectId')
      .populate({ path: 'requestedBy', select: 'name email username' })
      .populate({ path: 'createdBy', select: 'name email username' })
      .sort({ createdAt: -1 });

    if (
      page &&
      limit &&
      !isNaN(page) &&
      !isNaN(limit) &&
      page > 0 &&
      limit > 0
    ) {
      findQuery.skip((page - 1) * limit).limit(limit);
    }

    const items = await findQuery.exec();
    return items;
  }

  async findOne(id: string) {
    let miv: any = null;
    if (Types.ObjectId.isValid(id)) {
      miv = await this.mivModel
        .findById(id)
        .populate('warehouseId projectId')
        .populate({ path: 'requestedBy', select: 'name email username' })
        .populate({ path: 'createdBy', select: 'name email username' })
        .populate('items.itemId');
    }
    if (!miv) {
      miv = await this.mivModel
        .findOne({
          $or: [
            { mivNumber: id },
            { voucherNumber: id },
            { documentNumber: id },
          ],
        })
        .populate('warehouseId projectId')
        .populate({ path: 'requestedBy', select: 'name email username' })
        .populate({ path: 'createdBy', select: 'name email username' })
        .populate('items.itemId');
    }
    if (!miv) throw new NotFoundException('MIV not found');
    return { data: miv };
  }

  async postMiv(id: string, postDto: any, userId: string) {
    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      let miv: any = null;
      if (Types.ObjectId.isValid(id)) {
        miv = await this.mivModel.findById(id).session(session);
      }
      if (!miv) {
        miv = await this.mivModel
          .findOne({
            $or: [
              { mivNumber: id },
              { voucherNumber: id },
              { documentNumber: id },
            ],
          })
          .session(session);
      }
      if (!miv) throw new NotFoundException('MIV not found');

      // حماية من الترحيل المزدوج
      if (miv.status === 'Posted') {
        throw new ConflictException('This MIV has already been posted to inventory.');
      }

      // خصم الكميات من المخزون والتحقق من الأرصدة وتسجيل كارت الصنف
      const updatedItems: any[] = [];
      for (const item of miv.items || []) {
        const qtyToDeduct = item.quantityIssued ?? item.quantity ?? 0;
        if (qtyToDeduct <= 0) continue;

        let itemDoc: any = null;
        if (item.itemId && Types.ObjectId.isValid(item.itemId)) {
          itemDoc = await this._InventoryItemRepository.model
            .findById(item.itemId)
            .session(session);
        }
        if (!itemDoc && item.itemCode) {
          const itemFilter: any = { itemCode: item.itemCode };
          if (miv.warehouseId) {
            itemFilter.warehouseId = miv.warehouseId;
          }
          itemDoc = await this._InventoryItemRepository.model
            .findOne(itemFilter)
            .session(session);
          if (!itemDoc) {
            itemDoc = await this._InventoryItemRepository.model
              .findOne({ itemCode: item.itemCode })
              .session(session);
          }
        }

        if (!itemDoc) {
          throw new BadRequestException(
            `Item ${item.itemCode || item.itemName} not found in inventory.`,
          );
        }

        if (itemDoc.quantity < qtyToDeduct) {
          throw new BadRequestException(
            `Insufficient stock for item ${itemDoc.itemName} (${itemDoc.itemCode}). Available: ${itemDoc.quantity}, Required: ${qtyToDeduct}`,
          );
        }

        itemDoc.quantity = itemDoc.quantity - qtyToDeduct;
        if (itemDoc.quantity === 0) {
          itemDoc.status = ItemStatus.OutOfStock;
        } else if (itemDoc.quantity <= (itemDoc.minQuantity || 0)) {
          itemDoc.status = ItemStatus.LowStock;
        } else {
          itemDoc.status = ItemStatus.InStock;
        }
        await itemDoc.save({ session });

        const unitCost = item.unitPrice || itemDoc.unitPrice || 0;
        const totalCost = item.totalPrice || qtyToDeduct * unitCost;

        // تسجيل حركة الصرف في كارت الصنف (ItemLedger)
        await this._ItemLedgerRepository.create(
          {
            itemId: itemDoc._id,
            itemCode: item.itemCode || itemDoc.itemCode,
            itemName: item.itemName || itemDoc.itemName,
            warehouseId: miv.warehouseId,
            date: new Date(),
            transactionDate: new Date(),
            type: 'MIV',
            transactionType: 'ISSUE',
            reference: miv.voucherNumber || miv.mivNumber,
            documentType: 'MIV',
            documentId: miv._id,
            documentNumber: miv.voucherNumber || miv.mivNumber,
            qtyIn: 0,
            quantityIn: 0,
            qtyOut: qtyToDeduct,
            quantityOut: qtyToDeduct,
            balance: itemDoc.quantity,
            runningBalance: itemDoc.quantity,
            unitPrice: unitCost,
            unitCost,
            totalPrice: totalCost,
            totalCost,
            createdBy: postDto?.postedBy || userId || 'Storekeeper',
          },
          { session },
        );

        updatedItems.push({
          itemId: itemDoc._id,
          itemCode: item.itemCode,
          deductedQuantity: qtyToDeduct,
          newBalance: itemDoc.quantity,
        });
      }

      // تحديث حالة السند إلى Posted
      miv.status = 'Posted';
      miv.postedBy = postDto?.postedBy || userId || 'Storekeeper';
      miv.postedAt = postDto?.postingDate
        ? new Date(postDto.postingDate)
        : new Date();
      miv.approvedBy = miv.approvedBy || userId;
      miv.approvedAt = miv.approvedAt || new Date();
      miv.issuedBy = miv.issuedBy || userId;
      miv.issuedAt = miv.issuedAt || new Date();
      await miv.save({ session });

      await this.auditLogService.log({
        userId,
        action: 'POST',
        entity: 'MIV',
        entityId: miv._id,
        details: `Posted MIV ${miv.mivNumber} and deducted stock`,
      });

      await session.commitTransaction();

      return {
        message: `Material Issue Voucher ${miv.voucherNumber || miv.mivNumber} posted successfully. Stock levels updated.`,
        data: {
          mivId: miv._id,
          mivNumber: miv.mivNumber,
          voucherNumber: miv.voucherNumber || miv.mivNumber,
          status: 'Posted',
          updatedItems,
        },
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async approve(id: string, userId: string) {
    return this.postMiv(id, {}, userId);
  }

  async update(id: string, dto: any, userId: string) {
    return this._Repository.findOneAndUpdate({ _id: id }, { $set: dto });
  }

  async remove(id: string, userId: string) {
    return this._Repository.softDelete({ _id: id });
  }

  async createAutoFromPR(
    purchaseRequest: any,
    mivItemsToCreate: any[],
    session?: any,
  ) {
    const mivNumber = await this.numberingService.generateMIVNumber(session);

    let warehouseId: Types.ObjectId;
    try {
      const warehouse = await this.connection
        .model('Warehouse')
        .findOne({ isDeleted: false })
        .session(session)
        .exec();
      warehouseId = warehouse
        ? (warehouse._id as Types.ObjectId)
        : new Types.ObjectId();
    } catch {
      warehouseId = new Types.ObjectId();
    }

    const items: any[] = [];
    for (const item of mivItemsToCreate) {
      let itemId: Types.ObjectId | undefined;
      try {
        const dbItem = await this.connection
          .model('InventoryItem')
          .findOne({ itemCode: item.itemCode })
          .session(session)
          .exec();
        if (dbItem) itemId = dbItem._id as Types.ObjectId;
      } catch {}

      items.push({
        itemId: itemId || new Types.ObjectId(),
        itemCode: item.itemCode,
        itemName: item.itemName,
        quantity: item.fulfillFromStock || item.quantity,
        uom: item.uom,
      });
    }

    let requestedById: Types.ObjectId;
    try {
      if (Types.ObjectId.isValid(purchaseRequest.requestedBy)) {
        requestedById = new Types.ObjectId(purchaseRequest.requestedBy);
      } else {
        const user = await this.connection
          .model('User')
          .findOne()
          .session(session)
          .exec();
        requestedById = user
          ? (user._id as Types.ObjectId)
          : new Types.ObjectId();
      }
    } catch {
      requestedById = new Types.ObjectId();
    }

    const miv = new this.mivModel({
      documentNumber: mivNumber,
      warehouseId,
      requestedBy: requestedById,
      status: 'Draft',
      items,
      remarks: `Auto-generated from PR ${purchaseRequest.requestNumber || purchaseRequest.documentNumber}`,
    });

    await miv.save({ session });
    return miv;
  }
}
