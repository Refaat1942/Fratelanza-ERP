import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { getRootEnvPath } from './config/env-path';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { BranchesModule } from './modules/branches/branches.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { DevicesModule } from './modules/devices/devices.module';
import { SettingsModule } from './modules/settings/settings.module';
import { HealthModule } from './modules/health/health.module';
import { SystemModule } from './modules/system/system.module';
import { AuditModule } from './modules/audit/audit.module';
import { CommonModule } from './common/common.module';
import { ProductsModule } from './modules/products/products.module';
import { CustomersModule } from './modules/customers/customers.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { WarehousesModule } from './modules/warehouses/warehouses.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { SalesModule } from './modules/sales/sales.module';
import { PurchasingModule } from './modules/purchasing/purchasing.module';
import { AccountingModule } from './modules/accounting/accounting.module';
import { PosModule } from './modules/pos/pos.module';
import { SyncModule } from './modules/sync/sync.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { PmsModule } from './modules/pms/pms.module';
import { FinanceModule } from './modules/finance/finance.module';
import { PartiesModule } from './modules/parties/parties.module';
import { LicenseModule } from './modules/license/license.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { ConstructionModule } from './modules/construction/construction.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: getRootEnvPath(),
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    DatabaseModule,
    CommonModule,
    AuthModule,
    TenantsModule,
    BranchesModule,
    UsersModule,
    RolesModule,
    DevicesModule,
    SettingsModule,
    HealthModule,
    SystemModule,
    AuditModule,
    // ── Legacy ERP modules (frozen — see docs/LEGACY_ERP.md) ──
    ProductsModule,
    CustomersModule,
    SuppliersModule,
    WarehousesModule,
    InventoryModule,
    SalesModule,
    PurchasingModule,
    AccountingModule,
    PosModule,
    SyncModule,
    DashboardModule,
    // ── PMS domain (see docs/PMS_DOMAIN_DESIGN.md) ──
    PmsModule,
    // ── Universal Finance (Phase 2) ──
    FinanceModule,
    // ── Universal Party / Contacts (Phase 3) ──
    PartiesModule,
    // ── Commercial Licensing (Phase 4.5) ──
    LicenseModule,
    // ── Universal Projects (Phase 8) ──
    ProjectsModule,
    // ── Construction Vertical (Phase 9) ──
    ConstructionModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
