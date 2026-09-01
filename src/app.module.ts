import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import * as Joi from 'joi';

// 🛡️ استيراد الحراس (Guards) العالمية
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';

// 📦 استيراد الموديولات المشتركة وقاعدة البيانات
import { DatabaseModule } from './DB/database.module';
import { SharedModule } from './shared/shared.module';

// 👥 استيراد موديولات المصادقة والإدارة
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './modules/admin/users/users.module';
import { RolesModule } from './modules/admin/roles/roles.module';
import { DepartmentsModule } from './modules/admin/departments/departments.module';

// 🛒 استيراد موديولات دورة العمل
import { PurchaseRequestsModule } from './modules/procurement/purchase-requests/purchase-requests.module';
import { PurchaseOrdersModule } from './modules/procurement/purchase-orders/purchase-orders.module';
import { VendorsModule } from './modules/vendors/vendors.module';
import { MrvsModule } from './modules/inventory/mrvs/mrvs.module';
import { MivsModule } from './modules/inventory/mivs/mivs.module';
import { WarehousesModule } from './modules/inventory/warehouses/warehouses.module';
import { ItemsModule } from './modules/inventory/items/items.module';
import { AdjustmentsModule } from './modules/inventory/adjustments/adjustments.module';
import { CountsModule } from './modules/inventory/counts/counts.module';
import { TransfersModule } from './modules/inventory/transfers/transfers.module';
import { ReportsModule as InventoryReportsModule } from './modules/inventory/reports/reports.module';
import { InventoryAliasModule } from './modules/inventory/inventory-alias.module';

// 🏗️ Phase 1 — Master Data & Contracts
import { EquipmentModule } from './modules/assets/equipment/equipment.module';
import { AssetsModule } from './modules/assets/assets.module';
import { CostCentersModule } from './modules/cost-centers/cost-centers.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { ContractsModule } from './modules/workflow/contracts/contracts.module';

// 🔧 Maintenance
import { MaintenanceModule } from './modules/maintenance/maintenance.module';

// 📁 Asset Categories
import { AssetCategoriesModule } from './modules/assets/categories/categories.module';

// ⚡ Phase 2 — Field Operations, Fuel, Fleet, Camps
import { ProjectResourcesModule } from './modules/projects/project-resources.module';
import { TimesheetsModule } from './modules/operations/timesheets/timesheets.module';
import { FuelModule } from './modules/operations/fuel/fuel.module';
import { FleetModule } from './modules/operations/fleet/fleet.module';
import { CampsModule } from './modules/operations/camps/camps.module';

// 💳 Phase 3 — Billing, Invoicing & Collections
import { DARModule } from './modules/billing/dar/dar.module';
import { WCCModule } from './modules/billing/wcc/wcc.module';
import { InvoicesModule } from './modules/billing/invoices/invoices.module';

// 💰 Finance Module
import { FinanceModule } from './modules/finance/finance.module';

// 🦺 HSE Module
import { HseModule } from './modules/hse/hse.module';

@Module({
  imports: [
    // 1. إعدادات متغيرات البيئة
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        PORT: Joi.number().default(3000),
        MONGO_URI: Joi.string().default(
          process.env.MONGO_URI ||
          process.env.MONGO_URL ||
          process.env.MONGODB_URI ||
          'mongodb+srv://mohamedmansour291991_db_user:qoh4XtIyDH8Fq9bK@cluster0.ccopjej.mongodb.net/?appName=Cluster0'
        ),
        MONGO_URL: Joi.string().optional(),
        MONGODB_URI: Joi.string().optional(),
        JWT_SECRET: Joi.string().default(
          process.env.JWT_SECRET || 'SUlsWrJxCtmNwevnopmfPigA21Wcskdg'
        ),
        ALLOWED_ORIGIN: Joi.string().optional(),
        // Mail settings (optional — will use SMTP defaults if not provided)
        MAIL_HOST: Joi.string().optional(),
        MAIL_PORT: Joi.number().optional(),
        MAIL_USER: Joi.string().optional(),
        MAIL_PASS: Joi.string().optional(),
        MAIL_FROM: Joi.string().optional(),
        FRONTEND_URL: Joi.string().optional(),
        ADMIN_EMAIL: Joi.string().email().optional(),
        ADMIN_DEFAULT_PASSWORD: Joi.string().optional(),
      }),
    }),

    // 2. إعدادات الـ Rate Limiting
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),

    // 3. الاتصال بـ MongoDB
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => ({
        uri:
          config.get<string>('MONGO_URI') ||
          config.get<string>('MONGO_URL') ||
          config.get<string>('MONGODB_URI') ||
          process.env.MONGO_URI ||
          process.env.MONGO_URL ||
          process.env.MONGODB_URI ||
          'mongodb+srv://mohamedmansour291991_db_user:qoh4XtIyDH8Fq9bK@cluster0.ccopjej.mongodb.net/?appName=Cluster0',
      }),
    }),

    // 4. المهام المجدولة
    ScheduleModule.forRoot(),

    // 5. الموديولات التأسيسية
    DatabaseModule,
    SharedModule,

    // 6. موديولات المصادقة والإدارة
    AuthModule,
    UsersModule,
    RolesModule,
    DepartmentsModule,

    // 7. موديولات الـ ERP
    PurchaseRequestsModule,
    PurchaseOrdersModule,
    VendorsModule,
    // Inventory Module (complete)
    WarehousesModule,
    ItemsModule,
    MrvsModule,
    MivsModule,
    AdjustmentsModule,
    CountsModule,
    TransfersModule,
    InventoryReportsModule,
    InventoryAliasModule,

    // 8. Phase 1 — Master Assets, Contracts, Projects, Cost Centers
    EquipmentModule,
    AssetsModule,
    CostCentersModule,
    ProjectsModule,
    ContractsModule,

    // 8b. Maintenance
    MaintenanceModule,

    // 8c. Asset Categories
    AssetCategoriesModule,

    // 9. Phase 2 — Field Operations, Fuel, Fleet, Camps
    ProjectResourcesModule,
    TimesheetsModule,
    FuelModule,
    FleetModule,
    CampsModule,

    // 10. Phase 3 — Billing, Invoicing & Collections
    DARModule,
    WCCModule,
    InvoicesModule,

    // 11. Finance Module (COA, GL, AP, AR, Cash & Bank, Budget, Depreciation, VAT, Statements)
    FinanceModule,

    // 12. HSE Module (Incidents, PTWs, Inspections, Risk Register)
    HseModule,
  ],

  providers: [
    // Rate Limiter (أولاً)
    { provide: APP_GUARD, useClass: ThrottlerGuard },

    // JWT Authentication (ثانياً)
    { provide: APP_GUARD, useClass: JwtAuthGuard },

    // Permissions Guard (ثالثاً)
    { provide: APP_GUARD, useClass: PermissionsGuard },

    // Roles Guard (رابعاً)
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
