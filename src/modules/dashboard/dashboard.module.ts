import { Module } from '@nestjs/common';
import {
  DashboardController,
  ProcurementDashboardAliasController,
  InventoryDashboardAliasController,
} from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { InventoryItemModel } from 'src/DB/models/inventory-item.model';
import { PurchaseOrderModel } from '../procurement/purchase-orders/entities/purchase-order.model';
import { PurchaseRequestModel } from '../procurement/purchase-requests/entities/purchase-request.model';
import { RfqModel } from '../procurement/rfqs/entities/rfq.model';
import { InspectionRequestModel } from '../procurement/inspection/entities/inspection-request.model';
import { MRVModel } from '../inventory/mrvs/entities/mrv.model';
import { WarehouseModel } from 'src/DB/models/warehouse.model';

@Module({
  imports: [
    InventoryItemModel,
    PurchaseOrderModel,
    PurchaseRequestModel,
    RfqModel,
    InspectionRequestModel,
    MRVModel,
    WarehouseModel,
  ],
  controllers: [
    DashboardController,
    ProcurementDashboardAliasController,
    InventoryDashboardAliasController,
  ],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class MainDashboardModule {}
