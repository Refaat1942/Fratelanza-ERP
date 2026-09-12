import { pathToFileURL } from 'node:url';
import { PrismaClient } from '../generated/server';
import bcrypt from 'bcryptjs';
import {
  generateAllVerticalDemoVolumes,
} from './demo-generator';
import { assertSeedableDatabase } from './seed-guard';
import { seedWorldErpDemoSamples } from './seed-world-erp-demo';

const prisma = new PrismaClient();

type PermissionDef = { module: string; feature: string; action: string };

const CORE_PERMISSIONS: PermissionDef[] = [
  { module: 'core', feature: 'dashboard', action: 'read' },
  { module: 'core', feature: 'tenants', action: 'read' },
  { module: 'core', feature: 'tenants', action: 'create' },
  { module: 'core', feature: 'tenants', action: 'update' },
  { module: 'core', feature: 'branches', action: 'read' },
  { module: 'core', feature: 'branches', action: 'create' },
  { module: 'core', feature: 'branches', action: 'update' },
  { module: 'core', feature: 'users', action: 'read' },
  { module: 'core', feature: 'users', action: 'create' },
  { module: 'core', feature: 'users', action: 'update' },
  { module: 'core', feature: 'users', action: 'delete' },
  { module: 'core', feature: 'roles', action: 'read' },
  { module: 'core', feature: 'roles', action: 'create' },
  { module: 'core', feature: 'roles', action: 'update' },
  { module: 'core', feature: 'devices', action: 'read' },
  { module: 'core', feature: 'devices', action: 'update' },
  { module: 'core', feature: 'settings', action: 'read' },
  { module: 'core', feature: 'settings', action: 'update' },
  { module: 'core', feature: 'audit', action: 'read' },
  { module: 'products', feature: 'products', action: 'read' },
  { module: 'products', feature: 'products', action: 'create' },
  { module: 'products', feature: 'products', action: 'update' },
  { module: 'products', feature: 'products', action: 'delete' },
  { module: 'products', feature: 'categories', action: 'read' },
  { module: 'products', feature: 'categories', action: 'create' },
  { module: 'products', feature: 'categories', action: 'update' },
  { module: 'products', feature: 'categories', action: 'delete' },
  { module: 'products', feature: 'units', action: 'read' },
  { module: 'products', feature: 'units', action: 'create' },
  { module: 'products', feature: 'units', action: 'update' },
  { module: 'customers', feature: 'customers', action: 'read' },
  { module: 'customers', feature: 'customers', action: 'create' },
  { module: 'customers', feature: 'customers', action: 'update' },
  { module: 'customers', feature: 'customers', action: 'delete' },
  { module: 'suppliers', feature: 'suppliers', action: 'read' },
  { module: 'suppliers', feature: 'suppliers', action: 'create' },
  { module: 'suppliers', feature: 'suppliers', action: 'update' },
  { module: 'suppliers', feature: 'suppliers', action: 'delete' },
  { module: 'warehouses', feature: 'warehouses', action: 'read' },
  { module: 'warehouses', feature: 'warehouses', action: 'create' },
  { module: 'warehouses', feature: 'warehouses', action: 'update' },
  { module: 'warehouses', feature: 'warehouses', action: 'delete' },
  { module: 'inventory', feature: 'movements', action: 'read' },
  { module: 'inventory', feature: 'stock', action: 'read' },
  { module: 'inventory', feature: 'stock', action: 'adjust' },
  { module: 'sales', feature: 'invoices', action: 'read' },
  { module: 'sales', feature: 'invoices', action: 'create' },
  { module: 'sales', feature: 'invoices', action: 'post' },
  { module: 'sales', feature: 'payments', action: 'create' },
  { module: 'purchasing', feature: 'orders', action: 'read' },
  { module: 'purchasing', feature: 'orders', action: 'create' },
  { module: 'purchasing', feature: 'orders', action: 'receive' },
  { module: 'accounting', feature: 'accounts', action: 'read' },
  { module: 'accounting', feature: 'accounts', action: 'create' },
  { module: 'accounting', feature: 'accounts', action: 'update' },
  { module: 'accounting', feature: 'journals', action: 'read' },
  { module: 'accounting', feature: 'reports', action: 'read' },
  { module: 'accounting', feature: 'coa', action: 'seed' },
  { module: 'pos', feature: 'shifts', action: 'open' },
  { module: 'pos', feature: 'shifts', action: 'close' },
  { module: 'pos', feature: 'sales', action: 'create' },
  { module: 'sync', feature: 'sync', action: 'push' },
  { module: 'sync', feature: 'sync', action: 'pull' },
];

const PMS_PERMISSIONS: PermissionDef[] = [
  { module: 'pms', feature: 'patients', action: 'read' },
  { module: 'pms', feature: 'patients', action: 'create' },
  { module: 'pms', feature: 'patients', action: 'update' },
  { module: 'pms', feature: 'patients', action: 'delete' },
  { module: 'pms', feature: 'patients', action: 'notes' },
  { module: 'pms', feature: 'services', action: 'read' },
  { module: 'pms', feature: 'services', action: 'create' },
  { module: 'pms', feature: 'services', action: 'update' },
  { module: 'pms', feature: 'services', action: 'delete' },
  { module: 'pms', feature: 'encounters', action: 'read' },
  { module: 'pms', feature: 'encounters', action: 'create' },
  { module: 'pms', feature: 'encounters', action: 'update' },
  { module: 'pms', feature: 'encounters', action: 'cancel' },
  { module: 'pms', feature: 'charges', action: 'read' },
  { module: 'pms', feature: 'charges', action: 'create' },
  { module: 'pms', feature: 'charges', action: 'update' },
  { module: 'pms', feature: 'charges', action: 'post' },
  { module: 'pms', feature: 'charges', action: 'void' },
  { module: 'pms', feature: 'ledger', action: 'read' },
  { module: 'pms', feature: 'ledger', action: 'payment' },
  { module: 'pms', feature: 'ledger', action: 'refund' },
  { module: 'pms', feature: 'ledger', action: 'adjust' },
  { module: 'pms', feature: 'ledger', action: 'adjust:approve' },
  { module: 'pms', feature: 'discounts', action: 'apply' },
  { module: 'pms', feature: 'discounts', action: 'override' },
  { module: 'pms', feature: 'discounts', action: 'approve' },
  { module: 'pms', feature: 'reports', action: 'read' },
  { module: 'pms', feature: 'reports', action: 'export' },
  { module: 'pms', feature: 'settings', action: 'read' },
  { module: 'pms', feature: 'settings', action: 'update' },
];

const FINANCE_PERMISSIONS: PermissionDef[] = [
  { module: 'finance', feature: 'coa', action: 'read' },
  { module: 'finance', feature: 'coa', action: 'manage' },
  { module: 'finance', feature: 'periods', action: 'read' },
  { module: 'finance', feature: 'periods', action: 'manage' },
  { module: 'finance', feature: 'posting', action: 'read' },
  { module: 'finance', feature: 'posting', action: 'execute' },
  { module: 'finance', feature: 'journals', action: 'read' },
  { module: 'finance', feature: 'setup', action: 'seed' },
];

const PARTY_PERMISSIONS: PermissionDef[] = [
  { module: 'parties', feature: 'parties', action: 'read' },
  { module: 'parties', feature: 'parties', action: 'create' },
  { module: 'parties', feature: 'parties', action: 'update' },
  { module: 'parties', feature: 'parties', action: 'archive' },
  { module: 'parties', feature: 'roles', action: 'manage' },
  { module: 'parties', feature: 'contacts', action: 'read' },
  { module: 'parties', feature: 'contacts', action: 'manage' },
  { module: 'parties', feature: 'legacy-links', action: 'read' },
  { module: 'parties', feature: 'legacy-links', action: 'manage' },
];

const PROJECTS_PERMISSIONS: PermissionDef[] = [
  { module: 'projects', feature: 'projects', action: 'read' },
  { module: 'projects', feature: 'projects', action: 'create' },
  { module: 'projects', feature: 'projects', action: 'update' },
  { module: 'projects', feature: 'projects', action: 'archive' },
  { module: 'projects', feature: 'cost-centers', action: 'read' },
  { module: 'projects', feature: 'cost-centers', action: 'manage' },
];

const CONSTRUCTION_PERMISSIONS: PermissionDef[] = [
  { module: 'construction', feature: 'foundation', action: 'read' },
  { module: 'construction', feature: 'foundation', action: 'manage' },
  { module: 'construction', feature: 'contracts', action: 'read' },
  { module: 'construction', feature: 'contracts', action: 'manage' },
  { module: 'construction', feature: 'boq', action: 'read' },
  { module: 'construction', feature: 'boq', action: 'manage' },
  { module: 'construction', feature: 'boq', action: 'approve' },
  { module: 'construction', feature: 'progress', action: 'read' },
  { module: 'construction', feature: 'progress', action: 'manage' },
  { module: 'construction', feature: 'progress', action: 'submit' },
  { module: 'construction', feature: 'progress', action: 'approve' },
  { module: 'construction', feature: 'variations', action: 'read' },
  { module: 'construction', feature: 'variations', action: 'manage' },
  { module: 'construction', feature: 'variations', action: 'approve' },
  { module: 'construction', feature: 'retention', action: 'read' },
  { module: 'construction', feature: 'retention', action: 'manage' },
  { module: 'construction', feature: 'retention', action: 'release' },
  { module: 'construction', feature: 'subcontractors', action: 'read' },
  { module: 'construction', feature: 'subcontractors', action: 'manage' },
  { module: 'construction', feature: 'materials', action: 'read' },
  { module: 'construction', feature: 'materials', action: 'issue' },
  { module: 'construction', feature: 'costing', action: 'read' },
  { module: 'construction', feature: 'billing', action: 'read' },
  { module: 'construction', feature: 'billing', action: 'create' },
  { module: 'construction', feature: 'billing', action: 'manage' },
  { module: 'construction', feature: 'reports', action: 'read' },
];

const CURRENCY_PERMISSIONS: PermissionDef[] = [
  { module: 'currency', feature: 'currencies', action: 'read' },
  { module: 'currency', feature: 'currencies', action: 'manage' },
  { module: 'currency', feature: 'rates', action: 'read' },
  { module: 'currency', feature: 'rates', action: 'manage' },
];

const ASSETS_PERMISSIONS: PermissionDef[] = [
  { module: 'assets', feature: 'categories', action: 'read' },
  { module: 'assets', feature: 'categories', action: 'manage' },
  { module: 'assets', feature: 'assets', action: 'read' },
  { module: 'assets', feature: 'assets', action: 'create' },
  { module: 'assets', feature: 'assets', action: 'update' },
  { module: 'assets', feature: 'assets', action: 'dispose' },
  { module: 'assets', feature: 'depreciation', action: 'run' },
];

const CRM_PERMISSIONS: PermissionDef[] = [
  { module: 'crm', feature: 'leads', action: 'read' },
  { module: 'crm', feature: 'leads', action: 'create' },
  { module: 'crm', feature: 'leads', action: 'update' },
  { module: 'crm', feature: 'leads', action: 'delete' },
  { module: 'crm', feature: 'leads', action: 'convert' },
  { module: 'crm', feature: 'opportunities', action: 'read' },
  { module: 'crm', feature: 'opportunities', action: 'create' },
  { module: 'crm', feature: 'opportunities', action: 'update' },
  { module: 'crm', feature: 'opportunities', action: 'delete' },
  { module: 'crm', feature: 'activities', action: 'read' },
  { module: 'crm', feature: 'activities', action: 'create' },
  { module: 'crm', feature: 'activities', action: 'update' },
];

const HR_PERMISSIONS: PermissionDef[] = [
  { module: 'hr', feature: 'departments', action: 'read' },
  { module: 'hr', feature: 'departments', action: 'manage' },
  { module: 'hr', feature: 'positions', action: 'read' },
  { module: 'hr', feature: 'positions', action: 'manage' },
  { module: 'hr', feature: 'employees', action: 'read' },
  { module: 'hr', feature: 'employees', action: 'create' },
  { module: 'hr', feature: 'employees', action: 'update' },
  { module: 'hr', feature: 'leave', action: 'read' },
  { module: 'hr', feature: 'leave', action: 'manage' },
  { module: 'hr', feature: 'leave', action: 'create' },
  { module: 'hr', feature: 'leave', action: 'approve' },
  { module: 'hr', feature: 'payroll', action: 'create' },
  { module: 'hr', feature: 'payroll', action: 'post' },
];

const BANK_PERMISSIONS: PermissionDef[] = [
  { module: 'bank', feature: 'accounts', action: 'read' },
  { module: 'bank', feature: 'accounts', action: 'manage' },
  { module: 'bank', feature: 'statements', action: 'read' },
  { module: 'bank', feature: 'statements', action: 'import' },
  { module: 'bank', feature: 'statements', action: 'match' },
  { module: 'bank', feature: 'reconciliations', action: 'create' },
  { module: 'bank', feature: 'reconciliations', action: 'complete' },
];

const APPROVALS_PERMISSIONS: PermissionDef[] = [
  { module: 'approvals', feature: 'workflows', action: 'read' },
  { module: 'approvals', feature: 'workflows', action: 'manage' },
  { module: 'approvals', feature: 'requests', action: 'read' },
  { module: 'approvals', feature: 'requests', action: 'create' },
  { module: 'approvals', feature: 'requests', action: 'decide' },
];

const EVAL_PERMISSIONS: PermissionDef[] = [
  ...CORE_PERMISSIONS,
  ...PMS_PERMISSIONS,
  ...FINANCE_PERMISSIONS,
  ...PARTY_PERMISSIONS,
  ...PROJECTS_PERMISSIONS,
  ...CONSTRUCTION_PERMISSIONS,
  ...CURRENCY_PERMISSIONS,
  ...ASSETS_PERMISSIONS,
  ...CRM_PERMISSIONS,
  ...HR_PERMISSIONS,
  ...BANK_PERMISSIONS,
  ...APPROVALS_PERMISSIONS,
];

const DEFAULT_ACCOUNTS = [
  { code: '1000', name: 'Cash', type: 'asset', normalBalance: 'debit' as const },
  { code: '1010', name: 'Bank', type: 'asset', normalBalance: 'debit' as const },
  { code: '1100', name: 'Accounts Receivable', type: 'asset', normalBalance: 'debit' as const },
  { code: '1200', name: 'Inventory', type: 'asset', normalBalance: 'debit' as const },
  { code: '1500', name: 'Fixed Assets', type: 'asset', normalBalance: 'debit' as const },
  { code: '1510', name: 'Accumulated Depreciation', type: 'asset', normalBalance: 'credit' as const },
  { code: '2000', name: 'Accounts Payable', type: 'liability', normalBalance: 'credit' as const },
  { code: '2100', name: 'Tax Payable', type: 'liability', normalBalance: 'credit' as const },
  { code: '2200', name: 'Salaries Payable', type: 'liability', normalBalance: 'credit' as const },
  { code: '3000', name: 'Owner Equity', type: 'equity', normalBalance: 'credit' as const },
  { code: '4000', name: 'Sales Revenue', type: 'revenue', normalBalance: 'credit' as const },
  { code: '4900', name: 'FX Gain', type: 'revenue', normalBalance: 'credit' as const },
  { code: '5000', name: 'Cost of Goods Sold', type: 'expense', normalBalance: 'debit' as const },
  { code: '5100', name: 'Operating Expenses', type: 'expense', normalBalance: 'debit' as const },
  { code: '5200', name: 'Depreciation Expense', type: 'expense', normalBalance: 'debit' as const },
  { code: '5210', name: 'Gain/Loss on Asset Disposal', type: 'expense', normalBalance: 'debit' as const },
  { code: '5300', name: 'Salaries Expense', type: 'expense', normalBalance: 'debit' as const },
  { code: '5900', name: 'FX Loss', type: 'expense', normalBalance: 'debit' as const },
];

const ACCOUNT_ROLE_MAPPINGS = [
  { role: 'cash', code: '1000' },
  { role: 'bank', code: '1010' },
  { role: 'accounts_receivable', code: '1100' },
  { role: 'inventory', code: '1200' },
  { role: 'fixed_assets', code: '1500' },
  { role: 'accumulated_depreciation', code: '1510' },
  { role: 'accounts_payable', code: '2000' },
  { role: 'tax_payable', code: '2100' },
  { role: 'salary_payable', code: '2200' },
  { role: 'owner_equity', code: '3000' },
  { role: 'revenue', code: '4000' },
  { role: 'fx_gain', code: '4900' },
  { role: 'cost_of_goods_sold', code: '5000' },
  { role: 'operating_expense', code: '5100' },
  { role: 'depreciation_expense', code: '5200' },
  { role: 'asset_disposal_gain_loss', code: '5210' },
  { role: 'salary_expense', code: '5300' },
  { role: 'fx_loss', code: '5900' },
];

const DEFAULT_TENANT_SETTINGS = {
  defaultLocale: 'ar',
  defaultCurrency: 'SAR',
  timezone: 'Asia/Riyadh',
  fiscalYearStart: 1,
  country: 'SA',
};

function assertEvalDatabase(): void {
  assertSeedableDatabase();
}

function permKey(p: PermissionDef): string {
  return `${p.module}:${p.feature}:${p.action}`;
}

function managerPermissions(all: PermissionDef[]): PermissionDef[] {
  return all.filter((p) => {
    const key = permKey(p);
    if (key.startsWith('core:users:')) return p.action === 'read';
    if (key.startsWith('core:roles:')) return p.action === 'read';
    if (key.startsWith('core:tenants:')) return p.action === 'read';
    if (p.module === 'pms') return false;
    return true;
  });
}

function accountantPermissions(all: PermissionDef[]): PermissionDef[] {
  const modules = new Set([
    'accounting',
    'finance',
    'core',
    'parties',
    'sales',
    'purchasing',
    'customers',
    'suppliers',
  ]);
  return all.filter((p) => {
    if (!modules.has(p.module)) return false;
    if (p.module === 'core') {
      return ['dashboard', 'branches', 'settings', 'audit'].includes(p.feature) && p.action === 'read';
    }
    if (p.module === 'sales' || p.module === 'purchasing') return p.action === 'read';
    if (p.module === 'customers' || p.module === 'suppliers') return p.action === 'read';
    return true;
  });
}

function salesPermissions(all: PermissionDef[]): PermissionDef[] {
  const modules = new Set(['sales', 'customers', 'products', 'inventory', 'core', 'warehouses']);
  return all.filter((p) => {
    if (!modules.has(p.module)) return false;
    const key = permKey(p);
    if (p.module === 'core') return key === 'core:dashboard:read' || key === 'core:branches:read';
    if (p.module === 'products' || p.module === 'warehouses') return p.action === 'read';
    if (p.module === 'inventory') {
      return (p.feature === 'stock' || p.feature === 'movements') && p.action === 'read';
    }
    return true;
  });
}

async function seedPermissions(): Promise<void> {
  for (const perm of EVAL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: {
        module_feature_action: {
          module: perm.module,
          feature: perm.feature,
          action: perm.action,
        },
      },
      update: {},
      create: perm,
    });
  }
}

async function enableTenantModules(tenantId: string, moduleIds: string[]): Promise<void> {
  for (const moduleId of moduleIds) {
    await prisma.tenantModuleAccess.upsert({
      where: { tenantId_moduleId: { tenantId, moduleId } },
      update: { enabled: true },
      create: { tenantId, moduleId, enabled: true },
    });
  }
}

async function seedAccountingFoundation(tenantId: string): Promise<void> {
  for (const acc of DEFAULT_ACCOUNTS) {
    await prisma.account.upsert({
      where: { tenantId_code: { tenantId, code: acc.code } },
      update: { normalBalance: acc.normalBalance, isPosting: true },
      create: {
        tenantId,
        code: acc.code,
        name: acc.name,
        type: acc.type,
        normalBalance: acc.normalBalance,
        isPosting: true,
        isSystem: true,
      },
    });
  }

  for (const mapping of ACCOUNT_ROLE_MAPPINGS) {
    const account = await prisma.account.findUnique({
      where: { tenantId_code: { tenantId, code: mapping.code } },
    });
    if (!account) continue;
    await prisma.accountRoleMapping.upsert({
      where: { tenantId_role: { tenantId, role: mapping.role } },
      update: { accountId: account.id },
      create: { tenantId, role: mapping.role, accountId: account.id },
    });
  }

  const fiscalYear = new Date().getFullYear();
  const existingFiscalPeriod = await prisma.fiscalPeriod.findFirst({
    where: {
      tenantId,
      startDate: { lte: new Date(`${fiscalYear}-12-31`) },
      endDate: { gte: new Date(`${fiscalYear}-01-01`) },
    },
  });
  if (!existingFiscalPeriod) {
    await prisma.fiscalPeriod.create({
      data: {
        tenantId,
        name: `FY ${fiscalYear}`,
        startDate: new Date(`${fiscalYear}-01-01`),
        endDate: new Date(`${fiscalYear}-12-31`),
        status: 'open',
        isClosed: false,
      },
    });
  }

  const postingRuleDefinitions = [
    {
      sourceModule: 'sales',
      sourceType: 'invoice',
      event: 'post',
      lines: [
        { sequence: 1, accountRole: 'accounts_receivable', side: 'debit', amountSource: 'total' },
        { sequence: 2, accountRole: 'revenue', side: 'credit', amountSource: 'total' },
        { sequence: 3, accountRole: 'cost_of_goods_sold', side: 'debit', amountSource: 'cogs' },
        { sequence: 4, accountRole: 'inventory', side: 'credit', amountSource: 'cogs' },
      ],
    },
    {
      sourceModule: 'sales',
      sourceType: 'payment',
      event: 'post',
      lines: [
        { sequence: 1, accountRole: 'cash', side: 'debit', amountSource: 'amount' },
        { sequence: 2, accountRole: 'accounts_receivable', side: 'credit', amountSource: 'amount' },
      ],
    },
    {
      sourceModule: 'purchasing',
      sourceType: 'order',
      event: 'receive',
      lines: [
        { sequence: 1, accountRole: 'inventory', side: 'debit', amountSource: 'total' },
        { sequence: 2, accountRole: 'accounts_payable', side: 'credit', amountSource: 'total' },
      ],
    },
    {
      sourceModule: 'pos',
      sourceType: 'sale',
      event: 'post',
      lines: [
        { sequence: 1, accountRole: 'cash', side: 'debit', amountSource: 'cash_portion' },
        { sequence: 2, accountRole: 'revenue', side: 'credit', amountSource: 'total' },
      ],
    },
  ];

  for (const definition of postingRuleDefinitions) {
    const rule = await prisma.postingRule.upsert({
      where: {
        tenantId_sourceModule_sourceType_event: {
          tenantId,
          sourceModule: definition.sourceModule,
          sourceType: definition.sourceType,
          event: definition.event,
        },
      },
      update: { isActive: true },
      create: {
        tenantId,
        sourceModule: definition.sourceModule,
        sourceType: definition.sourceType,
        event: definition.event,
      },
    });

    for (const line of definition.lines) {
      await prisma.postingRuleLine.upsert({
        where: { ruleId_sequence: { ruleId: rule.id, sequence: line.sequence } },
        update: {
          accountRole: line.accountRole,
          side: line.side,
          amountSource: line.amountSource,
        },
        create: {
          ruleId: rule.id,
          sequence: line.sequence,
          accountRole: line.accountRole,
          side: line.side,
          amountSource: line.amountSource,
        },
      });
    }
  }
}

async function upsertRole(
  tenantId: string,
  code: string,
  name: string,
  description: string,
  permissionDefs: PermissionDef[],
): Promise<string> {
  const role = await prisma.role.upsert({
    where: { tenantId_code: { tenantId, code } },
    update: { name, description, isSystem: true },
    create: { tenantId, code, name, description, isSystem: true },
  });

  const permissions = await prisma.permission.findMany({
    where: {
      OR: permissionDefs.map((p) => ({
        module: p.module,
        feature: p.feature,
        action: p.action,
      })),
    },
  });

  for (const permission of permissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      update: {},
      create: { roleId: role.id, permissionId: permission.id },
    });
  }

  return role.id;
}

async function upsertUser(
  tenantId: string,
  branchId: string,
  roleId: string,
  email: string,
  firstName: string,
  lastName: string,
  passwordHash: string,
  isPlatformAdmin = false,
): Promise<string> {
  const user = await prisma.user.upsert({
    where: { tenantId_email: { tenantId, email } },
    update: {
      roleId,
      branchId,
      passwordHash,
      firstName,
      lastName,
      isActive: true,
      isPlatformAdmin,
    },
    create: {
      tenantId,
      branchId,
      roleId,
      email,
      passwordHash,
      firstName,
      lastName,
      locale: 'ar',
      isPlatformAdmin,
    },
  });
  return user.id;
}

async function upsertCustomers(
  tenantId: string,
  branchId: string,
  customers: Array<{ code: string; name: string; email: string; phone: string }>,
): Promise<void> {
  for (const c of customers) {
    await prisma.customer.upsert({
      where: { tenantId_code: { tenantId, code: c.code } },
      update: { name: c.name, email: c.email, phone: c.phone },
      create: { tenantId, branchId, ...c },
    });
  }
}

async function upsertSuppliers(
  tenantId: string,
  suppliers: Array<{ code: string; name: string; email: string; phone: string }>,
): Promise<void> {
  for (const s of suppliers) {
    await prisma.supplier.upsert({
      where: { tenantId_code: { tenantId, code: s.code } },
      update: { name: s.name, email: s.email, phone: s.phone },
      create: { tenantId, ...s },
    });
  }
}

async function seedTradingTenant(passwordHash: string): Promise<void> {
  const tenant = await prisma.tenant.upsert({
    where: { code: 'TRADING_DEMO' },
    update: {
      name: 'Nile Trading Company | شركة النيل للتجارة',
      country: 'EG',
      currency: 'EGP',
      language: 'ar',
      settings: {
        ...DEFAULT_TENANT_SETTINGS,
        defaultCurrency: 'EGP',
        timezone: 'Africa/Cairo',
        country: 'EG',
        taxProfile: {
          countryCode: 'EG',
          defaultTaxMode: 'exclusive',
          roundingMode: 'line',
          categories: [
            { id: 'standard', label: 'Standard VAT', labelAr: 'ضريبة القيمة المضافة', rate: 14, kind: 'standard' },
            { id: 'zero_rated', label: 'Zero Rated', labelAr: 'نسبة صفر', rate: 0, kind: 'zero_rated' },
            { id: 'exempt', label: 'Exempt', labelAr: 'معفى', rate: 0, kind: 'exempt' },
            { id: 'out_of_scope', label: 'Out of Scope', labelAr: ' خارج النطاق', rate: 0, kind: 'out_of_scope' },
          ],
        },
        integrations: {
          eta: { environment: 'sandbox' },
        },
      },
    },
    create: {
      code: 'TRADING_DEMO',
      name: 'Nile Trading Company | شركة النيل للتجارة',
      country: 'EG',
      currency: 'EGP',
      language: 'ar',
      settings: {
        ...DEFAULT_TENANT_SETTINGS,
        defaultCurrency: 'EGP',
        timezone: 'Africa/Cairo',
        country: 'EG',
      },
    },
  });

  const branch = await prisma.branch.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'MAIN' } },
    update: { name: 'Main Warehouse Cairo' },
    create: {
      tenantId: tenant.id,
      code: 'MAIN',
      name: 'Main Warehouse Cairo',
      isDefault: true,
      address: '6th of October City, Giza, Egypt',
    },
  });

  const warehouse = await prisma.warehouse.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'WH-MAIN' } },
    update: { name: 'Main Warehouse Cairo' },
    create: {
      tenantId: tenant.id,
      branchId: branch.id,
      code: 'WH-MAIN',
      name: 'Main Warehouse Cairo',
    },
  });

  const unit = await prisma.unitOfMeasure.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'PCS' } },
    update: {},
    create: { tenantId: tenant.id, name: 'Piece', code: 'PCS', symbol: 'pcs' },
  });

  const category = await prisma.productCategory.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'TRADE' } },
    update: {},
    create: { tenantId: tenant.id, name: 'Trading Goods', code: 'TRADE' },
  });

  const products = [
    { sku: 'NTC-001', name: 'Sunflower Oil 1L | زيت عباد الشمس ١ لتر', costPrice: 45, salePrice: 65 },
    { sku: 'NTC-002', name: 'Basmati Rice 5kg | أرز بسمتي ٥ كجم', costPrice: 180, salePrice: 220 },
    { sku: 'NTC-003', name: 'Tomato Paste 400g | معجون طماطم ٤٠٠ جم', costPrice: 12, salePrice: 18 },
  ];

  for (const p of products) {
    await prisma.product.upsert({
      where: { tenantId_sku: { tenantId: tenant.id, sku: p.sku } },
      update: { name: p.name, costPrice: p.costPrice, salePrice: p.salePrice },
      create: {
        tenantId: tenant.id,
        categoryId: category.id,
        unitId: unit.id,
        sku: p.sku,
        name: p.name,
        costPrice: p.costPrice,
        salePrice: p.salePrice,
        trackInventory: true,
      },
    });
  }

  await upsertCustomers(tenant.id, branch.id, [
    {
      code: 'CUST-001',
      name: 'Al-Masry Market | سوق المصري',
      email: 'orders@almasry-market.eg',
      phone: '+201022334455',
    },
    {
      code: 'CUST-002',
      name: 'Delta Retail Chain | سلسلة دلتا للتجزئة',
      email: 'procurement@delta-retail.eg',
      phone: '+201033445566',
    },
    {
      code: 'CUST-003',
      name: 'Cairo Grocers Co. | شركة بقالة القاهرة',
      email: 'sales@cairo-grocers.eg',
      phone: '+201044556677',
    },
  ]);

  await upsertSuppliers(tenant.id, [
    {
      code: 'SUP-001',
      name: 'Nile Food Industries | صناعات النيل للأغذية',
      email: 'supply@nile-food.eg',
      phone: '+201055667788',
    },
    {
      code: 'SUP-002',
      name: 'Delta Packaging | دلتا للتعبئة والتغليف',
      email: 'orders@delta-pack.eg',
      phone: '+201066778899',
    },
    {
      code: 'SUP-003',
      name: 'Giza Logistics | جيزة للنقل والتخزين',
      email: 'warehouse@giza-logistics.eg',
      phone: '+201077889900',
    },
  ]);

  await seedAccountingFoundation(tenant.id);

  await enableTenantModules(tenant.id, [
    'core',
    'finance',
    'party',
    'products',
    'customers',
    'suppliers',
    'warehouses',
    'inventory',
    'sales',
    'purchasing',
    'accounting',
    'pos',
    'sync',
    'currency',
    'assets',
    'crm',
    'hr',
    'bank',
    'approvals',
  ]);

  const ownerRoleId = await upsertRole(
    tenant.id,
    'owner',
    'Owner',
    'Full system access',
    EVAL_PERMISSIONS,
  );
  const managerRoleId = await upsertRole(
    tenant.id,
    'manager',
    'Manager',
    'Operations and inventory management',
    managerPermissions(EVAL_PERMISSIONS),
  );
  const accountantRoleId = await upsertRole(
    tenant.id,
    'accountant',
    'Accountant',
    'Accounting and finance',
    accountantPermissions(EVAL_PERMISSIONS),
  );
  const salesRoleId = await upsertRole(
    tenant.id,
    'sales',
    'Sales',
    'Sales and customer operations',
    salesPermissions(EVAL_PERMISSIONS),
  );

  const adminUserId = await upsertUser(
    tenant.id,
    branch.id,
    ownerRoleId,
    'admin@fratelanza.local',
    'محمد',
    'السيد',
    passwordHash,
  );
  await upsertUser(tenant.id, branch.id, managerRoleId, 'manager@fratelanza.local', 'سارة', 'حسن', passwordHash);
  await upsertUser(
    tenant.id,
    branch.id,
    accountantRoleId,
    'accountant@fratelanza.local',
    'أحمد',
    'فتحي',
    passwordHash,
  );
  await upsertUser(tenant.id, branch.id, salesRoleId, 'sales@fratelanza.local', 'نور', 'إبراهيم', passwordHash);

  const dbProducts = await prisma.product.findMany({ where: { tenantId: tenant.id } });
  for (const product of dbProducts) {
    await prisma.stockBalance.upsert({
      where: {
        tenantId_warehouseId_productId: {
          tenantId: tenant.id,
          warehouseId: warehouse.id,
          productId: product.id,
        },
      },
      update: { quantity: 250, avgCost: product.costPrice },
      create: {
        tenantId: tenant.id,
        warehouseId: warehouse.id,
        productId: product.id,
        quantity: 250,
        avgCost: product.costPrice,
      },
    });
  }

  const customer = await prisma.customer.findFirst({
    where: { tenantId: tenant.id, code: 'CUST-001' },
  });
  const supplier = await prisma.supplier.findFirst({
    where: { tenantId: tenant.id, code: 'SUP-001' },
  });
  const firstProduct = dbProducts[0];

  if (customer && firstProduct) {
    await prisma.salesInvoice.upsert({
      where: { tenantId_number: { tenantId: tenant.id, number: 'INV-2026-000001' } },
      update: {},
      create: {
        tenantId: tenant.id,
        branchId: branch.id,
        customerId: customer.id,
        warehouseId: warehouse.id,
        number: 'INV-2026-000001',
        status: 'draft',
        subtotal: 220,
        taxAmount: 0,
        total: 220,
        createdById: adminUserId,
        lines: {
          create: [
            {
              productId: firstProduct.id,
              description: firstProduct.name,
              quantity: 10,
              unitPrice: 22,
              lineTotal: 220,
            },
          ],
        },
      },
    });
  }

  if (supplier && firstProduct) {
    await prisma.purchaseOrder.upsert({
      where: { tenantId_number: { tenantId: tenant.id, number: 'PO-2026-000001' } },
      update: {},
      create: {
        tenantId: tenant.id,
        branchId: branch.id,
        supplierId: supplier.id,
        warehouseId: warehouse.id,
        number: 'PO-2026-000001',
        status: 'draft',
        subtotal: 450,
        taxAmount: 0,
        total: 450,
        lines: {
          create: [
            {
              productId: firstProduct.id,
              description: firstProduct.name,
              quantity: 100,
              unitPrice: 4.5,
              lineTotal: 450,
            },
          ],
        },
      },
    });
  }

  const fiscalYear = new Date().getFullYear();
  for (const seq of [
    { documentType: 'INV', prefix: 'INV', nextNumber: 2 },
    { documentType: 'PO', prefix: 'PO', nextNumber: 2 },
  ]) {
    await prisma.numberSequence.upsert({
      where: {
        tenantId_branchId_documentType_fiscalYear: {
          tenantId: tenant.id,
          branchId: branch.id,
          documentType: seq.documentType,
          fiscalYear,
        },
      },
      update: { nextNumber: seq.nextNumber },
      create: {
        tenantId: tenant.id,
        branchId: branch.id,
        documentType: seq.documentType,
        prefix: seq.prefix,
        fiscalYear,
        nextNumber: seq.nextNumber,
        padding: 6,
      },
    });
  }

  console.log('  [TRADING_DEMO] Nile Trading Company — 4 users, 3 products, draft INV + PO');
}

async function seedConstructionTenant(passwordHash: string): Promise<void> {
  const tenant = await prisma.tenant.upsert({
    where: { code: 'CONSTRUCTION_DEMO' },
    update: {
      name: 'Jeddah Construction | شركة جدة للمقاولات',
      country: 'SA',
      currency: 'SAR',
      language: 'ar',
      settings: {
        ...DEFAULT_TENANT_SETTINGS,
        timezone: 'Asia/Riyadh',
        country: 'SA',
        integrations: { zatca: { environment: 'sandbox', certificateStatus: 'not_configured' } },
      },
    },
    create: {
      code: 'CONSTRUCTION_DEMO',
      name: 'Jeddah Construction | شركة جدة للمقاولات',
      country: 'SA',
      currency: 'SAR',
      language: 'ar',
      settings: DEFAULT_TENANT_SETTINGS,
    },
  });

  const branch = await prisma.branch.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'SITE' } },
    update: { name: 'New Cairo Site Office' },
    create: {
      tenantId: tenant.id,
      code: 'SITE',
      name: 'New Cairo Site Office',
      isDefault: true,
      address: 'New Cairo, Cairo Governorate, Egypt',
    },
  });

  const unitKg = await prisma.unitOfMeasure.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'KG' } },
    update: {},
    create: { tenantId: tenant.id, name: 'Kilogram', code: 'KG', symbol: 'kg' },
  });

  const unitTon = await prisma.unitOfMeasure.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'TON' } },
    update: {},
    create: { tenantId: tenant.id, name: 'Ton', code: 'TON', symbol: 't' },
  });

  const category = await prisma.productCategory.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'MATERIALS' } },
    update: {},
    create: { tenantId: tenant.id, name: 'Construction Materials', code: 'MATERIALS' },
  });

  const materials = [
    {
      sku: 'MAT-CEM',
      name: 'Portland Cement 50kg | أسمنت بورتلاند ٥٠ كجم',
      unitId: unitKg.id,
      costPrice: 85,
      salePrice: 95,
    },
    {
      sku: 'MAT-REB',
      name: 'Steel Rebar 12mm | حديد تسليح ١٢ مم',
      unitId: unitTon.id,
      costPrice: 28000,
      salePrice: 29500,
    },
    {
      sku: 'MAT-BRK',
      name: 'Red Clay Bricks | طوب أحمر',
      unitId: unitKg.id,
      costPrice: 2.5,
      salePrice: 3.5,
    },
  ];

  for (const m of materials) {
    await prisma.product.upsert({
      where: { tenantId_sku: { tenantId: tenant.id, sku: m.sku } },
      update: { name: m.name, costPrice: m.costPrice, salePrice: m.salePrice },
      create: {
        tenantId: tenant.id,
        categoryId: category.id,
        unitId: m.unitId,
        sku: m.sku,
        name: m.name,
        costPrice: m.costPrice,
        salePrice: m.salePrice,
        trackInventory: true,
      },
    });
  }

  const clientCustomers = [
    {
      code: 'OWNER-001',
      name: 'Future Development Co. | شركة المستقبل للتطوير العقاري',
      email: 'projects@future-dev.eg',
      phone: '+201088990011',
      partyCode: 'PTY-OWNER-001',
      partyType: 'organization' as const,
    },
    {
      code: 'OWNER-002',
      name: 'Elite Housing Foundation | مؤسسة النخبة للإسكان',
      email: 'contracts@elite-housing.eg',
      phone: '+201099001122',
      partyCode: 'PTY-OWNER-002',
      partyType: 'organization' as const,
    },
    {
      code: 'OWNER-003',
      name: 'Mr. Ahmed Mahmoud | السيد أحمد محمود',
      email: 'ahmed.mahmoud@example.eg',
      phone: '+201010112233',
      partyCode: 'PTY-OWNER-003',
      partyType: 'individual' as const,
    },
  ];

  let primaryOwnerPartyId: string | undefined;

  for (const c of clientCustomers) {
    const party = await prisma.party.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: c.partyCode } },
      update: { displayName: c.name, email: c.email, phone: c.phone },
      create: {
        tenantId: tenant.id,
        type: c.partyType,
        code: c.partyCode,
        displayName: c.name,
        legalName: c.name,
        email: c.email,
        phone: c.phone,
      },
    });

    await prisma.partyRole.upsert({
      where: { tenantId_partyId_role: { tenantId: tenant.id, partyId: party.id, role: 'customer' } },
      update: { isActive: true },
      create: { tenantId: tenant.id, partyId: party.id, role: 'customer' },
    });

    await prisma.customer.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: c.code } },
      update: { name: c.name, email: c.email, phone: c.phone, partyId: party.id },
      create: {
        tenantId: tenant.id,
        branchId: branch.id,
        partyId: party.id,
        code: c.code,
        name: c.name,
        email: c.email,
        phone: c.phone,
      },
    });

    if (c.code === 'OWNER-001') primaryOwnerPartyId = party.id;
  }

  await upsertSuppliers(tenant.id, [
    {
      code: 'SUP-STL',
      name: 'Egypt Steel Co. | شركة الحديد المصري',
      email: 'sales@egypt-steel.eg',
      phone: '+201011223344',
    },
    {
      code: 'SUP-CEM',
      name: 'Sinai Cement | أسمنت سيناء',
      email: 'orders@sinai-cement.eg',
      phone: '+201022334455',
    },
    {
      code: 'SUP-EQP',
      name: 'Cairo Equipment Rental | تأجير معدات القاهرة',
      email: 'rental@cairo-equip.eg',
      phone: '+201033445566',
    },
  ]);

  await seedAccountingFoundation(tenant.id);

  await enableTenantModules(tenant.id, [
    'core',
    'finance',
    'party',
    'products',
    'customers',
    'suppliers',
    'warehouses',
    'inventory',
    'purchasing',
    'accounting',
    'projects',
    'construction',
    'currency',
    'assets',
    'crm',
    'hr',
    'bank',
    'approvals',
  ]);

  const ownerRoleId = await upsertRole(
    tenant.id,
    'owner',
    'Owner',
    'Full system access',
    EVAL_PERMISSIONS,
  );

  const adminUserId = await upsertUser(
    tenant.id,
    branch.id,
    ownerRoleId,
    'constr-admin@fratelanza.local',
    'خالد',
    'عبدالله',
    passwordHash,
  );

  const project = await prisma.project.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'PRJ-ZAHRA' } },
    update: {
      name: 'Zahra Towers Project | مشروع أبراج الزهراء',
      status: 'active',
      customerPartyId: primaryOwnerPartyId,
      managerUserId: adminUserId,
    },
    create: {
      tenantId: tenant.id,
      branchId: branch.id,
      code: 'PRJ-ZAHRA',
      name: 'Zahra Towers Project | مشروع أبراج الزهراء',
      description: 'Residential towers — 3 buildings, New Cairo',
      status: 'active',
      startDate: new Date('2026-01-15'),
      endDate: new Date('2027-12-31'),
      customerPartyId: primaryOwnerPartyId,
      managerUserId: adminUserId,
    },
  });

  const costCenters = [
    { code: 'CC-STRUCT', name: 'Structural Works | أعمال الهيكل' },
    { code: 'CC-FINISH', name: 'Finishing | التشطيبات' },
    { code: 'CC-MEP', name: 'MEP | الكهروميكانيك' },
  ];

  for (const cc of costCenters) {
    await prisma.costCenter.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: cc.code } },
      update: { name: cc.name, projectId: project.id, isActive: true },
      create: {
        tenantId: tenant.id,
        branchId: branch.id,
        projectId: project.id,
        code: cc.code,
        name: cc.name,
        description: `${cc.name} cost center for ${project.name}`,
      },
    });
  }

  await prisma.constructionProjectProfile.upsert({
    where: { projectId: project.id },
    update: {
      notes:
        'Evaluation demo: lump-sum residential towers with structural, finishing, and MEP cost centers.',
    },
    create: {
      tenantId: tenant.id,
      projectId: project.id,
      createdById: adminUserId,
      notes:
        'Evaluation demo: lump-sum residential towers with structural, finishing, and MEP cost centers.',
    },
  });

  console.log('  [CONSTRUCTION_DEMO] Ahram Construction — 1 project, 3 cost centers, construction profile');
}

async function seedServicesTenant(passwordHash: string): Promise<void> {
  const tenant = await prisma.tenant.upsert({
    where: { code: 'SERVICES_DEMO' },
    update: {
      name: 'Riyadh Professional Services | مكتب الرياض للخدمات المهنية',
      country: 'SA',
      currency: 'SAR',
      language: 'ar',
      settings: {
        ...DEFAULT_TENANT_SETTINGS,
        timezone: 'Asia/Riyadh',
        country: 'SA',
      },
    },
    create: {
      code: 'SERVICES_DEMO',
      name: 'Riyadh Professional Services | مكتب الرياض للخدمات المهنية',
      country: 'SA',
      currency: 'SAR',
      language: 'ar',
      settings: DEFAULT_TENANT_SETTINGS,
    },
  });

  const branch = await prisma.branch.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'HQ' } },
    update: { name: 'Dokki Head Office' },
    create: {
      tenantId: tenant.id,
      code: 'HQ',
      name: 'Dokki Head Office',
      isDefault: true,
      address: 'Dokki, Giza, Egypt',
    },
  });

  const unitHr = await prisma.unitOfMeasure.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'HR' } },
    update: {},
    create: { tenantId: tenant.id, name: 'Hour', code: 'HR', symbol: 'hr' },
  });

  const category = await prisma.productCategory.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'SERVICES' } },
    update: {},
    create: { tenantId: tenant.id, name: 'Professional Services', code: 'SERVICES' },
  });

  const services = [
    {
      sku: 'SRV-CONS',
      name: 'Management Consulting | استشارات إدارية',
      costPrice: 0,
      salePrice: 1500,
    },
    {
      sku: 'SRV-LEGAL',
      name: 'Legal Advisory | استشارات قانونية',
      costPrice: 0,
      salePrice: 2000,
    },
    {
      sku: 'SRV-TAX',
      name: 'Tax Filing Service | إعداد الإقرارات الضريبية',
      costPrice: 0,
      salePrice: 3500,
    },
  ];

  for (const s of services) {
    await prisma.product.upsert({
      where: { tenantId_sku: { tenantId: tenant.id, sku: s.sku } },
      update: { name: s.name, costPrice: s.costPrice, salePrice: s.salePrice },
      create: {
        tenantId: tenant.id,
        categoryId: category.id,
        unitId: unitHr.id,
        sku: s.sku,
        name: s.name,
        type: 'service',
        costPrice: s.costPrice,
        salePrice: s.salePrice,
        trackInventory: false,
      },
    });
  }

  await upsertCustomers(tenant.id, branch.id, [
    {
      code: 'CLI-001',
      name: 'Orion Tech Solutions | أوريون للتقنية',
      email: 'finance@orion-tech.eg',
      phone: '+201044556677',
    },
    {
      code: 'CLI-002',
      name: 'Green Valley Farms | مزارع الوادي الأخضر',
      email: 'admin@green-valley.eg',
      phone: '+201055667788',
    },
    {
      code: 'CLI-003',
      name: 'Crescent Trading Group | مجموعة الهلال للتجارة',
      email: 'accounts@crescent-trading.eg',
      phone: '+201066778899',
    },
  ]);

  await upsertSuppliers(tenant.id, [
    {
      code: 'SUP-SW',
      name: 'CloudSoft Licenses | تراخيص كلاود سوفت',
      email: 'billing@cloudsoft.eg',
      phone: '+201077889900',
    },
    {
      code: 'SUP-OFF',
      name: 'Cairo Office Supplies | مستلزمات مكتبية القاهرة',
      email: 'orders@cairo-office.eg',
      phone: '+201088990011',
    },
  ]);

  await seedAccountingFoundation(tenant.id);

  await enableTenantModules(tenant.id, [
    'core',
    'finance',
    'party',
    'products',
    'customers',
    'suppliers',
    'accounting',
    'sales',
    'currency',
    'assets',
    'crm',
    'hr',
    'bank',
    'approvals',
  ]);

  const ownerRoleId = await upsertRole(
    tenant.id,
    'owner',
    'Owner',
    'Full system access',
    EVAL_PERMISSIONS,
  );

  await upsertUser(
    tenant.id,
    branch.id,
    ownerRoleId,
    'serv-admin@fratelanza.local',
    'ليلى',
    'محمود',
    passwordHash,
  );

  console.log('  [SERVICES_DEMO] Hilal Professional Services — 3 service products, accounting foundation');
}

async function seedPlatformAdmin(passwordHash: string): Promise<void> {
  const tenant = await prisma.tenant.upsert({
    where: { code: 'FRATELANZA_PLATFORM' },
    update: {
      name: 'Fratelanza Platform',
      displayName: 'Fratelanza Control Center',
      country: 'SA',
      currency: 'SAR',
      language: 'ar',
      status: 'ACTIVE',
    },
    create: {
      code: 'FRATELANZA_PLATFORM',
      name: 'Fratelanza Platform',
      displayName: 'Fratelanza Control Center',
      country: 'SA',
      currency: 'SAR',
      language: 'ar',
      status: 'ACTIVE',
      settings: DEFAULT_TENANT_SETTINGS,
    },
  });

  const branch = await prisma.branch.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'HQ' } },
    update: { name: 'Platform HQ' },
    create: {
      tenantId: tenant.id,
      code: 'HQ',
      name: 'Platform HQ',
      isDefault: true,
    },
  });

  const ownerRoleId = await upsertRole(
    tenant.id,
    'platform-admin',
    'Platform Administrator',
    'Full platform control center access',
    EVAL_PERMISSIONS,
  );

  await upsertUser(
    tenant.id,
    branch.id,
    ownerRoleId,
    'platform-admin@fratelanza.local',
    'Platform',
    'Admin',
    passwordHash,
    true,
  );

  console.log('  [PLATFORM] platform-admin@fratelanza.local (isPlatformAdmin=true)');
}

async function seedDemoEnvironments(): Promise<void> {
  const tenantCountry: Record<string, { country: string; currency: string }> = {
    TRADING_DEMO: { country: 'EG', currency: 'EGP' },
    CONSTRUCTION_DEMO: { country: 'SA', currency: 'SAR' },
    SERVICES_DEMO: { country: 'SA', currency: 'SAR' },
  };

  const demos: Array<{
    slug: string;
    name: string;
    tenantCode: string;
    demoUserEmail: string;
    modules: string[];
  }> = [
    {
      slug: 'egypt/trading',
      name: 'Cairo Trading Company',
      tenantCode: 'TRADING_DEMO',
      demoUserEmail: 'admin@fratelanza.local',
      modules: ['dashboard', 'sales', 'purchasing', 'inventory', 'customers', 'suppliers', 'accounting', 'reports', 'crm', 'hr', 'currency', 'bank', 'assets', 'approvals'],
    },
    {
      slug: 'egypt/construction',
      name: 'Cairo Construction Demo',
      tenantCode: 'CONSTRUCTION_DEMO',
      demoUserEmail: 'constr-admin@fratelanza.local',
      modules: ['dashboard', 'projects', 'construction', 'purchasing', 'inventory', 'accounting', 'reports'],
    },
    {
      slug: 'egypt/restaurant',
      name: 'Egypt Restaurant Demo',
      tenantCode: 'TRADING_DEMO',
      demoUserEmail: 'admin@fratelanza.local',
      modules: ['dashboard', 'restaurant', 'pos', 'inventory', 'sales', 'reports'],
    },
    {
      slug: 'saudi/trading',
      name: 'Riyadh Trading Company',
      tenantCode: 'TRADING_DEMO',
      demoUserEmail: 'admin@fratelanza.local',
      modules: ['dashboard', 'sales', 'purchasing', 'inventory', 'customers', 'suppliers', 'accounting', 'reports'],
    },
    {
      slug: 'saudi/construction',
      name: 'Jeddah Construction Company',
      tenantCode: 'CONSTRUCTION_DEMO',
      demoUserEmail: 'constr-admin@fratelanza.local',
      modules: ['dashboard', 'projects', 'construction', 'purchasing', 'inventory', 'accounting', 'reports'],
    },
    {
      slug: 'saudi/restaurant',
      name: 'Saudi Restaurant Demo',
      tenantCode: 'TRADING_DEMO',
      demoUserEmail: 'admin@fratelanza.local',
      modules: ['dashboard', 'restaurant', 'pos', 'inventory', 'sales', 'reports'],
    },
    {
      slug: 'trading',
      name: 'Cairo Trading Company',
      tenantCode: 'TRADING_DEMO',
      demoUserEmail: 'admin@fratelanza.local',
      modules: ['dashboard', 'sales', 'purchasing', 'inventory', 'customers', 'suppliers', 'accounting', 'reports'],
    },
    {
      slug: 'construction',
      name: 'Jeddah Construction Company',
      tenantCode: 'CONSTRUCTION_DEMO',
      demoUserEmail: 'constr-admin@fratelanza.local',
      modules: ['dashboard', 'projects', 'construction', 'purchasing', 'inventory', 'accounting', 'reports'],
    },
    {
      slug: 'restaurant',
      name: 'Egypt Restaurant Demo',
      tenantCode: 'TRADING_DEMO',
      demoUserEmail: 'admin@fratelanza.local',
      modules: ['dashboard', 'restaurant', 'pos', 'inventory', 'sales', 'reports'],
    },
    {
      slug: 'services',
      name: 'Riyadh Professional Services',
      tenantCode: 'SERVICES_DEMO',
      demoUserEmail: 'serv-admin@fratelanza.local',
      modules: ['dashboard', 'sales', 'customers', 'accounting', 'reports'],
    },
  ];

  const configuredTenants = new Set<string>();

  for (const demo of demos) {
    const tenant = await prisma.tenant.findUnique({ where: { code: demo.tenantCode } });
    if (!tenant) continue;

    const demoUser = await prisma.user.findFirst({
      where: { tenantId: tenant.id, email: demo.demoUserEmail },
    });

    const countryConfig = tenantCountry[demo.tenantCode];
    if (countryConfig && !configuredTenants.has(tenant.id)) {
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: {
          isDemo: true,
          country: countryConfig.country,
          currency: countryConfig.currency,
          language: 'ar',
        },
      });
      configuredTenants.add(tenant.id);
    }

    await prisma.demoEnvironment.upsert({
      where: { slug: demo.slug },
      update: {
        name: demo.name,
        enabled: true,
        modules: demo.modules,
        demoUserId: demoUser?.id,
      },
      create: {
        slug: demo.slug,
        name: demo.name,
        tenantId: tenant.id,
        enabled: true,
        modules: demo.modules,
        demoUserId: demoUser?.id,
      },
    });
  }

  console.log('  [DEMOS] /demo/egypt/* and /demo/saudi/* plus legacy slugs');
}

export async function main(): Promise<void> {
  assertEvalDatabase();

  const demoPassword = process.env.DEMO_SEED_PASSWORD ?? 'Eval@2026!Demo';
  const passwordHash = await bcrypt.hash(demoPassword, 12);

  console.log('Seeding evaluation database (fratelanza_eval)...');
  console.log(`  Permissions: ${EVAL_PERMISSIONS.length} (license perms excluded)`);

  await seedPermissions();

  await seedTradingTenant(passwordHash);
  await seedConstructionTenant(passwordHash);
  await seedServicesTenant(passwordHash);
  await seedPlatformAdmin(passwordHash);
  await seedDemoEnvironments();

  console.log('');
  console.log('Generating realistic demo volume (all verticals)...');
  const volumeStats = await generateAllVerticalDemoVolumes(prisma);
  for (const [code, stats] of Object.entries(volumeStats)) {
    if (typeof stats === 'number') continue;
    console.log(
      `  [VOLUME/${code}] products=${stats.products} customers=${stats.customers} invoices=${stats.salesInvoices} POs=${stats.purchaseOrders} payments=${stats.customerPayments} movements=${stats.inventoryMovements}${stats.posSales ? ` pos=${stats.posSales}` : ''}`,
    );
  }

  console.log('');
  console.log('Seeding world ERP module samples (CRM, HR, assets, bank, currency, approvals)...');
  await seedWorldErpDemoSamples(prisma, 'TRADING_DEMO');
  await seedWorldErpDemoSamples(prisma, 'CONSTRUCTION_DEMO');
  await seedWorldErpDemoSamples(prisma, 'SERVICES_DEMO');

  console.log('');
  console.log('Evaluation seed completed.');
  console.log('  Tenants: TRADING_DEMO, CONSTRUCTION_DEMO, SERVICES_DEMO, FRATELANZA_PLATFORM');
  console.log(`  Password (all demo users): ${demoPassword}`);
  console.log('  Trading users: admin, manager, accountant, sales');
  console.log('  Construction admin: constr-admin');
  console.log('  Services admin: serv-admin');
  console.log('  Platform admin: platform-admin');
  console.log('  Demo links:');
  console.log('    /demo/egypt/trading  /demo/egypt/construction  /demo/egypt/restaurant');
  console.log('    /demo/saudi/trading  /demo/saudi/construction  /demo/saudi/restaurant');
  console.log('    /demo/trading  /demo/construction  /demo/restaurant  /demo/services');
}

function isExecutedDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(entry).href;
  } catch {
    return entry.replace(/\\/g, '/').includes('seed-eval');
  }
}

if (isExecutedDirectly()) {
  main()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
