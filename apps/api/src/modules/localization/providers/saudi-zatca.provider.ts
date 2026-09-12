import { Injectable } from '@nestjs/common';
import type { GovernmentIntegrationStatus } from '@fratelanza/shared';
import { PrismaService } from '../../../database/prisma.service';
import type {
  EInvoicingProvider,
  EInvoicingQueueInput,
  EInvoicingSubmissionResult,
  IntegrationStatusSnapshot,
} from './e-invoicing.provider';

type ZatcaSettings = {
  environment: 'sandbox' | 'production';
  vatNumber?: string;
  csrCommonName?: string;
  certificateStatus: 'not_configured' | 'pending' | 'active' | 'expired';
  lastSubmissionAt?: string;
};

@Injectable()
export class SaudiZatcaProvider implements EInvoicingProvider {
  readonly authority = 'ZATCA' as const;
  readonly countryCode = 'SA' as const;

  private settingsKey = 'integrations.zatca';

  constructor(private prisma: PrismaService) {}

  private async readSettings(tenantId: string): Promise<ZatcaSettings> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
    const zatca = (settings[this.settingsKey] ?? {}) as Partial<ZatcaSettings>;
    return {
      environment: zatca.environment ?? 'sandbox',
      vatNumber: zatca.vatNumber,
      csrCommonName: zatca.csrCommonName,
      certificateStatus: zatca.certificateStatus ?? 'not_configured',
      lastSubmissionAt: zatca.lastSubmissionAt,
    };
  }

  private async countByStatus(tenantId: string, status: string) {
    return this.prisma.governmentIntegrationLog.count({
      where: { tenantId, authority: 'ZATCA', status },
    });
  }

  async getStatus(tenantId: string): Promise<IntegrationStatusSnapshot> {
    const settings = await this.readSettings(tenantId);
    const credentialsReady = settings.certificateStatus === 'active';
    const [pendingDocuments, successfulDocuments, failedDocuments] = await Promise.all([
      this.countByStatus(tenantId, 'pending'),
      this.countByStatus(tenantId, 'accepted'),
      this.countByStatus(tenantId, 'failed'),
    ]);

    return {
      authority: 'ZATCA',
      environment: settings.environment,
      connectionStatus: credentialsReady ? 'connected' : 'not_configured',
      certificateStatus: settings.certificateStatus,
      credentialsStatus: credentialsReady ? 'configured' : 'missing',
      pendingDocuments,
      successfulDocuments,
      failedDocuments,
      lastSubmission: settings.lastSubmissionAt ?? null,
      configurationRequired: [
        'ZATCA CSID / compliance certificate (server-side only)',
        'Private key and signing certificate storage',
        'Production clearance/reporting credentials from ZATCA portal',
      ],
    };
  }

  async updateSettings(
    tenantId: string,
    dto: Partial<Pick<ZatcaSettings, 'environment' | 'vatNumber' | 'csrCommonName'>>,
  ) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
    const current = (settings[this.settingsKey] ?? {}) as Partial<ZatcaSettings>;
    const next = {
      ...current,
      ...dto,
      certificateStatus: current.certificateStatus ?? 'not_configured',
    };
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        settings: {
          ...settings,
          [this.settingsKey]: next,
        } as object,
      },
    });
    return next;
  }

  async getLogs(tenantId: string, take = 50) {
    return this.prisma.governmentIntegrationLog.findMany({
      where: { tenantId, authority: 'ZATCA' },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  async queueDocument(input: EInvoicingQueueInput): Promise<EInvoicingSubmissionResult> {
    const existing = await this.prisma.governmentIntegrationLog.findFirst({
      where: {
        tenantId: input.tenantId,
        authority: 'ZATCA',
        documentId: input.documentId,
        status: { in: ['pending', 'accepted', 'configuration_required'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      return {
        status: existing.status as EInvoicingSubmissionResult['status'],
        authority: 'ZATCA',
        requestId: existing.requestId ?? existing.id,
        errorMessage: existing.errorMessage ?? undefined,
      };
    }

    const settings = await this.readSettings(input.tenantId);
    const credentialsReady = settings.certificateStatus === 'active';
    const requestId = crypto.randomUUID();
    const status: GovernmentIntegrationStatus = credentialsReady ? 'pending' : 'configuration_required';
    const errorMessage = credentialsReady
      ? undefined
      : 'ZATCA certificate and CSID are not configured';

    await this.prisma.governmentIntegrationLog.create({
      data: {
        tenantId: input.tenantId,
        countryCode: input.countryCode,
        authority: 'ZATCA',
        documentType: input.documentType,
        documentId: input.documentId,
        documentNumber: input.documentNumber,
        requestId,
        status,
        errorMessage,
      },
    });

    return {
      status,
      authority: 'ZATCA' as const,
      requestId,
      errorMessage,
      configurationRequired: credentialsReady
        ? undefined
        : ['ZATCA CSID, certificate, and private key'],
    };
  }
}
