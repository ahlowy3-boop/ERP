// Aliases for /api/v1/assets/maintenance/... (used by AssetsApiService in frontend)
import { Controller, Get, Post, Put, Patch, Body, Param, Query } from '@nestjs/common';
import { MaintenanceService } from './maintenance.service';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

@Controller('assets/maintenance')
export class MaintenanceAliasController {
  constructor(private readonly svc: MaintenanceService) {}

  // GET /api/v1/assets/maintenance/pm-schedules
  @Get('pm-schedules')
  listPM(
    @Query('assetId') assetId?: string,
    @Query('status') status?: string,
    @Query('dueBefore') dueBefore?: string,
  ) {
    return this.svc.listPMSchedules({ assetId, status, dueBefore });
  }

  // POST /api/v1/assets/maintenance/pm-schedules
  @Post('pm-schedules')
  createPM(@Body() dto: any, @CurrentUser('id') userId: string) {
    return this.svc.createPMSchedule(dto, userId);
  }

  // PUT /api/v1/assets/maintenance/pm-schedules/:id
  @Put('pm-schedules/:id')
  updatePM(@Param('id') id: string, @Body() dto: any) {
    return this.svc.updatePMSchedule(id, dto);
  }

  // POST /api/v1/assets/maintenance/pm-schedules/:id/trigger
  @Post('pm-schedules/:id/trigger')
  triggerPM(
    @Param('id') id: string,
    @Body() dto: any,
    @CurrentUser('id') userId: string,
  ) {
    return this.svc.triggerPM(id, dto, userId);
  }

  // GET /api/v1/assets/maintenance/work-orders
  @Get('work-orders')
  listWO(
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('priority') priority?: string,
    @Query('assetId') assetId?: string,
  ) {
    return this.svc.listWorkOrders({ status, type, priority, assetId });
  }

  // POST /api/v1/assets/maintenance/work-orders
  @Post('work-orders')
  createWO(@Body() dto: any, @CurrentUser('id') userId: string) {
    return this.svc.createWorkOrder(dto, userId);
  }

  // PATCH /api/v1/assets/maintenance/work-orders/:id/status
  @Patch('work-orders/:id/status')
  updateWOStatus(
    @Param('id') id: string,
    @Body() dto: any,
    @CurrentUser('id') userId: string,
  ) {
    return this.svc.updateWorkOrderStatus(id, dto, userId);
  }
}
