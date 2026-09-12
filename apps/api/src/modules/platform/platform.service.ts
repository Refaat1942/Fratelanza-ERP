import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ERP_MODULES } from '@fratelanza/shared';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class PlatformService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async getDashboardStats() {
    const [organizations, activeUsers, demoTenants, recentAudit] = await Promise.all([
      this.prisma.tenant.count({ where: { deletedAt: null, isDemo: false } }),
      this.prisma.user.count({ where: { isActive: true, deletedAt: null } }),
      this.prisma.demoEnvironment.count({ where: { enabled: true } }),
      this.prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          action: true,
          entity: true,
          createdAt: true,
          user: { select: { email: true, firstName: true, lastName: true } },
          tenant: { select: { name: true, code: true } },
        },
      }),
    ]);

    const enabledModules = ERP_MODULES.length;
    return {
      organizations,
      activeUsers,
      demoTenants,
      enabledModules,
      disabledModules: 0,
      recentActivity: recentAudit,
      securityAlerts: [],
    };
  }

  async listOrganizations() {
    return this.prisma.tenant.findMany({
      where: { deletedAt: null, isDemo: false },
      include: {
        _count: { select: { users: true, branches: true } },
        moduleAccess: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createOrganization(data: {
    name: string;
    code: string;
    displayName?: string;
    businessType?: string;
    country?: string;
    currency?: string;
    language?: string;
  }) {
    const existing = await this.prisma.tenant.findUnique({ where: { code: data.code } });
    if (existing) throw new BadRequestException('Organization code already exists');

    return this.prisma.tenant.create({
      data: {
        name: data.name,
        code: data.code.toUpperCase(),
        displayName: data.displayName ?? data.name,
        businessType: data.businessType,
        country: data.country ?? 'SA',
        currency: data.currency ?? 'SAR',
        language: data.language ?? 'ar',
        status: 'ACTIVE',
        isActive: true,
        moduleAccess: {
          create: ERP_MODULES.map((m) => ({
            moduleId: m.id,
            enabled: true,
          })),
        },
      },
    });
  }

  async updateOrganization(
    id: string,
    data: {
      name?: string;
      displayName?: string;
      businessType?: string;
      country?: string;
      currency?: string;
      language?: string;
      status?: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
    },
  ) {
    const tenant = await this.prisma.tenant.findFirst({ where: { id, deletedAt: null } });
    if (!tenant) throw new NotFoundException('Organization not found');

    const isActive = data.status ? data.status === 'ACTIVE' : undefined;
    return this.prisma.tenant.update({
      where: { id },
      data: {
        ...data,
        isActive,
      },
    });
  }

  async listDemos() {
    return this.prisma.demoEnvironment.findMany({
      include: {
        tenant: { select: { id: true, name: true, code: true, status: true } },
        demoUser: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createDemo(data: {
    slug: string;
    name: string;
    tenantCode: string;
    modules?: string[];
    demoUserEmail?: string;
  }) {
    const slug = data.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const existing = await this.prisma.demoEnvironment.findUnique({ where: { slug } });
    if (existing) throw new BadRequestException('Demo slug already exists');

    const tenant = await this.prisma.tenant.create({
      data: {
        name: data.name,
        code: data.tenantCode.toUpperCase(),
        displayName: data.name,
        country: 'SA',
        currency: 'SAR',
        language: 'ar',
        isDemo: true,
        demoSlug: slug,
        status: 'ACTIVE',
        isActive: true,
      },
    });

    const demo = await this.prisma.demoEnvironment.create({
      data: {
        slug,
        name: data.name,
        tenantId: tenant.id,
        modules: data.modules ?? ERP_MODULES.map((m) => m.id),
        linkToken: randomUUID(),
      },
    });

    return demo;
  }

  async updateDemo(
    id: string,
    data: {
      name?: string;
      enabled?: boolean;
      modules?: string[];
      demoUserId?: string;
    },
  ) {
    const demo = await this.prisma.demoEnvironment.findUnique({ where: { id } });
    if (!demo) throw new NotFoundException('Demo not found');

    return this.prisma.demoEnvironment.update({
      where: { id },
      data: {
        name: data.name,
        enabled: data.enabled,
        modules: data.modules,
        demoUserId: data.demoUserId,
        linkToken: data.enabled === false ? demo.linkToken : randomUUID(),
      },
    });
  }

  async regenerateDemoLink(id: string) {
    const demo = await this.prisma.demoEnvironment.findUnique({ where: { id } });
    if (!demo) throw new NotFoundException('Demo not found');
    return this.prisma.demoEnvironment.update({
      where: { id },
      data: { linkToken: randomUUID() },
    });
  }

  async getDemoBySlug(slug: string) {
    const demo = await this.prisma.demoEnvironment.findFirst({
      where: { slug: slug.toLowerCase(), enabled: true },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            displayName: true,
            businessType: true,
            country: true,
            currency: true,
            language: true,
            status: true,
            isActive: true,
          },
        },
      },
    });
    if (!demo || !demo.tenant.isActive || demo.tenant.status !== 'ACTIVE') {
      throw new NotFoundException('Demo not available');
    }
    return {
      slug: demo.slug,
      name: demo.name,
      modules: demo.modules,
      tenantName: demo.tenant.displayName ?? demo.tenant.name,
      businessType: demo.tenant.businessType,
    };
  }

  async listModulesForTenant(tenantId: string) {
    const access = await this.prisma.tenantModuleAccess.findMany({ where: { tenantId } });
    const accessMap = new Map(access.map((a) => [a.moduleId, a.enabled]));
    return ERP_MODULES.map((mod) => ({
      ...mod,
      enabled: accessMap.has(mod.id) ? accessMap.get(mod.id)! : true,
    }));
  }

  async setTenantModule(tenantId: string, moduleId: string, enabled: boolean) {
    return this.prisma.tenantModuleAccess.upsert({
      where: { tenantId_moduleId: { tenantId, moduleId } },
      create: { tenantId, moduleId, enabled },
      update: { enabled },
    });
  }

  async getEnabledModuleIds(tenantId: string): Promise<string[]> {
    const rows = await this.prisma.tenantModuleAccess.findMany({
      where: { tenantId, enabled: true },
    });
    if (rows.length === 0) return ERP_MODULES.map((m) => m.id);
    return rows.map((r) => r.moduleId);
  }
}
