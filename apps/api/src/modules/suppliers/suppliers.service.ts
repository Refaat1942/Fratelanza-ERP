import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class SuppliersService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string) {
    return this.prisma.supplier.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  async findById(tenantId: string, id: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');
    return supplier;
  }

  async create(
    tenantId: string,
    data: {
      code: string;
      name: string;
      email?: string;
      phone?: string;
      address?: string;
      taxNumber?: string;
    },
  ) {
    const existing = await this.prisma.supplier.findUnique({
      where: { tenantId_code: { tenantId, code: data.code } },
    });
    if (existing) throw new ConflictException('Supplier code already exists');

    return this.prisma.supplier.create({ data: { tenantId, ...data } });
  }

  async update(
    tenantId: string,
    id: string,
    data: Partial<{
      name: string;
      email: string;
      phone: string;
      address: string;
      taxNumber: string;
      isActive: boolean;
    }>,
  ) {
    await this.findById(tenantId, id);
    return this.prisma.supplier.update({ where: { id }, data });
  }

  async softDelete(tenantId: string, id: string) {
    await this.findById(tenantId, id);
    return this.prisma.supplier.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }
}
