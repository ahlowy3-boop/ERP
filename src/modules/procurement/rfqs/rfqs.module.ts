import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RfqsController } from './rfqs.controller';
import { RfqsService } from './rfqs.service';
import { RfqModel } from './entities/rfq.model';
import { QuotationModel } from './entities/quotation.model';
import { RfqsRepository } from './rfqs.repository';
import { QuotationsRepository } from './quotations.repository';
import { PurchaseRequestsModule } from '../purchase-requests/purchase-requests.module';
import { PurchaseOrdersModule } from '../purchase-orders/purchase-orders.module';
import {
  VendorTimelineModelName,
  VendorTimelineSchema,
} from 'src/modules/vendors/entities/vendor-timeline.model';

@Module({
  imports: [
    RfqModel,
    QuotationModel,
    PurchaseRequestsModule,
    PurchaseOrdersModule,
    MongooseModule.forFeature([
      { name: VendorTimelineModelName, schema: VendorTimelineSchema },
    ]),
  ],
  controllers: [RfqsController],
  providers: [RfqsService, RfqsRepository, QuotationsRepository],
  exports: [RfqsService, RfqsRepository, QuotationsRepository],
})
export class RfqsModule {}
