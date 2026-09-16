import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  InventoryItem,
  InventoryItemDocument,
  InventoryItemModelName,
} from 'src/DB/models/inventory-item.model';
import {
  PurchaseOrder,
  PurchaseOrderDocument,
  PurchaseOrderModelName,
} from '../procurement/purchase-orders/entities/purchase-order.model';
import {
  PurchaseRequest,
  PurchaseRequestDocument,
  PurchaseRequestModelName,
} from '../procurement/purchase-requests/entities/purchase-request.model';
import {
  RFQ,
  RFQDocument,
  RFQModelName,
} from '../procurement/rfqs/entities/rfq.model';
import {
  InspectionRequest,
  InspectionRequestDocument,
  InspectionRequestModelName,
} from '../procurement/inspection/entities/inspection-request.model';
import {
  MRV,
  MRVDocument,
  MRVModelName,
} from '../inventory/mrvs/entities/mrv.model';
import {
  Warehouse,
  WarehouseDocument,
  WarehouseModelName,
} from 'src/DB/models/warehouse.model';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    @InjectModel(InventoryItemModelName)
    private readonly itemModel: Model<InventoryItemDocument>,
    @InjectModel(PurchaseOrderModelName)
    private readonly poModel: Model<PurchaseOrderDocument>,
    @InjectModel(PurchaseRequestModelName)
    private readonly prModel: Model<PurchaseRequestDocument>,
    @InjectModel(RFQModelName)
    private readonly rfqModel: Model<RFQDocument>,
    @InjectModel(InspectionRequestModelName)
    private readonly inspectionModel: Model<InspectionRequestDocument>,
    @InjectModel(MRVModelName)
    private readonly mrvModel: Model<MRVDocument>,
    @InjectModel(WarehouseModelName)
    private readonly warehouseModel: Model<WarehouseDocument>,
  ) {}

  /**
   * Retrieves unified dashboard statistics for Procurement & Inventory
   */
  async getStatistics() {
    // Execute all queries concurrently for ultra-fast response
    const [
      inventoryValueAgg,
      openPurchaseOrdersCount,
      criticalStockCount,
      pipelineTotals,
      stageBreakdown,
      inventoryHealthAgg,
      pendingPRsDocs,
      pendingInspectionsDocs,
      criticalStockDocs,
      warehouses,
    ] = await Promise.all([
      // 1. Total Inventory Valuation
      this.itemModel.aggregate([
        {
          $group: {
            _id: null,
            totalValue: {
              $sum: {
                $multiply: [
                  { $ifNull: ['$quantity', 0] },
                  { $ifNull: ['$unitPrice', 0] },
                ],
              },
            },
          },
        },
      ]),

      // 2. Open Purchase Orders Count
      this.poModel.countDocuments({
        status: {
          $in: [
            'Pending Approval',
            'Approved',
            'Partially Received',
            'Issued',
          ],
        },
        isDeleted: { $ne: true },
      }),

      // 3. Critical Stock Count (quantity <= minQuantity)
      this.itemModel.countDocuments({
        $expr: { $lte: ['$quantity', '$minQuantity'] },
      }),

      // 4. Pipeline Totals
      Promise.all([
        this.prModel.countDocuments({ status: { $ne: 'Cancelled' } }),
        this.rfqModel.countDocuments({ status: { $ne: 'Cancelled' } }),
        this.poModel.countDocuments({
          status: { $ne: 'Cancelled' },
          isDeleted: { $ne: true },
        }),
        this.inspectionModel.countDocuments({}),
        this.mrvModel.countDocuments({
          status: { $ne: 'Cancelled' },
          isDeleted: { $ne: true },
        }),
      ]),

      // 5. Stage Breakdown (active / pending counts)
      Promise.all([
        this.prModel.countDocuments({ status: 'Pending Approval' }),
        this.rfqModel.countDocuments({
          status: {
            $in: [
              'Sent',
              'Published',
              'Partially Responded',
              'Fully Responded',
            ],
          },
        }),
        this.poModel.countDocuments({
          status: 'Pending Approval',
          isDeleted: { $ne: true },
        }),
        this.inspectionModel.countDocuments({ status: 'Pending' }),
        this.mrvModel.countDocuments({
          status: { $in: ['Draft', 'Pending Approval'] },
          isDeleted: { $ne: true },
        }),
      ]),

      // 6. Inventory Health Distribution
      this.itemModel.aggregate([
        {
          $group: {
            _id: null,
            totalItems: { $sum: 1 },
            outOfStock: {
              $sum: { $cond: [{ $lte: ['$quantity', 0] }, 1, 0] },
            },
            lowStock: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $gt: ['$quantity', 0] },
                      { $lte: ['$quantity', '$minQuantity'] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            inStock: {
              $sum: {
                $cond: [{ $gt: ['$quantity', '$minQuantity'] }, 1, 0],
              },
            },
          },
        },
      ]),

      // 7. Pending PRs (Tasks)
      this.prModel
        .find({ status: 'Pending Approval' })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),

      // 8. Pending Inspections (Tasks)
      this.inspectionModel
        .find({ status: 'Pending' })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),

      // 9. Critical Stock Alerts (Items)
      this.itemModel
        .find({ $expr: { $lte: ['$quantity', '$minQuantity'] } })
        .sort({ quantity: 1 })
        .limit(5)
        .lean(),

      // 10. Warehouses for naming lookup
      this.warehouseModel.find().lean(),
    ]);

    // Format KPIs
    const inventoryValue =
      inventoryValueAgg.length > 0
        ? Math.round(inventoryValueAgg[0].totalValue * 100) / 100
        : 0;

    // Format Pipeline
    const [
      purchaseRequestsCount,
      rfqsCount,
      purchaseOrdersCount,
      inspectionsCount,
      goodsReceiptsCount,
    ] = pipelineTotals;

    const [
      openPRs,
      activeRFQs,
      pendingPOs,
      queueInspections,
      pendingMRVs,
    ] = stageBreakdown;

    // Format Inventory Health
    const health = inventoryHealthAgg[0] || {
      totalItems: 0,
      inStock: 0,
      lowStock: 0,
      outOfStock: 0,
    };
    const totalItems = health.totalItems || 0;
    const inStock = health.inStock || 0;
    const lowStock = health.lowStock || 0;
    const outOfStock = health.outOfStock || 0;

    const inStockPercentage =
      totalItems > 0 ? Math.round((inStock / totalItems) * 100) : 0;
    const lowStockPercentage =
      totalItems > 0 ? Math.round((lowStock / totalItems) * 100) : 0;
    const outOfStockPercentage =
      totalItems > 0 ? Math.round((outOfStock / totalItems) * 100) : 0;

    // Format Tasks
    const pendingPRs = pendingPRsDocs.map((pr: any) => {
      const totalEstimatedCost = (pr.items || []).reduce(
        (sum: number, it: any) =>
          sum +
          (it.totalPrice || (it.quantity || 0) * (it.unitPrice || 0)),
        0,
      );

      return {
        id: String(pr._id),
        prNumber: pr.prNumber || pr.requestNumber || `PR-${pr._id}`,
        department: pr.department || 'Operations',
        requestedBy: pr.requestedBy || 'Purchasing Team',
        createdAt: pr.createdAt || pr.requestDate || new Date(),
        totalEstimatedCost: Math.round(totalEstimatedCost * 100) / 100,
        status: pr.status || 'Pending Approval',
      };
    });

    const pendingInspections = pendingInspectionsDocs.map((ins: any) => ({
      id: String(ins._id),
      inspectionNumber:
        ins.requestNumber || ins.inspectionNumber || `INS-${ins._id}`,
      poNumber: ins.poNumber || 'N/A',
      vendorName: ins.vendorName || 'N/A',
      deliveryDate:
        ins.requestedDate || ins.requestDate || ins.createdAt || new Date(),
      status: ins.status || 'Pending',
    }));

    // Format Critical Stock Alerts
    const defaultWarehouseName =
      warehouses.length > 0
        ? `${warehouses[0].name} (${warehouses[0].code})`
        : 'Main Warehouse (WH-MAIN)';

    const criticalStockAlerts = criticalStockDocs.map((item: any) => {
      const qty = item.quantity || 0;
      const minQty = item.minQuantity || 0;
      const status = qty <= 0 ? 'Out of Stock' : 'Low Stock';

      return {
        id: String(item._id),
        itemCode: item.itemCode,
        itemName: item.itemName,
        quantity: qty,
        minQuantity: minQty,
        uom: item.uom || 'EA',
        warehouseName: item.location || defaultWarehouseName,
        status,
      };
    });

    return {
      kpis: {
        inventoryValue,
        openPurchaseOrdersCount,
        criticalStockCount,
      },
      procurementPipeline: {
        purchaseRequestsCount,
        rfqsCount,
        purchaseOrdersCount,
        inspectionsCount,
        goodsReceiptsCount,
        stageSummary: {
          openPRs,
          activeRFQs,
          pendingPOs,
          queueInspections,
          pendingMRVs,
        },
      },
      inventoryHealth: {
        totalItems,
        inStock,
        lowStock,
        outOfStock,
        inStockPercentage,
        lowStockPercentage,
        outOfStockPercentage,
      },
      myTasks: {
        pendingPRs,
        pendingInspections,
      },
      criticalStockAlerts,
    };
  }
}
