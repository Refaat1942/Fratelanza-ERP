CREATE TABLE "government_integration_logs" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "countryCode" TEXT NOT NULL,
    "authority" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "documentId" UUID,
    "documentNumber" TEXT,
    "requestId" TEXT,
    "submissionId" TEXT,
    "documentUuid" TEXT,
    "status" TEXT NOT NULL,
    "response" JSONB,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "government_integration_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "government_integration_logs_tenantId_status_idx" ON "government_integration_logs"("tenantId", "status");
CREATE INDEX "government_integration_logs_tenantId_authority_idx" ON "government_integration_logs"("tenantId", "authority");
CREATE INDEX "government_integration_logs_documentId_idx" ON "government_integration_logs"("documentId");

ALTER TABLE "government_integration_logs" ADD CONSTRAINT "government_integration_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
