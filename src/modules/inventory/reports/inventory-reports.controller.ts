import {
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { RequirePermissions } from 'src/common/decorators/permissions.decorator';

@Controller('inventory/reports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InventoryReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /**
   * 1. Item Ledger Card (Historical movements for a specific item)
   * GET /api/v1/inventory/reports/item-ledger?itemId=...&warehouseId=...&startDate=...&endDate=...&format=csv
   */
  @Get('item-ledger')
  @RequirePermissions('view:inventory')
  async getItemLedger(
    @Query() query: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.reportsService.getItemLedgerReport(query, res);
  }

  /**
   * 2. Stock Summary Matrix (Balance matrix: Opening, Purchases, Consumption, Transfers, Closing)
   * GET /api/v1/inventory/reports/stock-summary?warehouseId=...&categoryId=...&startDate=...&endDate=...&search=...&format=csv
   */
  @Get('stock-summary')
  @RequirePermissions('view:inventory')
  async getStockSummary(
    @Query() query: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.reportsService.getStockSummaryReport(query, res);
  }

  /**
   * 3. Inventory Asset Valuation (WAVG / FIFO valuation by warehouse and category)
   * GET /api/v1/inventory/reports/valuation?warehouseId=...&asOfDate=...&valuationMethod=WAVG&format=csv
   */
  @Get('valuation')
  @RequirePermissions('view:inventory')
  async getValuation(
    @Query() query: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.reportsService.getValuationReport(query, res);
  }

  /**
   * 4. Reorder & Low Stock Alerts (Critical & Warning alerts with open PO quantities)
   * GET /api/v1/inventory/reports/reorder-alerts?warehouseId=...&urgency=critical&format=csv
   */
  @Get('reorder-alerts')
  @RequirePermissions('view:inventory')
  async getReorderAlerts(
    @Query() query: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.reportsService.getReorderAlertsReport(query, res);
  }

  /**
   * 5. Stock Aging Report (Turnover & aging brackets: 0-30, 31-60, 61-90, 91-180, 180+ dead stock)
   * GET /api/v1/inventory/reports/aging?warehouseId=...&asOfDate=...&format=csv
   */
  @Get('aging')
  @RequirePermissions('view:inventory')
  async getAging(
    @Query() query: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.reportsService.getAgingReport(query, res);
  }

  /**
   * 6. Project / Cost Center Material Consumption (MIV consumption grouped by project/cost center)
   * GET /api/v1/inventory/reports/consumption-by-project?projectId=...&costCenter=...&startDate=...&endDate=...&format=csv
   */
  @Get('consumption-by-project')
  @RequirePermissions('view:inventory')
  async getConsumptionByProject(
    @Query() query: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.reportsService.getConsumptionByProjectReport(query, res);
  }

  /**
   * 7. Physical Stock Count Variance (Physical count vs system inventory discrepancies)
   * GET /api/v1/inventory/reports/stock-count-variance?warehouseId=...&startDate=...&endDate=...&format=csv
   */
  @Get('stock-count-variance')
  @RequirePermissions('view:inventory')
  async getStockCountVariance(
    @Query() query: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.reportsService.getStockCountVarianceReport(query, res);
  }
}
