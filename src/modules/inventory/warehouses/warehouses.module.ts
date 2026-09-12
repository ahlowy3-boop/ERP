import { Module } from '@nestjs/common';
import { WarehousesController } from './warehouses.controller';
import { WarehousesService } from './warehouses.service';
import { WarehouseModel } from 'src/DB/models/warehouse.model';
import { WarehouseRepository } from 'src/DB/repositories/warehouse.repository';
import { MIVModel } from '../mivs/entities/miv.model';
import { TransferModel } from '../transfers/entities/transfer.model';
import { StockAdjustmentModel } from '../adjustments/entities/adjustment.model';
import { OpeningStockModel } from '../opening-stock/entities/opening-stock.model';

@Module({
  imports: [
    WarehouseModel,
    MIVModel,
    TransferModel,
    StockAdjustmentModel,
    OpeningStockModel,
  ],
  controllers: [WarehousesController],
  providers: [WarehousesService, WarehouseRepository],
  exports: [WarehousesService, WarehouseRepository],
})
export class WarehousesModule {}
