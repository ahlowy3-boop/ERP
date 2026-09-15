import { Module } from '@nestjs/common';
import { MrvsController } from './mrvs.controller';
import { MrvsService } from './mrvs.service';
import { MrvModel } from './entities/mrv.model';
import { MrvsRepository } from './mrvs.repository';
import { PurchaseOrdersModule } from 'src/modules/procurement/purchase-orders/purchase-orders.module';
import { ItemsModule } from 'src/modules/inventory/items/items.module';

import { ItemLedgerModel } from 'src/modules/inventory/reports/entities/item-ledger.model';
import { ItemLedgerRepository } from 'src/modules/inventory/reports/item-ledger.repository';

@Module({
  imports: [
    MrvModel,
    ItemLedgerModel,
    PurchaseOrdersModule, // للوصول لتحديث حالة PO
    ItemsModule, // لتمكين حقن InventoryItemRepository
  ],
  controllers: [MrvsController],
  providers: [MrvsService, MrvsRepository, ItemLedgerRepository],
  exports: [MrvsService, MrvsRepository],
})
export class MrvsModule {}
