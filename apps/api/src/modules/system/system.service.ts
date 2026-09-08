import { Injectable } from '@nestjs/common';
import { getAppConfig } from '../../config/app-config';
import { PrismaService } from '../../database/prisma.service';
import { EntitlementService } from '../license/entitlement.service';
import { LicenseService } from '../license/license.service';

interface MigrationRow {
  migration_name: string;
  finished_at: Date | null;
}

@Injectable()
export class SystemService {
  constructor(
    private prisma: PrismaService,
    private licenseService: LicenseService,
    private entitlementService: EntitlementService,
  ) {}

  getVersion() {
    const config = getAppConfig();
    return {
      apiVersion: config.appVersion,
      nodeEnv: config.nodeEnv,
      product: 'Fratelanza Grand ERP',
    };
  }

  async getHealthSummary() {
    let database: 'ok' | 'error' = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'error';
    }

    const config = getAppConfig();
    return {
      status: database === 'ok' ? 'healthy' : 'degraded',
      version: config.appVersion,
      database,
      timestamp: new Date().toISOString(),
    };
  }

  async getDiagnostics(tenantId: string) {
    const config = getAppConfig();
    let database: 'ok' | 'error' = 'ok';
    let migrationCount = 0;
    let latestMigration: string | null = null;

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const rows = await this.prisma.$queryRaw<MigrationRow[]>`
        SELECT migration_name, finished_at
        FROM _prisma_migrations
        WHERE finished_at IS NOT NULL
        ORDER BY finished_at DESC
        LIMIT 1
      `;
      migrationCount = rows.length;
      latestMigration = rows[0]?.migration_name ?? null;
    } catch {
      database = 'error';
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, code: true, name: true, isActive: true },
    });

    const license = await this.licenseService.getLicenseForTenant(tenantId);
    const licenseRecord = await this.prisma.tenantLicense.findUnique({ where: { tenantId } });
    const entitlements = await this.entitlementService.getEntitlements(tenantId);

    return {
      generatedAt: new Date().toISOString(),
      product: 'Fratelanza Grand ERP',
      apiVersion: config.appVersion,
      nodeEnv: config.nodeEnv,
      server: {
        host: config.api.host,
        port: config.api.port,
        installationId: config.installationId,
      },
      database: {
        status: database,
        latestMigration,
        migrationTableReachable: migrationCount > 0 || database === 'ok',
      },
      tenant: tenant
        ? {
            id: tenant.id,
            code: tenant.code,
            name: tenant.name,
            isActive: tenant.isActive,
          }
        : null,
      license: license
        ? {
            licenseKey: license.licenseKey,
            licenseType: license.licenseType,
            edition: license.edition,
            status: license.status,
            isOperational: license.isOperational,
            installationId: license.installationId,
            activatedAt: license.activatedAt,
            expiresAt: license.expiresAt,
            hasSignature: Boolean(licenseRecord?.payloadSignature),
          }
        : null,
      entitlements: {
        edition: entitlements.edition,
        status: entitlements.status,
        isOperational: entitlements.isOperational,
        enabledModules: entitlements.modules.filter((m) => m.enabled).map((m) => m.key),
        enabledFeatureCount: entitlements.features.filter((f) => f.enabled).length,
        usage: entitlements.usage,
        limits: entitlements.limits,
      },
      flags: {
        syncEnabled: config.syncEnabled,
        partyLegacyRoutingEnabled: config.partyLegacyRoutingEnabled,
        purchasingPartyRoutingEnabled: config.purchasingPartyRoutingEnabled,
        universalFinancePilotEnabled: config.universalFinancePilotEnabled,
        universalFinanceSalesPilotEnabled: config.universalFinanceSalesPilotEnabled,
      },
    };
  }
}
