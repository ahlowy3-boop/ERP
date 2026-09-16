import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { OpeningStockRepository } from './opening-stock.repository';
import { InventoryItemRepository } from 'src/DB/repositories/inventory-item.repository';
import { WarehouseRepository } from 'src/DB/repositories/warehouse.repository';
import { InventoryEngineService } from 'src/shared/services/inventory-engine.service';
import { ItemType, ItemStatus } from 'src/DB/models/inventory-item.model';

// ── xlsx: lazy-load so Railway doesn't crash if not installed ──────────────
let xlsx: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  xlsx = require('xlsx');
} catch {
  xlsx = null;
}

@Injectable()
export class OpeningStockService {
  private readonly logger = new Logger(OpeningStockService.name);

  constructor(
    private readonly _OSRepo: OpeningStockRepository,
    private readonly _ItemRepo: InventoryItemRepository,
    private readonly _WHRepo: WarehouseRepository,
    private readonly _InventoryEngine: InventoryEngineService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  // ─── Generate OS number (OS-YYYY-XXXX) ────────────────────────────────────
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

  // ─── Generate Item Code if missing (MAT-YYYY-XXXX) ────────────────────────
  private async generateItemCode(session?: any): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `MAT-${year}-`;
    const last = await this._ItemRepo.model
      .findOne({ itemCode: { $regex: `^${prefix}` } })
      .sort({ itemCode: -1 })
      .lean()
      .session(session ?? null);
    let seq = 1;
    if (last) {
      const parts = (last as any).itemCode?.split('-') || [];
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

    // Validate warehouse (by code or name)
    const whFilter = {
      $or: [
        { code: dto.warehouseCode },
        { name: dto.warehouseCode },
      ],
    };
    const warehouse = await this._WHRepo.findOne({ filter: whFilter });
    if (!warehouse) throw new NotFoundException(`Warehouse "${dto.warehouseCode}" not found`);
    if ((warehouse as any).status === 'Inactive') {
      throw new BadRequestException(`Warehouse "${dto.warehouseCode}" is inactive`);
    }

    if (dto.openingQuantity < 0) {
      throw new BadRequestException('Opening quantity cannot be negative');
    }

    const unitCost = dto.unitCost !== undefined ? Number(dto.unitCost) : ((item as any).unitPrice || 0);
    const totalCost = unitCost * dto.openingQuantity;

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
          unitCost,
          totalCost,
          category:        dto.category || (item as any).category || null,
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
      if (err instanceof BadRequestException || err instanceof NotFoundException) {
        throw err;
      }
      throw new BadRequestException(`Failed to create opening stock: ${err.message}`);
    } finally {
      session.endSession();
    }
  }

  // ─── Post (activate) an Opening Stock record → updates ledger & item qty ──
  async post(id: string, userId?: string) {
    let record: any = null;
    if (Types.ObjectId.isValid(id)) {
      record = await this._OSRepo.findOne({ filter: { _id: id } });
    }
    if (!record) {
      record = await this._OSRepo.findOne({ filter: { openingNumber: id } });
    }
    if (!record) throw new NotFoundException('Opening stock record not found');
    if ((record as any).status === 'Posted' || (record as any).status === 'POSTED') {
      throw new BadRequestException('Already posted');
    }
    if ((record as any).status === 'Cancelled' || (record as any).status === 'CANCELLED') {
      throw new BadRequestException('Cannot post a cancelled opening stock record');
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
          record._id,
          { $set: { status: 'POSTED', postedAt: new Date() } },
          { new: true, session },
        )
        .lean();

      await session.commitTransaction();
      return { success: true, message: 'Opening stock posted successfully', data: updated };
    } catch (err: any) {
      await session.abortTransaction();
      if (err instanceof BadRequestException || err instanceof NotFoundException) {
        throw err;
      }
      throw new BadRequestException(`Failed to post opening stock: ${err.message}`);
    } finally {
      session.endSession();
    }
  }

  // ─── Delete / Cancel Opening Stock ─────────────────────────────────────────
  async remove(id: string, userId?: string) {
    let record: any = null;
    if (Types.ObjectId.isValid(id)) {
      record = await this._OSRepo.findOne({ filter: { _id: id } });
    }
    if (!record) {
      record = await this._OSRepo.findOne({ filter: { openingNumber: id } });
    }
    if (!record) throw new NotFoundException('Opening stock record not found');

    const status = (record as any).status;

    // If Draft: Hard delete
    if (status === 'Draft' || status === 'DRAFT') {
      await this._OSRepo.model.findByIdAndDelete(record._id);
      this.logger.log(`Draft opening stock ${(record as any).openingNumber} deleted`);
      return { success: true, message: 'Opening stock draft deleted successfully' };
    }

    // If already cancelled: Cleanly delete from database
    if (status === 'Cancelled' || status === 'CANCELLED') {
      await this._OSRepo.model.findByIdAndDelete(record._id);
      this.logger.log(`Cancelled opening stock ${(record as any).openingNumber} deleted`);
      return { success: true, message: 'Cancelled opening stock deleted successfully' };
    }

    // If Posted / POSTED: Reverse stock impact & soft-cancel
    if (status === 'Posted' || status === 'POSTED') {
      const session = await this.connection.startSession();
      session.startTransaction();
      try {
        // Reverse stock safely up to available quantity (prevents negative inventory)
        await this._InventoryEngine.reverseStock(
          (record as any).itemCode,
          (record as any).openingQuantity,
          (record as any).openingNumber || 'OS-CANCEL',
          'ADJ',
          session,
        );

        const updated = await this._OSRepo.model
          .findByIdAndUpdate(
            record._id,
            {
              $set: {
                status: 'CANCELLED',
                cancelledAt: new Date(),
                cancelledBy:
                  userId && Types.ObjectId.isValid(userId)
                    ? new Types.ObjectId(userId)
                    : undefined,
              },
            },
            { new: true, session },
          )
          .lean();

        await session.commitTransaction();
        this.logger.log(
          `Posted opening stock ${(record as any).openingNumber} cancelled and stock impact reversed`,
        );
        return {
          success: true,
          message: 'Opening stock cancelled and stock impact reversed successfully',
          data: updated,
        };
      } catch (err: any) {
        await session.abortTransaction();
        this.logger.error(`Failed to cancel opening stock: ${err.message}`, err.stack);
        if (err instanceof BadRequestException || err instanceof NotFoundException) {
          throw err;
        }
        throw new BadRequestException(`Failed to cancel opening stock: ${err.message}`);
      } finally {
        session.endSession();
      }
    }

    throw new BadRequestException(`Cannot delete opening stock with status "${status}"`);
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
    let record: any = null;
    if (Types.ObjectId.isValid(id)) {
      record = await this._OSRepo.findOne({ filter: { _id: id } });
    }
    if (!record) {
      record = await this._OSRepo.findOne({ filter: { openingNumber: id } });
    }
    if (!record) throw new NotFoundException('Opening stock record not found');
    return { success: true, data: record };
  }

  // ─── Excel Import + Auto Post + Auto Material Creation ─────────────────────
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
    const rawRows: any[] = xlsx.utils.sheet_to_json(sheet, { defval: '' });

    if (!rawRows.length) throw new BadRequestException('Excel file is empty or has no data rows');

    // ─── Column name normalization map ─────────────────────────────────────
    const normalize = (row: any) => {
      const getVal = (...keys: string[]) => {
        for (const k of keys) {
          if (row[k] !== undefined && String(row[k]).trim() !== '') {
            return String(row[k]).trim();
          }
        }
        return '';
      };

      const itemCodeRaw = getVal('Item Code', 'itemCode', 'ItemCode', 'Code', 'code', 'SKU', 'sku');
      const itemNameRaw = getVal('Item Name', 'itemName', 'ItemName', 'Name', 'name', 'Description', 'description');
      const qtyRaw      = getVal('Quantity', 'quantity', 'Qty', 'qty', 'Opening Quantity', 'openingQuantity');
      const whRaw       = getVal('Warehouse', 'warehouse', 'Warehouse Code', 'warehouseCode', 'Warehouse Name', 'warehouseName');
      const costRaw     = getVal('Unit Cost', 'unitCost', 'UnitCost', 'Cost', 'cost', 'Unit Price', 'unitPrice', 'Price', 'price');
      const catRaw      = getVal('Category', 'category', 'Item Category', 'itemCategory');
      const uomRaw      = getVal('Unit of Measure', 'unitOfMeasure', 'UOM', 'uom', 'Unit', 'unit');

      const cleanNumStr = (val: string) => val.replace(/,/g, '').trim();
      const parsedQty  = qtyRaw ? parseFloat(cleanNumStr(qtyRaw)) : NaN;
      const parsedCost = costRaw ? parseFloat(cleanNumStr(costRaw)) : undefined;

      return {
        itemCode:        itemCodeRaw,
        itemName:        itemNameRaw,
        quantity:        isNaN(parsedQty) ? 0 : parsedQty,
        quantityRaw:     qtyRaw,
        warehouse:       whRaw,
        unitCost:        parsedCost !== undefined && !isNaN(parsedCost) ? parsedCost : undefined,
        category:        catRaw || undefined,
        unitOfMeasure:   uomRaw || 'EA',
        location:        getVal('Location / Bin', 'location', 'Bin', 'bin') || null,
        batchNumber:     getVal('Batch / Lot No.', 'batchNumber', 'batch', 'Batch') || null,
        serialNumber:    getVal('Serial No.', 'serialNumber', 'serial') || null,
        condition:       getVal('Condition', 'condition') || null,
        notes:           getVal('Notes', 'notes') || null,
      };
    };

    // ─── Step 1: Validation ────────────────────────────────────────────────
    const validationErrors: Array<{ row: number; itemCode: string; message: string }> = [];

    const parsedRows = rawRows.map((r, i) => {
      const rowNum = i + 2; // Excel row (1=header, 2=first data row)
      const norm = normalize(r);

      // Check required item identification
      if (!norm.itemCode && !norm.itemName) {
        validationErrors.push({
          row: rowNum,
          itemCode: 'N/A',
          message: 'Item Code or Item Name is required',
        });
      }

      // Check quantity
      if (!norm.quantityRaw || isNaN(norm.quantity) || norm.quantity <= 0) {
        validationErrors.push({
          row: rowNum,
          itemCode: norm.itemCode || norm.itemName || 'N/A',
          message: 'Quantity must be greater than 0',
        });
      }

      // Check warehouse
      if (!norm.warehouse) {
        validationErrors.push({
          row: rowNum,
          itemCode: norm.itemCode || norm.itemName || 'N/A',
          message: 'Warehouse is required',
        });
      }

      // Check optional unit cost validity
      if (norm.unitCost !== undefined && norm.unitCost < 0) {
        validationErrors.push({
          row: rowNum,
          itemCode: norm.itemCode || norm.itemName || 'N/A',
          message: 'Unit Cost cannot be negative',
        });
      }

      return { rowNum, norm };
    });

    // If format validation failed, return error response immediately (No partial import)
    if (validationErrors.length > 0) {
      return {
        success: false,
        message: 'Excel validation failed',
        errors: validationErrors,
      };
    }

    // ─── Step 2: Database Execution inside Transaction ─────────────────────
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      // Validate warehouses in DB first
      const warehouseCache = new Map<string, any>();
      for (const { rowNum, norm } of parsedRows) {
        if (!warehouseCache.has(norm.warehouse)) {
          const escapedWh = norm.warehouse.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const wh = await this._WHRepo.model
            .findOne({
              $or: [
                { code: norm.warehouse },
                { name: norm.warehouse },
                { code: new RegExp(`^${escapedWh}$`, 'i') },
                { name: new RegExp(`^${escapedWh}$`, 'i') },
              ],
            })
            .session(session);

          if (!wh) {
            validationErrors.push({
              row: rowNum,
              itemCode: norm.itemCode || norm.itemName,
              message: `Warehouse "${norm.warehouse}" does not exist in the system`,
            });
            continue;
          }

          if ((wh as any).status === 'Inactive') {
            validationErrors.push({
              row: rowNum,
              itemCode: norm.itemCode || norm.itemName,
              message: `Warehouse "${norm.warehouse}" is inactive`,
            });
            continue;
          }

          warehouseCache.set(norm.warehouse, wh);
        }
      }

      if (validationErrors.length > 0) {
        await session.abortTransaction();
        return {
          success: false,
          message: 'Excel validation failed',
          errors: validationErrors,
        };
      }

      let createdMaterials = 0;
      let existingMaterials = 0;
      let firstOpeningStockId: string | null = null;
      let firstOpeningNumber: string | null = null;

      // In-memory cache for materials found/created during this transaction
      const materialCache = new Map<string, any>();

      for (const { norm } of parsedRows) {
        const warehouse = warehouseCache.get(norm.warehouse);

        // ── 2.1 Find or Create Material ────────────────────────────────────
        let material: any = null;

        // Search cache
        if (norm.itemCode && materialCache.has(`code:${norm.itemCode}`)) {
          material = materialCache.get(`code:${norm.itemCode}`);
        } else if (norm.itemName && materialCache.has(`name:${norm.itemName.toLowerCase()}`)) {
          material = materialCache.get(`name:${norm.itemName.toLowerCase()}`);
        }

        // Search Database
        if (!material) {
          if (norm.itemCode) {
            material = await this._ItemRepo.model
              .findOne({ itemCode: norm.itemCode })
              .session(session);
          }
          if (!material && norm.itemName) {
            const escapedName = norm.itemName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            material = await this._ItemRepo.model
              .findOne({ itemName: new RegExp(`^${escapedName}$`, 'i') })
              .session(session);
          }
        }

        if (material) {
          // Material exists: use it
          existingMaterials++;
          // Update unit price if material has 0 and Excel provided one
          if (norm.unitCost !== undefined && norm.unitCost > 0 && (material.unitPrice === 0 || !material.unitPrice)) {
            material.unitPrice = norm.unitCost;
            await material.save({ session });
          }
          if (norm.itemCode) materialCache.set(`code:${norm.itemCode}`, material);
          if (material.itemName) materialCache.set(`name:${material.itemName.toLowerCase()}`, material);
        } else {
          // Material does not exist: Create it automatically as "MATERIAL"
          const itemCode = norm.itemCode || (await this.generateItemCode(session));
          const itemName = norm.itemName || itemCode;
          const unitPrice = norm.unitCost !== undefined ? norm.unitCost : 0;
          const category = norm.category || 'General';
          const uom = norm.unitOfMeasure || 'EA';

          const newMat = await this._ItemRepo.create(
            {
              itemCode,
              itemName,
              itemType: ItemType.Material,
              category,
              uom,
              unitPrice,
              quantity: 0, // will be incremented on auto-post
              minQuantity: 0,
              status: ItemStatus.OutOfStock,
            },
            { session },
          );

          material = newMat;
          createdMaterials++;
          this.logger.log(`Auto-created Material "${itemCode}" (${itemName}) from Excel import`);

          if (norm.itemCode) materialCache.set(`code:${norm.itemCode}`, material);
          materialCache.set(`code:${itemCode}`, material);
          materialCache.set(`name:${itemName.toLowerCase()}`, material);
        }

        // ── 2.2 Create Opening Stock record ────────────────────────────────
        const openingNumber = await this.generateOSNumber(session);
        const resolvedCost = norm.unitCost !== undefined ? norm.unitCost : (material.unitPrice || 0);
        const totalCost = resolvedCost * norm.quantity;

        const createdOS = await this._OSRepo.create(
          {
            openingNumber,
            itemId:          material._id,
            itemCode:        material.itemCode,
            itemName:        material.itemName,
            warehouseId:     warehouse._id,
            warehouseCode:   warehouse.code,
            openingQuantity: norm.quantity,
            unitOfMeasure:   norm.unitOfMeasure || material.uom || 'EA',
            unitCost:        resolvedCost,
            totalCost,
            category:        norm.category || material.category || 'General',
            location:        norm.location,
            batchNumber:     norm.batchNumber,
            serialNumber:    norm.serialNumber,
            condition:       norm.condition,
            notes:           norm.notes,
            openingDate:     new Date(),
            status:          'POSTED',
            postedAt:        new Date(),
            createdBy:       userId && Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : undefined,
          },
          { session },
        );

        if (!firstOpeningStockId) {
          firstOpeningStockId = (createdOS as any)._id.toString();
          firstOpeningNumber   = openingNumber;
        }

        // ── 2.3 Auto-Post stock movement (updates quantity & ItemLedger) ───
        await this._InventoryEngine.addStock(
          material.itemCode,
          norm.quantity,
          openingNumber,
          'INI',
          session,
        );
      }

      // Commit transaction
      await session.commitTransaction();

      return {
        success: true,
        message: 'Opening stock imported and posted successfully',
        data: {
          openingStockId:    firstOpeningStockId || firstOpeningNumber,
          status:            'POSTED',
          totalItems:        parsedRows.length,
          createdMaterials,
          existingMaterials,
        },
      };
    } catch (err: any) {
      await session.abortTransaction();
      this.logger.error(`Excel import transaction failed: ${err.message}`, err.stack);
      if (err instanceof BadRequestException || err instanceof NotFoundException) {
        throw err;
      }
      throw new BadRequestException(`Import and posting failed: ${err.message}`);
    } finally {
      session.endSession();
    }
  }
}
