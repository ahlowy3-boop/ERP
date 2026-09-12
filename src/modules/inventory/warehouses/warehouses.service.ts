import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { WarehouseRepository } from 'src/DB/repositories/warehouse.repository';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';

// We check these collections for warehouse references and active stock before deletion
import { MIVModelName } from '../mivs/entities/miv.model';
import { TransferModelName } from '../transfers/entities/transfer.model';
import { StockAdjustmentModelName } from '../adjustments/entities/adjustment.model';
import { OpeningStockModelName } from '../opening-stock/entities/opening-stock.model';
import { StockCountModelName } from '../counts/entities/stock-count.model';
import { InventoryItemModelName } from 'src/DB/models/inventory-item.model';

@Injectable()
export class WarehousesService {
  constructor(
    private readonly _WarehouseRepository: WarehouseRepository,
    @InjectModel(MIVModelName)              private readonly mivModel: Model<any>,
    @InjectModel(TransferModelName)         private readonly transferModel: Model<any>,
    @InjectModel(StockAdjustmentModelName)  private readonly adjModel: Model<any>,
    @InjectModel(OpeningStockModelName)     private readonly osModel: Model<any>,
    @InjectModel(StockCountModelName)       private readonly countModel: Model<any>,
    @InjectModel(InventoryItemModelName)    private readonly itemModel: Model<any>,
  ) {}

  // ─── Resolve warehouse helper (by _id or code) ───────────────────────────
  private async findWarehouseDoc(id: string) {
    if (Types.ObjectId.isValid(id)) {
      const byId = await this._WarehouseRepository.model.findById(id);
      if (byId) return byId;
    }
    return this._WarehouseRepository.model.findOne({ code: id });
  }

  // ─── Create ────────────────────────────────────────────────────────────────
  async create(data: CreateWarehouseDto) {
    const existing = await this._WarehouseRepository.model.findOne({ code: data.code });
    if (existing) {
      throw new BadRequestException(`Warehouse code "${data.code}" is already in use`);
    }

    const warehouse = await this._WarehouseRepository.create(data);
    return {
      success: true,
      message: 'Warehouse created successfully',
      data: this._format(warehouse),
    };
  }

  // ─── Find All ──────────────────────────────────────────────────────────────
  async findAll(page: number = 1, limit: number = 50, status?: string) {
    const filter: any = {};
    if (status) filter.status = status;
    const items = await this._WarehouseRepository.findAll({
      filter,
      paginate: { page, limit },
    });
    return {
      success: true,
      message: 'Warehouses fetched successfully',
      data: (items as any[]).map((w: any) => this._format(w)),
    };
  }

  // ─── Find One ──────────────────────────────────────────────────────────────
  async findOne(id: string) {
    const warehouse = await this.findWarehouseDoc(id);
    if (!warehouse) throw new NotFoundException('Warehouse not found');
    return { success: true, data: this._format(warehouse) };
  }

  // ─── Update ────────────────────────────────────────────────────────────────
  async update(id: string, data: UpdateWarehouseDto) {
    const warehouse = await this.findWarehouseDoc(id);
    if (!warehouse) throw new NotFoundException('Warehouse not found');

    const whId = (warehouse as any)._id;

    // If code is changing, check uniqueness
    if (data.code && data.code !== (warehouse as any).code) {
      const existing = await this._WarehouseRepository.model.findOne({
        code: data.code,
        _id: { $ne: whId },
      });
      if (existing) {
        throw new BadRequestException(`Warehouse code "${data.code}" is already in use`);
      }
    }

    const updated = await this._WarehouseRepository.model.findByIdAndUpdate(
      whId,
      { $set: data },
      { new: true },
    );
    return {
      success: true,
      message: 'Warehouse updated successfully',
      data: this._format(updated),
    };
  }

  // ─── Safe Delete (Checks both stored materials and transactions) ──────────
  async remove(id: string) {
    const warehouse = await this.findWarehouseDoc(id);
    if (!warehouse) throw new NotFoundException('Warehouse not found');

    const whId = (warehouse as any)._id;
    const whCode = (warehouse as any).code;

    // Check 1: Are there active materials/stock stored in this warehouse?
    // Check 2: Are there historical inventory transactions referencing this warehouse?
    const [
      mivCount,
      transferFromCount,
      transferToCount,
      adjCount,
      osCount,
      countCount,
      itemsWithStock,
    ] = await Promise.all([
      this.mivModel.countDocuments({ warehouseId: whId, isDeleted: { $ne: true } }),
      this.transferModel.countDocuments({ fromWarehouseId: whId }),
      this.transferModel.countDocuments({ toWarehouseId: whId }),
      this.adjModel.countDocuments({ warehouseId: whId }),
      this.osModel.countDocuments({ warehouseId: whId }),
      this.countModel.countDocuments({ warehouseId: whId }),
      this.itemModel.countDocuments({
        $or: [{ defaultWarehouse: whId }, { location: whCode }],
        quantity: { $gt: 0 },
      }),
    ]);

    // Check if there are active materials stored
    if (itemsWithStock > 0) {
      throw new BadRequestException(
        `لا يمكن حذف المستودع "${whCode}" لوجود مواد مخزنة به حالياً (${itemsWithStock} صنف برصيد موجب). يرجى صرف أو نقل جميع المواد قبل الحذف. Cannot delete warehouse because it currently contains stored materials.`,
      );
    }

    // Check if there are historical inventory transactions
    const totalTransactions =
      mivCount + transferFromCount + transferToCount + adjCount + osCount + countCount;

    if (totalTransactions > 0) {
      throw new BadRequestException(
        `لا يمكن حذف المستودع "${whCode}" لأنه مرتبط بـ ${totalTransactions} حركة مخزنية سابقة ` +
        `(سندات صرف: ${mivCount}، تحويلات: ${transferFromCount + transferToCount}، تسويات: ${adjCount}، أرصدة افتتاحية: ${osCount}، عمليات جرد: ${countCount}). ` +
        `Cannot delete warehouse because it is already used in inventory transactions.`,
      );
    }

    // Safe Soft-delete: mark status as Inactive
    await this._WarehouseRepository.model.findByIdAndUpdate(
      whId,
      { $set: { status: 'Inactive' } },
    );

    return {
      success: true,
      message: `تم إلغاء تفعيل المستودع "${whCode}" بنجاح (Warehouse deactivated successfully)`,
    };
  }

  // ─── Format helper ─────────────────────────────────────────────────────────
  private _format(w: any) {
    const obj = w.toObject?.() ?? w;
    return { ...obj, id: obj._id?.toString(), _id: obj._id?.toString() };
  }
}
