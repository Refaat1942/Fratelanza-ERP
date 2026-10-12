import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export interface PlanInput {
  code: string;
  name: string;
  description?: string;
  priceMonthly: number;
  priceYearly?: number;
  currency?: string;
  maxUsers?: number;
  maxBranches?: number;
  isActive?: boolean;
  isPublic?: boolean;
  sortOrder?: number;
  moduleIds: string[];
}

@Injectable()
export class PlansService {
  constructor(private prisma: PrismaService) {}

  async list() {
    return this.prisma.plan.findMany({
      include: { modules: true, _count: { select: { subscriptions: true } } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async findById(id: string) {
    const plan = await this.prisma.plan.findUnique({
      where: { id },
      include: { modules: true },
    });
    if (!plan) throw new NotFoundException('Plan not found');
    return plan;
  }

  async create(data: PlanInput) {
    const existing = await this.prisma.plan.findUnique({ where: { code: data.code } });
    if (existing) throw new ConflictException('Plan code already exists');

    return this.prisma.plan.create({
      data: {
        code: data.code,
        name: data.name,
        description: data.description,
        priceMonthly: data.priceMonthly,
        priceYearly: data.priceYearly,
        currency: data.currency ?? 'USD',
        maxUsers: data.maxUsers,
        maxBranches: data.maxBranches,
        isActive: data.isActive ?? true,
        isPublic: data.isPublic ?? true,
        sortOrder: data.sortOrder ?? 0,
        modules: { create: data.moduleIds.map((moduleId) => ({ moduleId })) },
      },
      include: { modules: true },
    });
  }

  async update(id: string, data: Partial<PlanInput>) {
    await this.findById(id);

    return this.prisma.$transaction(async (tx) => {
      if (data.moduleIds) {
        await tx.planModule.deleteMany({ where: { planId: id } });
        await tx.planModule.createMany({
          data: data.moduleIds.map((moduleId) => ({ planId: id, moduleId })),
        });
      }

      return tx.plan.update({
        where: { id },
        data: {
          name: data.name,
          description: data.description,
          priceMonthly: data.priceMonthly,
          priceYearly: data.priceYearly,
          currency: data.currency,
          maxUsers: data.maxUsers,
          maxBranches: data.maxBranches,
          isActive: data.isActive,
          isPublic: data.isPublic,
          sortOrder: data.sortOrder,
        },
        include: { modules: true },
      });
    });
  }
}
