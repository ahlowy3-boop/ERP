import { UserRole } from 'src/DB/enums/user.enum';
import { Controller, Get, Post, Patch, Body, Param, Query, Request } from '@nestjs/common';
import { ApService } from './ap.service';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RequirePermissions } from 'src/common/decorators/permissions.decorator';

@Controller('finance/ap')
export class ApController {
  constructor(private readonly apService: ApService) {}

  @Get('invoices')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager)
  @RequirePermissions('view:finance')
  findAllInvoices(@Query() query: any) {
    return this.apService.findAllInvoices(query);
  }

  @Post('invoices')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager)
  @RequirePermissions('edit:finance')
  createInvoice(@Body() dto: any, @Request() req: any) {
    return this.apService.createInvoice(dto, req.user?.id);
  }

  @Get('aging')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager)
  @RequirePermissions('view:finance')
  getAging() {
    return this.apService.getAging();
  }

  @Get('vouchers')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager)
  @RequirePermissions('view:finance')
  findAllVouchers(@Query() query: any) {
    return this.apService.findAllVouchers(query);
  }

  @Post('vouchers')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager)
  @RequirePermissions('approve:finance')
  createVoucher(@Body() dto: any, @Request() req: any) {
    return this.apService.createVoucher(dto, req.user?.id);
  }

  // PATCH /api/v1/finance/ap/invoices/:id/approve
  @Patch('invoices/:id/approve')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager)
  @RequirePermissions('approve:finance')
  approveInvoice(
    @Param('id') id: string,
    @Body() dto: { approvalNotes?: string },
    @Request() req: any,
  ) {
    return this.apService.approveInvoice(id, dto, req.user?.id);
  }

  // PATCH /api/v1/finance/ap/invoices/:id/reject
  @Patch('invoices/:id/reject')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager)
  @RequirePermissions('approve:finance')
  rejectInvoice(
    @Param('id') id: string,
    @Body() dto: { rejectionReason: string },
    @Request() req: any,
  ) {
    return this.apService.rejectInvoice(id, dto, req.user?.id);
  }
}
