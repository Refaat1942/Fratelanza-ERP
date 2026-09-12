/**
 * Reusable demo volume generator for fratelanza_eval / fratelanza_g_erp_prod only.
 * Creates interconnected posted transactions for dashboards and reports.
 */
import type { PrismaClient } from '../generated/server';
import { Prisma } from '../generated/server';

const EG_CUSTOMER_NAMES = [
  'Al-Masry Market | سوق المصري',
  'Delta Retail Chain | سلسلة دلتا',
  'Cairo Grocers Co. | بقالة القاهرة',
  'Alexandria Foods | أغذية الإسكندرية',
  'Giza Wholesale | جيزة للجملة',
];

const EG_SUPPLIER_NAMES = [
  'Nile Food Industries | صناعات النيل',
  'Delta Packaging | دلتا للتعبئة',
  'Giza Logistics | جيزة للنقل',
];

const PRODUCT_PREFIXES = ['NTC', 'GDS', 'FOD', 'BEV', 'SNK'];

export type VolumeOptions = {
  targetProducts?: number;
  targetCustomers?: number;
  targetSuppliers?: number;
  salesInvoices?: number;
  purchaseOrders?: number;
  skipInventoryMovements?: boolean;
  taxRate?: number;
};

export type DemoVolumeStats = {
  products: number;
  customers: number;
  suppliers: number;
  salesInvoices: number;
  purchaseOrders: number;
  customerPayments: number;
  inventoryMovements: number;
  posSales?: number;
};

const DEFAULT_VOLUME: Required<Omit<VolumeOptions, 'skipInventoryMovements'>> & {
  skipInventoryMovements: boolean;
} = {
  targetProducts: 100,
  targetCustomers: 60,
  targetSuppliers: 40,
  salesInvoices: 120,
  purchaseOrders: 80,
  skipInventoryMovements: false,
  taxRate: 14,
};

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(10, 0, 0, 0);
  return d;
}

function randomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

export async function generateTradingDemoVolume(
  prisma: PrismaClient,
  tenantCode: string,
  options: VolumeOptions = {},
): Promise<DemoVolumeStats> {
  const opts = { ...DEFAULT_VOLUME, ...options };
  const tenant = await prisma.tenant.findUnique({ where: { code: tenantCode } });
  if (!tenant) throw new Error(`Tenant ${tenantCode} not found for demo volume`);

  const branch = await prisma.branch.findFirst({ where: { tenantId: tenant.id, isDefault: true } });
  if (!branch) throw new Error('Default branch missing');

  let warehouse = await prisma.warehouse.findFirst({ where: { tenantId: tenant.id, branchId: branch.id } });
  if (!opts.skipInventoryMovements && !warehouse) {
    warehouse = await prisma.warehouse.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        code: 'WH-MAIN',
        name: 'Main Warehouse',
      },
    });
  }

  let unit = await prisma.unitOfMeasure.findFirst({ where: { tenantId: tenant.id } });
  if (!unit) {
    unit = await prisma.unitOfMeasure.create({
      data: { tenantId: tenant.id, name: 'Piece', code: 'PCS', symbol: 'pcs' },
    });
  }

  let category = await prisma.productCategory.findFirst({ where: { tenantId: tenant.id } });
  if (!category) {
    category = await prisma.productCategory.create({
      data: { tenantId: tenant.id, name: 'General', code: 'GEN' },
    });
  }

  const admin = await prisma.user.findFirst({
    where: { tenantId: tenant.id, isActive: true },
    orderBy: { createdAt: 'asc' },
  });

  for (const extra of [
    { code: 'BR-02', name: 'Branch 2 | فرع ٢' },
    { code: 'BR-03', name: 'Branch 3 | فرع ٣' },
  ]) {
    await prisma.branch.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: extra.code } },
      update: { name: extra.name },
      create: { tenantId: tenant.id, code: extra.code, name: extra.name, isDefault: false },
    });
  }

  const existingProducts = await prisma.product.count({ where: { tenantId: tenant.id } });
  for (let i = existingProducts + 1; i <= opts.targetProducts; i++) {
    const prefix = PRODUCT_PREFIXES[i % PRODUCT_PREFIXES.length]!;
    const sku = `${prefix}-${String(i).padStart(4, '0')}`;
    const cost = 10 + (i % 40);
    const sale = cost + 8 + (i % 15);
    await prisma.product.upsert({
      where: { tenantId_sku: { tenantId: tenant.id, sku } },
      update: {},
      create: {
        tenantId: tenant.id,
        categoryId: category.id,
        unitId: unit.id,
        sku,
        name: `Product ${i} | منتج ${i}`,
        costPrice: cost,
        salePrice: sale,
        trackInventory: !opts.skipInventoryMovements,
        type: opts.skipInventoryMovements ? 'service' : 'product',
      },
    });
  }

  const products = await prisma.product.findMany({ where: { tenantId: tenant.id }, take: opts.targetProducts });

  if (warehouse && !opts.skipInventoryMovements) {
    for (const product of products.filter((p) => p.trackInventory)) {
      await prisma.stockBalance.upsert({
        where: {
          tenantId_warehouseId_productId: {
            tenantId: tenant.id,
            warehouseId: warehouse.id,
            productId: product.id,
          },
        },
        update: { quantity: 500, avgCost: product.costPrice },
        create: {
          tenantId: tenant.id,
          warehouseId: warehouse.id,
          productId: product.id,
          quantity: 500,
          avgCost: product.costPrice,
        },
      });
    }
  }

  const existingCustomers = await prisma.customer.count({ where: { tenantId: tenant.id } });
  for (let i = existingCustomers + 1; i <= opts.targetCustomers; i++) {
    const baseName = EG_CUSTOMER_NAMES[i % EG_CUSTOMER_NAMES.length]!;
    await prisma.customer.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: `CUST-${String(i).padStart(4, '0')}` } },
      update: {},
      create: {
        tenantId: tenant.id,
        branchId: branch.id,
        code: `CUST-${String(i).padStart(4, '0')}`,
        name: `${baseName} #${i}`,
        email: `customer${i}@demo.fratelanza.local`,
        phone: `+2010${String(1000000 + i).slice(-8)}`,
        creditLimit: 50000,
      },
    });
  }

  const existingSuppliers = await prisma.supplier.count({ where: { tenantId: tenant.id } });
  for (let i = existingSuppliers + 1; i <= opts.targetSuppliers; i++) {
    const baseName = EG_SUPPLIER_NAMES[i % EG_SUPPLIER_NAMES.length]!;
    await prisma.supplier.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: `SUP-${String(i).padStart(4, '0')}` } },
      update: {},
      create: {
        tenantId: tenant.id,
        code: `SUP-${String(i).padStart(4, '0')}`,
        name: `${baseName} #${i}`,
        email: `supplier${i}@demo.fratelanza.local`,
        phone: `+2011${String(1000000 + i).slice(-8)}`,
      },
    });
  }

  const customers = await prisma.customer.findMany({ where: { tenantId: tenant.id }, take: opts.targetCustomers });
  const suppliers = await prisma.supplier.findMany({ where: { tenantId: tenant.id }, take: opts.targetSuppliers });
  const sellableProducts = products.filter((p) => !opts.skipInventoryMovements || !p.trackInventory);

  let salesCount = 0;
  let poCount = 0;
  let paymentCount = 0;
  let movementCount = 0;
  const fiscalYear = new Date().getFullYear();

  await prisma.customerPayment.deleteMany({
    where: { tenantId: tenant.id, number: { startsWith: `CP-${fiscalYear}-001` } },
  });
  await prisma.salesInvoice.deleteMany({
    where: { tenantId: tenant.id, number: { startsWith: `INV-${fiscalYear}-001` } },
  });
  if (!opts.skipInventoryMovements) {
    await prisma.purchaseOrder.deleteMany({
      where: { tenantId: tenant.id, number: { startsWith: `PO-${fiscalYear}-002` } },
    });
  }

  for (let n = 1; n <= opts.salesInvoices; n++) {
    const customer = randomItem(customers);
    const product = randomItem(sellableProducts.length ? sellableProducts : products);
    const qty = opts.skipInventoryMovements ? 1 + (n % 8) : 5 + (n % 20);
    const unitPrice = Number(product.salePrice);
    const subtotal = qty * unitPrice;
    const taxAmount = Math.round(subtotal * (opts.taxRate / 100) * 100) / 100;
    const total = subtotal + taxAmount;
    const invoiceDate = daysAgo(n % 180);
    const number = `INV-${fiscalYear}-${String(1000 + n).padStart(6, '0')}`;

    const invoice = await prisma.salesInvoice.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        customerId: customer.id,
        warehouseId: warehouse?.id,
        number,
        status: 'posted',
        invoiceDate,
        postedAt: invoiceDate,
        subtotal,
        taxAmount,
        total,
        paidAmount: n % 3 === 0 ? total : new Prisma.Decimal(0),
        createdById: admin?.id,
        lines: {
          create: [
            {
              productId: product.id,
              description: product.name,
              quantity: qty,
              unitPrice,
              taxRate: opts.taxRate,
              taxAmount,
              lineTotal: subtotal,
            },
          ],
        },
      },
    });

    if (warehouse && product.trackInventory && !opts.skipInventoryMovements) {
      await prisma.inventoryMovement.create({
        data: {
          tenantId: tenant.id,
          branchId: branch.id,
          warehouseId: warehouse.id,
          productId: product.id,
          quantity: -qty,
          unitCost: product.costPrice,
          movementType: 'sale',
          referenceType: 'sales_invoice',
          referenceId: invoice.id,
          createdAt: invoiceDate,
        },
      });
      movementCount++;
    }

    await prisma.customer.update({
      where: { id: customer.id },
      data: { balance: { increment: n % 3 === 0 ? 0 : total } },
    });

    if (n % 3 === 0) {
      await prisma.customerPayment.create({
        data: {
          tenantId: tenant.id,
          branchId: branch.id,
          customerId: customer.id,
          invoiceId: invoice.id,
          number: `CP-${fiscalYear}-${String(1000 + n).padStart(6, '0')}`,
          amount: total,
          paymentDate: invoiceDate,
          method: n % 2 === 0 ? 'cash' : 'bank',
        },
      });
      paymentCount++;
    }

    salesCount++;
  }

  if (warehouse && !opts.skipInventoryMovements) {
    for (let n = 1; n <= opts.purchaseOrders; n++) {
      const supplier = randomItem(suppliers);
      const product = randomItem(products.filter((p) => p.trackInventory));
      const qty = 50 + (n % 30);
      const unitPrice = Number(product.costPrice);
      const subtotal = qty * unitPrice;
      const total = subtotal;
      const orderDate = daysAgo(n % 150);
      const number = `PO-${fiscalYear}-${String(2000 + n).padStart(6, '0')}`;

      await prisma.purchaseOrder.create({
        data: {
          tenantId: tenant.id,
          branchId: branch.id,
          supplierId: supplier.id,
          warehouseId: warehouse.id,
          number,
          status: 'received',
          orderDate,
          receivedAt: orderDate,
          subtotal,
          total,
          lines: {
            create: [
              {
                productId: product.id,
                description: product.name,
                quantity: qty,
                receivedQty: qty,
                unitPrice,
                lineTotal: subtotal,
              },
            ],
          },
        },
      });

      await prisma.inventoryMovement.create({
        data: {
          tenantId: tenant.id,
          branchId: branch.id,
          warehouseId: warehouse.id,
          productId: product.id,
          quantity: qty,
          unitCost: product.costPrice,
          movementType: 'purchase_receipt',
          referenceType: 'purchase_order',
          referenceId: number,
          createdAt: orderDate,
        },
      });
      movementCount++;

      await prisma.supplier.update({
        where: { id: supplier.id },
        data: { balance: { increment: total * 0.6 } },
      });

      poCount++;
    }
  }

  return {
    products: products.length,
    customers: customers.length,
    suppliers: suppliers.length,
    salesInvoices: salesCount,
    purchaseOrders: poCount,
    customerPayments: paymentCount,
    inventoryMovements: movementCount,
  };
}

export async function generateConstructionDemoVolume(
  prisma: PrismaClient,
  tenantCode: string,
): Promise<DemoVolumeStats> {
  const tenant = await prisma.tenant.findUnique({ where: { code: tenantCode } });
  if (!tenant) throw new Error(`Tenant ${tenantCode} not found`);

  const branch = await prisma.branch.findFirst({ where: { tenantId: tenant.id, isDefault: true } });
  if (!branch) throw new Error('Branch missing');

  await prisma.warehouse.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'WH-SITE' } },
    update: {},
    create: {
      tenantId: tenant.id,
      branchId: branch.id,
      code: 'WH-SITE',
      name: 'Site Warehouse | مخزن الموقع',
    },
  });

  const project = await prisma.project.findFirst({ where: { tenantId: tenant.id } });
  const customer = await prisma.customer.findFirst({
    where: { tenantId: tenant.id },
    include: { party: true },
  });

  if (project && branch && customer?.partyId) {
    await prisma.constructionContract.upsert({
      where: { tenantId_number: { tenantId: tenant.id, number: 'CON-2026-001' } },
      update: {},
      create: {
        tenantId: tenant.id,
        projectId: project.id,
        branchId: branch.id,
        number: 'CON-2026-001',
        title: 'Main Contract | العقد الرئيسي',
        direction: 'customer',
        partyId: customer.partyId,
        pricingModel: 'lump_sum',
        originalValue: 15000000,
        status: 'active',
        startDate: daysAgo(120),
        endDate: daysAgo(-365),
        currency: tenant.currency,
      },
    });
  }

  return generateTradingDemoVolume(prisma, tenantCode, {
    targetProducts: 60,
    targetCustomers: 40,
    targetSuppliers: 25,
    salesInvoices: 70,
    purchaseOrders: 50,
    taxRate: tenant.country === 'SA' ? 15 : 14,
  });
}

export async function generateServicesDemoVolume(
  prisma: PrismaClient,
  tenantCode: string,
): Promise<DemoVolumeStats> {
  const tenant = await prisma.tenant.findUnique({ where: { code: tenantCode } });
  const taxRate = tenant?.country === 'SA' ? 15 : 14;
  return generateTradingDemoVolume(prisma, tenantCode, {
    targetProducts: 40,
    targetCustomers: 50,
    targetSuppliers: 20,
    salesInvoices: 90,
    purchaseOrders: 0,
    skipInventoryMovements: true,
    taxRate,
  });
}

export async function generatePosDemoVolume(
  prisma: PrismaClient,
  tenantCode: string,
  count = 40,
): Promise<number> {
  const tenant = await prisma.tenant.findUnique({ where: { code: tenantCode } });
  if (!tenant) return 0;

  const branch = await prisma.branch.findFirst({ where: { tenantId: tenant.id, isDefault: true } });
  const user = await prisma.user.findFirst({ where: { tenantId: tenant.id, isActive: true } });
  const products = await prisma.product.findMany({
    where: { tenantId: tenant.id, trackInventory: true },
    take: 20,
  });
  if (!branch || !user || products.length === 0) return 0;

  const fiscalYear = new Date().getFullYear();
  await prisma.posSale.deleteMany({
    where: { tenantId: tenant.id, number: { startsWith: `POS-${fiscalYear}-` } },
  });

  const shift = await prisma.posShift.create({
    data: {
      tenantId: tenant.id,
      branchId: branch.id,
      userId: user.id,
      status: 'closed',
      openedAt: daysAgo(1),
      closedAt: daysAgo(0),
      openingCash: 500,
      closingCash: 5000,
      totalSales: 4500,
    },
  });

  let created = 0;
  for (let n = 1; n <= count; n++) {
    const product = randomItem(products);
    const qty = 1 + (n % 5);
    const unitPrice = Number(product.salePrice);
    const subtotal = qty * unitPrice;
    const taxAmount = Math.round(subtotal * 0.14 * 100) / 100;
    const total = subtotal + taxAmount;

    await prisma.posSale.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        shiftId: shift.id,
        number: `POS-${fiscalYear}-${String(n).padStart(5, '0')}`,
        status: 'completed',
        subtotal,
        taxAmount,
        total,
        saleDate: daysAgo(n % 30),
        lines: {
          create: [
            {
              productId: product.id,
              description: product.name,
              quantity: qty,
              unitPrice,
              lineTotal: subtotal,
            },
          ],
        },
      },
    });
    created++;
  }

  return created;
}

export async function generateAllVerticalDemoVolumes(
  prisma: PrismaClient,
): Promise<Record<string, DemoVolumeStats | number>> {
  const trading = await generateTradingDemoVolume(prisma, 'TRADING_DEMO');
  const posSales = await generatePosDemoVolume(prisma, 'TRADING_DEMO', 50);
  const construction = await generateConstructionDemoVolume(prisma, 'CONSTRUCTION_DEMO');
  const services = await generateServicesDemoVolume(prisma, 'SERVICES_DEMO');

  return {
    TRADING_DEMO: { ...trading, posSales },
    CONSTRUCTION_DEMO: construction,
    SERVICES_DEMO: services,
  };
}
