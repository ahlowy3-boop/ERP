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
import { MrvsRepository } from './mrvs.repository';
import { InventoryItemRepository } from 'src/DB/repositories/inventory-item.repository';
import { ItemLedgerRepository } from 'src/modules/inventory/reports/item-ledger.repository';
import { MRVModelName, MRVDocument } from './entities/mrv.model';
import {
  PurchaseOrderModelName,
  PurchaseOrderDocument,
} from 'src/modules/procurement/purchase-orders/entities/purchase-order.model';
import { ItemStatus } from 'src/DB/models/inventory-item.model';

@Injectable()
export class MrvsService {
  constructor(
    @InjectModel(MRVModelName) private readonly mrvModel: Model<MRVDocument>,
    @InjectModel(PurchaseOrderModelName)
    private readonly poModel: Model<PurchaseOrderDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly numberingService: NumberingService,
    private readonly inventoryEngineService: InventoryEngineService,
    private readonly auditLogService: AuditLogService,
    private readonly _Repository: MrvsRepository,
    private readonly _InventoryItemRepository: InventoryItemRepository,
    private readonly _ItemLedgerRepository: ItemLedgerRepository,
  ) {}

  async create(createDto: any, userId: string) {
    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      const mrvNumber = await this.numberingService.generateMRVNumber(session);

      const items = (createDto.items || []).map((it: any) => {
        const qtyReceived = it.quantityReceived ?? it.receivedQuantity ?? 0;
        const unitPrice = it.unitPrice ?? 0;
        const totalPrice = it.totalPrice ?? (qtyReceived * unitPrice);
        return {
          ...it,
          quantityOrdered: it.quantityOrdered ?? it.expectedQuantity ?? 0,
          quantityReceived: qtyReceived,
          expectedQuantity: it.quantityOrdered ?? it.expectedQuantity ?? 0,
          receivedQuantity: qtyReceived,
          acceptedQuantity: it.acceptedQuantity ?? qtyReceived,
          rejectedQuantity: it.rejectedQuantity ?? 0,
          unitPrice,
          totalPrice,
        };
      });

      const totalAmount =
        createDto.totalAmount ??
        items.reduce((sum: number, it: any) => sum + (it.totalPrice || 0), 0);

      const mrv = new this.mrvModel({
        ...createDto,
        mrvNumber,
        voucherNumber: createDto.voucherNumber || mrvNumber,
        items,
        totalAmount,
        status: createDto.status || 'Draft',
        receivedDate: createDto.receivedDate ? new Date(createDto.receivedDate) : new Date(),
        createdBy: userId,
      });

      await mrv.save({ session });

      await this.auditLogService.log({
        userId,
        action: 'CREATE',
        entity: 'MRV',
        entityId: mrv._id,
        details: `Created MRV ${mrvNumber}`,
      });

      await session.commitTransaction();
      return { success: true, message: 'MRV created successfully', data: mrv };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async findAll(query?: any) {
    const filter: any = { isDeleted: { $ne: true } };

    if (query?.status) {
      filter.status = query.status;
    }
    if (query?.warehouseId) {
      filter.warehouseId = query.warehouseId;
    }
    if (query?.poId) {
      filter.poId = query.poId;
    }
    if (query?.poNumber) {
      filter.poNumber = new RegExp(query.poNumber, 'i');
    }
    if (query?.search) {
      filter.$or = [
        { mrvNumber: new RegExp(query.search, 'i') },
        { voucherNumber: new RegExp(query.search, 'i') },
        { poNumber: new RegExp(query.search, 'i') },
        { supplierName: new RegExp(query.search, 'i') },
        { vendorName: new RegExp(query.search, 'i') },
      ];
    }

    const page = parseInt(query?.page) || 1;
    const limit = parseInt(query?.limit) || 50;

    const total = await this.mrvModel.countDocuments(filter);
    const items = await this.mrvModel
      .find(filter)
      .populate('warehouseId')
      .populate('supplierId')
      .populate('vendorId')
      .populate('poId')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec();

    return {
      success: true,
      data: items,
      total,
      page,
      limit,
    };
  }

  async findOne(id: string) {
    const mrv = await this.mrvModel
      .findById(id)
      .populate('warehouseId supplierId vendorId poId items.itemId');
    if (!mrv) throw new NotFoundException('MRV not found');
    return { success: true, data: mrv };
  }

  async update(id: string, dto: any, _userId: string) {
    const updated = await this.mrvModel.findByIdAndUpdate(
      id,
      { $set: dto },
      { new: true },
    );
    if (!updated) throw new NotFoundException('MRV not found');
    return { success: true, data: updated };
  }

  async remove(id: string, _userId: string) {
    const deleted = await this.mrvModel.findByIdAndUpdate(
      id,
      { $set: { isDeleted: true } },
      { new: true },
    );
    if (!deleted) throw new NotFoundException('MRV not found');
    return { success: true, message: 'MRV deleted successfully' };
  }

  async approve(id: string, userId: string) {
    return this.postMrv(id, {}, userId);
  }

  async postMrv(id: string, postDto: any, userId: string) {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const mrv = await this.mrvModel.findById(id).session(session);
      if (!mrv) {
        throw new NotFoundException('MRV not found');
      }

      // 1. Idempotency Guard (Double Posting Guard)
      if (mrv.status === 'Posted') {
        throw new ConflictException('This MRV has already been posted to inventory.');
      }

      // 2. Over-Receiving Guard
      let po: any = null;
      if (mrv.poId) {
        po = await this.poModel.findById(mrv.poId).session(session);
      }
      if (!po && mrv.poNumber) {
        po = await this.poModel.findOne({ poNumber: mrv.poNumber }).session(session);
      }

      if (po) {
        // Find all previously posted MRVs for this PO
        const previouslyPostedMrvs = await this.mrvModel
          .find({
            $or: [{ poId: po._id }, { poNumber: po.poNumber }],
            status: 'Posted',
            _id: { $ne: mrv._id },
          })
          .session(session);

        const cumulativeReceived: Record<string, number> = {};
        for (const prev of previouslyPostedMrvs) {
          for (const it of prev.items || []) {
            const key = it.itemCode || it.itemId?.toString();
            if (key) {
              const qty = it.quantityReceived ?? it.receivedQuantity ?? 0;
              cumulativeReceived[key] = (cumulativeReceived[key] || 0) + qty;
            }
          }
        }

        // Validate each item in the current MRV
        for (const it of mrv.items || []) {
          const key = it.itemCode || it.itemId?.toString();
          const curQty = it.quantityReceived ?? it.receivedQuantity ?? 0;
          if (curQty <= 0) continue;

          const poItem = (po.items || []).find(
            (p: any) =>
              (it.itemCode && p.itemCode === it.itemCode) ||
              (it.itemId && p.itemId?.toString() === it.itemId?.toString()),
          );

          if (poItem) {
            const prevQty = (key ? cumulativeReceived[key] : 0) || 0;
            const newTotal = prevQty + curQty;
            if (newTotal > poItem.quantity) {
              throw new BadRequestException(
                `Cannot receive more than remaining PO quantity for item ${it.itemCode || poItem.itemCode || 'N/A'} (${poItem.quantity} ordered, ${newTotal} received).`,
              );
            }
          }
        }
      }

      // 3. Update MRV status to 'Posted'
      mrv.status = 'Posted';
      mrv.postedBy = postDto?.postedBy || userId || 'Store Manager';
      mrv.postedAt = postDto?.postingDate ? new Date(postDto.postingDate) : new Date();
      mrv.approvedBy = mrv.approvedBy || userId || 'Authorized Approver';
      mrv.approvedAt = mrv.approvedAt || new Date();
      if (!mrv.voucherNumber) {
        mrv.voucherNumber = mrv.mrvNumber;
      }
      await mrv.save({ session });

      // 4. Update Inventory Items & Insert into ItemLedger
      const updatedItems: any[] = [];

      for (const item of mrv.items || []) {
        const qtyToAdd = item.quantityReceived ?? item.receivedQuantity ?? 0;
        if (qtyToAdd <= 0) continue;

        let itemDoc: any = null;
        if (item.itemId && Types.ObjectId.isValid(item.itemId)) {
          itemDoc = await this._InventoryItemRepository.model
            .findById(item.itemId)
            .session(session);
        }
        if (!itemDoc && item.itemCode) {
          itemDoc = await this._InventoryItemRepository.model
            .findOne({ itemCode: item.itemCode })
            .session(session);
        }

        let newBalance = qtyToAdd;
        if (itemDoc) {
          itemDoc.quantity = (itemDoc.quantity || 0) + qtyToAdd;
          itemDoc.status = ItemStatus.InStock;
          await itemDoc.save({ session });
          newBalance = itemDoc.quantity;
        } else {
          // Auto-create item in inventory if not present
          const created = await this._InventoryItemRepository.model.create(
            [
              {
                itemCode: item.itemCode,
                itemName: item.itemName || 'Material',
                uom: item.uom || 'EA',
                quantity: qtyToAdd,
                unitPrice: item.unitPrice || 0,
                status: ItemStatus.InStock,
                warehouseId: mrv.warehouseId,
              },
            ] as any[],
            { session },
          );
          itemDoc = created[0];
          newBalance = itemDoc.quantity;
        }

        const unitCost = item.unitPrice || itemDoc.unitPrice || 0;
        const totalCost = item.totalPrice || (qtyToAdd * unitCost);

        // Record in ItemLedger
        await this._ItemLedgerRepository.create(
          {
            itemId: itemDoc._id,
            itemCode: item.itemCode,
            itemName: item.itemName || itemDoc.itemName,
            warehouseId: mrv.warehouseId,
            date: new Date(),
            transactionDate: new Date(),
            type: 'MRV',
            transactionType: 'PURCHASE_RECEIPT',
            reference: mrv.voucherNumber || mrv.mrvNumber,
            documentType: 'MRV',
            documentId: mrv._id,
            documentNumber: mrv.voucherNumber || mrv.mrvNumber,
            qtyIn: qtyToAdd,
            quantityIn: qtyToAdd,
            qtyOut: 0,
            quantityOut: 0,
            balance: newBalance,
            runningBalance: newBalance,
            unitPrice: unitCost,
            unitCost: unitCost,
            totalCost: totalCost,
            referencePoNumber: mrv.poNumber || po?.poNumber,
            createdBy: mrv.receivedBy || mrv.postedBy || userId || 'Storekeeper',
          },
          { session },
        );

        updatedItems.push({
          itemId: itemDoc._id,
          itemCode: item.itemCode,
          addedQuantity: qtyToAdd,
          newBalance: newBalance,
        });
      }

      // 5. Update Purchase Order Status
      let poStatus = 'N/A';
      if (po) {
        const allPostedMrvs = await this.mrvModel
          .find({
            $or: [{ poId: po._id }, { poNumber: po.poNumber }],
            status: 'Posted',
          })
          .session(session);

        const totalOrdered = (po.items || []).reduce(
          (acc: number, cur: any) => acc + (cur.quantity || 0),
          0,
        );

        const totalReceived = allPostedMrvs.reduce((acc: number, currMrv: any) => {
          return (
            acc +
            (currMrv.items || []).reduce(
              (sum: number, it: any) =>
                sum + (it.quantityReceived ?? it.receivedQuantity ?? 0),
              0,
            )
          );
        }, 0);

        if (totalReceived >= totalOrdered && totalOrdered > 0) {
          po.status = 'Completed';
        } else {
          po.status = 'Partially Received';
        }

        po.markModified('status');
        await po.save({ session });
        poStatus = po.status;
      }

      await this.auditLogService.log({
        userId,
        action: 'APPROVE',
        entity: 'MRV',
        entityId: mrv._id,
        details: `Posted MRV ${mrv.voucherNumber || mrv.mrvNumber} to inventory. PO status: ${poStatus}`,
      });

      await session.commitTransaction();

      return {
        success: true,
        message: `Goods Receipt ${mrv.voucherNumber || mrv.mrvNumber} posted successfully. Stock levels updated.`,
        data: {
          mrvId: mrv._id,
          voucherNumber: mrv.voucherNumber || mrv.mrvNumber,
          status: 'Posted',
          poStatus,
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

  async createAutoFromInspection(
    inspection: any,
    poDetails: any,
    session?: any,
  ) {
    // Check if an MRV already exists for this inspection
    const existingMrv = await this.mrvModel
      .findOne({ inspectionRequestId: inspection._id })
      .session(session || null);
    if (existingMrv) {
      return existingMrv;
    }

    const mrvNumber = await this.numberingService.generateMRVNumber(session);

    // Map items with accepted quantities
    const items: any[] = [];
    let totalAmount = 0;

    for (const item of inspection.items || []) {
      const acceptedQty =
        item.quantityAccepted !== undefined
          ? item.quantityAccepted
          : item.quantityReceived ?? item.quantityOrdered ?? 0;

      if (acceptedQty <= 0) continue;

      // Find PO item to grab pricing and snapshot details
      const poItem = (poDetails?.items || []).find(
        (p: any) =>
          (item.itemCode && p.itemCode === item.itemCode) ||
          (item.itemId && p.itemId?.toString() === item.itemId?.toString()),
      );

      const unitPrice = poItem?.unitPrice || 0;
      const totalPrice = acceptedQty * unitPrice;
      totalAmount += totalPrice;

      let dbItem: any = null;
      if (item.itemCode) {
        dbItem = await this._InventoryItemRepository.findOne({
          itemCode: item.itemCode,
        });
      }

      items.push({
        itemId: item.itemId || (dbItem ? dbItem._id : new Types.ObjectId()),
        itemCode: item.itemCode,
        itemName: item.itemName || dbItem?.itemName || poItem?.itemName || 'Material',
        uom: item.uom || dbItem?.uom || poItem?.uom || 'EA',
        quantityOrdered: item.quantityOrdered,
        quantityReceived: acceptedQty,
        expectedQuantity: item.quantityOrdered,
        receivedQuantity: acceptedQty,
        acceptedQuantity: acceptedQty,
        rejectedQuantity: item.quantityRejected || 0,
        unitPrice,
        totalPrice,
        location: poItem?.location || 'Warehouse - Zone 1',
        notes: item.remarks || item.status,
      });
    }

    const mrv = new this.mrvModel({
      mrvNumber,
      voucherNumber: mrvNumber,
      poId: inspection.poId,
      poNumber: inspection.poNumber,
      inspectionRequestId: inspection._id,
      warehouseId: poDetails?.warehouseId || new Types.ObjectId('66d8f11035cffb47ef582b12'),
      warehouseName: poDetails?.warehouseName || 'Main Warehouse',
      vendorId: poDetails?.vendorId || inspection.vendorId || new Types.ObjectId(),
      supplierId: poDetails?.vendorId || inspection.vendorId || new Types.ObjectId(),
      supplierName: inspection.vendorName || poDetails?.vendorName || 'Supplier',
      vendorName: inspection.vendorName || poDetails?.vendorName || 'Supplier',
      receivedDate: new Date(),
      receivedBy: inspection.inspectorName || 'Storekeeper',
      deliveryNoteNumber: inspection.requestNumber,
      status: 'Draft',
      items,
      totalAmount,
      chargeType: poDetails?.chargeType || 'OPEX',
      projectId: poDetails?.projectId,
      projectName: poDetails?.projectName,
      costCenter: poDetails?.costCenter,
      assetId: poDetails?.assetId,
      assetName: poDetails?.assetName,
      receivedById: poDetails?.createdBy || new Types.ObjectId(),
    });

    await mrv.save({ session });
    return mrv;
  }
}
