import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { GlService } from './gl.service';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RequirePermissions } from 'src/common/decorators/permissions.decorator';
import { UserRole } from 'src/DB/enums/user.enum';

@Controller('finance/gl')
export class GlController {
  constructor(private readonly glService: GlService) {}

  @Get('journal-entries')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager)
  @RequirePermissions('view:finance')
  findAll(
    @Query('status') status?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('reference') reference?: string,
    @Query('accountCode') accountCode?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.glService.findAll({ status, dateFrom, dateTo, reference, accountCode, page, limit });
  }

  @Get('journal-entries/:id')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager)
  @RequirePermissions('view:finance')
  findOne(@Param('id') id: string) {
    return this.glService.findOne(id);
  }

  @Post('journal-entries')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager)
  @RequirePermissions('edit:finance')
  createManual(@Body() dto: any, @CurrentUser() user: any) {
    return this.glService.createManual(dto, user._id || user.id);
  }

  @Post('journal-entries/:id/void')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager)
  @RequirePermissions('approve:finance')
  voidEntry(@Param('id') id: string, @CurrentUser() user: any) {
    return this.glService.voidEntry(id, user._id || user.id);
  }

  @Get('ledger-accounts')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager)
  @RequirePermissions('view:finance')
  getLedgerAccounts(@Query() query: any) {
    return this.glService.getLedgerAccounts(query);
  }
}
