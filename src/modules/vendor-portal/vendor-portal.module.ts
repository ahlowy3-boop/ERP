import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { VendorPortalController } from './vendor-portal.controller';
import { VendorPortalService } from './vendor-portal.service';
import { VendorModelName } from '../vendors/entities/vendor.model';
import { VendorSchema } from '../vendors/entities/vendor.model';
import { VendorTimelineModelName, VendorTimelineSchema } from '../vendors/entities/vendor-timeline.model';
import { RFQModelName, RFQSchema } from '../procurement/rfqs/entities/rfq.model';
import { QuotationModelName, QuotationSchema } from '../procurement/rfqs/entities/quotation.model';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: VendorModelName,         schema: VendorSchema         },
      { name: VendorTimelineModelName, schema: VendorTimelineSchema },
      { name: RFQModelName,            schema: RFQSchema            },
      { name: QuotationModelName,      schema: QuotationSchema      },
    ]),
  ],
  controllers: [VendorPortalController],
  providers: [VendorPortalService],
})
export class VendorPortalModule {}
