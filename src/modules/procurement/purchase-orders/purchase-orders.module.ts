import { Module } from '@nestjs/common';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseOrderModel } from './entities/purchase-order.model';
import { PurchaseOrdersRepository } from './purchase-orders.repository';

@Module({
  imports: [PurchaseOrderModel],
  controllers: [PurchaseOrdersController],
  providers: [PurchaseOrdersService, PurchaseOrdersRepository],
  exports: [
    PurchaseOrdersService,
    PurchaseOrdersRepository,
    PurchaseOrderModel,
  ],
})
export class PurchaseOrdersModule {}
