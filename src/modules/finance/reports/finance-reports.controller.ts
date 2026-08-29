import { Controller, Get, Query } from '@nestjs/common';
import { StatementsService } from '../statements/statements.service';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RequirePermissions } from 'src/common/decorators/permissions.decorator';
import { UserRole } from 'src/DB/enums/user.enum';

@Controller('finance/reports')
export class FinanceReportsController {
  constructor(private readonly statementsService: StatementsService) {}

  // Cash Flow Statement
  @Get('cash-flow')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager)
  @RequirePermissions('view:finance')
  getCashFlow(@Query() _query: any) {
    return {
      data: {
        operating: { netIncome: 0, depreciation: 0, arChange: 0, apChange: 0, total: 0 },
        investing: { assetPurchases: 0, assetDisposals: 0, total: 0 },
        financing: { loanDrawdowns: 0, loanRepayments: 0, total: 0 },
        netCashChange: 0,
        openingCash: 0,
        closingCash: 0,
      },
    };
  }

  // Budget vs Actual
  @Get('budget-vs-actual')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager, UserRole.ProjectManager)
  @RequirePermissions('view:finance')
  getBudgetVsActual(@Query() _query: any) {
    return { data: [], message: 'Budget vs Actual report' };
  }

  // Cost Center P&L
  @Get('cost-center-pl')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager)
  @RequirePermissions('view:finance')
  getCostCenterPL(@Query() _query: any) {
    return { data: [], message: 'Cost Center P&L report' };
  }

  // Project Financial
  @Get('project-financial')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager, UserRole.ProjectManager)
  @RequirePermissions('view:finance')
  getProjectFinancial(@Query() _query: any) {
    return { data: [], message: 'Project Financial report' };
  }

  // AP Aging Detail
  @Get('ap-aging-detail')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager)
  @RequirePermissions('view:finance')
  getApAgingDetail(@Query() _query: any) {
    return {
      data: [],
      buckets: { current: 0, thirtyToSixty: 0, sixtyToNinety: 0, overNinety: 0 },
    };
  }

  // AR Aging Detail
  @Get('ar-aging-detail')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager)
  @RequirePermissions('view:finance')
  getArAgingDetail(@Query() _query: any) {
    return {
      data: [],
      buckets: { current: 0, thirtyToSixty: 0, sixtyToNinety: 0, overNinety: 0 },
    };
  }
}
