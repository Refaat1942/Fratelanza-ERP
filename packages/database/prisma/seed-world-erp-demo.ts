/**
 * Sample CRM / HR / Assets / Bank / Currency / Approvals data for demo tenants.
 */
import type { PrismaClient } from '../generated/server';

export async function seedWorldErpDemoSamples(
  prisma: PrismaClient,
  tenantCode = 'TRADING_DEMO',
): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { code: tenantCode } });
  if (!tenant) return;

  const branch = await prisma.branch.findFirst({ where: { tenantId: tenant.id, isDefault: true } });
  const owner = await prisma.user.findFirst({ where: { tenantId: tenant.id, isActive: true } });
  if (!branch || !owner) return;

  await prisma.currency.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: tenant.currency } },
    update: { isBase: true, isActive: true },
    create: {
      tenantId: tenant.id,
      code: tenant.currency,
      name: tenant.currency === 'EGP' ? 'Egyptian Pound' : 'Saudi Riyal',
      symbol: tenant.currency,
      isBase: true,
      isActive: true,
    },
  });

  await prisma.currency.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'USD' } },
    update: { isActive: true },
    create: {
      tenantId: tenant.id,
      code: 'USD',
      name: 'US Dollar',
      symbol: '$',
      isBase: false,
      isActive: true,
    },
  });

  await prisma.exchangeRate.upsert({
    where: {
      tenantId_fromCurrency_toCurrency_asOfDate: {
        tenantId: tenant.id,
        fromCurrency: 'USD',
        toCurrency: tenant.currency,
        asOfDate: new Date('2026-01-01'),
      },
    },
    update: { rate: tenant.currency === 'EGP' ? 49.5 : 3.75 },
    create: {
      tenantId: tenant.id,
      fromCurrency: 'USD',
      toCurrency: tenant.currency,
      rate: tenant.currency === 'EGP' ? 49.5 : 3.75,
      asOfDate: new Date('2026-01-01'),
    },
  });

  const bankGl = await prisma.account.findUnique({
    where: { tenantId_code: { tenantId: tenant.id, code: '1010' } },
  });

  const existingBank = await prisma.bankAccount.findFirst({
    where: { tenantId: tenant.id, name: 'Main Operating Account' },
  });
  if (!existingBank) {
    await prisma.bankAccount.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        name: 'Main Operating Account',
        bankName: tenant.country === 'EG' ? 'National Bank of Egypt' : 'Al Rajhi Bank',
        accountNumber: '100200300400',
        currencyCode: tenant.currency,
        glAccountId: bankGl?.id,
        openingBalance: 250000,
      },
    });
  }

  const assetCategory = await prisma.assetCategory.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'VEH' } },
    update: {},
    create: {
      tenantId: tenant.id,
      code: 'VEH',
      name: 'Vehicles',
      defaultUsefulLifeMonths: 60,
      defaultDepreciationMethod: 'straight_line',
    },
  });

  await prisma.asset.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'AST-001' } },
    update: {},
    create: {
      tenantId: tenant.id,
      branchId: branch.id,
      categoryId: assetCategory.id,
      code: 'AST-001',
      name: 'Delivery Van | فان توصيل',
      acquisitionDate: new Date('2025-06-01'),
      acquisitionCost: 450000,
      bookValue: 450000,
      salvageValue: 50000,
      usefulLifeMonths: 60,
      depreciationMethod: 'straight_line',
      status: 'active',
      createdById: owner.id,
    },
  });

  await prisma.lead.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'LEAD-001' } },
    update: {},
    create: {
      tenantId: tenant.id,
      branchId: branch.id,
      code: 'LEAD-001',
      companyName: 'Future Retail Group',
      contactName: 'Sara Mahmoud',
      email: 'sara@future-retail.eg',
      phone: '+201012345678',
      source: 'website',
      status: 'qualified',
      ownerId: owner.id,
    },
  });

  await prisma.opportunity.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'OPP-001' } },
    update: {},
    create: {
      tenantId: tenant.id,
      branchId: branch.id,
      code: 'OPP-001',
      name: 'Annual supply contract',
      stage: 'proposal',
      amount: 850000,
      currencyCode: tenant.currency,
      probability: 60,
      expectedCloseDate: new Date('2026-03-31'),
      ownerId: owner.id,
    },
  });

  const dept = await prisma.department.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'OPS' } },
    update: {},
    create: {
      tenantId: tenant.id,
      branchId: branch.id,
      code: 'OPS',
      name: 'Operations',
    },
  });

  const position = await prisma.position.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'OPS-MGR' } },
    update: {},
    create: {
      tenantId: tenant.id,
      departmentId: dept.id,
      code: 'OPS-MGR',
      title: 'Operations Manager',
    },
  });

  await prisma.employee.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'EMP-001' } },
    update: {},
    create: {
      tenantId: tenant.id,
      branchId: branch.id,
      departmentId: dept.id,
      positionId: position.id,
      code: 'EMP-001',
      firstName: 'Omar',
      lastName: 'Hassan',
      email: 'omar.hassan@demo.fratelanza.local',
      hireDate: new Date('2024-01-15'),
      basicSalary: 18000,
      currencyCode: tenant.currency,
      status: 'active',
    },
  });

  const existingWorkflow = await prisma.approvalWorkflow.findFirst({
    where: {
      tenantId: tenant.id,
      sourceModule: 'purchasing',
      sourceType: 'order',
      name: 'Purchase order approval',
    },
  });
  if (!existingWorkflow) {
    await prisma.approvalWorkflow.create({
      data: {
        tenantId: tenant.id,
        sourceModule: 'purchasing',
        sourceType: 'order',
        name: 'Purchase order approval',
        minAmount: 10000,
        isActive: true,
        steps: {
          create: [{ sequence: 1, name: 'Manager approval', approverRole: 'manager' }],
        },
      },
    });
  }

  console.log(`  [WORLD_ERP/${tenantCode}] currencies, bank, asset, CRM, HR, approvals sample data`);
}
