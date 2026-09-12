import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '../../../../../packages/database/generated/server';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  async findAll(
    tenantId: string,
    branchWhere?: {
      OR?: Array<{ branchId: null } | { branchId: string } | { branchId: { in: string[] } }>;
    },
  ) {
    return this.prisma.customer.findMany({
      where: { tenantId, deletedAt: null, ...branchWhere },
      orderBy: { name: 'asc' },
    });
  }

  async findById(tenantId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  async create(
    tenantId: string,
    data: {
      code: string;
      name: string;
      branchId?: string;
      email?: string;
      phone?: string;
      address?: string;
      taxNumber?: string;
      creditLimit?: number;
    },
  ) {
    const existing = await this.prisma.customer.findUnique({
      where: { tenantId_code: { tenantId, code: data.code } },
    });
    if (existing) throw new ConflictException('Customer code already exists');

    return this.prisma.customer.create({
      data: {
        tenantId,
        code: data.code,
        name: data.name,
        branchId: data.branchId,
        email: data.email,
        phone: data.phone,
        address: data.address,
        taxNumber: data.taxNumber,
        creditLimit: new Prisma.Decimal(data.creditLimit ?? 0),
      },
    });
  }

  async update(
    tenantId: string,
    id: string,
    data: Partial<{
      name: string;
      branchId: string | null;
      email: string;
      phone: string;
      address: string;
      taxNumber: string;
      creditLimit: number;
      isActive: boolean;
    }>,
  ) {
    await this.findById(tenantId, id);
    const { creditLimit, ...rest } = data;
    return this.prisma.customer.update({
      where: { id },
      data: {
        ...rest,
        ...(creditLimit !== undefined && { creditLimit: new Prisma.Decimal(creditLimit) }),
      },
    });
  }

  async softDelete(tenantId: string, id: string) {
    await this.findById(tenantId, id);
    return this.prisma.customer.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }
}
