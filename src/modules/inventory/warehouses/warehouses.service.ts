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

// We check these collections for warehouse references before soft-delete
import { MIVModelName } from '../mivs/entities/miv.model';
import { TransferModelName } from '../transfers/entities/transfer.model';
import { StockAdjustmentModelName } from '../adjustments/entities/adjustment.model';
import { OpeningStockModelName } from '../opening-stock/entities/opening-stock.model';

@Injectable()
export class WarehousesService {
  constructor(
    private readonly _WarehouseRepository: WarehouseRepository,
    @InjectModel(MIVModelName)              private readonly mivModel: Model<any>,
    @InjectModel(TransferModelName)         private readonly transferModel: Model<any>,
    @InjectModel(StockAdjustmentModelName)  private readonly adjModel: Model<any>,
    @InjectModel(OpeningStockModelName)     private readonly osModel: Model<any>,
  ) {}

  // ─── Create ────────────────────────────────────────────────────────────────
  async create(data: CreateWarehouseDto) {
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
    const warehouse = await this._WarehouseRepository.findOne({ filter: { _id: id } });
    if (!warehouse) throw new NotFoundException('Warehouse not found');
    return { success: true, data: this._format(warehouse) };
  }

  // ─── Update ────────────────────────────────────────────────────────────────
  async update(id: string, data: UpdateWarehouseDto) {
    // If code is changing, check uniqueness
    if (data.code) {
      const existing = await this._WarehouseRepository.model.findOne({
        code: data.code,
        _id: { $ne: new Types.ObjectId(id) },
      });
      if (existing) {
        throw new BadRequestException(`Warehouse code "${data.code}" is already in use`);
      }
    }

    const warehouse = await this._WarehouseRepository.findOneAndUpdate(
      { _id: id },
      { $set: data },
    );
    if (!warehouse) throw new NotFoundException('Warehouse not found');
    return {
      success: true,
      message: 'Warehouse updated successfully',
      data: this._format(warehouse),
    };
  }

  // ─── Safe Delete (soft) ────────────────────────────────────────────────────
  async remove(id: string) {
    const warehouse = await this._WarehouseRepository.findOne({ filter: { _id: id } });
    if (!warehouse) throw new NotFoundException('Warehouse not found');

    const whId = (warehouse as any)._id;

    // Check usage across inventory transaction collections
    const [mivCount, transferFromCount, transferToCount, adjCount, osCount] =
      await Promise.all([
        this.mivModel.countDocuments({ warehouseId: whId, isDeleted: { $ne: true } }),
        this.transferModel.countDocuments({ fromWarehouseId: whId }),
        this.transferModel.countDocuments({ toWarehouseId: whId }),
        this.adjModel.countDocuments({ warehouseId: whId }),
        this.osModel.countDocuments({ warehouseId: whId }),
      ]);

    const totalUsage = mivCount + transferFromCount + transferToCount + adjCount + osCount;

    if (totalUsage > 0) {
      throw new BadRequestException(
        `Cannot delete warehouse "${(warehouse as any).code}" because it is already used in ` +
        `${totalUsage} inventory transaction(s). ` +
        `(MIVs: ${mivCount}, Transfers: ${transferFromCount + transferToCount}, ` +
        `Adjustments: ${adjCount}, Opening Stock: ${osCount})`,
      );
    }

    // Soft-delete: set status to Inactive
    await this._WarehouseRepository.findOneAndUpdate(
      { _id: id },
      { $set: { status: 'Inactive' } },
    );

    return { success: true, message: 'Warehouse deactivated successfully' };
  }

  // ─── Format helper ─────────────────────────────────────────────────────────
  private _format(w: any) {
    const obj = w.toObject?.() ?? w;
    return { ...obj, id: obj._id?.toString(), _id: obj._id?.toString() };
  }
}
