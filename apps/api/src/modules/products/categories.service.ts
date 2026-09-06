import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string) {
    return this.prisma.productCategory.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  async findById(tenantId: string, id: string) {
    const category = await this.prisma.productCategory.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  async create(
    tenantId: string,
    data: { name: string; code: string; parentId?: string },
  ) {
    const existing = await this.prisma.productCategory.findUnique({
      where: { tenantId_code: { tenantId, code: data.code } },
    });
    if (existing) throw new ConflictException('Category code already exists');

    return this.prisma.productCategory.create({
      data: { tenantId, ...data },
    });
  }

  async update(
    tenantId: string,
    id: string,
    data: Partial<{ name: string; parentId: string | null; isActive: boolean }>,
  ) {
    await this.findById(tenantId, id);
    return this.prisma.productCategory.update({ where: { id }, data });
  }

  async softDelete(tenantId: string, id: string) {
    await this.findById(tenantId, id);
    return this.prisma.productCategory.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }
}
