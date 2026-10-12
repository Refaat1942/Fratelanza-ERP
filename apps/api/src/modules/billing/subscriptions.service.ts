import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'suspended';
type BillingCycle = 'monthly' | 'yearly';

export interface AssignSubscriptionInput {
  planId: string;
  status?: SubscriptionStatus;
  billingCycle?: BillingCycle;
  trialEndsAt?: string;
  currentPeriodEnd?: string;
  seats?: number;
}

const INCLUDE = { plan: { include: { modules: true } } } as const;

@Injectable()
export class SubscriptionsService {
  constructor(private prisma: PrismaService) {}

  async list() {
    return this.prisma.subscription.findMany({
      include: {
        ...INCLUDE,
        tenant: { select: { id: true, name: true, code: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findForTenant(tenantId: string) {
    return this.prisma.subscription.findUnique({ where: { tenantId }, include: INCLUDE });
  }

  async assign(tenantId: string, data: AssignSubscriptionInput) {
    const [tenant, plan] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId } }),
      this.prisma.plan.findUnique({ where: { id: data.planId } }),
    ]);
    if (!tenant) throw new NotFoundException('Tenant not found');
    if (!plan) throw new NotFoundException('Plan not found');

    const existing = await this.prisma.subscription.findUnique({ where: { tenantId } });
    if (existing) {
      throw new BadRequestException('Tenant already has a subscription - use update instead');
    }

    const now = new Date();
    const periodEnd = data.currentPeriodEnd
      ? new Date(data.currentPeriodEnd)
      : addPeriod(now, data.billingCycle ?? 'monthly');

    return this.prisma.subscription.create({
      data: {
        tenantId,
        planId: data.planId,
        status: data.status ?? 'active',
        billingCycle: data.billingCycle ?? 'monthly',
        provider: 'manual',
        trialEndsAt: data.trialEndsAt ? new Date(data.trialEndsAt) : undefined,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        seats: data.seats,
      },
      include: INCLUDE,
    });
  }

  async update(tenantId: string, data: Partial<AssignSubscriptionInput> & { cancelAtPeriodEnd?: boolean }) {
    const existing = await this.prisma.subscription.findUnique({ where: { tenantId } });
    if (!existing) throw new NotFoundException('Tenant has no subscription yet - use assign instead');

    if (data.planId) {
      const plan = await this.prisma.plan.findUnique({ where: { id: data.planId } });
      if (!plan) throw new NotFoundException('Plan not found');
    }

    return this.prisma.subscription.update({
      where: { tenantId },
      data: {
        planId: data.planId,
        status: data.status,
        billingCycle: data.billingCycle,
        cancelAtPeriodEnd: data.cancelAtPeriodEnd,
        seats: data.seats,
        canceledAt: data.status === 'canceled' ? new Date() : undefined,
      },
      include: INCLUDE,
    });
  }
}

function addPeriod(from: Date, cycle: BillingCycle): Date {
  const d = new Date(from);
  if (cycle === 'yearly') {
    d.setFullYear(d.getFullYear() + 1);
  } else {
    d.setMonth(d.getMonth() + 1);
  }
  return d;
}
