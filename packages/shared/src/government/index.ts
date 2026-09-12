export type ZatcaInvoiceType =
  | 'standard_tax_invoice'
  | 'simplified_tax_invoice'
  | 'standard_credit_note'
  | 'standard_debit_note'
  | 'simplified_credit_note'
  | 'simplified_debit_note';

export type EtaDocumentKind = 'e_invoice' | 'e_receipt';

export type GovernmentSubmissionStatus =
  | 'pending'
  | 'accepted'
  | 'failed'
  | 'configuration_required'
  | 'retry_scheduled';

export interface GovernmentDocumentIdentity {
  documentUuid: string;
  documentHash: string;
  previousDocumentHash?: string | null;
  invoiceCounter?: number;
}

export interface GovernmentQrPayload {
  sellerName: string;
  vatNumber: string;
  timestamp: string;
  total: string;
  vatTotal: string;
  documentHash: string;
}

export interface GovernmentSigningContext {
  certificateId?: string;
  privateKeyRef?: string;
  csid?: string;
}

export interface GovernmentSubmissionEnvelope {
  authority: 'ZATCA' | 'ETA';
  countryCode: 'SA' | 'EG';
  documentType: string;
  documentId: string;
  documentNumber?: string;
  requestId: string;
  idempotencyKey: string;
  xmlPayload?: string;
  identity?: GovernmentDocumentIdentity;
  qrPayload?: GovernmentQrPayload;
  signing?: GovernmentSigningContext;
}

export function buildIdempotencyKey(
  authority: string,
  documentType: string,
  documentId: string,
  event = 'submit',
): string {
  return `${authority}:${documentType}:${documentId}:${event}`;
}
