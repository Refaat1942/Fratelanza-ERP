import type { CountryCode, GovernmentIntegrationStatus, TaxAuthority } from '@fratelanza/shared';

export interface EInvoicingQueueInput {
  tenantId: string;
  countryCode: CountryCode;
  documentType: string;
  documentId: string;
  documentNumber: string;
}

export interface EInvoicingSubmissionResult {
  status: GovernmentIntegrationStatus;
  authority: TaxAuthority;
  submissionId?: string;
  documentUuid?: string;
  requestId?: string;
  errorMessage?: string;
  configurationRequired?: string[];
}

export interface IntegrationStatusSnapshot {
  authority: TaxAuthority;
  environment: 'sandbox' | 'production';
  connectionStatus: 'connected' | 'not_configured' | 'connection_failed';
  certificateStatus?: string;
  credentialsStatus: 'configured' | 'missing';
  pendingDocuments: number;
  successfulDocuments: number;
  failedDocuments: number;
  lastSubmission: string | null;
  configurationRequired: string[];
}

export interface EInvoicingProvider {
  readonly authority: TaxAuthority;
  readonly countryCode: CountryCode;
  getStatus(tenantId: string): Promise<IntegrationStatusSnapshot>;
  queueDocument(input: EInvoicingQueueInput): Promise<EInvoicingSubmissionResult>;
}
