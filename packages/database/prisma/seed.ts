import { PrismaClient } from '../generated/server';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const CORE_PERMISSIONS = [
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
  { module: 'core', feature: 'license', action: 'read' },
  { module: 'core', feature: 'license', action: 'manage' },
  // Products
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
  // Customers
  { module: 'customers', feature: 'customers', action: 'read' },
  { module: 'customers', feature: 'customers', action: 'create' },
  { module: 'customers', feature: 'customers', action: 'update' },
  { module: 'customers', feature: 'customers', action: 'delete' },
  // Suppliers
  { module: 'suppliers', feature: 'suppliers', action: 'read' },
  { module: 'suppliers', feature: 'suppliers', action: 'create' },
  { module: 'suppliers', feature: 'suppliers', action: 'update' },
  { module: 'suppliers', feature: 'suppliers', action: 'delete' },
  // Warehouses
  { module: 'warehouses', feature: 'warehouses', action: 'read' },
  { module: 'warehouses', feature: 'warehouses', action: 'create' },
  { module: 'warehouses', feature: 'warehouses', action: 'update' },
  { module: 'warehouses', feature: 'warehouses', action: 'delete' },
  // Inventory
  { module: 'inventory', feature: 'movements', action: 'read' },
  { module: 'inventory', feature: 'stock', action: 'read' },
  { module: 'inventory', feature: 'stock', action: 'adjust' },
  // Sales
  { module: 'sales', feature: 'invoices', action: 'read' },
  { module: 'sales', feature: 'invoices', action: 'create' },
  { module: 'sales', feature: 'invoices', action: 'post' },
  { module: 'sales', feature: 'payments', action: 'create' },
  // Purchasing
  { module: 'purchasing', feature: 'orders', action: 'read' },
  { module: 'purchasing', feature: 'orders', action: 'create' },
  { module: 'purchasing', feature: 'orders', action: 'receive' },
  // Accounting
  { module: 'accounting', feature: 'accounts', action: 'read' },
  { module: 'accounting', feature: 'accounts', action: 'create' },
  { module: 'accounting', feature: 'accounts', action: 'update' },
  { module: 'accounting', feature: 'journals', action: 'read' },
  { module: 'accounting', feature: 'reports', action: 'read' },
  { module: 'accounting', feature: 'coa', action: 'seed' },
  // POS
  { module: 'pos', feature: 'shifts', action: 'open' },
  { module: 'pos', feature: 'shifts', action: 'close' },
  { module: 'pos', feature: 'sales', action: 'create' },
  // Sync
  { module: 'sync', feature: 'sync', action: 'push' },
  { module: 'sync', feature: 'sync', action: 'pull' },
];

const PMS_PERMISSIONS = [
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

const FINANCE_PERMISSIONS = [
  { module: 'finance', feature: 'coa', action: 'read' },
  { module: 'finance', feature: 'coa', action: 'manage' },
  { module: 'finance', feature: 'periods', action: 'read' },
  { module: 'finance', feature: 'periods', action: 'manage' },
  { module: 'finance', feature: 'posting', action: 'read' },
  { module: 'finance', feature: 'posting', action: 'execute' },
  { module: 'finance', feature: 'journals', action: 'read' },
  { module: 'finance', feature: 'setup', action: 'seed' },
];

const PARTY_PERMISSIONS = [
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

const PROJECTS_PERMISSIONS = [
  { module: 'projects', feature: 'projects', action: 'read' },
  { module: 'projects', feature: 'projects', action: 'create' },
  { module: 'projects', feature: 'projects', action: 'update' },
  { module: 'projects', feature: 'projects', action: 'archive' },
  { module: 'projects', feature: 'cost-centers', action: 'read' },
  { module: 'projects', feature: 'cost-centers', action: 'manage' },
];

const CONSTRUCTION_PERMISSIONS = [
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
];

const ALL_PERMISSIONS = [
  ...CORE_PERMISSIONS,
  ...PMS_PERMISSIONS,
  ...FINANCE_PERMISSIONS,
  ...PARTY_PERMISSIONS,
  ...PROJECTS_PERMISSIONS,
  ...CONSTRUCTION_PERMISSIONS,
];

const DEFAULT_ACCOUNTS = [
  { code: '1000', name: 'Cash', type: 'asset', normalBalance: 'debit' as const },
  { code: '1100', name: 'Accounts Receivable', type: 'asset', normalBalance: 'debit' as const },
  { code: '1200', name: 'Inventory', type: 'asset', normalBalance: 'debit' as const },
  { code: '2000', name: 'Accounts Payable', type: 'liability', normalBalance: 'credit' as const },
  { code: '2100', name: 'Tax Payable', type: 'liability', normalBalance: 'credit' as const },
  { code: '3000', name: 'Owner Equity', type: 'equity', normalBalance: 'credit' as const },
  { code: '4000', name: 'Sales Revenue', type: 'revenue', normalBalance: 'credit' as const },
  { code: '5000', name: 'Cost of Goods Sold', type: 'expense', normalBalance: 'debit' as const },
  { code: '5100', name: 'Operating Expenses', type: 'expense', normalBalance: 'debit' as const },
];

const ACCOUNT_ROLE_MAPPINGS = [
  { role: 'cash', code: '1000' },
  { role: 'accounts_receivable', code: '1100' },
  { role: 'inventory', code: '1200' },
  { role: 'accounts_payable', code: '2000' },
  { role: 'tax_payable', code: '2100' },
  { role: 'owner_equity', code: '3000' },
  { role: 'revenue', code: '4000' },
  { role: 'cost_of_goods_sold', code: '5000' },
  { role: 'operating_expense', code: '5100' },
];

const DEMO_LICENSE_MODULES = [
  'core', 'finance', 'party', 'products', 'customers', 'suppliers',
  'warehouses', 'inventory', 'sales', 'purchasing', 'accounting', 'pos', 'sync', 'pms', 'projects',
];

const DEMO_LICENSE_FEATURES = [
  'finance.general-ledger',
  'finance.fiscal-periods',
  'finance.financial-posting',
  'sales.invoices',
  'sales.quotations',
  'pms.patients',
  'pms.ledger',
];

async function seedTenantLicense(prisma: PrismaClient, tenantId: string) {
  const licenseKey = `FRZ-DEMO-${tenantId.slice(0, 8).toUpperCase()}`;
  const license = await prisma.tenantLicense.upsert({
    where: { tenantId },
    update: {
      status: 'active',
      licenseType: 'perpetual',
      edition: 'enterprise',
      activatedAt: new Date(),
      expiresAt: null,
      graceEndsAt: null,
      maxUsers: 100,
      maxBranches: 20,
      maxDevices: 50,
    },
    create: {
      tenantId,
      licenseKey,
      licenseType: 'perpetual',
      edition: 'enterprise',
      status: 'active',
      activatedAt: new Date(),
      maxUsers: 100,
      maxBranches: 20,
      maxDevices: 50,
    },
  });

  await prisma.licenseModuleEntitlement.deleteMany({ where: { licenseId: license.id } });
  await prisma.licenseFeatureEntitlement.deleteMany({ where: { licenseId: license.id } });

  await prisma.licenseModuleEntitlement.createMany({
    data: DEMO_LICENSE_MODULES.map((moduleKey) => ({
      tenantId,
      licenseId: license.id,
      moduleKey,
      termType: 'perpetual',
      isEnabled: true,
    })),
  });

  await prisma.licenseFeatureEntitlement.createMany({
    data: DEMO_LICENSE_FEATURES.map((featureKey) => ({
      tenantId,
      licenseId: license.id,
      featureKey,
      isEnabled: true,
    })),
  });
}

async function main() {
  console.log('Seeding database...');

  for (const perm of ALL_PERMISSIONS) {
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

  const tenant = await prisma.tenant.upsert({
    where: { code: 'FRATELANZA' },
    update: {},
    create: {
      name: 'Fratelanza Demo Company',
      code: 'FRATELANZA',
      settings: {
        defaultLocale: 'en',
        defaultCurrency: 'EGP',
        timezone: 'Africa/Cairo',
        fiscalYearStart: 1,
        pms: {
          allowCreditBalance: false,
          maxDiscountPercent: 10,
          maxDiscountAmount: 500,
          requireApprovalAbovePercent: 20,
        },
      },
    },
  });

  const branch = await prisma.branch.upsert({
    where: {
      tenantId_code: { tenantId: tenant.id, code: 'HQ' },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Head Office',
      code: 'HQ',
      isDefault: true,
      address: 'Cairo, Egypt',
    },
  });

  const warehouse = await prisma.warehouse.upsert({
    where: {
      tenantId_code: { tenantId: tenant.id, code: 'WH-HQ' },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      branchId: branch.id,
      name: 'Main Warehouse',
      code: 'WH-HQ',
    },
  });

  const unit = await prisma.unitOfMeasure.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'PCS' } },
    update: {},
    create: { tenantId: tenant.id, name: 'Piece', code: 'PCS', symbol: 'pcs' },
  });

  const category = await prisma.productCategory.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'GENERAL' } },
    update: {},
    create: { tenantId: tenant.id, name: 'General', code: 'GENERAL' },
  });

  const sampleProducts = [
    { sku: 'PROD-001', name: 'Widget A', costPrice: 50, salePrice: 100 },
    { sku: 'PROD-002', name: 'Widget B', costPrice: 75, salePrice: 150 },
    { sku: 'PROD-003', name: 'Widget C', costPrice: 30, salePrice: 60 },
  ];

  for (const p of sampleProducts) {
    await prisma.product.upsert({
      where: { tenantId_sku: { tenantId: tenant.id, sku: p.sku } },
      update: {},
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

  const sampleCustomers = [
    { code: 'CUST-001', name: 'Acme Trading Co.', email: 'acme@example.com', phone: '+20100000001' },
    { code: 'CUST-002', name: 'Beta Retail Ltd.', email: 'beta@example.com', phone: '+20100000002' },
  ];

  for (const c of sampleCustomers) {
    await prisma.customer.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: c.code } },
      update: {},
      create: { tenantId: tenant.id, branchId: branch.id, ...c },
    });
  }

  await prisma.supplier.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'SUP-001' } },
    update: {},
    create: {
      tenantId: tenant.id,
      code: 'SUP-001',
      name: 'Global Supplies Inc.',
      email: 'orders@globalsupplies.com',
      phone: '+20100000003',
    },
  });

  for (const acc of DEFAULT_ACCOUNTS) {
    await prisma.account.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: acc.code } },
      update: {
        normalBalance: acc.normalBalance,
        isPosting: true,
      },
      create: {
        tenantId: tenant.id,
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
      where: { tenantId_code: { tenantId: tenant.id, code: mapping.code } },
    });
    if (!account) continue;
    await prisma.accountRoleMapping.upsert({
      where: { tenantId_role: { tenantId: tenant.id, role: mapping.role } },
      update: { accountId: account.id },
      create: { tenantId: tenant.id, role: mapping.role, accountId: account.id },
    });
  }

  const fiscalYear = new Date().getFullYear();
  const existingFiscalPeriod = await prisma.fiscalPeriod.findFirst({
    where: {
      tenantId: tenant.id,
      startDate: { lte: new Date(`${fiscalYear}-12-31`) },
      endDate: { gte: new Date(`${fiscalYear}-01-01`) },
    },
  });
  if (!existingFiscalPeriod) {
    await prisma.fiscalPeriod.create({
      data: {
        tenantId: tenant.id,
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
      sourceModule: 'sales', sourceType: 'invoice', event: 'post',
      lines: [
        { sequence: 1, accountRole: 'accounts_receivable', side: 'debit', amountSource: 'total' },
        { sequence: 2, accountRole: 'revenue', side: 'credit', amountSource: 'total' },
        { sequence: 3, accountRole: 'cost_of_goods_sold', side: 'debit', amountSource: 'cogs' },
        { sequence: 4, accountRole: 'inventory', side: 'credit', amountSource: 'cogs' },
      ],
    },
    {
      sourceModule: 'sales', sourceType: 'payment', event: 'post',
      lines: [
        { sequence: 1, accountRole: 'cash', side: 'debit', amountSource: 'amount' },
        { sequence: 2, accountRole: 'accounts_receivable', side: 'credit', amountSource: 'amount' },
      ],
    },
    {
      sourceModule: 'purchasing', sourceType: 'order', event: 'receive',
      lines: [
        { sequence: 1, accountRole: 'inventory', side: 'debit', amountSource: 'total' },
        { sequence: 2, accountRole: 'accounts_payable', side: 'credit', amountSource: 'total' },
      ],
    },
    {
      sourceModule: 'pos', sourceType: 'sale', event: 'post',
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
          tenantId: tenant.id,
          sourceModule: definition.sourceModule,
          sourceType: definition.sourceType,
          event: definition.event,
        },
      },
      update: { isActive: true },
      create: {
        tenantId: tenant.id,
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

  const allPermissions = await prisma.permission.findMany();

  const ownerRole = await prisma.role.upsert({
    where: {
      tenantId_code: { tenantId: tenant.id, code: 'owner' },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Owner',
      code: 'owner',
      description: 'Full system access',
      isSystem: true,
    },
  });

  for (const permission of allPermissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: ownerRole.id,
          permissionId: permission.id,
        },
      },
      update: {},
      create: {
        roleId: ownerRole.id,
        permissionId: permission.id,
      },
    });
  }

  const passwordHash = await bcrypt.hash('Admin@123456', 12);

  await prisma.user.upsert({
    where: {
      tenantId_email: { tenantId: tenant.id, email: 'admin@fratelanza.local' },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      branchId: branch.id,
      roleId: ownerRole.id,
      email: 'admin@fratelanza.local',
      passwordHash,
      firstName: 'System',
      lastName: 'Administrator',
      locale: 'en',
    },
  });

  await prisma.tenantModule.upsert({
    where: {
      tenantId_moduleId: { tenantId: tenant.id, moduleId: 'core' },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      moduleId: 'core',
      isEnabled: true,
    },
  });

  const erpModules = [
    'products', 'customers', 'suppliers', 'warehouses', 'inventory',
    'sales', 'purchasing', 'accounting', 'pos', 'sync',
  ];
  for (const moduleId of [...erpModules, 'pms', 'finance', 'party', 'projects']) {
    await prisma.tenantModule.upsert({
      where: { tenantId_moduleId: { tenantId: tenant.id, moduleId } },
      update: { isEnabled: true },
      create: { tenantId: tenant.id, moduleId, isEnabled: true },
    });
  }

  await seedTenantLicense(prisma, tenant.id);

  const products = await prisma.product.findMany({ where: { tenantId: tenant.id } });
  for (const product of products) {
    await prisma.stockBalance.upsert({
      where: {
        tenantId_warehouseId_productId: {
          tenantId: tenant.id,
          warehouseId: warehouse.id,
          productId: product.id,
        },
      },
      update: { quantity: 100, avgCost: product.costPrice },
      create: {
        tenantId: tenant.id,
        warehouseId: warehouse.id,
        productId: product.id,
        quantity: 100,
        avgCost: product.costPrice,
      },
    });
  }

  const customer = await prisma.customer.findFirst({ where: { tenantId: tenant.id, code: 'CUST-001' } });
  const supplier = await prisma.supplier.findFirst({ where: { tenantId: tenant.id, code: 'SUP-001' } });
  const adminUser = await prisma.user.findFirst({ where: { tenantId: tenant.id, email: 'admin@fratelanza.local' } });
  const firstProduct = products[0];

  if (customer && firstProduct && adminUser) {
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
        subtotal: 100,
        taxAmount: 0,
        total: 100,
        createdById: adminUser.id,
        lines: {
          create: [{
            productId: firstProduct.id,
            description: firstProduct.name,
            quantity: 1,
            unitPrice: 100,
            lineTotal: 100,
          }],
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
        subtotal: 50,
        taxAmount: 0,
        total: 50,
        lines: {
          create: [{
            productId: firstProduct.id,
            description: firstProduct.name,
            quantity: 10,
            unitPrice: 5,
            lineTotal: 50,
          }],
        },
      },
    });
  }

  const documentFiscalYear = new Date().getFullYear();
  for (const seq of [
    { documentType: 'INV', prefix: 'INV', nextNumber: 2 },
    { documentType: 'PO', prefix: 'PO', nextNumber: 2 },
    { documentType: 'RCP', prefix: 'RCP', nextNumber: 1 },
    { documentType: 'JE', prefix: 'JE', nextNumber: 1 },
    { documentType: 'PAT', prefix: 'PAT', nextNumber: 2 },
    { documentType: 'ENC', prefix: 'ENC', nextNumber: 1 },
    { documentType: 'CHG', prefix: 'CHG', nextNumber: 1 },
    { documentType: 'PMT', prefix: 'PMT', nextNumber: 1 },
    { documentType: 'REF', prefix: 'REF', nextNumber: 1 },
    { documentType: 'ADJ', prefix: 'ADJ', nextNumber: 1 },
  ]) {
    const existing = await prisma.numberSequence.findUnique({
      where: {
        tenantId_branchId_documentType_fiscalYear: {
          tenantId: tenant.id,
          branchId: branch.id,
          documentType: seq.documentType,
          fiscalYear: documentFiscalYear,
        },
      },
    });
    await prisma.numberSequence.upsert({
      where: {
        tenantId_branchId_documentType_fiscalYear: {
          tenantId: tenant.id,
          branchId: branch.id,
          documentType: seq.documentType,
          fiscalYear: documentFiscalYear,
        },
      },
      update: {
        nextNumber: Math.max(existing?.nextNumber ?? 0, seq.nextNumber),
      },
      create: {
        tenantId: tenant.id,
        branchId: branch.id,
        documentType: seq.documentType,
        prefix: seq.prefix,
        fiscalYear: documentFiscalYear,
        nextNumber: seq.nextNumber,
        padding: 6,
      },
    });
  }

  const consultCategory = await prisma.serviceCategory.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'CONSULT' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Consultations',
      code: 'CONSULT',
    },
  });

  const procedureCategory = await prisma.serviceCategory.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'PROC' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Procedures',
      code: 'PROC',
    },
  });

  const sampleServices = [
    { code: 'CONS-30', name: 'Consultation (30 min)', categoryId: consultCategory.id, defaultPrice: 300, department: 'General', durationMinutes: 30 },
    { code: 'CONS-60', name: 'Consultation (60 min)', categoryId: consultCategory.id, defaultPrice: 500, department: 'General', durationMinutes: 60 },
    { code: 'PROC-BASIC', name: 'Basic Procedure', categoryId: procedureCategory.id, defaultPrice: 750, department: 'General' },
  ];

  for (const svc of sampleServices) {
    await prisma.service.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: svc.code } },
      update: {},
      create: {
        tenantId: tenant.id,
        categoryId: svc.categoryId,
        code: svc.code,
        name: svc.name,
        defaultPrice: svc.defaultPrice,
        department: svc.department,
        durationMinutes: svc.durationMinutes,
      },
    });
  }

  const demoPatient = await prisma.patient.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'PAT-2026-000001' } },
    update: {},
    create: {
      tenantId: tenant.id,
      branchId: branch.id,
      code: 'PAT-2026-000001',
      firstName: 'Sara',
      lastName: 'Hassan',
      fullName: 'Sara Hassan',
      phone: '+20100000999',
      email: 'sara.demo@example.com',
      status: 'active',
      createdById: adminUser?.id,
    },
  });

  await prisma.patientProfile.upsert({
    where: { patientId: demoPatient.id },
    update: {},
    create: {
      patientId: demoPatient.id,
      preferredLocale: 'en',
      referralSource: 'Walk-in',
    },
  });

  await prisma.patientAccount.upsert({
    where: { patientId: demoPatient.id },
    update: {},
    create: {
      tenantId: tenant.id,
      patientId: demoPatient.id,
      currency: 'EGP',
      cachedBalance: 0,
    },
  });

  console.log('Seed completed.');
  console.log('  Tenant: Fratelanza Demo Company (FRATELANZA)');
  console.log('  Admin:  admin@fratelanza.local / Admin@123456');
  console.log(`  Warehouse: ${warehouse.code}`);
  console.log(`  Products: ${sampleProducts.length}, Customers: ${sampleCustomers.length}, Accounts: ${DEFAULT_ACCOUNTS.length}`);
  console.log(`  PMS: ${sampleServices.length} services, 1 demo patient (PAT-2026-000001)`);
  console.log('  Stock: 100 units per product, 1 draft invoice, 1 draft PO');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
