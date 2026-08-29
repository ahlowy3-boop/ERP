import { Controller, Get, Post, Patch, Body, Param, Query, Request } from '@nestjs/common';
import { HseService } from './hse.service';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RequirePermissions } from 'src/common/decorators/permissions.decorator';
import { UserRole } from 'src/DB/enums/user.enum';

@Controller('hse')
export class HseController {
  constructor(private readonly hseService: HseService) {}

  // ─── 1. Incidents ─────────────────────────────────────────────────────────
  @Get('incidents')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.SafetyOfficer, UserRole.OperationsManager)
  @RequirePermissions('view:hse')
  findAllIncidents(@Query() query: any) {
    return this.hseService.findAllIncidents(query);
  }

  @Post('incidents')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.SafetyOfficer, UserRole.OperationsManager)
  @RequirePermissions('edit:hse')
  createIncident(@Body() dto: any) {
    return this.hseService.createIncident(dto);
  }

  @Patch('incidents/:id')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.SafetyOfficer)
  @RequirePermissions('edit:hse')
  updateIncident(@Param('id') id: string, @Body() dto: any) {
    return this.hseService.updateIncident(id, dto);
  }

  // ─── 2. Permit to Work (PTW) ──────────────────────────────────────────────
  @Get('ptws')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.SafetyOfficer, UserRole.OperationsManager)
  @RequirePermissions('view:hse')
  findAllPtws(@Query() query: any) {
    return this.hseService.findAllPtws(query);
  }

  @Post('ptws')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.SafetyOfficer, UserRole.OperationsManager)
  @RequirePermissions('edit:hse')
  createPtw(@Body() dto: any) {
    return this.hseService.createPtw(dto);
  }

  @Patch('ptws/:id/approve')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.SafetyOfficer)
  @RequirePermissions('edit:hse')
  approvePtw(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    return this.hseService.approvePtw(id, dto, req.user?.id);
  }

  // ─── 3. Safety Inspections ────────────────────────────────────────────────
  @Get('safety-inspections')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.SafetyOfficer)
  @RequirePermissions('view:hse')
  findAllInspections(@Query() query: any) {
    return this.hseService.findAllInspections(query);
  }

  @Post('safety-inspections')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.SafetyOfficer)
  @RequirePermissions('edit:hse')
  createInspection(@Body() dto: any) {
    return this.hseService.createInspection(dto);
  }

  // ─── 4. Risk Register ─────────────────────────────────────────────────────
  @Get('risks')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.SafetyOfficer)
  @RequirePermissions('view:hse')
  findAllRisks(@Query() query: any) {
    return this.hseService.findAllRisks(query);
  }

  @Post('risks')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.SafetyOfficer)
  @RequirePermissions('edit:hse')
  createRisk(@Body() dto: any) {
    return this.hseService.createRisk(dto);
  }
}
