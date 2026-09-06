import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export interface AuditLogInput {
  tenantId: string;
  branchId?: string | null;
  userId?: string | null;
  deviceId?: string | null;
  entity: string;
  entityId: string;
  action: string;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string | null;
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(input: AuditLogInput) {
    return this.prisma.auditLog.create({
      data: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        userId: input.userId,
        deviceId: input.deviceId,
        entity: input.entity,
        entityId: input.entityId,
        action: input.action,
        oldValue: input.oldValue as object | undefined,
        newValue: input.newValue as object | undefined,
        ipAddress: input.ipAddress,
      },
    });
  }

  async findByTenant(tenantId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: { select: { firstName: true, lastName: true, email: true } },
        },
      }),
      this.prisma.auditLog.count({ where: { tenantId } }),
    ]);
    return { items, total, page, limit };
  }
}
