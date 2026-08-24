import { Module } from '@nestjs/common';
import { MaintenanceService } from './maintenance.service';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceAliasController } from './maintenance-alias.controller';
import { PMScheduleModel, WorkOrderModel } from './entities/maintenance.model';
import { EquipmentModel } from '../assets/equipment/entities/equipment.model';
import { AssetHistoryModel } from '../assets/entities/assets.model';

@Module({
  imports: [
    PMScheduleModel,
    WorkOrderModel,
    EquipmentModel,
    AssetHistoryModel,
  ],
  providers: [MaintenanceService],
  controllers: [MaintenanceController, MaintenanceAliasController],
  exports: [MaintenanceService, PMScheduleModel, WorkOrderModel],
})
export class MaintenanceModule {}

