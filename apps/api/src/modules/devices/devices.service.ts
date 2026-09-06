import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class DevicesService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string) {
    return this.prisma.device.findMany({
      where: { tenantId },
      include: { branch: { select: { id: true, name: true, code: true } } },
      orderBy: { lastSeenAt: 'desc' },
    });
  }

  async findById(tenantId: string, id: string) {
    const device = await this.prisma.device.findFirst({
      where: { id, tenantId },
      include: { branch: true },
    });
    if (!device) throw new NotFoundException('Device not found');
    return device;
  }

  async updateStatus(tenantId: string, id: string, status: string) {
    await this.findById(tenantId, id);
    return this.prisma.device.update({
      where: { id },
      data: {
        status,
        revokedAt: status === 'revoked' ? new Date() : null,
      },
    });
  }
}
