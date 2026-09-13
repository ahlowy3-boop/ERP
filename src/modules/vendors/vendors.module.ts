import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { VendorsController } from './vendors.controller';
import { VendorsService } from './vendors.service';
import { VendorModel } from './entities/vendor.model';
import { VendorDocumentModelName } from './entities/vendor-document.model';
import { VendorDocumentSchema } from './entities/vendor-document.model';
import { VendorTimelineModelName, VendorTimelineSchema } from './entities/vendor-timeline.model';
import { VendorEvaluationModelName, VendorEvaluationSchema } from './entities/vendor-evaluation.model';
import { VendorLedgerModelName, VendorLedgerSchema } from './entities/vendor-ledger.model';

@Module({
  imports: [
    MongooseModule.forFeature([
      VendorModel,
      { name: VendorDocumentModelName,   schema: VendorDocumentSchema   },
      { name: VendorTimelineModelName,   schema: VendorTimelineSchema   },
      { name: VendorEvaluationModelName, schema: VendorEvaluationSchema },
      { name: VendorLedgerModelName,     schema: VendorLedgerSchema     },
    ]),
  ],
  controllers: [VendorsController],
  providers: [VendorsService],
  exports: [VendorsService, MongooseModule],
})
export class VendorsModule {}
