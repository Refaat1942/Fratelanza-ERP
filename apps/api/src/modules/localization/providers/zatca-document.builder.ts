import { createHash, randomUUID } from 'crypto';
import type {
  GovernmentDocumentIdentity,
  GovernmentQrPayload,
  GovernmentSubmissionEnvelope,
  ZatcaInvoiceType,
} from '@fratelanza/shared';

export interface ZatcaDocumentInput {
  tenantId: string;
  documentId: string;
  documentNumber: string;
  documentType: ZatcaInvoiceType;
  sellerName: string;
  vatNumber: string;
  issueDate: string;
  total: number;
  vatTotal: number;
  previousDocumentHash?: string | null;
  invoiceCounter?: number;
}

export class ZatcaDocumentBuilder {
  buildEnvelope(input: ZatcaDocumentInput): GovernmentSubmissionEnvelope {
    const documentUuid = randomUUID();
    const xmlPayload = this.buildXml(input, documentUuid);
    const documentHash = this.computeHash(xmlPayload);
    const identity: GovernmentDocumentIdentity = {
      documentUuid,
      documentHash,
      previousDocumentHash: input.previousDocumentHash ?? null,
      invoiceCounter: input.invoiceCounter,
    };

    return {
      authority: 'ZATCA',
      countryCode: 'SA',
      documentType: input.documentType,
      documentId: input.documentId,
      documentNumber: input.documentNumber,
      requestId: randomUUID(),
      idempotencyKey: `ZATCA:${input.documentType}:${input.documentId}:submit`,
      xmlPayload,
      identity,
      qrPayload: this.buildQrPayload(input, documentHash),
      signing: {
        certificateId: undefined,
        privateKeyRef: 'tenant.settings.integrations.zatca.privateKeyRef',
        csid: undefined,
      },
    };
  }

  buildXml(input: ZatcaDocumentInput, documentUuid: string): string {
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">',
      `<UUID>${documentUuid}</UUID>`,
      `<ID>${input.documentNumber}</ID>`,
      `<IssueDate>${input.issueDate}</IssueDate>`,
      `<InvoiceTypeCode>${input.documentType}</InvoiceTypeCode>`,
      `<AccountingSupplierParty><Name>${input.sellerName}</Name><CompanyID>${input.vatNumber}</CompanyID></AccountingSupplierParty>`,
      `<LegalMonetaryTotal><TaxExclusiveAmount>${input.total - input.vatTotal}</TaxExclusiveAmount><TaxInclusiveAmount>${input.total}</TaxInclusiveAmount></LegalMonetaryTotal>`,
      `<TaxTotal><TaxAmount>${input.vatTotal}</TaxAmount></TaxTotal>`,
      '</Invoice>',
    ].join('');
  }

  computeHash(xmlPayload: string): string {
    return createHash('sha256').update(xmlPayload, 'utf8').digest('base64');
  }

  buildQrPayload(input: ZatcaDocumentInput, documentHash: string): GovernmentQrPayload {
    return {
      sellerName: input.sellerName,
      vatNumber: input.vatNumber,
      timestamp: input.issueDate,
      total: input.total.toFixed(2),
      vatTotal: input.vatTotal.toFixed(2),
      documentHash,
    };
  }
}
