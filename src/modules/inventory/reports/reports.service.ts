import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { Response } from 'express';
import { InventoryItemRepository } from 'src/DB/repositories/inventory-item.repository';
import { ItemLedgerRepository } from './item-ledger.repository';
import {
  ItemLedger,
  ItemLedgerDocument,
  ItemLedgerModelName,
} from './entities/item-ledger.model';
import {
  InventoryItem,
  InventoryItemDocument,
  InventoryItemModelName,
} from 'src/DB/models/inventory-item.model';
import {
  Warehouse,
  WarehouseDocument,
  WarehouseModelName,
} from 'src/DB/models/warehouse.model';
import { MRV, MRVDocument, MRVModelName } from '../mrvs/entities/mrv.model';
import { MIV, MIVDocument, MIVModelName } from '../mivs/entities/miv.model';
import {
  Transfer,
  TransferDocument,
  TransferModelName,
} from '../transfers/entities/transfer.model';
import {
  StockAdjustment,
  StockAdjustmentDocument,
  StockAdjustmentModelName,
} from '../adjustments/entities/adjustment.model';
import {
  StockCount,
  StockCountDocument,
  StockCountModelName,
} from '../counts/entities/stock-count.model';
import {
  PurchaseOrder,
  PurchaseOrderDocument,
  PurchaseOrderModelName,
} from '../../procurement/purchase-orders/entities/purchase-order.model';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly _InventoryItemRepository: InventoryItemRepository,
    private readonly _ItemLedgerRepository: ItemLedgerRepository,
    @InjectModel(ItemLedgerModelName)
    private readonly itemLedgerModel: Model<ItemLedgerDocument>,
    @InjectModel(InventoryItemModelName)
    private readonly itemModel: Model<InventoryItemDocument>,
    @InjectModel(WarehouseModelName)
    private readonly warehouseModel: Model<WarehouseDocument>,
    @InjectModel(MRVModelName)
    private readonly mrvModel: Model<MRVDocument>,
    @InjectModel(MIVModelName)
    private readonly mivModel: Model<MIVDocument>,
    @InjectModel(TransferModelName)
    private readonly transferModel: Model<TransferDocument>,
    @InjectModel(StockAdjustmentModelName)
    private readonly adjustmentModel: Model<StockAdjustmentDocument>,
    @InjectModel(StockCountModelName)
    private readonly stockCountModel: Model<StockCountDocument>,
    @InjectModel(PurchaseOrderModelName)
    private readonly poModel: Model<PurchaseOrderDocument>,
  ) {}

  // ==========================================
  // 0. CSV Export Utility
  // ==========================================
  private exportCsv(
    res: Response,
    filename: string,
    headers: string[],
    rows: (string | number | null | undefined)[][],
  ) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}.csv"`,
    );

    const escapeCell = (cell: any) => {
      if (cell === null || cell === undefined) return '""';
      const str = String(cell).replace(/"/g, '""');
      return `"${str}"`;
    };

    const csvContent =
      '\uFEFF' +
      [
        headers.map(escapeCell).join(','),
        ...rows.map((row) => row.map(escapeCell).join(',')),
      ].join('\r\n');

    res.end(csvContent);
  }

  // ==========================================
  // 1. Item Ledger Card (Historical movements)
  // GET /api/v1/inventory/reports/item-ledger
  // ==========================================
  async getItemLedgerReport(query: any, res?: Response) {
    const itemIdentifier = query.itemId || query.itemCode;
    if (!itemIdentifier) {
      throw new BadRequestException('itemId or itemCode is required');
    }

    let item: any = null;
    if (Types.ObjectId.isValid(itemIdentifier)) {
      item = await this.itemModel.findById(itemIdentifier).lean();
    }
    if (!item) {
      item = await this.itemModel.findOne({ itemCode: itemIdentifier }).lean();
    }
    if (!item) {
      throw new NotFoundException(`Item '${itemIdentifier}' not found`);
    }

    const start = query.startDate ? new Date(query.startDate) : null;
    const end = query.endDate ? new Date(query.endDate) : null;

    const warehouses = await this.warehouseModel.find().lean();
    const warehouseMap = new Map<string, string>();
    warehouses.forEach((w) => warehouseMap.set(String(w._id), w.name));

    // 1. Search existing ItemLedger entries
    const ledgerFilter: any = { itemCode: item.itemCode };
    if (query.warehouseId && Types.ObjectId.isValid(query.warehouseId)) {
      ledgerFilter.warehouseId = new Types.ObjectId(query.warehouseId);
    }
    let allLedger = await this.itemLedgerModel
      .find(ledgerFilter)
      .sort({ date: 1, createdAt: 1 })
      .lean();

    // If ItemLedger is empty, dynamically reconstruct movements from MRVs & MIVs
    if (allLedger.length === 0) {
      const reconstructed: any[] = [];
      const mrvFilter: any = {
        status: { $in: ['Approved', 'Inspected', 'Posted'] },
        'items.itemCode': item.itemCode,
      };
      if (query.warehouseId && Types.ObjectId.isValid(query.warehouseId)) {
        mrvFilter.warehouseId = new Types.ObjectId(query.warehouseId);
      }
      const mrvs = await this.mrvModel.find(mrvFilter).lean();
      for (const m of mrvs) {
        for (const it of m.items) {
          if (it.itemCode === item.itemCode) {
            reconstructed.push({
              _id: m._id,
              date: m.receivedDate || (m as any).createdAt,
              type: 'MRV',
              reference: m.mrvNumber || m.voucherNumber || '',
              warehouseId: m.warehouseId,
              partner: m.supplierName || m.vendorName || '',
              qtyIn:
                it.acceptedQuantity ||
                it.receivedQuantity ||
                it.quantityReceived ||
                it.quantityOrdered ||
                0,
              qtyOut: 0,
              unitPrice: it.unitPrice || item.unitPrice || 0,
              remarks: m.deliveryNoteNumber || m.poNumber || '',
            });
          }
        }
      }

      const mivFilter: any = {
        status: { $in: ['Approved', 'Issued', 'Posted'] },
        isDeleted: { $ne: true },
        'items.itemCode': item.itemCode,
      };
      if (query.warehouseId && Types.ObjectId.isValid(query.warehouseId)) {
        mivFilter.warehouseId = new Types.ObjectId(query.warehouseId);
      }
      const mivs = await this.mivModel.find(mivFilter).lean();
      for (const m of mivs) {
        for (const it of m.items) {
          if (it.itemCode === item.itemCode) {
            reconstructed.push({
              _id: m._id,
              date: m.issueDate || m.requestDate || (m as any).createdAt,
              type: 'MIV',
              reference: m.mivNumber || m.voucherNumber || '',
              warehouseId: m.warehouseId,
              partner:
                m.projectName ||
                m.costCenterName ||
                m.costCenter ||
                m.recipientName ||
                '',
              qtyIn: 0,
              qtyOut: it.quantityIssued || it.quantity || 0,
              unitPrice:
                it.unitPrice || it.unitCost || item.unitPrice || 0,
              remarks: m.remarks || m.purpose || '',
            });
          }
        }
      }

      reconstructed.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );
      allLedger = reconstructed;
    }

    // Calculate opening balance before start date
    let openingBalance = 0;
    const periodTransactions: any[] = [];

    for (const tx of allLedger) {
      const txDate = new Date(tx.date || (tx as any).createdAt);
      const qtyIn = tx.qtyIn || tx.quantityIn || 0;
      const qtyOut = tx.qtyOut || tx.quantityOut || 0;

      if (start && txDate < start) {
        openingBalance += qtyIn - qtyOut;
      } else if ((!start || txDate >= start) && (!end || txDate <= end)) {
        periodTransactions.push(tx);
      }
    }

    const openingValue =
      Math.round(openingBalance * (item.unitPrice || 0) * 100) / 100;

    let currentRunning = openingBalance;
    let totalIn = 0;
    let totalOut = 0;

    const transactions = periodTransactions.map((tx) => {
      const qtyIn = tx.qtyIn || tx.quantityIn || 0;
      const qtyOut = tx.qtyOut || tx.quantityOut || 0;
      currentRunning += qtyIn - qtyOut;
      totalIn += qtyIn;
      totalOut += qtyOut;

      const uPrice = tx.unitPrice || tx.unitCost || item.unitPrice || 0;
      const txTotal = (qtyIn > 0 ? qtyIn : qtyOut) * uPrice;
      const wName =
        warehouseMap.get(String(tx.warehouseId)) || 'Main Warehouse';

      return {
        transactionId: tx._id ? String(tx._id) : '',
        date: tx.date || (tx as any).createdAt,
        type: tx.type || (tx as any).documentType || 'Movement',
        reference: tx.reference || (tx as any).documentNumber || '',
        warehouse: {
          _id: tx.warehouseId ? String(tx.warehouseId) : '',
          name: wName,
        },
        partner:
          tx.partner ||
          (tx as any).supplierName ||
          (tx as any).projectName ||
          (tx as any).costCenter ||
          (tx as any).remarks ||
          '',
        qtyIn,
        qtyOut,
        runningBalance: currentRunning,
        unitPrice: uPrice,
        totalPrice: Math.round(txTotal * 100) / 100,
        runningValue: Math.round(currentRunning * uPrice * 100) / 100,
        remarks: tx.remarks || (tx as any).referencePoNumber || '',
      };
    });

    const closingBalance = currentRunning;
    const closingValue =
      Math.round(closingBalance * (item.unitPrice || 0) * 100) / 100;

    if (query.format === 'csv' && res) {
      const headers = [
        'Date',
        'Type',
        'Reference',
        'Warehouse',
        'Partner/Cost Center',
        'Qty In',
        'Qty Out',
        'Running Balance',
        'Unit Price',
        'Total Price',
        'Running Value',
        'Remarks',
      ];
      const rows = transactions.map((t) => [
        t.date ? new Date(t.date).toISOString() : '',
        t.type,
        t.reference,
        t.warehouse.name,
        t.partner,
        t.qtyIn,
        t.qtyOut,
        t.runningBalance,
        t.unitPrice,
        t.totalPrice,
        t.runningValue,
        t.remarks,
      ]);
      return this.exportCsv(
        res,
        `item-ledger-${item.itemCode}`,
        headers,
        rows,
      );
    }

    return {
      success: true,
      statusCode: 200,
      data: {
        item: {
          _id: String(item._id),
          itemCode: item.itemCode,
          name: item.itemName,
          unit: item.uom,
          unitCost: item.unitPrice || 0,
        },
        period: {
          startDate: start ? start.toISOString() : null,
          endDate: end ? end.toISOString() : null,
        },
        openingBalance,
        openingValue,
        totalIn,
        totalOut,
        closingBalance,
        closingValue,
        transactions,
      },
    };
  }

  // ==========================================
  // 2. Stock Summary Matrix
  // GET /api/v1/inventory/reports/stock-summary
  // ==========================================
  async getStockSummaryReport(query: any, res?: Response) {
    const itemFilter: any = {};
    const cat = query.categoryId || query.category;
    if (cat) {
      itemFilter.category = { $regex: new RegExp(cat, 'i') };
    }
    if (query.search) {
      itemFilter.$or = [
        { itemCode: { $regex: query.search, $options: 'i' } },
        { itemName: { $regex: query.search, $options: 'i' } },
      ];
    }
    const items = await this.itemModel.find(itemFilter).lean();

    const start = query.startDate ? new Date(query.startDate) : null;
    const end = query.endDate ? new Date(query.endDate) : null;

    // Movement aggregates by itemCode from ItemLedger
    const ledgerFilter: any = {};
    if (query.warehouseId && Types.ObjectId.isValid(query.warehouseId)) {
      ledgerFilter.warehouseId = new Types.ObjectId(query.warehouseId);
    }

    const allLedgers = await this.itemLedgerModel
      .find(ledgerFilter)
      .lean();

    const itemMovementMap = new Map<
      string,
      {
        opening: number;
        purchases: number;
        opsIn: number;
        transfersIn: number;
        consumption: number;
        opsOut: number;
        transfersOut: number;
      }
    >();

    for (const l of allLedgers) {
      const code = l.itemCode;
      if (!itemMovementMap.has(code)) {
        itemMovementMap.set(code, {
          opening: 0,
          purchases: 0,
          opsIn: 0,
          transfersIn: 0,
          consumption: 0,
          opsOut: 0,
          transfersOut: 0,
        });
      }
      const entry = itemMovementMap.get(code)!;
      const lDate = new Date(l.date || (l as any).createdAt);
      const qIn = l.qtyIn || (l as any).quantityIn || 0;
      const qOut = l.qtyOut || (l as any).quantityOut || 0;

      if (start && lDate < start) {
        entry.opening += qIn - qOut;
      } else if ((!start || lDate >= start) && (!end || lDate <= end)) {
        const type = (l.type || '').toUpperCase();
        if (type === 'MRV' || type === 'PURCHASE_RECEIPT') {
          entry.purchases += qIn;
        } else if (type === 'TRN') {
          entry.transfersIn += qIn;
          entry.transfersOut += qOut;
        } else if (type === 'ADJ') {
          entry.opsIn += qIn;
          entry.opsOut += qOut;
        } else if (type === 'MIV') {
          entry.consumption += qOut;
        } else {
          entry.opsIn += qIn;
          entry.opsOut += qOut;
        }
      }
    }

    let totalStockQty = 0;
    let totalValuationUSD = 0;
    let lowStockCount = 0;

    const mappedItems = items.map((item) => {
      const mov = itemMovementMap.get(item.itemCode) || {
        opening: 0,
        purchases: 0,
        opsIn: 0,
        transfersIn: 0,
        consumption: 0,
        opsOut: 0,
        transfersOut: 0,
      };

      const hasMovements = itemMovementMap.has(item.itemCode);
      const openingBalance = start ? mov.opening : (hasMovements ? mov.opening : item.quantity);
      const closingBalance = start
        ? openingBalance +
          mov.purchases +
          mov.opsIn +
          mov.transfersIn -
          mov.consumption -
          mov.opsOut -
          mov.transfersOut
        : item.quantity;

      const unitPrice = item.unitPrice || 0;
      const totalValue =
        Math.round(closingBalance * unitPrice * 100) / 100;
      const minQuantity = item.minQuantity || 0;

      let status = 'In Stock';
      if (closingBalance <= 0) {
        status = 'Out of Stock';
        lowStockCount++;
      } else if (closingBalance <= minQuantity) {
        status = 'Low Stock';
        lowStockCount++;
      }

      totalStockQty += closingBalance;
      totalValuationUSD += totalValue;

      return {
        itemId: String(item._id),
        itemCode: item.itemCode,
        itemName: item.itemName,
        category: item.category || 'General',
        uom: item.uom,
        openingBalance,
        purchases: mov.purchases,
        opsIn: mov.opsIn,
        transfersIn: mov.transfersIn,
        consumption: mov.consumption,
        opsOut: mov.opsOut,
        transfersOut: mov.transfersOut,
        contractors: 0,
        currentBalance: item.quantity,
        closingBalance,
        unitPrice,
        totalValue,
        minQuantity,
        status,
      };
    });

    const kpis = {
      totalItemsCount: items.length,
      totalStockQty,
      totalValuationUSD: Math.round(totalValuationUSD * 100) / 100,
      lowStockCount,
    };

    if (query.format === 'csv' && res) {
      const headers = [
        'Item Code',
        'Item Name',
        'Category',
        'UOM',
        'Opening Balance',
        'Purchases',
        'Ops In',
        'Transfers In',
        'Consumption',
        'Ops Out',
        'Transfers Out',
        'Current Balance',
        'Closing Balance',
        'Unit Price',
        'Total Value',
        'Min Quantity',
        'Status',
      ];
      const rows = mappedItems.map((i) => [
        i.itemCode,
        i.itemName,
        i.category,
        i.uom,
        i.openingBalance,
        i.purchases,
        i.opsIn,
        i.transfersIn,
        i.consumption,
        i.opsOut,
        i.transfersOut,
        i.currentBalance,
        i.closingBalance,
        i.unitPrice,
        i.totalValue,
        i.minQuantity,
        i.status,
      ]);
      return this.exportCsv(res, 'stock-summary-report', headers, rows);
    }

    return {
      success: true,
      statusCode: 200,
      data: {
        kpis,
        items: mappedItems,
      },
    };
  }

  // ==========================================
  // 3. Inventory Asset Valuation (WAVG / FIFO)
  // GET /api/v1/inventory/reports/valuation
  // ==========================================
  async getValuationReport(query: any, res?: Response) {
    const method =
      (query.valuationMethod || 'WAVG').toUpperCase() === 'FIFO'
        ? 'FIFO'
        : 'WAVG';

    const items = await this.itemModel.find().lean();
    const warehouses = await this.warehouseModel.find().lean();
    const warehouseMap = new Map<string, string>();
    warehouses.forEach((w) => warehouseMap.set(String(w._id), w.name));
    const defaultWarehouseName =
      warehouses.length > 0 ? warehouses[0].name : 'Main Yard';

    let totalPhysicalUnits = 0;
    let totalInventoryAssetValue = 0;
    const categoryMap = new Map<
      string,
      { skuCount: number; totalQty: number; totalValuation: number }
    >();

    // For FIFO valuation, pre-fetch latest MRVs
    let recentMrvs: any[] = [];
    if (method === 'FIFO') {
      recentMrvs = await this.mrvModel
        .find({
          status: { $in: ['Approved', 'Inspected', 'Posted'] },
        })
        .sort({ receivedDate: -1, createdAt: -1 })
        .lean();
    }

    const mappedItems = items.map((item) => {
      const onHandQty = item.quantity || 0;
      let averageUnitCost = item.unitPrice || 0;
      let totalAssetValue = 0;

      if (method === 'FIFO' && onHandQty > 0) {
        let remainingQty = onHandQty;
        let fifoSum = 0;
        for (const m of recentMrvs) {
          if (remainingQty <= 0) break;
          for (const it of m.items) {
            if (it.itemCode === item.itemCode && remainingQty > 0) {
              const lotQty =
                it.acceptedQuantity ||
                it.receivedQuantity ||
                it.quantityReceived ||
                0;
              const lotPrice = it.unitPrice || item.unitPrice || 0;
              const taken = Math.min(remainingQty, lotQty);
              fifoSum += taken * lotPrice;
              remainingQty -= taken;
            }
          }
        }
        if (remainingQty > 0) {
          fifoSum += remainingQty * (item.unitPrice || 0);
        }
        totalAssetValue = Math.round(fifoSum * 100) / 100;
        averageUnitCost =
          Math.round((totalAssetValue / onHandQty) * 100) / 100;
      } else {
        totalAssetValue =
          Math.round(onHandQty * averageUnitCost * 100) / 100;
      }

      totalPhysicalUnits += onHandQty;
      totalInventoryAssetValue += totalAssetValue;

      const cat = item.category || 'General';
      if (!categoryMap.has(cat)) {
        categoryMap.set(cat, {
          skuCount: 0,
          totalQty: 0,
          totalValuation: 0,
        });
      }
      const cEntry = categoryMap.get(cat)!;
      cEntry.skuCount++;
      cEntry.totalQty += onHandQty;
      cEntry.totalValuation += totalAssetValue;

      return {
        itemId: String(item._id),
        itemCode: item.itemCode,
        itemName: item.itemName,
        uom: item.uom,
        warehouseId:
          query.warehouseId ||
          (warehouses[0]?._id ? String(warehouses[0]._id) : ''),
        warehouseName: query.warehouseId
          ? warehouseMap.get(query.warehouseId) || defaultWarehouseName
          : defaultWarehouseName,
        onHandQty,
        averageUnitCost,
        totalAssetValue,
        lastReceivedDate: (item as any).updatedAt || (item as any).createdAt,
      };
    });

    const byCategory = Array.from(categoryMap.entries()).map(
      ([category, stat]) => ({
        category,
        skuCount: stat.skuCount,
        totalQty: stat.totalQty,
        totalValuation: Math.round(stat.totalValuation * 100) / 100,
      }),
    );

    const summary = {
      totalSKUs: items.length,
      totalPhysicalUnits,
      totalInventoryAssetValue:
        Math.round(totalInventoryAssetValue * 100) / 100,
    };

    if (query.format === 'csv' && res) {
      const headers = [
        'Item Code',
        'Item Name',
        'UOM',
        'Warehouse',
        'On Hand Qty',
        'Average Unit Cost',
        'Total Asset Value',
        'Last Received Date',
      ];
      const rows = mappedItems.map((i) => [
        i.itemCode,
        i.itemName,
        i.uom,
        i.warehouseName,
        i.onHandQty,
        i.averageUnitCost,
        i.totalAssetValue,
        i.lastReceivedDate ? new Date(i.lastReceivedDate).toISOString() : '',
      ]);
      return this.exportCsv(
        res,
        `inventory-valuation-${method.toLowerCase()}`,
        headers,
        rows,
      );
    }

    return {
      success: true,
      statusCode: 200,
      data: {
        asOfDate: query.asOfDate || new Date().toISOString(),
        valuationMethod: method,
        summary,
        byCategory,
        items: mappedItems,
      },
    };
  }

  // ==========================================
  // 4. Reorder & Low Stock Alerts
  // GET /api/v1/inventory/reports/reorder-alerts
  // ==========================================
  async getReorderAlertsReport(query: any, res?: Response) {
    const items = await this.itemModel.find().lean();
    const warehouses = await this.warehouseModel.find().lean();
    const warehouseName =
      warehouses.length > 0 ? warehouses[0].name : 'Main Yard';

    // Calculate open PO quantities
    const openPOs = await this.poModel
      .find({
        status: {
          $in: [
            'Draft',
            'Pending Approval',
            'Approved',
            'Issued',
            'Partially Received',
          ],
        },
        isDeleted: { $ne: true },
      })
      .lean();

    const openPoQtyMap = new Map<string, number>();
    for (const po of openPOs) {
      for (const it of po.items || []) {
        if (it.itemCode) {
          const qty = it.quantity || 0;
          const rec = (it as any).receivedQuantity || 0;
          const pending = Math.max(0, qty - rec);
          openPoQtyMap.set(
            it.itemCode,
            (openPoQtyMap.get(it.itemCode) || 0) + pending,
          );
        }
      }
    }

    let criticalAlerts = 0;
    let warningAlerts = 0;
    const alerts: any[] = [];

    for (const item of items) {
      const currentStock = item.quantity || 0;
      const minQuantity = item.minQuantity || 0;

      // Condition: currentStock <= minQuantity
      if (currentStock <= minQuantity || currentStock === 0) {
        const maxQuantity =
          (item as any).maxQuantity || (minQuantity > 0 ? minQuantity * 3 : 10);
        const reorderQuantity = Math.max(0, maxQuantity - currentStock);
        const urgency = currentStock === 0 ? 'CRITICAL' : 'WARNING';

        if (urgency === 'CRITICAL') criticalAlerts++;
        else warningAlerts++;

        if (
          !query.urgency ||
          query.urgency.toUpperCase() === urgency
        ) {
          alerts.push({
            itemId: String(item._id),
            itemCode: item.itemCode,
            itemName: item.itemName,
            warehouseName: item.location || warehouseName,
            currentStock,
            minQuantity,
            maxQuantity,
            reorderQuantity,
            urgency,
            openPurchaseOrderQty: openPoQtyMap.get(item.itemCode) || 0,
          });
        }
      }
    }

    if (query.format === 'csv' && res) {
      const headers = [
        'Item Code',
        'Item Name',
        'Warehouse',
        'Current Stock',
        'Min Quantity',
        'Max Quantity',
        'Reorder Quantity',
        'Urgency',
        'Open Purchase Order Qty',
      ];
      const rows = alerts.map((a) => [
        a.itemCode,
        a.itemName,
        a.warehouseName,
        a.currentStock,
        a.minQuantity,
        a.maxQuantity,
        a.reorderQuantity,
        a.urgency,
        a.openPurchaseOrderQty,
      ]);
      return this.exportCsv(res, 'reorder-alerts-report', headers, rows);
    }

    return {
      success: true,
      statusCode: 200,
      data: {
        totalAlerts: alerts.length,
        criticalAlerts,
        warningAlerts,
        alerts,
      },
    };
  }

  // ==========================================
  // 5. Stock Aging Report
  // GET /api/v1/inventory/reports/aging
  // ==========================================
  async getAgingReport(query: any, res?: Response) {
    const asOf = query.asOfDate ? new Date(query.asOfDate) : new Date();
    const items = await this.itemModel
      .find({ quantity: { $gt: 0 } })
      .lean();

    // Map latest movement date per itemCode from ItemLedger
    const latestLedgers = await this.itemLedgerModel.aggregate([
      { $group: { _id: '$itemCode', lastDate: { $max: '$date' } } },
    ]);
    const lastMovementMap = new Map<string, Date>();
    latestLedgers.forEach((l) => {
      if (l._id) lastMovementMap.set(l._id, new Date(l.lastDate));
    });

    const agingDistribution = {
      tier_0_30: { qty: 0, value: 0 },
      tier_31_60: { qty: 0, value: 0 },
      tier_61_90: { qty: 0, value: 0 },
      tier_91_180: { qty: 0, value: 0 },
      tier_over_180: { qty: 0, value: 0 },
    };

    const deadStockItems: any[] = [];

    for (const item of items) {
      const lastMovementDate =
        lastMovementMap.get(item.itemCode) ||
        (item as any).updatedAt ||
        (item as any).createdAt ||
        asOf;

      const diffMs = asOf.getTime() - new Date(lastMovementDate).getTime();
      const daysDormant = Math.max(
        0,
        Math.floor(diffMs / (1000 * 60 * 60 * 24)),
      );
      const qty = item.quantity;
      const unitCost = item.unitPrice || 0;
      const val = Math.round(qty * unitCost * 100) / 100;

      if (daysDormant <= 30) {
        agingDistribution.tier_0_30.qty += qty;
        agingDistribution.tier_0_30.value += val;
      } else if (daysDormant <= 60) {
        agingDistribution.tier_31_60.qty += qty;
        agingDistribution.tier_31_60.value += val;
      } else if (daysDormant <= 90) {
        agingDistribution.tier_61_90.qty += qty;
        agingDistribution.tier_61_90.value += val;
      } else if (daysDormant <= 180) {
        agingDistribution.tier_91_180.qty += qty;
        agingDistribution.tier_91_180.value += val;
      } else {
        agingDistribution.tier_over_180.qty += qty;
        agingDistribution.tier_over_180.value += val;

        deadStockItems.push({
          itemId: String(item._id),
          itemCode: item.itemCode,
          itemName: item.itemName,
          onHandQty: qty,
          unitCost,
          totalValuation: val,
          lastMovementDate: new Date(lastMovementDate).toISOString(),
          daysDormant,
        });
      }
    }

    // Round values
    for (const key of Object.keys(agingDistribution) as (keyof typeof agingDistribution)[]) {
      agingDistribution[key].value =
        Math.round(agingDistribution[key].value * 100) / 100;
    }

    if (query.format === 'csv' && res) {
      const headers = [
        'Item Code',
        'Item Name',
        'On Hand Qty',
        'Unit Cost',
        'Total Valuation',
        'Last Movement Date',
        'Days Dormant',
      ];
      const rows = deadStockItems.map((d) => [
        d.itemCode,
        d.itemName,
        d.onHandQty,
        d.unitCost,
        d.totalValuation,
        d.lastMovementDate,
        d.daysDormant,
      ]);
      return this.exportCsv(res, 'dead-stock-aging-report', headers, rows);
    }

    return {
      success: true,
      statusCode: 200,
      data: {
        agingDistribution,
        deadStockItems,
      },
    };
  }

  // ==========================================
  // 6. Project / Cost Center Material Consumption
  // GET /api/v1/inventory/reports/consumption-by-project
  // ==========================================
  async getConsumptionByProjectReport(query: any, res?: Response) {
    const filter: any = {
      status: { $in: ['Approved', 'Issued', 'Posted'] },
      isDeleted: { $ne: true },
    };

    if (query.projectId) {
      if (Types.ObjectId.isValid(query.projectId)) {
        filter.$or = [
          { projectId: new Types.ObjectId(query.projectId) },
          { projectCode: query.projectId },
        ];
      } else {
        filter.projectCode = query.projectId;
      }
    }

    if (query.costCenter) {
      filter.$or = [
        { costCenter: { $regex: query.costCenter, $options: 'i' } },
        { costCenterCode: { $regex: query.costCenter, $options: 'i' } },
      ];
    }

    if (query.startDate || query.endDate) {
      const dateQuery: any = {};
      if (query.startDate) dateQuery.$gte = new Date(query.startDate);
      if (query.endDate) dateQuery.$lte = new Date(query.endDate);
      filter.$or = [{ issueDate: dateQuery }, { createdAt: dateQuery }];
    }

    const mivs = await this.mivModel.find(filter).lean();

    const projectMap = new Map<
      string,
      {
        projectId: string;
        projectName: string;
        totalItemsIssued: number;
        totalCost: number;
        materialsMap: Map<
          string,
          { itemCode: string; name: string; quantity: number; cost: number }
        >;
      }
    >();

    let grandTotalCost = 0;

    for (const miv of mivs) {
      const pId =
        miv.projectCode ||
        (miv.projectId ? String(miv.projectId) : miv.costCenter || 'General');
      const pName =
        miv.projectName ||
        miv.costCenterName ||
        miv.costCenter ||
        'General Consumption';

      if (!projectMap.has(pId)) {
        projectMap.set(pId, {
          projectId: pId,
          projectName: pName,
          totalItemsIssued: 0,
          totalCost: 0,
          materialsMap: new Map(),
        });
      }

      const proj = projectMap.get(pId)!;

      for (const it of miv.items || []) {
        const qty = it.quantityIssued || it.quantity || 0;
        const itemCost =
          it.totalCost ||
          it.totalPrice ||
          qty * (it.unitCost || it.unitPrice || 0);

        proj.totalItemsIssued += qty;
        proj.totalCost += itemCost;
        grandTotalCost += itemCost;

        if (!proj.materialsMap.has(it.itemCode)) {
          proj.materialsMap.set(it.itemCode, {
            itemCode: it.itemCode,
            name: it.itemName,
            quantity: 0,
            cost: 0,
          });
        }
        const mat = proj.materialsMap.get(it.itemCode)!;
        mat.quantity += qty;
        mat.cost += itemCost;
      }
    }

    const projects = Array.from(projectMap.values()).map((p) => {
      const topMaterials = Array.from(p.materialsMap.values())
        .sort((a, b) => b.cost - a.cost)
        .slice(0, 5)
        .map((m) => ({
          itemCode: m.itemCode,
          name: m.name,
          quantity: m.quantity,
          cost: Math.round(m.cost * 100) / 100,
        }));

      return {
        projectId: p.projectId,
        projectName: p.projectName,
        totalItemsIssued: p.totalItemsIssued,
        totalCost: Math.round(p.totalCost * 100) / 100,
        topMaterials,
      };
    });

    if (query.format === 'csv' && res) {
      const headers = [
        'Project ID',
        'Project Name',
        'Total Items Issued',
        'Total Cost',
        'Top Material 1',
        'Top Material 2',
      ];
      const rows = projects.map((p) => [
        p.projectId,
        p.projectName,
        p.totalItemsIssued,
        p.totalCost,
        p.topMaterials[0]
          ? `${p.topMaterials[0].name} (${p.topMaterials[0].quantity})`
          : '',
        p.topMaterials[1]
          ? `${p.topMaterials[1].name} (${p.topMaterials[1].quantity})`
          : '',
      ]);
      return this.exportCsv(
        res,
        'consumption-by-project-report',
        headers,
        rows,
      );
    }

    return {
      success: true,
      statusCode: 200,
      data: {
        totalConsumptionValue: Math.round(grandTotalCost * 100) / 100,
        projects,
      },
    };
  }

  // ==========================================
  // 7. Physical Stock Count Variance
  // GET /api/v1/inventory/reports/stock-count-variance
  // ==========================================
  async getStockCountVarianceReport(query: any, res?: Response) {
    const filter: any = {};
    if (query.warehouseId && Types.ObjectId.isValid(query.warehouseId)) {
      filter.warehouseId = new Types.ObjectId(query.warehouseId);
    }
    if (query.startDate || query.endDate) {
      const dateFilter: any = {};
      if (query.startDate) dateFilter.$gte = new Date(query.startDate);
      if (query.endDate) dateFilter.$lte = new Date(query.endDate);
      filter.countDate = dateFilter;
    }

    const warehouses = await this.warehouseModel.find().lean();
    const warehouseMap = new Map<string, string>();
    warehouses.forEach((w) => warehouseMap.set(String(w._id), w.name));

    const items = await this.itemModel
      .find()
      .select('itemCode unitPrice')
      .lean();
    const priceMap = new Map<string, number>();
    items.forEach((i) => priceMap.set(i.itemCode, i.unitPrice || 0));

    const counts = await this.stockCountModel
      .find(filter)
      .sort({ countDate: -1, createdAt: -1 })
      .lean();

    let totalItemsAudited = 0;
    let discrepanciesCount = 0;
    let netVarianceQty = 0;
    let netVarianceValue = 0;
    const variances: any[] = [];

    for (const c of counts) {
      const wName =
        warehouseMap.get(String(c.warehouseId)) || 'Main Warehouse';
      for (const it of c.items || []) {
        totalItemsAudited++;
        const sysQty = it.systemQuantity || 0;
        const countQty = it.countedQuantity || 0;
        const variance =
          it.variance !== undefined ? it.variance : countQty - sysQty;
        const unitPrice = priceMap.get(it.itemCode) || 0;
        const varianceVal = Math.round(variance * unitPrice * 100) / 100;

        if (variance !== 0) {
          discrepanciesCount++;
        }
        netVarianceQty += variance;
        netVarianceValue += varianceVal;

        variances.push({
          countNumber: c.countNumber,
          countDate: c.countDate || (c as any).createdAt,
          warehouseName: wName,
          itemCode: it.itemCode,
          itemName: it.itemName,
          systemQuantity: sysQty,
          countedQuantity: countQty,
          variance,
          unitPrice,
          varianceValue: varianceVal,
        });
      }
    }

    const summary = {
      totalCounts: counts.length,
      totalItemsAudited,
      discrepanciesCount,
      netVarianceQty,
      netVarianceValue: Math.round(netVarianceValue * 100) / 100,
    };

    if (query.format === 'csv' && res) {
      const headers = [
        'Count Number',
        'Count Date',
        'Warehouse',
        'Item Code',
        'Item Name',
        'System Qty',
        'Counted Qty',
        'Variance Qty',
        'Unit Price',
        'Variance Value',
      ];
      const rows = variances.map((v) => [
        v.countNumber,
        v.countDate ? new Date(v.countDate).toISOString() : '',
        v.warehouseName,
        v.itemCode,
        v.itemName,
        v.systemQuantity,
        v.countedQuantity,
        v.variance,
        v.unitPrice,
        v.varianceValue,
      ]);
      return this.exportCsv(
        res,
        'stock-count-variance-report',
        headers,
        rows,
      );
    }

    return {
      success: true,
      statusCode: 200,
      data: {
        summary,
        variances,
      },
    };
  }

  // ==========================================
  // Legacy Methods (Preserved for full backward compatibility)
  // ==========================================

  // 1. لوحة تحكم المخزون (KPIs)
  async getSummary() {
    const items = await this._InventoryItemRepository.findAll({
      paginate: { limit: 100000 },
    });
    const data = (items as any[]) || [];

    const totalItems = data.length;
    const totalValue = data.reduce(
      (acc: number, item: any) =>
        acc + (item.quantity || 0) * (item.unitPrice || 0),
      0,
    );
    const lowStockCount = data.filter(
      (item: any) => item.status === 'Low Stock',
    ).length;
    const outOfStockCount = data.filter(
      (item: any) => item.status === 'Out of Stock',
    ).length;

    return {
      success: true,
      data: {
        totalItems,
        totalValue,
        lowStockCount,
        outOfStockCount,
        pendingMRVs: 0,
        pendingMIVs: 0,
      },
    };
  }

  // 2. تقرير تقييم المخزون
  async getValuation() {
    const result = await this._InventoryItemRepository.findAll({
      select: 'itemCode itemName quantity unitPrice',
      paginate: { limit: 1000 },
    });

    const valuation = result.map((item: any) => ({
      itemCode: item.itemCode,
      itemName: item.itemName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalValue: item.quantity * item.unitPrice,
    }));

    return { data: valuation };
  }

  // 3. جلب دفتر الصنف المحدد (Item Ledger)
  async getItemLedger(itemCode: string) {
    const item = await this._InventoryItemRepository.findOne({
      filter: { itemCode },
    });
    if (!item) throw new NotFoundException('Item not found');

    const ledger = await this._ItemLedgerRepository.findAll({
      filter: { itemCode },
      sort: { date: 1 },
    });

    return {
      data: {
        itemCode: item.itemCode,
        currentBalance: item.quantity,
        ledger: ledger,
      },
    };
  }
}
