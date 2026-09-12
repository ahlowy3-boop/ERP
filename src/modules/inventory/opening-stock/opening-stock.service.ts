import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { OpeningStockRepository } from './opening-stock.repository';
import { OpeningStockModelName } from './entities/opening-stock.model';
import { InventoryItemRepository } from 'src/DB/repositories/inventory-item.repository';
import { WarehouseRepository } from 'src/DB/repositories/warehouse.repository';
import { InventoryEngineService } from 'src/shared/services/inventory-engine.service';
import { NumberingService } from 'src/shared/services/numbering.service';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

// ── xlsx is read from buffer without external deps when possible ────────────
// We require it lazily so the app doesn't crash if not installed on Railway
let xlsx: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  xlsx = require('xlsx');
} catch {
  xlsx = null;
}

@Injectable()
export class OpeningStockService {
  constructor(
    private readonly _OSRepo: OpeningStockRepository,
    private readonly _ItemRepo: InventoryItemRepository,
    private readonly _WHRepo: WarehouseRepository,
    private readonly _InventoryEngine: InventoryEngineService,
    private readonly _NumberingService: NumberingService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  // ─── Generate OS number ────────────────────────────────────────────────────
  private async generateOSNumber(session?: any): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `OS-${year}-`;
    const last = await this._OSRepo.model
      .findOne({ openingNumber: { $regex: `^${prefix}` } })
      .sort({ openingNumber: -1 })
      .lean()
      .session(session ?? null);
    let seq = 1;
    if (last) {
      const parts = (last as any).openingNumber?.split('-') || [];
      const n = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(n)) seq = n + 1;
    }
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  // ─── Create single Opening Stock record ────────────────────────────────────
  async create(dto: any, userId?: string) {
    // Validate item
    const item = await this._ItemRepo.findOne({ filter: { itemCode: dto.itemCode } });
    if (!item) throw new NotFoundException(`Item "${dto.itemCode}" not found`);

    // Validate warehouse
    const warehouse = await this._WHRepo.findOne({ filter: { code: dto.warehouseCode } });
    if (!warehouse) throw new NotFoundException(`Warehouse "${dto.warehouseCode}" not found`);
    if ((warehouse as any).status === 'Inactive') {
      throw new BadRequestException(`Warehouse "${dto.warehouseCode}" is inactive`);
    }

    if (dto.openingQuantity < 0) {
      throw new BadRequestException('Opening quantity cannot be negative');
    }

    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      const openingNumber = await this.generateOSNumber(session);

      const record = await this._OSRepo.create(
        {
          openingNumber,
          itemId:          (item as any)._id,
          itemCode:        item.itemCode,
          itemName:        (item as any).itemName,
          warehouseId:     (warehouse as any)._id,
          warehouseCode:   (warehouse as any).code,
          openingQuantity: dto.openingQuantity,
          unitOfMeasure:   dto.unitOfMeasure || (item as any).uom,
          location:        dto.location || null,
          batchNumber:     dto.batchNumber || null,
          serialNumber:    dto.serialNumber || null,
          condition:       dto.condition || null,
          notes:           dto.notes || null,
          openingDate:     dto.openingDate ? new Date(dto.openingDate) : new Date(),
          status:          'Draft',
          createdBy:       userId && Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : undefined,
        },
        { session },
      );

      await session.commitTransaction();
      return { success: true, message: 'Opening stock created', data: record };
    } catch (err: any) {
      await session.abortTransaction();
      if (err.code === 11000) {
        throw new BadRequestException(
          'Duplicate opening stock: same item, warehouse, date and batch already exists',
        );
      }
      throw new InternalServerErrorException(err.message);
    } finally {
      session.endSession();
    }
  }

  // ─── Post (activate) an Opening Stock record → updates ledger & item qty ──
  async post(id: string, userId?: string) {
    const record = await this._OSRepo.findOne({ filter: { _id: id } });
    if (!record) throw new NotFoundException('Opening stock record not found');
    if ((record as any).status === 'Posted') {
      throw new BadRequestException('Already posted');
    }

    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      // Add to item global quantity + ledger entry type 'INI'
      await this._InventoryEngine.addStock(
        (record as any).itemCode,
        (record as any).openingQuantity,
        (record as any).openingNumber,
        'INI',
        session,
      );

      const updated = await this._OSRepo.model
        .findByIdAndUpdate(
          id,
          { $set: { status: 'Posted', postedAt: new Date() } },
          { new: true, session },
        )
        .lean();

      await session.commitTransaction();
      return { success: true, message: 'Opening stock posted successfully', data: updated };
    } catch (err: any) {
      await session.abortTransaction();
      throw new InternalServerErrorException(err.message);
    } finally {
      session.endSession();
    }
  }

  // ─── Find All ──────────────────────────────────────────────────────────────
  async findAll(query: {
    status?: string;
    warehouseCode?: string;
    itemCode?: string;
    page?: number;
    limit?: number;
  }) {
    const filter: any = {};
    if (query.status) filter.status = query.status;
    if (query.warehouseCode) filter.warehouseCode = query.warehouseCode;
    if (query.itemCode) filter.itemCode = query.itemCode;

    const page  = Number(query.page)  || 1;
    const limit = Number(query.limit) || 20;

    const [items, total] = await Promise.all([
      this._OSRepo.findAll({ filter, paginate: { page, limit }, sort: { createdAt: -1 } }),
      this._OSRepo.model.countDocuments(filter),
    ]);

    return {
      success: true,
      data: { items, total, page, totalPages: Math.ceil(total / limit) },
    };
  }

  // ─── Find One ──────────────────────────────────────────────────────────────
  async findOne(id: string) {
    const record = await this._OSRepo.findOne({ filter: { _id: id } });
    if (!record) throw new NotFoundException('Opening stock record not found');
    return { success: true, data: record };
  }

  // ─── Excel Import ──────────────────────────────────────────────────────────
  async importFromExcel(file: Express.Multer.File, userId?: string) {
    if (!file) throw new BadRequestException('Excel file is required');

    if (!xlsx) {
      throw new InternalServerErrorException(
        'xlsx library is not installed on this server. Please run: npm install xlsx',
      );
    }

    const workbook  = xlsx.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet     = workbook.Sheets[sheetName];
    const rows: any[] = xlsx.utils.sheet_to_json(sheet, { defval: '' });

    if (!rows.length) throw new BadRequestException('Excel file is empty or has no data rows');

    // ─── Column name normalization map ─────────────────────────────────────
    const normalize = (row: any) => ({
      itemCode:        String(row['Item Code']        || row['itemCode']        || '').trim(),
      itemName:        String(row['Item Name']         || row['itemName']        || '').trim(),
      openingQuantity: parseFloat(String(row['Opening Quantity'] || row['openingQuantity'] || '0')),
      unitOfMeasure:   String(row['Unit of Measure']  || row['unitOfMeasure']   || '').trim(),
      warehouseCode:   String(row['Warehouse Code']   || row['warehouseCode']   || '').trim(),
      location:        String(row['Location / Bin']   || row['location']        || '').trim() || null,
      batchNumber:     String(row['Batch / Lot No.']  || row['batchNumber']     || '').trim() || null,
      serialNumber:    String(row['Serial No.']       || row['serialNumber']    || '').trim() || null,
      condition:       String(row['Condition']         || row['condition']       || '').trim() || null,
      notes:           String(row['Notes']             || row['notes']           || '').trim() || null,
    });

    const results: any[] = [];
    let successCount = 0;
    let failedCount  = 0;

    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      for (let i = 0; i < rows.length; i++) {
        const rowNum = i + 2; // Excel row (1=header, 2=first data)
        const norm   = normalize(rows[i]);
        const rowResult: any = { row: rowNum, itemCode: norm.itemCode, warehouseCode: norm.warehouseCode };

        // ── Required field validation ──────────────────────────────────────
        const missing: string[] = [];
        if (!norm.itemCode)        missing.push('Item Code');
        if (!norm.itemName)        missing.push('Item Name');
        if (isNaN(norm.openingQuantity) || norm.openingQuantity < 0) missing.push('Opening Quantity (must be >= 0)');
        if (!norm.unitOfMeasure)   missing.push('Unit of Measure');
        if (!norm.warehouseCode)   missing.push('Warehouse Code');

        if (missing.length) {
          rowResult.status = 'failed';
          rowResult.reason = `Missing or invalid required fields: ${missing.join(', ')}`;
          results.push(rowResult);
          failedCount++;
          continue;
        }

        // ── Lookup item ───────────────────────────────────────────────────
        const item = await this._ItemRepo.findOne({ filter: { itemCode: norm.itemCode } });
        if (!item) {
          rowResult.status = 'failed';
          rowResult.reason = `Item code "${norm.itemCode}" does not exist in the system`;
          results.push(rowResult);
          failedCount++;
          continue;
        }

        // ── Lookup warehouse ──────────────────────────────────────────────
        const warehouse = await this._WHRepo.findOne({ filter: { code: norm.warehouseCode } });
        if (!warehouse) {
          rowResult.status = 'failed';
          rowResult.reason = `Warehouse code "${norm.warehouseCode}" does not exist in the system`;
          results.push(rowResult);
          failedCount++;
          continue;
        }
        if ((warehouse as any).status === 'Inactive') {
          rowResult.status = 'failed';
          rowResult.reason = `Warehouse "${norm.warehouseCode}" is inactive`;
          results.push(rowResult);
          failedCount++;
          continue;
        }

        // ── Insert ────────────────────────────────────────────────────────
        const openingNumber = await this.generateOSNumber(session);
        try {
          await this._OSRepo.create(
            {
              openingNumber,
              itemId:          (item as any)._id,
              itemCode:        item.itemCode,
              itemName:        norm.itemName || (item as any).itemName,
              warehouseId:     (warehouse as any)._id,
              warehouseCode:   (warehouse as any).code,
              openingQuantity: norm.openingQuantity,
              unitOfMeasure:   norm.unitOfMeasure,
              location:        norm.location,
              batchNumber:     norm.batchNumber,
              serialNumber:    norm.serialNumber,
              condition:       norm.condition,
              notes:           norm.notes,
              openingDate:     new Date(),
              status:          'Draft',
              createdBy:       userId && Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : undefined,
            },
            { session },
          );
          rowResult.status       = 'success';
          rowResult.openingNumber = openingNumber;
          results.push(rowResult);
          successCount++;
        } catch (rowErr: any) {
          rowResult.status = 'failed';
          rowResult.reason = rowErr.code === 11000
            ? 'Duplicate: same item+warehouse+date+batch already exists'
            : rowErr.message;
          results.push(rowResult);
          failedCount++;
        }
      }

      // If any row failed, abort entire import (all-or-nothing)
      if (failedCount > 0) {
        await session.abortTransaction();
        return {
          success:      false,
          message:      `Import failed: ${failedCount} row(s) have errors. No records were saved.`,
          totalRows:    rows.length,
          successCount: 0,
          failedCount:  rows.length,
          errors:       results.filter(r => r.status === 'failed'),
        };
      }

      await session.commitTransaction();
      return {
        success:      true,
        message:      `Successfully imported ${successCount} opening stock record(s)`,
        totalRows:    rows.length,
        successCount,
        failedCount:  0,
        results,
      };
    } catch (err: any) {
      await session.abortTransaction();
      throw new InternalServerErrorException(`Import failed: ${err.message}`);
    } finally {
      session.endSession();
    }
  }
}
