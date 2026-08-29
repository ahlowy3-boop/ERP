import { Module } from '@nestjs/common';
import {
  HseIncidentModel,
  HsePtwModel,
  HseInspectionModel,
  HseRiskModel,
} from './entities/hse.model';
import { HseService } from './hse.service';
import { HseController } from './hse.controller';

@Module({
  imports: [
    HseIncidentModel,
    HsePtwModel,
    HseInspectionModel,
    HseRiskModel,
  ],
  providers: [HseService],
  controllers: [HseController],
  exports: [HseService],
})
export class HseModule {}
