import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { FEATURE_CATALOG, getFeatureEntry } from './catalog/feature-catalog';
import { MODULE_CATALOG, getModuleEntry } from './catalog/module-catalog';
import { LicenseService } from './license.service';

export type UsageLimitKey = 'maxUsers' | 'maxBranches' | 'maxDevices' | 'maxStorageMb';

export interface EntitlementSnapshot {
  licenseType: string;
  edition: string;
  status: string;
  isOperational: boolean;
  expiresAt: string | null;
  graceEndsAt: string | null;
  modules: Array<{ key: string; enabled: boolean; displayName: string; termType: string }>;
  features: Array<{ key: string; enabled: boolean; displayName: string }>;
  limits: Record<UsageLimitKey, number | null>;
  usage: Record<'users' | 'branches' | 'devices', number>;
}

@Injectable()
export class EntitlementService {
  constructor(
    private prisma: PrismaService,
    private licenseService: LicenseService,
  ) {}

  async requireModule(tenantId: string, moduleKey: string): Promise<void> {
    getModuleEntry(moduleKey);
    await this.licenseService.requireOperationalLicense(tenantId);

    const entitlement = await this.prisma.licenseModuleEntitlement.findUnique({
      where: { tenantId_moduleKey: { tenantId, moduleKey } },
    });

    if (!entitlement?.isEnabled) {
      throw new ForbiddenException(`Module "${moduleKey}" is not licensed for this tenant`);
    }

    if (!this.licenseService.isModuleTermOperational(entitlement.termType, entitlement.expiresAt)) {
      throw new ForbiddenException(`Module "${moduleKey}" license term has expired`);
    }

    const entry = MODULE_CATALOG[moduleKey];
    for (const dep of entry.dependencies) {
      const depEnt = await this.prisma.licenseModuleEntitlement.findUnique({
        where: { tenantId_moduleKey: { tenantId, moduleKey: dep } },
      });
      if (!depEnt?.isEnabled) {
        throw new ForbiddenException(
          `Module "${moduleKey}" requires licensed module "${dep}"`,
        );
      }
    }
  }

  async requireFeature(tenantId: string, featureKey: string): Promise<void> {
    const feature = getFeatureEntry(featureKey);
    await this.requireModule(tenantId, feature.moduleKey);

    const entitlement = await this.prisma.licenseFeatureEntitlement.findUnique({
      where: { tenantId_featureKey: { tenantId, featureKey } },
    });

    if (!entitlement?.isEnabled) {
      throw new ForbiddenException(
        `Feature "${featureKey}" is not licensed for this tenant`,
      );
    }
  }

  async assertLimit(
    tenantId: string,
    limitKey: UsageLimitKey,
    projectedCount?: number,
  ): Promise<void> {
    const license = await this.licenseService.getLicenseForTenant(tenantId);
    if (!license) {
      throw new NotFoundException('No license found for tenant');
    }

    const limitValue = license[limitKey];
    if (limitValue == null) return;

    const current =
      projectedCount ?? (await this.getCurrentUsage(tenantId))[limitKeyToUsageKey(limitKey)];

    if (current > limitValue) {
      throw new ForbiddenException(
        `License limit reached for ${limitKey} (${current}/${limitValue})`,
      );
    }
  }

  async getEntitlements(tenantId: string): Promise<EntitlementSnapshot> {
    const license = await this.licenseService.getLicenseForTenant(tenantId);
    if (!license) {
      throw new NotFoundException('No license found for tenant');
    }

    const [moduleEntitlements, featureEntitlements, usage] = await Promise.all([
      this.prisma.licenseModuleEntitlement.findMany({ where: { tenantId } }),
      this.prisma.licenseFeatureEntitlement.findMany({ where: { tenantId } }),
      this.getCurrentUsage(tenantId),
    ]);

    const moduleMap = new Map(
      moduleEntitlements.map((m) => [m.moduleKey, m]),
    );
    const featureMap = new Map(featureEntitlements.map((f) => [f.featureKey, f.isEnabled]));

    return {
      licenseType: license.licenseType,
      edition: license.edition,
      status: license.status,
      isOperational: license.isOperational,
      expiresAt: license.expiresAt?.toISOString() ?? null,
      graceEndsAt: license.graceEndsAt?.toISOString() ?? null,
      modules: Object.values(MODULE_CATALOG)
        .filter((m) => m.available || moduleMap.has(m.key))
        .map((m) => {
          const ent = moduleMap.get(m.key);
          const termActive = ent
            ? this.licenseService.isModuleTermOperational(ent.termType, ent.expiresAt)
            : false;
          return {
            key: m.key,
            enabled: license.isOperational && (ent?.isEnabled ?? false) && termActive,
            displayName: m.displayName,
            termType: ent?.termType ?? 'perpetual',
          };
        }),
      features: Object.values(FEATURE_CATALOG).map((f) => ({
        key: f.key,
        enabled:
          license.isOperational &&
          (featureMap.get(f.key) ?? false) &&
          (moduleMap.get(f.moduleKey)?.isEnabled ?? false) &&
          (moduleMap.get(f.moduleKey)
            ? this.licenseService.isModuleTermOperational(
                moduleMap.get(f.moduleKey)!.termType,
                moduleMap.get(f.moduleKey)!.expiresAt,
              )
            : false),
        displayName: f.displayName,
      })),
      limits: {
        maxUsers: license.maxUsers,
        maxBranches: license.maxBranches,
        maxDevices: license.maxDevices,
        maxStorageMb: license.maxStorageMb,
      },
      usage,
    };
  }

  async getAdminLicenseView(tenantId: string) {
    const license = await this.licenseService.getLicenseForTenant(tenantId);
    if (!license) throw new NotFoundException('No license found for tenant');
    const entitlements = await this.getEntitlements(tenantId);
    return {
      license: {
        id: license.id,
        licenseKey: license.licenseKey,
        licenseType: license.licenseType,
        edition: license.edition,
        status: license.status,
        isOperational: license.isOperational,
        issuedAt: license.issuedAt,
        activatedAt: license.activatedAt,
        expiresAt: license.expiresAt,
        graceEndsAt: license.graceEndsAt,
        installationId: license.installationId,
        limits: entitlements.limits,
      },
      entitlements,
    };
  }

  private async getCurrentUsage(tenantId: string) {
    const [users, branches, devices] = await Promise.all([
      this.prisma.user.count({ where: { tenantId, deletedAt: null, isActive: true } }),
      this.prisma.branch.count({ where: { tenantId, deletedAt: null, isActive: true } }),
      this.prisma.device.count({
        where: { tenantId, status: 'active', revokedAt: null },
      }),
    ]);
    return { users, branches, devices };
  }
}

function limitKeyToUsageKey(
  limitKey: UsageLimitKey,
): 'users' | 'branches' | 'devices' {
  switch (limitKey) {
    case 'maxUsers':
      return 'users';
    case 'maxBranches':
      return 'branches';
    case 'maxDevices':
      return 'devices';
    default:
      return 'users';
  }
}
