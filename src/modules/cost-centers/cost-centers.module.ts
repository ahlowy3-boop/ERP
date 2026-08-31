import { Module } from '@nestjs/common';
import { CostCentersService } from './cost-centers.service';
import { CostCentersController } from './cost-centers.controller';
import { CostCenterModel } from './entities/cost-center.model';
import { ProjectBudgetModel } from '../finance/entities/budget.model';
import { JournalEntryModel } from '../billing/invoices/entities/billing.model';
import { SupplierInvoiceModel } from '../finance/entities/ap.model';
import { PurchaseOrderModel } from '../procurement/purchase-orders/entities/purchase-order.model';

@Module({
  imports: [
    CostCenterModel,
    ProjectBudgetModel,
    JournalEntryModel,
    SupplierInvoiceModel,
    PurchaseOrderModel,
  ],
  providers: [CostCentersService],
  controllers: [CostCentersController],
  exports: [CostCentersService, CostCenterModel],
})
export class CostCentersModule {}
