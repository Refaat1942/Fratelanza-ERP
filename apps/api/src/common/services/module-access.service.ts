import { ForbiddenException, Injectable } from '@nestjs/common';
import { ERP_MODULES } from '@fratelanza/shared';
import { PrismaService } from '../../database/prisma.service';

/** Subscription statuses that keep plan-granted module access active. */
const ACCESS_GRANTING_STATUSES = ['trialing', 'active', 'past_due'];

export type ModuleSource = 'override' | 'plan' | 'default';

export interface ResolvedModuleAccess {
  id: string;
  enabled: boolean;
  source: ModuleSource;
  overrideValue: boolean | null;
  planValue: boolean | null;
}

/**
 * Single source of truth for "is module X enabled for tenant Y", combining:
 *   1. TenantModuleAccess - an explicit per-tenant override, always wins when present.
 *   2. The tenant's active Subscription -> Plan -> PlanModule list - the plan's default set.
 *   3. No subscription at all (legacy/demo tenants) - preserves the historical "open" default.
 * A subscription whose status has lapsed (canceled/suspended) grants NO plan modules -
 * only explicit overrides can restore access for a lapsed tenant.
 */
@Injectable()
export class ModuleAccessService {
  constructor(private prisma: PrismaService) {}

  async resolveAll(tenantId: string): Promise<ResolvedModuleAccess[]> {
    const [overrides, subscription] = await Promise.all([
      this.prisma.tenantModuleAccess.findMany({ where: { tenantId } }),
      this.prisma.subscription.findUnique({
        where: { tenantId },
        include: { plan: { include: { modules: true } } },
      }),
    ]);

    const overrideMap = new Map(overrides.map((o) => [o.moduleId, o.enabled]));

    let planModuleIds: Set<string> | null = null;
    if (subscription) {
      planModuleIds = ACCESS_GRANTING_STATUSES.includes(subscription.status)
        ? new Set(subscription.plan.modules.map((m) => m.moduleId))
        : new Set();
    }

    return ERP_MODULES.map((mod) => {
      const overrideValue = overrideMap.has(mod.id) ? overrideMap.get(mod.id)! : null;
      const planValue = planModuleIds ? planModuleIds.has(mod.id) : null;

      let enabled: boolean;
      let source: ModuleSource;
      if (overrideValue !== null) {
        enabled = overrideValue;
        source = 'override';
      } else if (planModuleIds !== null) {
        enabled = planValue!;
        source = 'plan';
      } else {
        enabled = true;
        source = 'default';
      }

      return { id: mod.id, enabled, source, overrideValue, planValue };
    });
  }

  async resolveEnabledModuleIds(tenantId: string): Promise<string[]> {
    const resolved = await this.resolveAll(tenantId);
    return resolved.filter((m) => m.enabled).map((m) => m.id);
  }

  async isModuleEnabled(tenantId: string, moduleId: string): Promise<boolean> {
    const ids = await this.resolveEnabledModuleIds(tenantId);
    return ids.includes(moduleId);
  }

  async assertModuleEnabled(tenantId: string, moduleId: string): Promise<void> {
    const enabled = await this.isModuleEnabled(tenantId, moduleId);
    if (!enabled) {
      throw new ForbiddenException(`Module "${moduleId}" is not enabled for this organization`);
    }
  }
}
