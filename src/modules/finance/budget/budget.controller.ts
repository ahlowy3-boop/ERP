import { UserRole } from 'src/DB/enums/user.enum';
import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { BudgetService } from './budget.service';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';

@Controller('finance/budget')
export class BudgetController {
  constructor(private readonly budgetService: BudgetService) {}

  @Get()
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager, UserRole.ProjectManager)
  @RequirePermissions('view:finance')
  findAll(@Query() query: any) {
    return this.budgetService.findAll(query);
  }

  @Post()
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager)
  @RequirePermissions('edit:finance')
  create(@Body() dto: any, @Request() req: any) {
    return this.budgetService.create(dto, req.user?.id);
  }

  @Put(':id')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager)
  @RequirePermissions('edit:finance')
  update(@Param('id') id: string, @Body() dto: any) {
    return this.budgetService.update(id, dto);
  }

  @Patch(':id/status')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager)
  @RequirePermissions('edit:finance')
  updateStatus(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    return this.budgetService.updateStatus(id, dto, req.user?.id);
  }

  @Delete(':id')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager)
  @RequirePermissions('edit:finance')
  remove(@Param('id') id: string) {
    return this.budgetService.remove(id);
  }
}
