import { createHash, randomUUID } from 'crypto';
import type { EtaDocumentKind, GovernmentSubmissionEnvelope } from '@fratelanza/shared';

export interface EtaDocumentInput {
  tenantId: string;
  documentId: string;
  documentNumber: string;
  documentKind: EtaDocumentKind;
  issuerTaxId: string;
  receiverTaxId?: string;
  issueDate: string;
  total: number;
  vatTotal: number;
}

export class EtaDocumentBuilder {
  buildEnvelope(input: EtaDocumentInput): GovernmentSubmissionEnvelope {
    const requestId = randomUUID();
    const xmlPayload = this.buildXml(input);
    const documentHash = this.computeHash(xmlPayload);

    return {
      authority: 'ETA',
      countryCode: 'EG',
      documentType: input.documentKind,
      documentId: input.documentId,
      documentNumber: input.documentNumber,
      requestId,
      idempotencyKey: `ETA:${input.documentKind}:${input.documentId}:submit`,
      xmlPayload,
      identity: {
        documentUuid: requestId,
        documentHash,
      },
      signing: {
        certificateId: undefined,
        privateKeyRef: 'tenant.settings.integrations.eta.clientSecret',
      },
    };
  }

  buildXml(input: EtaDocumentInput): string {
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<Document kind="${input.documentKind}">`,
      `<DocumentNumber>${input.documentNumber}</DocumentNumber>`,
      `<IssueDate>${input.issueDate}</IssueDate>`,
      `<IssuerTaxId>${input.issuerTaxId}</IssuerTaxId>`,
      input.receiverTaxId ? `<ReceiverTaxId>${input.receiverTaxId}</ReceiverTaxId>` : '',
      `<TotalAmount>${input.total.toFixed(2)}</TotalAmount>`,
      `<VATAmount>${input.vatTotal.toFixed(2)}</VATAmount>`,
      '</Document>',
    ].join('');
  }

  computeHash(xmlPayload: string): string {
    return createHash('sha256').update(xmlPayload, 'utf8').digest('hex');
  }
}
