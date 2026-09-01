import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InventoryItemRepository } from 'src/DB/repositories/inventory-item.repository';
import { CreateInventoryItemDto } from './dto/create-item.dto';

@Injectable()
export class ItemsService {
  constructor(
    private readonly _InventoryItemRepository: InventoryItemRepository,
  ) {}

  async create(data: CreateInventoryItemDto) {
    const item = await this._InventoryItemRepository.create(data);
    return { message: 'Item created successfully', data: item };
  }

  async findAll(query: any) {
    // بناء فلاتر البحث ديناميكياً
    const filter: any = {};
    if (query.search) {
      filter.$or = [
        { itemCode: { $regex: query.search, $options: 'i' } },
        { itemName: { $regex: query.search, $options: 'i' } },
      ];
    }
    if (query.category) filter.category = query.category;
    if (query.status) filter.status = query.status;
    if (query.location) filter.location = query.location;

    return await this._InventoryItemRepository.findAll({
      filter,
      paginate: {
        page: query.page ? parseInt(query.page) : 1,
        limit: query.limit ? parseInt(query.limit) : 20,
      },
    });
  }

  async findOne(id: string) {
    const item = await this._InventoryItemRepository.findOne({
      filter: { _id: id },
    });
    if (!item) throw new NotFoundException('Item not found');
    return { data: item };
  }

  async update(id: string, data: any) {
    // تفعيل الـ Hooks (runValidators) داخل AbstractRepository سيضمن تحديث الحالة (status) إذا تغيرت الكمية
    const item = await this._InventoryItemRepository.findOneAndUpdate(
      { _id: id },
      { $set: data },
    );
    if (!item) throw new NotFoundException('Item not found');
    return { message: 'Item updated', data: item };
  }

  async remove(id: string) {
    const item = await this._InventoryItemRepository.delete({ _id: id });
    if (!item) throw new NotFoundException('Item not found');
    return { message: 'Item deleted' };
  }

  // التحقق من توافر المخزون (Endpoint مخصص في التوثيق)
  async checkAvailability(itemCode: string) {
    const item = await this._InventoryItemRepository.findOne({
      filter: { itemCode },
    });
    if (!item)
      throw new NotFoundException(`Item with code ${itemCode} not found`);

    const reserved = (item as any).reservedQuantity || 0;
    const netAvailable = item.quantity - reserved;

    return {
      success: true,
      data: {
        itemCode: item.itemCode,
        itemName: item.itemName,
        totalAvailable: item.quantity,
        reserved,
        netAvailable,
        status: item.status,
        // warehouses breakdown — populated when warehouse-level tracking is enabled
        warehouses: (item as any).warehouseStock || [],
      },
    };
  }

  // معالجة ملف الإكسيل المرفوع
  async bulkImport(file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Excel file is required');

    // 💡 ملاحظة: هنا يتم دمج مكتبة مثل 'xlsx' أو 'exceljs' لقراءة الـ Buffer
    // const workbook = xlsx.read(file.buffer, { type: 'buffer' });
    // وتحويله إلى مصفوفة (Array of Objects) ثم استخدام:
    // await this._InventoryItemRepository.model.insertMany(parsedItems);

    return { message: 'Bulk import processed successfully (Placeholder)' };
  }
}
