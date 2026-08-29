import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { PeriodCloseService } from './period-close.service';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RequirePermissions } from 'src/common/decorators/permissions.decorator';
import { UserRole } from 'src/DB/enums/user.enum';

@Controller('finance/period-close')
export class PeriodCloseController {
  constructor(private readonly svc: PeriodCloseService) {}

  @Get()
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager)
  @RequirePermissions('view:finance')
  findAll(@Query() query: any) {
    return this.svc.findAll(query);
  }

  @Post()
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager)
  @RequirePermissions('edit:finance')
  create(@Body() dto: any) {
    return this.svc.create(dto);
  }

  @Patch(':id/close')
  @Roles(UserRole.SuperAdmin, UserRole.FinanceManager)
  @RequirePermissions('approve:finance')
  close(@Param('id') id: string, @Body() dto: any) {
    return this.svc.closePeriod(id, dto);
  }

  @Patch(':id/reopen')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager)
  @RequirePermissions('approve:finance')
  reopen(@Param('id') id: string) {
    return this.svc.reopenPeriod(id);
  }

  @Get(':id/checklist')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager)
  @RequirePermissions('view:finance')
  checklist(@Param('id') id: string) {
    return this.svc.getChecklist(id);
  }
}
