import { BadRequestException, Injectable } from '@nestjs/common';
import { InventoryItemRepository } from 'src/DB/repositories/inventory-item.repository';
import { QueryOptions, Types } from 'mongoose';
import { ItemStatus } from 'src/DB/models/inventory-item.model';
import { ItemLedgerRepository } from 'src/modules/inventory/reports/item-ledger.repository';

@Injectable()
export class InventoryEngineService {
  constructor(
    private readonly _InventoryItemRepository: InventoryItemRepository,
    private readonly _ItemLedgerRepository: ItemLedgerRepository,
  ) {}

  // التحقق من توافر المخزون
  async checkAvailability(itemCode: string) {
    const item = await this._InventoryItemRepository.findOne({
      filter: { itemCode },
    });
    if (!item)
      throw new BadRequestException(`Item with code ${itemCode} not found!`);
    return item;
  }

  async deductStock(
    itemCode: string,
    quantityToDeduct: number,
    reference: string,
    type: string,
    session?: QueryOptions['session'],
  ) {
    const filter = { itemCode, quantity: { $gte: quantityToDeduct } };

    const updatedItem = await this._InventoryItemRepository.findOneAndUpdate(
      filter,
      { $inc: { quantity: -quantityToDeduct } },
      { session, returnDocument: 'after' },
    );

    if (!updatedItem)
      throw new BadRequestException(`Insufficient stock for item ${itemCode}`);
    await this.updateItemStatus(updatedItem, session);

    // 👈 تسجيل الحركة في دفتر الأصناف
    await this._ItemLedgerRepository.create(
      {
        itemCode,
        date: new Date(),
        type, // 'MIV', 'TRN', 'ADJ'
        reference,
        qtyIn: 0,
        qtyOut: quantityToDeduct,
        balance: updatedItem.quantity,
        unitPrice: updatedItem.unitPrice,
      },
      { session },
    );

    return updatedItem;
  }

  // عكس كميات من المخزون بأمان (يُستخدم عند إلغاء الأرصدة الافتتاحية دون التسبب بأرصدة سالبة)
  async reverseStock(
    itemCode: string,
    quantityToDeduct: number,
    reference: string,
    type: string = 'ADJ',
    session?: QueryOptions['session'],
  ) {
    const item = await this._InventoryItemRepository.findOne({
      filter: { itemCode },
      options: { session },
    });
    if (!item) throw new BadRequestException(`Item ${itemCode} not found`);

    const actualDeduct = Math.min(item.quantity || 0, quantityToDeduct);
    if (actualDeduct > 0) {
      item.quantity = (item.quantity || 0) - actualDeduct;
      await this.updateItemStatus(item, session);
      await item.save({ session });

      await this._ItemLedgerRepository.create(
        {
          itemCode,
          date: new Date(),
          type,
          reference,
          qtyIn: 0,
          qtyOut: actualDeduct,
          balance: item.quantity,
          unitPrice: item.unitPrice || 0,
        },
        { session },
      );
    }

    return item;
  }

  // إضافة كميات للمخزون (يُستخدم عند استلام MRV)
  async addStock(
    itemCode: string,
    quantityToAdd: number,
    reference: string,
    type: string,
    session?: QueryOptions['session'],
  ) {
    const updatedItem = await this._InventoryItemRepository.findOneAndUpdate(
      { itemCode },
      { $inc: { quantity: quantityToAdd } },
      { session, returnDocument: 'after' },
    );

    if (!updatedItem)
      throw new BadRequestException(`Item ${itemCode} not found`);
    await this.updateItemStatus(updatedItem, session);

    // 👈 تسجيل الحركة في دفتر الأصناف
    await this._ItemLedgerRepository.create(
      {
        itemCode,
        date: new Date(),
        type, // 'MRV', 'TRN', 'ADJ'
        reference,
        qtyIn: quantityToAdd,
        qtyOut: 0,
        balance: updatedItem.quantity,
        unitPrice: updatedItem.unitPrice,
      },
      { session },
    );

    return updatedItem;
  }

  // دالة حجز المخزون (تزيد الكمية المحجوزة)
  async reserveStock(
    itemCode: string,
    quantityToReserve: number,
    session?: QueryOptions['session'],
  ) {
    // التأكد من أن الكمية المتاحة (الكلية - المحجوزة مسبقاً) تكفي للطلب الجديد
    const item = await this._InventoryItemRepository.findOne({
      filter: { itemCode },
      options: { session },
    });
    if (!item) throw new BadRequestException(`Item ${itemCode} not found!`);

    const currentReserved = (item as any).reservedQuantity || 0;
    const availableQty = item.quantity - currentReserved;

    if (availableQty < quantityToReserve) {
      throw new BadRequestException(
        `Insufficient available stock for item ${itemCode}. Available: ${availableQty}`,
      );
    }

    const updatedItem = await this._InventoryItemRepository.findOneAndUpdate(
      { _id: item._id },
      { $inc: { reservedQuantity: quantityToReserve } },
      { session, returnDocument: 'after' },
    );

    return updatedItem;
  }

  // دالة تحرير المخزون (تطرح من الكمية المحجوزة) - تُستخدم عند إلغاء الحجز أو عند صرف المواد فعلياً (MIV)
  async releaseStock(
    itemCode: string,
    quantityToRelease: number,
    session?: QueryOptions['session'],
  ) {
    const updatedItem = await this._InventoryItemRepository.findOneAndUpdate(
      { itemCode, reservedQuantity: { $gte: quantityToRelease } }, // حماية من القيم السالبة
      { $inc: { reservedQuantity: -quantityToRelease } },
      { session, returnDocument: 'after' },
    );

    if (!updatedItem)
      throw new BadRequestException(
        `Invalid release quantity for item ${itemCode}`,
      );
    return updatedItem;
  }

  // أضف هذه الدالة الخاصة (Private) داخل كلاس InventoryEngineService

  private async updateItemStatus(item: any, session?: QueryOptions['session']) {
    let newStatus: string = ItemStatus.InStock;

    // قواعد العمل (Business Rules) لتغيير الحالة
    if (item.quantity === 0) {
      newStatus = ItemStatus.OutOfStock;
    } else if (item.quantity <= (item.minQuantity || 0)) {
      newStatus = ItemStatus.LowStock;
    }

    // لا نحدث قاعدة البيانات إلا إذا تغيرت الحالة فعلياً لتوفير الموارد
    if (item.status !== newStatus) {
      item.status = newStatus;
      await item.save({ session });
    }
  }

  async processAdjustment(adjustment: any, session?: any) {
    // Logic for processing adjustment
  }

  async processMIV(miv: any, session?: any) {
    // Logic for processing MIV
  }

  async processMRV(mrv: any, session?: any) {
    // Logic for processing MRV
  }

  async processTransfer(transfer: any, session?: any) {
    // Logic for processing Transfer
  }
}
