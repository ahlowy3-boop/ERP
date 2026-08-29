import { UserRole } from 'src/DB/enums/user.enum';
import { Controller, Get, Post, Patch, Body, Query, Param, Request } from '@nestjs/common';
import { CashBankService } from './cash-bank.service';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RequirePermissions } from 'src/common/decorators/permissions.decorator';

@Controller('finance/cash-bank')
export class CashBankController {
  constructor(private readonly cashBankService: CashBankService) {}

  @Get('bank-accounts')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager)
  @RequirePermissions('view:finance')
  findAllBankAccounts() {
    return this.cashBankService.findAllBankAccounts();
  }

  @Post('bank-accounts')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager)
  @RequirePermissions('edit:finance')
  createBankAccount(@Body() dto: any, @Request() req: any) {
    return this.cashBankService.createBankAccount(dto, req.user?.id);
  }

  @Get('cash-accounts')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager)
  @RequirePermissions('view:finance')
  findAllCashAccounts() {
    return this.cashBankService.findAllCashAccounts();
  }

  @Post('cash-accounts')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager)
  @RequirePermissions('edit:finance')
  createCashAccount(@Body() dto: any, @Request() req: any) {
    return this.cashBankService.createCashAccount(dto, req.user?.id);
  }

  @Get('reconciliations')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager)
  @RequirePermissions('view:finance')
  findAllReconciliations(@Query() query: any) {
    return this.cashBankService.findAllReconciliations(query);
  }

  @Post('reconciliations')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager)
  @RequirePermissions('edit:finance')
  createReconciliation(@Body() dto: any, @Request() req: any) {
    return this.cashBankService.createReconciliation(dto, req.user?.id);
  }

  @Patch('bank-accounts/:id/balance')
  @Roles(UserRole.SuperAdmin, UserRole.FinanceManager)
  @RequirePermissions('edit:finance')
  updateBankBalance(@Param('id') id: string, @Body() dto: any) {
    return this.cashBankService.updateBankBalance(id, dto);
  }

  // ─── Treasury Transfers ───────────────────────────────────────────────────
  @Get('transfers')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager)
  @RequirePermissions('view:finance')
  findAllTransfers(@Query() query: any) {
    return this.cashBankService.findAllTransfers(query);
  }

  @Post('transfers')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager)
  @RequirePermissions('edit:finance')
  createTransfer(@Body() dto: any, @Request() req: any) {
    return this.cashBankService.createTransfer(dto, req.user?.id);
  }

  @Patch('transfers/:id/approve')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager)
  @RequirePermissions('approve:finance')
  approveTransfer(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    return this.cashBankService.approveTransfer(id, dto, req.user?.id);
  }

  @Post('transfers/:id/execute')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager)
  @RequirePermissions('approve:finance')
  executeTransfer(@Param('id') id: string, @Request() req: any) {
    return this.cashBankService.executeTransfer(id, req.user?.id);
  }

  @Patch('transfers/:id/cancel')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager)
  @RequirePermissions('edit:finance')
  cancelTransfer(@Param('id') id: string) {
    return this.cashBankService.cancelTransfer(id);
  }

  // ─── Account Movements ─────────────────────────────────────────────────────
  @Get('bank-accounts/:id/movements')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager)
  @RequirePermissions('view:finance')
  getBankAccountMovements(@Param('id') id: string, @Query() query: any) {
    return this.cashBankService.getBankAccountMovements(id, query);
  }

  @Get('cash-accounts/:id/movements')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager)
  @RequirePermissions('view:finance')
  getCashAccountMovements(@Param('id') id: string, @Query() query: any) {
    return this.cashBankService.getCashAccountMovements(id, query);
  }
}
