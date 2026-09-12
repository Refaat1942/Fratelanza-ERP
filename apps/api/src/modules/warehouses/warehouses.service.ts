import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class WarehousesService {
  constructor(private prisma: PrismaService) {}

  async findAll(
    tenantId: string,
    scopeWhere?: { branchId?: string | { in: string[] }; id?: string | { in: string[] } },
  ) {
    return this.prisma.warehouse.findMany({
      where: { tenantId, deletedAt: null, ...scopeWhere },
      include: { branch: { select: { id: true, name: true, code: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findById(tenantId: string, id: string) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { branch: { select: { id: true, name: true, code: true } } },
    });
    if (!warehouse) throw new NotFoundException('Warehouse not found');
    return warehouse;
  }

  async create(
    tenantId: string,
    data: { branchId: string; name: string; code: string; address?: string },
  ) {
    const existing = await this.prisma.warehouse.findUnique({
      where: { tenantId_code: { tenantId, code: data.code } },
    });
    if (existing) throw new ConflictException('Warehouse code already exists');

    return this.prisma.warehouse.create({
      data: { tenantId, ...data },
      include: { branch: { select: { id: true, name: true, code: true } } },
    });
  }

  async update(
    tenantId: string,
    id: string,
    data: Partial<{ name: string; address: string; isActive: boolean }>,
  ) {
    await this.findById(tenantId, id);
    return this.prisma.warehouse.update({
      where: { id },
      data,
      include: { branch: { select: { id: true, name: true, code: true } } },
    });
  }

  async softDelete(tenantId: string, id: string) {
    await this.findById(tenantId, id);
    return this.prisma.warehouse.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }
}
