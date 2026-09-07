import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { EntitlementService } from '../license/entitlement.service';

@Injectable()
export class BranchesService {
  constructor(
    private prisma: PrismaService,
    private entitlementService: EntitlementService,
  ) {}

  async findAll(tenantId: string) {
    return this.prisma.branch.findMany({
      where: { tenantId, deletedAt: null },
      include: { _count: { select: { warehouses: true, users: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findById(tenantId: string, id: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { warehouses: { where: { deletedAt: null } } },
    });
    if (!branch) throw new NotFoundException('Branch not found');
    return branch;
  }

  async create(tenantId: string, data: { name: string; code: string; address?: string }) {
    const activeBranches = await this.prisma.branch.count({
      where: { tenantId, deletedAt: null, isActive: true },
    });
    await this.entitlementService.assertLimit(tenantId, 'maxBranches', activeBranches + 1);

    return this.prisma.branch.create({
      data: { tenantId, ...data },
    });
  }

  async update(tenantId: string, id: string, data: Partial<{ name: string; address: string; phone: string; email: string; isActive: boolean }>) {
    await this.findById(tenantId, id);
    return this.prisma.branch.update({ where: { id }, data });
  }
}
