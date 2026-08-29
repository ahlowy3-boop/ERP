import { Module } from '@nestjs/common';

// ─── Entities ────────────────────────────────────────────────────────────────
import { ChartOfAccountModel } from './entities/coa.model';
import {
  SupplierInvoiceModel,
  PaymentVoucherModel,
  ApSupplierModel,
  ArCustomerModel,
} from './entities/ap.model';
import {
  BankAccountModel,
  CashAccountModel,
  BankReconciliationModel,
  TreasuryTransferModel,
} from './entities/cash-bank.model';
import { ProjectBudgetModel, CollectionVoucherModel } from './entities/budget.model';
import { PeriodCloseModel } from './period-close/period-close.model';

// ─── Shared Models from other modules ────────────────────────────────────────
import {
  JournalEntryModel,
  SalesInvoiceModel,
} from '../billing/invoices/entities/billing.model';
import { EquipmentModel } from '../assets/equipment/entities/equipment.model';
import { ProjectModel } from '../projects/entities/project.model';

// ─── Services ────────────────────────────────────────────────────────────────
import { CoaService } from './coa/coa.service';
import { GlService } from './gl/gl.service';
import { ApService } from './ap/ap.service';
import { ArService } from './ar/ar.service';
import { CashBankService } from './cash-bank/cash-bank.service';
import { BudgetService } from './budget/budget.service';
import { DepreciationService } from './depreciation/depreciation.service';
import { VatService } from './vat/vat.service';
import { StatementsService } from './statements/statements.service';
import { DashboardService } from './dashboard/dashboard.service';
import { PeriodCloseService } from './period-close/period-close.service';

// ─── Controllers ─────────────────────────────────────────────────────────────
import { CoaController } from './coa/coa.controller';
import { GlController } from './gl/gl.controller';
import { ApController } from './ap/ap.controller';
import { ArController } from './ar/ar.controller';
import { CashBankController } from './cash-bank/cash-bank.controller';
import { BudgetController } from './budget/budget.controller';
import { DepreciationController } from './depreciation/depreciation.controller';
import { VatController } from './vat/vat.controller';
import { StatementsController } from './statements/statements.controller';
import { FinanceAliasController } from './finance-alias.controller';
import { DashboardController } from './dashboard/dashboard.controller';
import { PeriodCloseController } from './period-close/period-close.controller';
import { FinanceReportsController } from './reports/finance-reports.controller';
import { FixedAssetsController } from './fixed-assets/fixed-assets.controller';

@Module({
  imports: [
    // Finance-owned models
    ChartOfAccountModel,
    SupplierInvoiceModel,
    PaymentVoucherModel,
    ApSupplierModel,
    ArCustomerModel,
    BankAccountModel,
    CashAccountModel,
    BankReconciliationModel,
    TreasuryTransferModel,
    ProjectBudgetModel,
    CollectionVoucherModel,
    PeriodCloseModel,

    // Cross-module shared models
    JournalEntryModel,
    SalesInvoiceModel,
    EquipmentModel,
    ProjectModel,
  ],
  providers: [
    CoaService,
    GlService,
    ApService,
    ArService,
    CashBankService,
    BudgetService,
    DepreciationService,
    VatService,
    StatementsService,
    DashboardService,
    PeriodCloseService,
  ],
  controllers: [
    CoaController,
    GlController,
    ApController,
    ArController,
    CashBankController,
    BudgetController,
    DepreciationController,
    VatController,
    StatementsController,
    FinanceAliasController,
    DashboardController,
    PeriodCloseController,
    FinanceReportsController,
    FixedAssetsController,
  ],
  exports: [
    CoaService,
    GlService,
    ApService,
    ArService,
    CashBankService,
    BudgetService,
    DepreciationService,
    VatService,
    StatementsService,
    DashboardService,
    PeriodCloseService,
    // Exported models for other modules
    ChartOfAccountModel,
    SupplierInvoiceModel,
    PaymentVoucherModel,
    ApSupplierModel,
    ArCustomerModel,
    BankAccountModel,
    CashAccountModel,
    CollectionVoucherModel,
    ProjectBudgetModel,
    TreasuryTransferModel,
    PeriodCloseModel,
  ],
})
export class FinanceModule {}
