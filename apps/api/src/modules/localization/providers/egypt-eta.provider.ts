import { Injectable } from '@nestjs/common';
import type { GovernmentIntegrationStatus } from '@fratelanza/shared';
import { PrismaService } from '../../../database/prisma.service';
import type { EInvoicingProvider, EInvoicingQueueInput, EInvoicingSubmissionResult, IntegrationStatusSnapshot } from './e-invoicing.provider';

type EtaSettings = {
  environment: 'sandbox' | 'production';
  clientId?: string;
  clientSecretConfigured?: boolean;
  posSerial?: string;
  posOsVersion?: string;
  posModel?: string;
  lastSubmissionAt?: string;
};

type EtaReceiptSettings = {
  environment: 'sandbox' | 'production';
  posSerial?: string;
  posClientConfigured?: boolean;
  lastSubmissionAt?: string;
};

@Injectable()
export class EgyptEtaProvider implements EInvoicingProvider {
  readonly authority = 'ETA' as const;
  readonly countryCode = 'EG' as const;

  private invoiceSettingsKey = 'integrations.eta';
  private receiptSettingsKey = 'integrations.eta.receipt';

  constructor(private prisma: PrismaService) {}

  private async readInvoiceSettings(tenantId: string): Promise<EtaSettings> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
    const eta = (settings[this.invoiceSettingsKey] ?? {}) as Partial<EtaSettings>;
    return {
      environment: eta.environment ?? 'sandbox',
      clientId: eta.clientId,
      clientSecretConfigured: eta.clientSecretConfigured ?? false,
      posSerial: eta.posSerial,
      posOsVersion: eta.posOsVersion,
      posModel: eta.posModel,
      lastSubmissionAt: eta.lastSubmissionAt,
    };
  }

  private async readReceiptSettings(tenantId: string): Promise<EtaReceiptSettings> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
    const receipt = (settings[this.receiptSettingsKey] ?? {}) as Partial<EtaReceiptSettings>;
    return {
      environment: receipt.environment ?? 'sandbox',
      posSerial: receipt.posSerial,
      posClientConfigured: receipt.posClientConfigured ?? false,
      lastSubmissionAt: receipt.lastSubmissionAt,
    };
  }

  private async countByStatus(tenantId: string, status: string) {
    return this.prisma.governmentIntegrationLog.count({
      where: { tenantId, authority: 'ETA', status },
    });
  }

  async getStatus(tenantId: string): Promise<IntegrationStatusSnapshot> {
    const settings = await this.readInvoiceSettings(tenantId);
    const credentialsReady = Boolean(settings.clientId && settings.clientSecretConfigured);
    const [pendingDocuments, successfulDocuments, failedDocuments] = await Promise.all([
      this.countByStatus(tenantId, 'pending'),
      this.countByStatus(tenantId, 'accepted'),
      this.countByStatus(tenantId, 'failed'),
    ]);

    return {
      authority: 'ETA',
      environment: settings.environment,
      connectionStatus: credentialsReady ? 'not_configured' : 'not_configured',
      credentialsStatus: credentialsReady ? 'configured' : 'missing',
      pendingDocuments,
      successfulDocuments,
      failedDocuments,
      lastSubmission: settings.lastSubmissionAt ?? null,
      configurationRequired: credentialsReady
        ? ['ETA OAuth client credentials (server-side)', 'POS/device registration for eReceipt where applicable']
        : [
            'ETA client ID and client secret (server-side only)',
            'ETA sandbox or production environment selection',
            'Company tax registration number in organization settings',
          ],
    };
  }

  async getReceiptStatus(tenantId: string) {
    const settings = await this.readReceiptSettings(tenantId);
    const configured = Boolean(settings.posSerial && settings.posClientConfigured);
    return {
      authority: 'ETA',
      channel: 'eReceipt',
      environment: settings.environment,
      credentialsStatus: configured ? 'configured' : 'missing',
      lastSubmission: settings.lastSubmissionAt ?? null,
      configurationRequired: configured
        ? ['ETA eReceipt POS registration and device credentials']
        : [
            'POS serial number and ETA POS registration',
            'POS client credentials stored server-side',
            'Separate eReceipt submission endpoint configuration',
          ],
    };
  }

  async updateInvoiceSettings(
    tenantId: string,
    dto: Partial<Pick<EtaSettings, 'environment' | 'clientId' | 'posSerial' | 'posOsVersion' | 'posModel'>> & {
      clientSecret?: string;
    },
  ) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
    const current = (settings[this.invoiceSettingsKey] ?? {}) as Partial<EtaSettings>;
    const next: EtaSettings = {
      environment: dto.environment ?? current.environment ?? 'sandbox',
      clientId: dto.clientId ?? current.clientId,
      clientSecretConfigured: dto.clientSecret
        ? true
        : (current.clientSecretConfigured ?? false),
      posSerial: dto.posSerial ?? current.posSerial,
      posOsVersion: dto.posOsVersion ?? current.posOsVersion,
      posModel: dto.posModel ?? current.posModel,
      lastSubmissionAt: current.lastSubmissionAt,
    };
    const stored = { ...next } as Record<string, unknown>;
    if (dto.clientSecret) {
      stored.clientSecretEnc = Buffer.from(dto.clientSecret).toString('base64');
    }
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        settings: {
          ...settings,
          [this.invoiceSettingsKey]: stored,
        } as object,
      },
    });
    const { clientSecretEnc: _secret, ...safe } = stored;
    return safe;
  }

  async updateReceiptSettings(
    tenantId: string,
    dto: Partial<Pick<EtaReceiptSettings, 'environment' | 'posSerial'>> & { posClientSecret?: string },
  ) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
    const current = (settings[this.receiptSettingsKey] ?? {}) as Partial<EtaReceiptSettings>;
    const next: EtaReceiptSettings = {
      environment: dto.environment ?? current.environment ?? 'sandbox',
      posSerial: dto.posSerial ?? current.posSerial,
      posClientConfigured: dto.posClientSecret
        ? true
        : (current.posClientConfigured ?? false),
      lastSubmissionAt: current.lastSubmissionAt,
    };
    const stored = { ...next } as Record<string, unknown>;
    if (dto.posClientSecret) {
      stored.posClientSecretEnc = Buffer.from(dto.posClientSecret).toString('base64');
    }
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        settings: {
          ...settings,
          [this.receiptSettingsKey]: stored,
        } as object,
      },
    });
    const { posClientSecretEnc: _secret, ...safe } = stored;
    return safe;
  }

  async queueDocument(input: EInvoicingQueueInput): Promise<EInvoicingSubmissionResult> {
    const existing = await this.prisma.governmentIntegrationLog.findFirst({
      where: {
        tenantId: input.tenantId,
        authority: 'ETA',
        documentId: input.documentId,
        status: { in: ['pending', 'accepted', 'configuration_required'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      return {
        status: existing.status as EInvoicingSubmissionResult['status'],
        authority: 'ETA',
        requestId: existing.requestId ?? existing.id,
        errorMessage: existing.errorMessage ?? undefined,
      };
    }

    const settings = await this.readInvoiceSettings(input.tenantId);
    const credentialsReady = Boolean(settings.clientId && settings.clientSecretConfigured);
    const requestId = crypto.randomUUID();
    const status: GovernmentIntegrationStatus = credentialsReady ? 'pending' : 'configuration_required';
    const errorMessage = credentialsReady
      ? undefined
      : 'ETA credentials are not configured';

    await this.prisma.governmentIntegrationLog.create({
      data: {
        tenantId: input.tenantId,
        countryCode: input.countryCode,
        authority: 'ETA',
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
      authority: 'ETA' as const,
      requestId,
      errorMessage,
      configurationRequired: credentialsReady
        ? undefined
        : ['ETA client ID and client secret'],
    };
  }
}
