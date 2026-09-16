import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { InventoryReportsController } from './inventory-reports.controller';
import { ReportsService } from './reports.service';
import { ItemLedgerModel } from './entities/item-ledger.model';
import { ItemLedgerRepository } from './item-ledger.repository';
import { ItemsModule } from '../items/items.module';
import { InventoryItemModel } from 'src/DB/models/inventory-item.model';
import { WarehouseModel } from 'src/DB/models/warehouse.model';
import { MRVModel } from '../mrvs/entities/mrv.model';
import { MIVModel } from '../mivs/entities/miv.model';
import { TransferModel } from '../transfers/entities/transfer.model';
import { StockAdjustmentModel } from '../adjustments/entities/adjustment.model';
import { StockCountModel } from '../counts/entities/stock-count.model';
import { PurchaseOrderModel } from '../../procurement/purchase-orders/entities/purchase-order.model';

@Module({
  imports: [
    ItemLedgerModel,
    ItemsModule,
    InventoryItemModel,
    WarehouseModel,
    MRVModel,
    MIVModel,
    TransferModel,
    StockAdjustmentModel,
    StockCountModel,
    PurchaseOrderModel,
  ],
  controllers: [ReportsController, InventoryReportsController],
  providers: [ReportsService, ItemLedgerRepository],
  exports: [ReportsService, ItemLedgerRepository],
})
export class ReportsModule {}
