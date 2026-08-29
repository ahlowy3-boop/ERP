import { UserRole } from 'src/DB/enums/user.enum';
import { Controller, Get, Post, Patch, Body, Param, Query, Request } from '@nestjs/common';
import { ArService } from './ar.service';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RequirePermissions } from 'src/common/decorators/permissions.decorator';

@Controller('finance/ar')
export class ArController {
  constructor(private readonly arService: ArService) {}

  @Get('invoices')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager, UserRole.ProjectManager)
  @RequirePermissions('view:finance')
  findAllInvoices(@Query() query: any) {
    return this.arService.findAllInvoices(query);
  }

  @Patch('invoices/:id/status')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager)
  @RequirePermissions('edit:finance')
  updateInvoiceStatus(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    return this.arService.updateInvoiceStatus(id, dto, req.user?.id);
  }

  @Get('aging')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager)
  @RequirePermissions('view:finance')
  getAging() {
    return this.arService.getAging();
  }

  @Get('collection-vouchers')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager)
  @RequirePermissions('view:finance')
  findAllCollectionVouchers(@Query() query: any) {
    return this.arService.findAllCollectionVouchers(query);
  }

  @Post('collection-vouchers')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager)
  @RequirePermissions('approve:finance')
  createCollectionVoucher(@Body() dto: any, @Request() req: any) {
    return this.arService.createCollectionVoucher(dto, req.user?.id);
  }

  // ─── AR Customers ─────────────────────────────────────────────────────────
  @Get('customers')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager, UserRole.ProjectManager)
  @RequirePermissions('view:finance')
  findAllCustomers(@Query() query: any) {
    return this.arService.findAllCustomers(query);
  }

  @Post('customers')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager)
  @RequirePermissions('edit:finance')
  createCustomer(@Body() dto: any) {
    return this.arService.createCustomer(dto);
  }

  @Patch('customers/:id')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager)
  @RequirePermissions('edit:finance')
  updateCustomer(@Param('id') id: string, @Body() dto: any) {
    return this.arService.updateCustomer(id, dto);
  }

  @Patch('customers/:id/toggle-status')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager)
  @RequirePermissions('edit:finance')
  toggleCustomerStatus(@Param('id') id: string) {
    return this.arService.toggleCustomerStatus(id);
  }
}
