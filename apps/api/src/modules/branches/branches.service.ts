import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class BranchesService {
  constructor(private prisma: PrismaService) {}

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
    return this.prisma.branch.create({
      data: { tenantId, ...data },
    });
  }

  async update(tenantId: string, id: string, data: Partial<{ name: string; address: string; phone: string; email: string; isActive: boolean }>) {
    await this.findById(tenantId, id);
    return this.prisma.branch.update({ where: { id }, data });
  }

  async softDelete(tenantId: string, id: string) {
    await this.findById(tenantId, id);
    const [warehouseCount, userCount] = await Promise.all([
      this.prisma.warehouse.count({ where: { branchId: id, deletedAt: null } }),
      this.prisma.user.count({ where: { branchId: id, deletedAt: null, isActive: true } }),
    ]);
    if (warehouseCount > 0 || userCount > 0) {
      throw new ConflictException(
        'Cannot delete a branch with active warehouses or users. Reassign or deactivate them first.',
      );
    }
    return this.prisma.branch.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }
}
