import { Controller, Get, Param, Query } from '@nestjs/common';
import { ReportsService } from './reports.service';

@Controller('inventory')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('summary')
  async getSummary() {
    return this.reportsService.getSummary();
  }

  @Get('valuation')
  async getValuation() {
    return this.reportsService.getValuation();
  }

  @Get('item-ledger/:itemCode')
  async getItemLedger(@Param('itemCode') itemCode: string) {
    return this.reportsService.getItemLedger(itemCode);
  }

  // Alias: GET /inventory/items/:id/ledger (frontend compatibility)
  @Get('items/:id/ledger')
  async getItemLedgerById(
    @Param('id') id: string,
    @Query('dateFrom') _dateFrom?: string,
    @Query('dateTo') _dateTo?: string,
    @Query('warehouseId') _warehouseId?: string,
  ) {
    // The existing service uses itemCode as the lookup key; id is used as itemCode here.
    // dateFrom, dateTo, warehouseId are accepted for future extension (prefixed _ to avoid lint warnings).
    return this.reportsService.getItemLedger(id);
  }
}
