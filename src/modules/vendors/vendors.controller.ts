import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, Request,
} from '@nestjs/common';
import { VendorsService } from './vendors.service';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RequirePermissions } from 'src/common/decorators/permissions.decorator';
import { UserRole } from 'src/DB/enums/user.enum';

@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  // GET /api/v1/vendors
  @Get()
  @Roles(
    UserRole.SuperAdmin, UserRole.GeneralManager,
    UserRole.ProcurementManager, UserRole.FinanceManager,
  )
  @RequirePermissions('view:vendors')
  findAll(
    @Query('search')   search?: string,
    @Query('status')   status?: string,
    @Query('category') category?: string,
    @Query('page')     page?: number,
    @Query('limit')    limit?: number,
  ) {
    return this.vendorsService.findAll({ search, status, category, page, limit });
  }

  // POST /api/v1/vendors
  @Post()
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.ProcurementManager)
  @RequirePermissions('edit:vendors')
  create(@Body() dto: any, @Request() req: any) {
    return this.vendorsService.create(dto, req.user?.id);
  }

  // GET /api/v1/vendors/:id
  @Get(':id')
  @Roles(
    UserRole.SuperAdmin, UserRole.GeneralManager,
    UserRole.ProcurementManager, UserRole.FinanceManager,
  )
  @RequirePermissions('view:vendors')
  findOne(@Param('id') id: string) {
    return this.vendorsService.findOne(id);
  }

  // PUT /api/v1/vendors/:id
  @Put(':id')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.ProcurementManager)
  @RequirePermissions('edit:vendors')
  update(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    return this.vendorsService.update(id, dto, req.user?.id);
  }

  // PATCH /api/v1/vendors/:id/status
  @Patch(':id/status')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.ProcurementManager)
  @RequirePermissions('edit:vendors')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: { status: string; reason?: string },
    @Request() req: any,
  ) {
    return this.vendorsService.updateStatus(id, dto, req.user?.id);
  }

  // DELETE /api/v1/vendors/:id
  @Delete(':id')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager)
  @RequirePermissions('edit:vendors')
  remove(@Param('id') id: string) {
    return this.vendorsService.remove(id);
  }
}
