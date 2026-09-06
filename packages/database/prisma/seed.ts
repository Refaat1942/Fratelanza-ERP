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

const DEFAULT_ACCOUNTS = [
  { code: '1000', name: 'Cash', type: 'asset' },
  { code: '1100', name: 'Accounts Receivable', type: 'asset' },
  { code: '1200', name: 'Inventory', type: 'asset' },
  { code: '2000', name: 'Accounts Payable', type: 'liability' },
  { code: '3000', name: 'Owner Equity', type: 'equity' },
  { code: '4000', name: 'Sales Revenue', type: 'revenue' },
  { code: '5000', name: 'Cost of Goods Sold', type: 'expense' },
];

async function main() {
  console.log('Seeding database...');

  for (const perm of CORE_PERMISSIONS) {
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
      update: {},
      create: { tenantId: tenant.id, ...acc, isSystem: true },
    });
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
  for (const moduleId of erpModules) {
    await prisma.tenantModule.upsert({
      where: { tenantId_moduleId: { tenantId: tenant.id, moduleId } },
      update: { isEnabled: true },
      create: { tenantId: tenant.id, moduleId, isEnabled: true },
    });
  }

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

  console.log('Seed completed.');
  console.log('  Tenant: Fratelanza Demo Company (FRATELANZA)');
  console.log('  Admin:  admin@fratelanza.local / Admin@123456');
  console.log(`  Warehouse: ${warehouse.code}`);
  console.log(`  Products: ${sampleProducts.length}, Customers: ${sampleCustomers.length}, Accounts: ${DEFAULT_ACCOUNTS.length}`);
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
