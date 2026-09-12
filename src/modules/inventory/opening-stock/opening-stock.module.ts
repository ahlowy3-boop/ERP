import { Module } from '@nestjs/common';
import { OpeningStockController } from './opening-stock.controller';
import { OpeningStockService } from './opening-stock.service';
import { OpeningStockRepository } from './opening-stock.repository';
import { OpeningStockModel } from './entities/opening-stock.model';
import { WarehousesModule } from '../warehouses/warehouses.module';
import { ItemsModule } from '../items/items.module';

@Module({
  imports: [
    OpeningStockModel,
    WarehousesModule,   // exports WarehouseRepository
    ItemsModule,        // exports InventoryItemRepository
    // SharedModule is @Global() → InventoryEngineService & NumberingService injected automatically
  ],
  controllers: [OpeningStockController],
  providers: [OpeningStockService, OpeningStockRepository],
  exports: [OpeningStockService, OpeningStockRepository],
})
export class OpeningStockModule {}
