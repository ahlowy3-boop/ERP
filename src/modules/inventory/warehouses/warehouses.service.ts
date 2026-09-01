import { Injectable, NotFoundException } from '@nestjs/common';
import { WarehouseRepository } from 'src/DB/repositories/warehouse.repository';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';

@Injectable()
export class WarehousesService {
  constructor(private readonly _WarehouseRepository: WarehouseRepository) {}

  async create(data: CreateWarehouseDto) {
    const warehouse = await this._WarehouseRepository.create(data);
    return {
      success: true,
      message: 'Warehouse created successfully',
      data: {
        ...(warehouse as any).toObject?.() ?? warehouse,
        id: (warehouse as any)._id?.toString(),
        _id: (warehouse as any)._id?.toString(),
      },
    };
  }

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
      data: (items as any[]).map((w: any) => ({
        ...w,
        id: w._id?.toString(),
        _id: w._id?.toString(),
      })),
    };
  }

  async findOne(id: string) {
    const warehouse = await this._WarehouseRepository.findOne({ filter: { _id: id } });
    if (!warehouse) throw new NotFoundException('Warehouse not found');
    return {
      success: true,
      data: {
        ...(warehouse as any),
        id: (warehouse as any)._id?.toString(),
        _id: (warehouse as any)._id?.toString(),
      },
    };
  }

  async update(id: string, data: any) {
    const warehouse = await this._WarehouseRepository.findOneAndUpdate(
      { _id: id },
      { $set: data },
    );
    if (!warehouse) throw new NotFoundException('Warehouse not found');
    return {
      success: true,
      message: 'Warehouse updated successfully',
      data: {
        ...(warehouse as any),
        id: (warehouse as any)._id?.toString(),
        _id: (warehouse as any)._id?.toString(),
      },
    };
  }

  async remove(id: string) {
    const warehouse = await this._WarehouseRepository.findOne({ filter: { _id: id } });
    if (!warehouse) throw new NotFoundException('Warehouse not found');
    await this._WarehouseRepository.delete({ _id: id });
    return { success: true, message: 'Warehouse deleted successfully' };
  }
}
