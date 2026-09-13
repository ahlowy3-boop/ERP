import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, Request, Res,
  UseInterceptors, UploadedFile, HttpCode, HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { VendorsService } from './vendors.service';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RequirePermissions } from 'src/common/decorators/permissions.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { UserRole } from 'src/DB/enums/user.enum';

@Controller('vendors')
export class VendorsController {
  constructor(private readonly svc: VendorsService) {}

  // ─── GET /vendors/summary/kpis ────────────────────────────────────────────
  @Get('summary/kpis')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.ProcurementManager, UserRole.FinanceManager)
  @RequirePermissions('view:vendors')
  getSummaryKpis() {
    return this.svc.getSummaryKpis();
  }

  // ─── GET /vendors/leaderboard ─────────────────────────────────────────────
  @Get('leaderboard')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.ProcurementManager)
  @RequirePermissions('view:vendors')
  getLeaderboard(@Query('limit') limit?: number) {
    return this.svc.getLeaderboard(limit ? Number(limit) : 10);
  }

  // ─── GET /vendors ─────────────────────────────────────────────────────────
  @Get()
  @Roles(
    UserRole.SuperAdmin, UserRole.GeneralManager,
    UserRole.ProcurementManager, UserRole.FinanceManager,
    UserRole.StoreKeeper, UserRole.Employee,
  )
  @RequirePermissions('view:vendors')
  findAll(
    @Query('search')         search?: string,
    @Query('status')         status?: string,
    @Query('approvalStatus') approvalStatus?: string,
    @Query('category')       category?: string,
    @Query('sortBy')         sortBy?: string,
    @Query('sortOrder')      sortOrder?: string,
    @Query('page')           page?: number,
    @Query('limit')          limit?: number,
  ) {
    return this.svc.findAll({ search, status, approvalStatus, category, sortBy, sortOrder, page, limit });
  }

  // ─── POST /vendors ────────────────────────────────────────────────────────
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.ProcurementManager)
  @RequirePermissions('edit:vendors')
  create(@Body() dto: any, @CurrentUser('id') userId: string) {
    return this.svc.create(dto, userId);
  }

  // ─── GET /vendors/:id ─────────────────────────────────────────────────────
  @Get(':id')
  @Roles(
    UserRole.SuperAdmin, UserRole.GeneralManager,
    UserRole.ProcurementManager, UserRole.FinanceManager, UserRole.StoreKeeper,
  )
  @RequirePermissions('view:vendors')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  // ─── PUT /vendors/:id ─────────────────────────────────────────────────────
  @Put(':id')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.ProcurementManager)
  @RequirePermissions('edit:vendors')
  update(
    @Param('id') id: string,
    @Body() dto: any,
    @CurrentUser('id') userId: string,
  ) {
    return this.svc.update(id, dto, userId);
  }

  // ─── PATCH /vendors/:id/status ────────────────────────────────────────────
  @Patch(':id/status')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.ProcurementManager)
  @RequirePermissions('edit:vendors')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: { status?: string; approvalStatus?: string; reason?: string },
    @CurrentUser('id') userId: string,
    @Request() req: any,
  ) {
    return this.svc.updateStatus(id, dto, userId, req.user?.fullName || req.user?.username);
  }

  // ─── DELETE /vendors/:id ──────────────────────────────────────────────────
  @Delete(':id')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager)
  @RequirePermissions('edit:vendors')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TIMELINE
  // ─────────────────────────────────────────────────────────────────────────

  // GET /vendors/:id/timeline
  @Get(':id/timeline')
  @Roles(
    UserRole.SuperAdmin, UserRole.GeneralManager,
    UserRole.ProcurementManager, UserRole.FinanceManager,
  )
  @RequirePermissions('view:vendors')
  getTimeline(@Param('id') id: string) {
    return this.svc.getTimeline(id);
  }

  // POST /vendors/:id/timeline
  @Post(':id/timeline')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.ProcurementManager)
  @RequirePermissions('edit:vendors')
  addTimeline(
    @Param('id') id: string,
    @Body() dto: any,
    @CurrentUser('id') userId: string,
    @Request() req: any,
  ) {
    return this.svc.addCustomTimeline(id, dto, userId, req.user?.fullName || req.user?.username);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LEDGER
  // ─────────────────────────────────────────────────────────────────────────

  // GET /vendors/:id/ledger
  @Get(':id/ledger')
  @Roles(
    UserRole.SuperAdmin, UserRole.GeneralManager,
    UserRole.ProcurementManager, UserRole.FinanceManager,
  )
  @RequirePermissions('view:vendors')
  getLedger(
    @Param('id') id: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('transactionType') transactionType?: string,
  ) {
    return this.svc.getLedger(id, { startDate, endDate, transactionType });
  }

  // POST /vendors/:id/ledger (internal — for finance to add manual entries)
  @Post(':id/ledger')
  @Roles(UserRole.SuperAdmin, UserRole.FinanceManager)
  @RequirePermissions('edit:finance')
  addLedgerEntry(@Param('id') id: string, @Body() dto: any) {
    return this.svc.addLedgerEntry(id, dto);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DOCUMENTS
  // ─────────────────────────────────────────────────────────────────────────

  // GET /vendors/:id/documents
  @Get(':id/documents')
  @Roles(
    UserRole.SuperAdmin, UserRole.GeneralManager,
    UserRole.ProcurementManager, UserRole.FinanceManager,
  )
  @RequirePermissions('view:vendors')
  listDocuments(@Param('id') id: string) {
    return this.svc.listDocuments(id);
  }

  // POST /vendors/:id/documents (multipart/form-data)
  @Post(':id/documents')
  @UseInterceptors(FileInterceptor('file'))
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.ProcurementManager)
  @RequirePermissions('edit:vendors')
  uploadDocument(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: any,
    @CurrentUser('id') userId: string,
  ) {
    return this.svc.uploadDocument(id, file, dto, userId);
  }

  // DELETE /vendors/:id/documents/:documentId
  @Delete(':id/documents/:documentId')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.ProcurementManager)
  @RequirePermissions('edit:vendors')
  deleteDocument(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
  ) {
    return this.svc.deleteDocument(id, documentId);
  }

  // GET /vendors/:id/documents/:documentId/download
  @Get(':id/documents/:documentId/download')
  @Roles(
    UserRole.SuperAdmin, UserRole.GeneralManager,
    UserRole.ProcurementManager, UserRole.FinanceManager,
  )
  @RequirePermissions('view:vendors')
  async downloadDocument(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @Res() res: Response,
  ) {
    const doc = await this.svc.downloadDocument(id, documentId);
    if (doc?.data?.fileUrl) {
      return res.redirect(doc.data.fileUrl);
    }
    return res.json(doc);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // EVALUATIONS
  // ─────────────────────────────────────────────────────────────────────────

  // POST /vendors/:id/evaluations
  @Post(':id/evaluations')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.ProcurementManager)
  @RequirePermissions('edit:vendors')
  submitEvaluation(
    @Param('id') id: string,
    @Body() dto: any,
    @CurrentUser('id') userId: string,
  ) {
    return this.svc.submitEvaluation(id, dto, userId);
  }

  // GET /vendors/:id/evaluations
  @Get(':id/evaluations')
  @Roles(
    UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.ProcurementManager,
  )
  @RequirePermissions('view:vendors')
  getEvaluations(@Param('id') id: string) {
    return this.svc.getEvaluations(id);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PERFORMANCE
  // ─────────────────────────────────────────────────────────────────────────

  // GET /vendors/:id/performance
  @Get(':id/performance')
  @Roles(
    UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.ProcurementManager,
  )
  @RequirePermissions('view:vendors')
  getPerformance(@Param('id') id: string) {
    return this.svc.getPerformance(id);
  }
}
