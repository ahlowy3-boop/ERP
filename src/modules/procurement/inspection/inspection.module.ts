import { Module } from '@nestjs/common';
import { InspectionController } from './inspection.controller';
import { InspectionService } from './inspection.service';
import { InspectionRequestModel } from './entities/inspection-request.model';
import { NcrModel } from './entities/ncr.model';
import { InspectionRequestsRepository } from './inspection-requests.repository';
import { NcrsRepository } from './ncrs.repository';
import { PurchaseOrdersModule } from '../purchase-orders/purchase-orders.module';
import { PurchaseOrderModel } from '../purchase-orders/entities/purchase-order.model';
import { MrvsModule } from 'src/modules/inventory/mrvs/mrvs.module';

@Module({
  imports: [
    InspectionRequestModel,
    NcrModel,
    PurchaseOrderModel,
    PurchaseOrdersModule,
    MrvsModule,
  ],
  controllers: [InspectionController],
  providers: [InspectionService, InspectionRequestsRepository, NcrsRepository],
  exports: [InspectionService, InspectionRequestsRepository],
})
export class InspectionModule {}
