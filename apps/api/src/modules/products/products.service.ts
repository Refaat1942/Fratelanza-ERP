import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '../../../../../packages/database/generated/server';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string) {
    return this.prisma.product.findMany({
      where: { tenantId, deletedAt: null },
      include: { category: true, unit: true },
      orderBy: { name: 'asc' },
    });
  }

  async findById(tenantId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { category: true, unit: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async create(
    tenantId: string,
    data: {
      sku: string;
      name: string;
      unitId: string;
      categoryId?: string;
      description?: string;
      barcode?: string;
      type?: string;
      costPrice?: number;
      salePrice?: number;
      taxRate?: number;
      trackInventory?: boolean;
    },
  ) {
    const existing = await this.prisma.product.findUnique({
      where: { tenantId_sku: { tenantId, sku: data.sku } },
    });
    if (existing) throw new ConflictException('SKU already exists');

    return this.prisma.product.create({
      data: {
        tenantId,
        sku: data.sku,
        name: data.name,
        unitId: data.unitId,
        categoryId: data.categoryId,
        description: data.description,
        barcode: data.barcode,
        type: data.type ?? 'product',
        costPrice: new Prisma.Decimal(data.costPrice ?? 0),
        salePrice: new Prisma.Decimal(data.salePrice ?? 0),
        taxRate: new Prisma.Decimal(data.taxRate ?? 0),
        trackInventory: data.trackInventory ?? true,
      },
      include: { category: true, unit: true },
    });
  }

  async update(
    tenantId: string,
    id: string,
    data: Partial<{
      name: string;
      categoryId: string | null;
      unitId: string;
      description: string;
      barcode: string;
      costPrice: number;
      salePrice: number;
      taxRate: number;
      trackInventory: boolean;
      isActive: boolean;
    }>,
  ) {
    await this.findById(tenantId, id);
    const { costPrice, salePrice, taxRate, ...rest } = data;
    return this.prisma.product.update({
      where: { id },
      data: {
        ...rest,
        ...(costPrice !== undefined && { costPrice: new Prisma.Decimal(costPrice) }),
        ...(salePrice !== undefined && { salePrice: new Prisma.Decimal(salePrice) }),
        ...(taxRate !== undefined && { taxRate: new Prisma.Decimal(taxRate) }),
      },
      include: { category: true, unit: true },
    });
  }

  async softDelete(tenantId: string, id: string) {
    await this.findById(tenantId, id);
    return this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }
}
