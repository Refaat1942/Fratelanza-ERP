import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../../packages/database/generated/server';
import { PrismaService } from '../../database/prisma.service';

type TxClient = Prisma.TransactionClient;

@Injectable()
export class DocumentNumberService {
  constructor(private prisma: PrismaService) {}

  async nextNumber(
    tenantId: string,
    documentType: string,
    prefix: string,
    branchId?: string | null,
    tx?: TxClient,
  ): Promise<string> {
    const allocate = async (db: TxClient) => {
      const fiscalYear = new Date().getFullYear();
      const resolvedBranchId = branchId ?? null;

      const rows = await db.$queryRaw<Array<{ assigned: number; prefix: string; padding: number }>>`
        WITH upserted AS (
          INSERT INTO number_sequences (
            id, "tenantId", "branchId", "documentType", prefix, "fiscalYear", "nextNumber", padding
          )
          VALUES (
            gen_random_uuid(),
            ${tenantId}::uuid,
            ${resolvedBranchId}::uuid,
            ${documentType},
            ${prefix},
            ${fiscalYear},
            2,
            6
          )
          ON CONFLICT ("tenantId", "branchId", "documentType", "fiscalYear")
          DO UPDATE SET "nextNumber" = number_sequences."nextNumber" + 1
          RETURNING "nextNumber", prefix, padding
        )
        SELECT ("nextNumber" - 1) AS assigned, prefix, padding FROM upserted
      `;

      const row = rows[0];
      if (!row) {
        throw new Error('Failed to allocate document number');
      }

      const padded = String(row.assigned).padStart(row.padding, '0');
      return `${row.prefix}-${fiscalYear}-${padded}`;
    };

    if (tx) {
      return allocate(tx);
    }

    return this.prisma.$transaction(allocate);
  }
}
