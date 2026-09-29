import { PrismaService } from '../../database/prisma.service';
import type { Product } from '../../../../../packages/database/generated/server';

const PRODUCT_NAMES: Array<[string, string]> = [
  ['Basmati Rice 5kg', 'أرز بسمتي ٥ كجم'],
  ['Sunflower Oil 1L', 'زيت عباد الشمس ١ لتر'],
  ['White Sugar 1kg', 'سكر أبيض ١ كجم'],
  ['Wheat Flour 1kg', 'دقيق قمح ١ كجم'],
  ['Tea Bags 100ct', 'شاي ١٠٠ كيس'],
  ['Instant Coffee 200g', 'قهوة سريعة ٢٠٠ جم'],
  ['Canned Tomatoes 400g', 'طماطم معلبة ٤٠٠ جم'],
  ['Pasta 500g', 'معكرونة ٥٠٠ جم'],
  ['Olive Oil 500ml', 'زيت زيتون ٥٠٠ مل'],
  ['Powdered Milk 900g', 'حليب بودرة ٩٠٠ جم'],
  ['Detergent Powder 3kg', 'مسحوق غسيل ٣ كجم'],
  ['Dish Soap 750ml', 'سائل جلي ٧٥٠ مل'],
  ['Bottled Water 1.5L', 'مياه معبأة ١.٥ لتر'],
  ['Soft Drink Cans 330ml', 'مشروب غازي ٣٣٠ مل'],
  ['Chocolate Bar 100g', 'شوكولاتة ١٠٠ جم'],
  ['Potato Chips 150g', 'شيبسي ١٥٠ جم'],
  ['Biscuits Pack 300g', 'بسكويت ٣٠٠ جم'],
  ['Frozen Chicken 1kg', 'دجاج مجمد ١ كجم'],
  ['Cheese Slices 200g', 'جبن شرائح ٢٠٠ جم'],
  ['Yogurt Cup 150g', 'زبادي ١٥٠ جم'],
];

const CUSTOMER_NAMES: Array<[string, string]> = [
  ['Al Rayan Market', 'سوق الريان'], ['Delta Retail Chain', 'سلسلة دلتا للتجزئة'],
  ['Cairo Grocers Co.', 'بقالة القاهرة'], ['Alexandria Foods', 'أغذية الإسكندرية'],
  ['Giza Wholesale', 'جيزة للجملة'], ['Nile Corner Store', 'محل النيل'],
  ['Sunrise Mart', 'سوق الشروق'], ['Family Grocers', 'بقالة العائلة'],
  ['Green Valley Foods', 'أغذية الوادي الأخضر'], ['City Center Market', 'سوق وسط المدينة'],
  ['Al Amal Trading', 'الأمل للتجارة'], ['Modern Retail Group', 'مجموعة التجزئة الحديثة'],
  ['Star Supermarket', 'سوبر ماركت النجمة'], ['Golden Gate Trading', 'البوابة الذهبية للتجارة'],
  ['Coastal Distributors', 'موزعو الساحل'], ['Metro Grocery', 'مترو للبقالة'],
  ['Palm Trading Co.', 'شركة النخيل للتجارة'], ['Riverside Market', 'سوق ضفة النهر'],
  ['Unity Wholesalers', 'موزعو الوحدة'], ['Horizon Foods', 'أغذية الأفق'],
];

const SUPPLIER_NAMES: Array<[string, string]> = [
  ['Nile Food Industries', 'صناعات النيل الغذائية'], ['Delta Packaging', 'دلتا للتعبئة'],
  ['Giza Logistics', 'جيزة للنقل'], ['Cairo Food Distributors', 'موزعو أغذية القاهرة'],
  ['Alexandria Manufacturing', 'مصنع الإسكندرية'], ['Suez Trading House', 'بيت السويس التجاري'],
  ['Red Sea Imports', 'واردات البحر الأحمر'], ['Upper Egypt Supplies', 'إمدادات صعيد مصر'],
  ['National Beverage Co.', 'الشركة الوطنية للمشروبات'], ['Modern Dairy Ltd.', 'ألبان حديثة'],
  ['Eastern Grain Mills', 'مطاحن الشرق'], ['Golden Harvest Foods', 'أغذية الحصاد الذهبي'],
  ['Pioneer Packaging', 'الريادة للتعبئة'], ['Continental Trading', 'التجارة القارية'],
  ['Fresh Fields Co.', 'شركة الحقول الطازجة'],
];

function randomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(10, 0, 0, 0);
  return d;
}

export interface DemoVolumeStats {
  products: number;
  customers: number;
  suppliers: number;
  salesInvoices: number;
  purchaseOrders: number;
}

const CHART_OF_ACCOUNTS = [
  { code: '1000', name: 'Cash', type: 'asset' },
  { code: '1100', name: 'Accounts Receivable', type: 'asset' },
  { code: '1200', name: 'Inventory', type: 'asset' },
  { code: '2000', name: 'Accounts Payable', type: 'liability' },
  { code: '2100', name: 'Tax Payable', type: 'liability' },
  { code: '3000', name: 'Owner Equity', type: 'equity' },
  { code: '4000', name: 'Sales Revenue', type: 'revenue' },
  { code: '5000', name: 'Cost of Goods Sold', type: 'cogs' },
  { code: '5100', name: 'Operating Expenses', type: 'expense' },
] as const;

async function ensureChartOfAccounts(
  prisma: PrismaService,
  tenantId: string,
): Promise<Record<string, string>> {
  const byCode: Record<string, string> = {};
  for (const acc of CHART_OF_ACCOUNTS) {
    const account = await prisma.account.upsert({
      where: { tenantId_code: { tenantId, code: acc.code } },
      update: {},
      create: { tenantId, code: acc.code, name: acc.name, type: acc.type, isSystem: true },
    });
    byCode[acc.code] = account.id;
  }
  return byCode;
}

type JournalLineInput = { accountId: string; debit?: number; credit?: number };

async function postJournalEntry(
  prisma: PrismaService,
  tenantId: string,
  branchId: string,
  number: string,
  entryDate: Date,
  description: string,
  lines: JournalLineInput[],
): Promise<void> {
  const postingLines = lines.filter((l) => (l.debit ?? 0) > 0 || (l.credit ?? 0) > 0);
  if (postingLines.length === 0) return;

  await prisma.journalEntry.create({
    data: {
      tenantId,
      branchId,
      number,
      entryDate,
      description,
      postedAt: entryDate,
      lines: {
        create: postingLines.map((l) => ({
          accountId: l.accountId,
          debit: l.debit ?? 0,
          credit: l.credit ?? 0,
        })),
      },
    },
  });
}

/**
 * Populates a freshly created demo tenant with a realistic-looking dataset —
 * products, customers, suppliers, stock, sales invoices and purchase orders —
 * so a link a customer opens actually has something to look at, not an empty shell.
 */
export async function seedDemoTenantVolume(
  prisma: PrismaService,
  tenantId: string,
  branchId: string,
): Promise<DemoVolumeStats> {
  const accounts = await ensureChartOfAccounts(prisma, tenantId);
  let journalNumber = 1;
  const nextJournalNumber = () => `JE-DEMO-${String(journalNumber++).padStart(4, '0')}`;

  const warehouse = await prisma.warehouse.create({
    data: { tenantId, branchId, code: 'WH-MAIN', name: 'Main Warehouse' },
  });

  const unit = await prisma.unitOfMeasure.create({
    data: { tenantId, name: 'Piece', code: 'PCS', symbol: 'pcs' },
  });

  const category = await prisma.productCategory.create({
    data: { tenantId, name: 'General Merchandise', code: 'GEN' },
  });

  const products: Product[] = [];
  for (let i = 0; i < PRODUCT_NAMES.length; i++) {
    const [en, ar] = PRODUCT_NAMES[i]!;
    const costPrice = randomInt(10, 500);
    const salePrice = Math.round(costPrice * (1.2 + Math.random() * 0.5));
    const product = await prisma.product.create({
      data: {
        tenantId,
        categoryId: category.id,
        unitId: unit.id,
        sku: `DEMO-${String(i + 1).padStart(3, '0')}`,
        name: `${en} | ${ar}`,
        costPrice,
        salePrice,
        taxRate: 14,
        trackInventory: true,
      },
    });
    products.push(product);
    await prisma.stockBalance.create({
      data: {
        tenantId,
        warehouseId: warehouse.id,
        productId: product.id,
        quantity: randomInt(20, 400),
        avgCost: costPrice,
      },
    });
  }

  const customers = [];
  for (let i = 0; i < CUSTOMER_NAMES.length; i++) {
    const [en, ar] = CUSTOMER_NAMES[i]!;
    const customer = await prisma.customer.create({
      data: {
        tenantId,
        branchId,
        code: `CUST-${String(i + 1).padStart(3, '0')}`,
        name: `${en} | ${ar}`,
        phone: `+2010${randomInt(10000000, 99999999)}`,
        creditLimit: randomInt(5000, 50000),
      },
    });
    customers.push(customer);
  }

  const suppliers = [];
  for (let i = 0; i < SUPPLIER_NAMES.length; i++) {
    const [en, ar] = SUPPLIER_NAMES[i]!;
    const supplier = await prisma.supplier.create({
      data: {
        tenantId,
        code: `SUP-${String(i + 1).padStart(3, '0')}`,
        name: `${en} | ${ar}`,
        phone: `+2011${randomInt(10000000, 99999999)}`,
      },
    });
    suppliers.push(supplier);
  }

  const invoiceCount = 60;
  for (let i = 0; i < invoiceCount; i++) {
    const customer = randomItem(customers);
    const lineCount = randomInt(1, 4);
    let costBasis = 0;
    const lines = Array.from({ length: lineCount }, () => {
      const product = randomItem(products);
      const quantity = randomInt(1, 10);
      const unitPrice = Number(product.salePrice);
      const lineTotal = quantity * unitPrice;
      costBasis += quantity * Number(product.costPrice);
      return {
        productId: product.id,
        description: product.name,
        quantity,
        unitPrice,
        taxRate: 14,
        taxAmount: Math.round(lineTotal * 0.14 * 100) / 100,
        lineTotal,
      };
    });
    const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
    const taxAmount = lines.reduce((sum, l) => sum + l.taxAmount, 0);
    const total = subtotal + taxAmount;
    const invoiceDate = daysAgo(randomInt(0, 90));
    const statusRoll = Math.random();
    const status = statusRoll < 0.15 ? 'draft' : statusRoll < 0.65 ? 'paid' : 'posted';
    const paidAmount = status === 'paid' ? total : status === 'posted' ? Math.round(total * 0.4 * 100) / 100 : 0;

    await prisma.salesInvoice.create({
      data: {
        tenantId,
        branchId,
        customerId: customer.id,
        warehouseId: warehouse.id,
        number: `INV-DEMO-${String(i + 1).padStart(4, '0')}`,
        status,
        invoiceDate,
        subtotal,
        taxAmount,
        total,
        paidAmount,
        postedAt: status === 'draft' ? null : invoiceDate,
        lines: { create: lines },
      },
    });

    if (paidAmount < total) {
      await prisma.customer.update({
        where: { id: customer.id },
        data: { balance: { increment: total - paidAmount } },
      });
    }

    if (status !== 'draft') {
      await postJournalEntry(prisma, tenantId, branchId, nextJournalNumber(), invoiceDate, `Sale ${customer.name}`, [
        { accountId: accounts['1000']!, debit: paidAmount },
        { accountId: accounts['1100']!, debit: total - paidAmount },
        { accountId: accounts['4000']!, credit: subtotal },
        { accountId: accounts['2100']!, credit: taxAmount },
        { accountId: accounts['5000']!, debit: costBasis },
        { accountId: accounts['1200']!, credit: costBasis },
      ]);
    }
  }

  const poCount = 40;
  for (let i = 0; i < poCount; i++) {
    const supplier = randomItem(suppliers);
    const lineCount = randomInt(1, 3);
    const lines = Array.from({ length: lineCount }, () => {
      const product = randomItem(products);
      const quantity = randomInt(10, 100);
      const unitPrice = Number(product.costPrice);
      return {
        productId: product.id,
        description: product.name,
        quantity,
        unitPrice,
        taxRate: 14,
        lineTotal: quantity * unitPrice,
      };
    });
    const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
    const taxAmount = Math.round(subtotal * 0.14 * 100) / 100;
    const total = subtotal + taxAmount;
    const orderDate = daysAgo(randomInt(0, 60));
    const status = Math.random() < 0.4 ? 'draft' : 'received';

    await prisma.purchaseOrder.create({
      data: {
        tenantId,
        branchId,
        supplierId: supplier.id,
        warehouseId: warehouse.id,
        number: `PO-DEMO-${String(i + 1).padStart(4, '0')}`,
        status,
        orderDate,
        subtotal,
        taxAmount,
        total,
        receivedAt: status === 'received' ? orderDate : null,
        lines: {
          create: lines.map((l) => ({ ...l, receivedQty: status === 'received' ? l.quantity : 0 })),
        },
      },
    });

    if (status === 'received') {
      await prisma.supplier.update({
        where: { id: supplier.id },
        data: { balance: { increment: total } },
      });

      await postJournalEntry(prisma, tenantId, branchId, nextJournalNumber(), orderDate, `Purchase from ${supplier.name}`, [
        { accountId: accounts['1200']!, debit: subtotal },
        { accountId: accounts['2100']!, debit: taxAmount },
        { accountId: accounts['2000']!, credit: total },
      ]);
    }
  }

  return {
    products: products.length,
    customers: customers.length,
    suppliers: suppliers.length,
    salesInvoices: invoiceCount,
    purchaseOrders: poCount,
  };
}
