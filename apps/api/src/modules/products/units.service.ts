import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class UnitsService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string) {
    return this.prisma.unitOfMeasure.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  }

  async findById(tenantId: string, id: string) {
    const unit = await this.prisma.unitOfMeasure.findFirst({
      where: { id, tenantId },
    });
    if (!unit) throw new NotFoundException('Unit of measure not found');
    return unit;
  }

  async create(
    tenantId: string,
    data: { name: string; code: string; symbol?: string },
  ) {
    const existing = await this.prisma.unitOfMeasure.findUnique({
      where: { tenantId_code: { tenantId, code: data.code } },
    });
    if (existing) throw new ConflictException('Unit code already exists');

    return this.prisma.unitOfMeasure.create({
      data: { tenantId, ...data },
    });
  }

  async update(
    tenantId: string,
    id: string,
    data: Partial<{ name: string; symbol: string; isActive: boolean }>,
  ) {
    await this.findById(tenantId, id);
    return this.prisma.unitOfMeasure.update({ where: { id }, data });
  }
}
