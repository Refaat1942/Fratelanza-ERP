import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type {
  LicenseStatus,
  LicenseType,
  EntitlementTermType,
} from '../../../../../packages/database/generated/server';
import { getAppConfig } from '../../config/app-config';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  DEMO_ENABLED_FEATURES,
} from './catalog/feature-catalog';
import { type LicenseEditionKey } from './catalog/edition-catalog';
import {
  DEMO_ENABLED_MODULES,
} from './catalog/module-catalog';
import { signLicenseDocument } from './verification/ed25519-license-crypto';
import { Ed25519LicenseVerifier } from './verification/ed25519-license-verifier';
import {
  defaultModuleEntries,
  type LicenseActivationInput,
} from './verification/license-verifier.interface';
import { prepareLicenseActivation } from './verification/license-activation.util';
import {
  canonicalizeLicenseDocument,
  digestLicenseDocument,
  type SignedLicenseDocument,
} from './verification/license-document';

const OPERATIONAL_STATUSES: LicenseStatus[] = ['active', 'grace'];

export interface TenantLicenseView {
  id: string;
  tenantId: string;
  licenseKey: string;
  licenseType: LicenseType;
  edition: string;
  status: LicenseStatus;
  schemaVersion: number;
  issuedAt: Date;
  activatedAt: Date | null;
  expiresAt: Date | null;
  graceEndsAt: Date | null;
  maxUsers: number;
  maxBranches: number;
  maxDevices: number;
  maxStorageMb: number | null;
  installationId: string | null;
  isOperational: boolean;
}

@Injectable()
export class LicenseService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private ed25519Verifier: Ed25519LicenseVerifier,
  ) {}

  async getLicenseForTenant(tenantId: string): Promise<TenantLicenseView | null> {
    const license = await this.prisma.tenantLicense.findUnique({
      where: { tenantId },
    });
    if (!license) return null;

    const resolved = await this.resolveEffectiveStatus(license);
    return {
      ...resolved,
      isOperational: OPERATIONAL_STATUSES.includes(resolved.status),
    };
  }

  async requireOperationalLicense(tenantId: string): Promise<TenantLicenseView> {
    await this.assertLicenseIntegrity(tenantId);
    const license = await this.getLicenseForTenant(tenantId);
    if (!license) {
      throw new NotFoundException('No license found for tenant');
    }
    if (!license.isOperational) {
      throw new ForbiddenException(
        `License is ${license.status}. Licensed module operations are unavailable.`,
      );
    }
    return license;
  }

  async assertLicenseIntegrity(tenantId: string): Promise<void> {
    const license = await this.prisma.tenantLicense.findUnique({
      where: { tenantId },
      include: {
        modules: { orderBy: { moduleKey: 'asc' } },
        features: { orderBy: { featureKey: 'asc' } },
      },
    });
    if (!license) {
      throw new NotFoundException('No license found for tenant');
    }

    const config = getAppConfig();
    if (!license.payloadSignature) {
      if (config.license.allowUnsignedDev && config.nodeEnv === 'development') {
        return;
      }
      throw new ForbiddenException('License integrity verification failed: missing signature');
    }

    const document = this.buildDocumentFromRecord(license);
    const verification = this.ed25519Verifier.verifyDocument(
      document,
      license.payloadSignature,
    );
    if (!verification.valid) {
      throw new ForbiddenException(
        verification.reason ?? 'License integrity verification failed',
      );
    }

    if (document.tenantId !== tenantId) {
      throw new ForbiddenException('License is not bound to this tenant');
    }
  }

  async resolveEffectiveStatus(
    license: NonNullable<Awaited<ReturnType<PrismaService['tenantLicense']['findUnique']>>>,
  ) {
    if (!license) {
      throw new NotFoundException('License not found');
    }

    let status = license.status;

    if (status === 'suspended' || status === 'revoked' || status === 'pending') {
      return license;
    }

    if (license.licenseType === 'perpetual') {
      return license;
    }

    const now = new Date();
    if (license.expiresAt && now > license.expiresAt) {
      if (license.graceEndsAt && now <= license.graceEndsAt) {
        if (status !== 'grace') {
          status = 'grace';
          await this.prisma.tenantLicense.update({
            where: { id: license.id },
            data: { status: 'grace' },
          });
          await this.audit.log({
            tenantId: license.tenantId,
            entity: 'license',
            entityId: license.id,
            action: 'license.grace_started',
            newValue: { status: 'grace', graceEndsAt: license.graceEndsAt },
          });
        }
      } else if (status !== 'expired') {
        status = 'expired';
        await this.prisma.tenantLicense.update({
          where: { id: license.id },
          data: { status: 'expired' },
        });
        await this.audit.log({
          tenantId: license.tenantId,
          entity: 'license',
          entityId: license.id,
          action: 'license.expired',
          newValue: { status: 'expired', expiresAt: license.expiresAt },
        });
      } else {
        status = 'expired';
      }
    }

    return { ...license, status };
  }

  async seedDemoLicense(tenantId: string, actorUserId?: string | null) {
    const existing = await this.prisma.tenantLicense.findUnique({ where: { tenantId } });
    const moduleKeys = [...DEMO_ENABLED_MODULES];
    return this.activateLicense(
      tenantId,
      {
        licenseId: existing?.id ?? randomUUID(),
        licenseKey: existing?.licenseKey ?? `FRZ-DEMO-${tenantId.slice(0, 8).toUpperCase()}`,
        tenantId,
        licenseType: 'perpetual',
        edition: 'enterprise',
        issuedAt: (existing?.issuedAt ?? new Date()).toISOString(),
        expiresAt: null,
        graceDays: null,
        modules: defaultModuleEntries(moduleKeys, 'perpetual'),
        features: DEMO_ENABLED_FEATURES,
        maxUsers: 100,
        maxBranches: 20,
        maxDevices: 50,
        signature: '',
      },
      actorUserId,
      { issueSignature: true },
    );
  }

  async activateLicense(
    tenantId: string,
    input: LicenseActivationInput,
    actorUserId?: string | null,
    options?: { issueSignature?: boolean },
  ) {
    const existing = await this.prisma.tenantLicense.findUnique({ where: { tenantId } });

    let prepared;
    try {
      prepared = prepareLicenseActivation(tenantId, input, existing?.id);
    } catch (error) {
      if (error instanceof Error && error.message.includes('tenant binding')) {
        throw new ForbiddenException(error.message);
      }
      throw new BadRequestException(error instanceof Error ? error.message : 'Invalid license');
    }

    const { document, modules, features, limits, expiresAt, graceEndsAt, licenseId } =
      prepared;

    const config = getAppConfig();
    if (config.installationId) {
      if (!input.installationId || input.installationId !== config.installationId) {
        throw new ForbiddenException(
          'License installation binding does not match this server installation',
        );
      }
    }

    let payloadSignature = input.signature;
    let payloadDigest = digestLicenseDocument(document);

    if (options?.issueSignature) {
      const privateKey = getAppConfig().license.signingPrivateKey;
      if (!privateKey) {
        throw new BadRequestException('LICENSE_SIGNING_PRIVATE_KEY is not configured');
      }
      payloadSignature = signLicenseDocument(document, privateKey);
    } else {
      const verification = this.ed25519Verifier.verifyDocument(document, payloadSignature);
      if (!verification.valid) {
        throw new BadRequestException(verification.reason ?? 'Invalid license signature');
      }
      payloadDigest = verification.digest;
    }

    const now = new Date();

    const license = await this.prisma.$transaction(async (tx) => {
      const existingInTx = await tx.tenantLicense.findUnique({ where: { tenantId } });
      const licenseRecord = existingInTx
        ? await tx.tenantLicense.update({
            where: { id: existingInTx.id },
            data: {
              licenseKey: input.licenseKey,
              licenseType: input.licenseType as LicenseType,
              edition: input.edition as LicenseEditionKey,
              status: 'active',
              schemaVersion: document.schemaVersion,
              issuedAt: new Date(input.issuedAt),
              activatedAt: now,
              expiresAt,
              graceEndsAt,
              ...limits,
              installationId: input.installationId ?? null,
              payloadDigest,
              payloadSignature,
            },
          })
        : await tx.tenantLicense.create({
            data: {
              id: licenseId,
              tenantId,
              licenseKey: input.licenseKey,
              licenseType: input.licenseType as LicenseType,
              edition: input.edition as LicenseEditionKey,
              status: 'active',
              schemaVersion: document.schemaVersion,
              issuedAt: new Date(input.issuedAt),
              activatedAt: now,
              expiresAt,
              graceEndsAt,
              ...limits,
              installationId: input.installationId ?? null,
              payloadDigest,
              payloadSignature,
            },
          });

      await tx.licenseModuleEntitlement.deleteMany({ where: { licenseId: licenseRecord.id } });
      await tx.licenseFeatureEntitlement.deleteMany({ where: { licenseId: licenseRecord.id } });

      await tx.licenseModuleEntitlement.createMany({
        data: modules.map((module) => ({
          tenantId,
          licenseId: licenseRecord.id,
          moduleKey: module.key,
          termType: module.termType as EntitlementTermType,
          expiresAt: module.expiresAt ? new Date(module.expiresAt) : null,
          isEnabled: true,
        })),
      });

      await tx.licenseFeatureEntitlement.createMany({
        data: features.map((featureKey) => ({
          tenantId,
          licenseId: licenseRecord.id,
          featureKey,
          isEnabled: true,
        })),
      });

      return licenseRecord;
    });

    await this.syncTenantModules(tenantId);

    const isUpdate = license.activatedAt != null && license.activatedAt < now;
    await this.audit.log({
      tenantId,
      userId: actorUserId,
      entity: 'license',
      entityId: license.id,
      action: isUpdate ? 'license.updated' : 'license.activated',
      newValue: {
        licenseType: input.licenseType,
        edition: input.edition,
        modules: modules.map((m) => m.key),
        featureCount: features.length,
        expiresAt,
        status: 'active',
      },
    });

    return this.getLicenseForTenant(tenantId);
  }

  async updateLicenseStatus(
    tenantId: string,
    status: LicenseStatus,
    actorUserId?: string | null,
  ) {
    const license = await this.prisma.tenantLicense.findUnique({ where: { tenantId } });
    if (!license) throw new NotFoundException('License not found');

    const updated = await this.prisma.tenantLicense.update({
      where: { id: license.id },
      data: { status },
    });

    const actionMap: Partial<Record<LicenseStatus, string>> = {
      suspended: 'license.suspended',
      revoked: 'license.revoked',
      active: 'license.updated',
    };

    await this.audit.log({
      tenantId,
      userId: actorUserId,
      entity: 'license',
      entityId: license.id,
      action: actionMap[status] ?? 'license.updated',
      oldValue: { status: license.status },
      newValue: { status },
    });

    if (status === 'suspended' || status === 'revoked' || status === 'expired') {
      await this.syncTenantModules(tenantId);
    }

    return updated;
  }

  /**
   * TenantLicense → tenant_modules (compatibility sync only).
   * Never reads tenant_modules as entitlement source of truth.
   */
  async syncTenantModules(tenantId: string) {
    const license = await this.getLicenseForTenant(tenantId);
    const moduleEntitlements = license
      ? await this.prisma.licenseModuleEntitlement.findMany({
          where: { tenantId, licenseId: license.id },
        })
      : [];

    const operational = license?.isOperational ?? false;

    for (const ent of moduleEntitlements) {
      const moduleOperational =
        operational &&
        ent.isEnabled &&
        this.isModuleTermOperational(ent.termType, ent.expiresAt);

      await this.prisma.tenantModule.upsert({
        where: { tenantId_moduleId: { tenantId, moduleId: ent.moduleKey } },
        update: { isEnabled: moduleOperational },
        create: { tenantId, moduleId: ent.moduleKey, isEnabled: moduleOperational },
      });
    }
  }

  isModuleTermOperational(
    termType: EntitlementTermType,
    expiresAt: Date | null,
  ): boolean {
    if (termType === 'perpetual') return true;
    if (!expiresAt) return false;
    return new Date() <= expiresAt;
  }

  buildDocumentFromRecord(
    license: {
      id: string;
      tenantId: string;
      licenseKey: string;
      licenseType: LicenseType;
      edition: string;
      schemaVersion: number;
      issuedAt: Date;
      expiresAt: Date | null;
      graceEndsAt: Date | null;
      maxUsers: number;
      maxBranches: number;
      maxDevices: number;
      maxStorageMb: number | null;
      installationId: string | null;
      modules: Array<{
        moduleKey: string;
        termType: EntitlementTermType;
        expiresAt: Date | null;
      }>;
      features: Array<{ featureKey: string }>;
    },
  ): SignedLicenseDocument {
    const graceDays =
      license.licenseType === 'time_limited' &&
      license.expiresAt &&
      license.graceEndsAt
        ? Math.round(
            (license.graceEndsAt.getTime() - license.expiresAt.getTime()) /
              (24 * 60 * 60 * 1000),
          )
        : null;

    return {
      schemaVersion: license.schemaVersion,
      licenseId: license.id,
      licenseKey: license.licenseKey,
      tenantId: license.tenantId,
      licenseType: license.licenseType,
      edition: license.edition,
      issuedAt: license.issuedAt.toISOString(),
      expiresAt: license.expiresAt?.toISOString() ?? null,
      graceDays,
      installationId: license.installationId,
      limits: {
        maxUsers: license.maxUsers,
        maxBranches: license.maxBranches,
        maxDevices: license.maxDevices,
        maxStorageMb: license.maxStorageMb,
      },
      modules: license.modules.map((m) => ({
        key: m.moduleKey,
        termType: m.termType,
        expiresAt: m.expiresAt?.toISOString() ?? null,
      })),
      features: license.features.map((f) => f.featureKey),
    };
  }

  exportCanonicalDocument(tenantId: string): Promise<string> {
    return this.prisma.tenantLicense
      .findUnique({
        where: { tenantId },
        include: {
          modules: { orderBy: { moduleKey: 'asc' } },
          features: { orderBy: { featureKey: 'asc' } },
        },
      })
      .then((license) => {
        if (!license) throw new NotFoundException('License not found');
        return canonicalizeLicenseDocument(this.buildDocumentFromRecord(license));
      });
  }
}
