import { Controller, Get, Param, Query } from '@nestjs/common';
import { QuotationComparisonService } from './quotation-comparison.service';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RequirePermissions } from 'src/common/decorators/permissions.decorator';
import { UserRole } from 'src/DB/enums/user.enum';

@Controller('procurement/quotation-comparison')
export class QuotationComparisonController {
  constructor(private readonly comparisonService: QuotationComparisonService) {}

  // GET /api/v1/procurement/quotation-comparison
  @Get()
  @Roles(
    UserRole.SuperAdmin,
    UserRole.GeneralManager,
    UserRole.ProcurementManager,
    UserRole.FinanceManager,
    UserRole.ProjectManager,
  )
  @RequirePermissions('view:procurement')
  async getAllComparisons(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('rfqId') rfqId?: string,
  ) {
    return this.comparisonService.getAllComparisons(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      rfqId,
    );
  }

  // GET /api/v1/procurement/quotation-comparison/:rfqId
  @Get(':rfqId')
  @Roles(
    UserRole.SuperAdmin,
    UserRole.GeneralManager,
    UserRole.ProcurementManager,
    UserRole.FinanceManager,
    UserRole.ProjectManager,
  )
  @RequirePermissions('view:procurement')
  async getComparisonDetails(@Param('rfqId') rfqId: string) {
    return this.comparisonService.getComparisonDetails(rfqId);
  }
}
