import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class TenantsService {
  constructor(private prisma: PrismaService) {}

  async findById(tenantId: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      include: {
        tenantModules: { where: { isEnabled: true } },
        _count: { select: { branches: true, users: true } },
      },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async updateSettings(tenantId: string, settings: Record<string, unknown>) {
    const tenant = await this.findById(tenantId);
    const merged = {
      ...(tenant.settings as Record<string, unknown>),
      ...settings,
    };
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: { settings: merged as object },
    });
  }
}
