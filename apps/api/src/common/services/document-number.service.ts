import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class DocumentNumberService {
  constructor(private prisma: PrismaService) {}

  async nextNumber(
    tenantId: string,
    documentType: string,
    prefix: string,
    branchId?: string | null,
  ): Promise<string> {
    const fiscalYear = new Date().getFullYear();
    const resolvedBranchId = branchId ?? null;

    const existing = await this.prisma.numberSequence.findFirst({
      where: {
        tenantId,
        branchId: resolvedBranchId,
        documentType,
        fiscalYear,
      },
    });

    const sequence = existing
      ? await this.prisma.numberSequence.update({
          where: { id: existing.id },
          data: { nextNumber: { increment: 1 } },
        })
      : await this.prisma.numberSequence.create({
          data: {
            tenantId,
            branchId: resolvedBranchId,
            documentType,
            prefix,
            fiscalYear,
            nextNumber: 2,
            padding: 6,
          },
        });

    const num = sequence.nextNumber - 1;
    const padded = String(num).padStart(sequence.padding, '0');
    return `${prefix}-${fiscalYear}-${padded}`;
  }
}
