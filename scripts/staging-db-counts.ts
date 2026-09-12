import { config } from 'dotenv';
import { resolve } from 'path';
import { PrismaClient } from '../packages/database/generated/server/index.js';

config({ path: resolve(process.cwd(), '.env') });

async function main() {
  const p = new PrismaClient();
  try {
    const counts = {
      tenants: await p.tenant.count(),
      users: await p.user.count(),
      parties: await p.party.count(),
      products: await p.product.count(),
      stockBalances: await p.stockBalance.count(),
      salesInvoices: await p.salesInvoice.count(),
      purchaseOrders: await p.purchaseOrder.count(),
      journalEntries: await p.journalEntry.count(),
      projects: await p.project.count(),
      constructionContracts: await p.constructionContract.count(),
      licenses: await p.tenantLicense.count(),
      auditLogs: await p.auditLog.count(),
    };
    console.log(JSON.stringify(counts, null, 2));
  } finally {
    await p.$disconnect();
  }
}

main();
