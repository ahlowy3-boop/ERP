import {
  Controller, Get, Post, Body, Param, Query, Request,
  HttpCode, HttpStatus, ForbiddenException,
} from '@nestjs/common';
import { VendorPortalService } from './vendor-portal.service';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { UserRole } from 'src/DB/enums/user.enum';
import { RequirePermissions } from 'src/common/decorators/permissions.decorator';

@Controller('vendor-portal')
@Roles(UserRole.Vendor)
export class VendorPortalController {
  constructor(private readonly svc: VendorPortalService) {}

  // ─── Resolve vendorId from JWT ───────────────────────────────────────────
  private getVendorId(req: any): string {
    const vendorId = req.user?.vendorId;
    if (!vendorId) throw new ForbiddenException('No vendor profile linked to this account');
    return vendorId.toString();
  }

  // GET /api/v1/vendor-portal/dashboard
  @Get('dashboard')
  getDashboard(@Request() req: any) {
    return this.svc.getDashboard(this.getVendorId(req));
  }

  // GET /api/v1/vendor-portal/rfqs
  @Get('rfqs')
  listRfqs(
    @Request() req: any,
    @Query('status') status?: string,
    @Query('page')   page?: number,
    @Query('limit')  limit?: number,
  ) {
    return this.svc.listRfqs(this.getVendorId(req), { status, page, limit });
  }

  // GET /api/v1/vendor-portal/rfqs/:rfqId
  @Get('rfqs/:rfqId')
  getRfqDetails(@Request() req: any, @Param('rfqId') rfqId: string) {
    return this.svc.getRfqDetails(this.getVendorId(req), rfqId);
  }

  // POST /api/v1/vendor-portal/rfqs/:rfqId/quotations
  @Post('rfqs/:rfqId/quotations')
  @HttpCode(HttpStatus.CREATED)
  submitQuotation(
    @Request() req: any,
    @Param('rfqId') rfqId: string,
    @Body() dto: any,
  ) {
    return this.svc.submitQuotation(this.getVendorId(req), rfqId, dto);
  }

  // GET /api/v1/vendor-portal/history
  @Get('history')
  getHistory(
    @Request() req: any,
    @Query('page')  page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.svc.getHistory(this.getVendorId(req), { page, limit });
  }
}
