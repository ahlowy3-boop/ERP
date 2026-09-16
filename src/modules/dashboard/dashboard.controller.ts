import { Controller, Get, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * GET /api/v1/dashboard/statistics
   * Primary unified dashboard statistics endpoint for Procurement & Inventory
   */
  @Get('statistics')
  async getDashboardStatistics() {
    const stats = await this.dashboardService.getStatistics();
    return {
      success: true,
      statusCode: 200,
      message: 'Dashboard statistics retrieved successfully',
      data: stats,
    };
  }

  /**
   * GET /api/v1/dashboard/stats (Alias)
   */
  @Get('stats')
  async getDashboardStatsAlias() {
    return this.getDashboardStatistics();
  }
}

@Controller('procurement/dashboard')
@UseGuards(JwtAuthGuard)
export class ProcurementDashboardAliasController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * GET /api/v1/procurement/dashboard/stats
   */
  @Get('stats')
  async getStats() {
    const stats = await this.dashboardService.getStatistics();
    return {
      success: true,
      statusCode: 200,
      message: 'Procurement dashboard statistics retrieved successfully',
      data: stats,
    };
  }
}

@Controller('inventory/dashboard')
@UseGuards(JwtAuthGuard)
export class InventoryDashboardAliasController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * GET /api/v1/inventory/dashboard/stats
   */
  @Get('stats')
  async getStats() {
    const stats = await this.dashboardService.getStatistics();
    return {
      success: true,
      statusCode: 200,
      message: 'Inventory dashboard statistics retrieved successfully',
      data: stats,
    };
  }
}
