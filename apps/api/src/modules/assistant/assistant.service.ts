import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { getAppConfig } from '../../config/app-config';
import { PrismaService } from '../../database/prisma.service';
import { ApprovalsService } from '../approvals/approvals.service';

export interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

const SYSTEM_PROMPT = `You are the in-app assistant for Fratelanza Business Platform, a multi-tenant ERP covering Sales, Purchasing, Inventory & Warehouses, Accounting, Projects & Construction, CRM, HR, Bank Reconciliation, Fixed Assets, Multi-Currency, and Approvals.

Respond in whichever language the user writes in — Arabic or English — matching their language for the whole reply, including numbers and dates formatted naturally for that language. Never mix languages within a single reply unless the user did.

You can both:
1. Answer "how do I..." and "what is..." questions about using the ERP from your own knowledge of its modules and standard ERP practice (e.g. "how do I create a purchase order" -> go to Purchasing, click Create, pick a supplier and warehouse, add lines, save as draft, then Receive once goods arrive).
2. Answer questions about this specific company's live data by calling the tools available to you (stock levels, sales, purchasing, pending approvals, customer/supplier balances). Always call a tool rather than guessing or estimating a number you could look up.

Be concise and concrete — a business owner or their staff member is asking, not a developer. Use bullet points or short paragraphs, not long essays. If a question is ambiguous, make a reasonable assumption and say what you assumed rather than asking a clarifying question first, unless the ambiguity is significant (e.g. which of two customers with a similar name).

Never invent figures. If a tool returns no data or an empty result, say so plainly instead of making something up.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_inventory_overview',
    description:
      'Get the total stock valuation across all warehouses and the list of products at or below their reorder point (low stock). Use for any question about stock levels, inventory value, or what needs reordering.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_sales_overview',
    description:
      'Get a summary of sales invoices over a recent period: invoice count, total revenue, amount collected vs outstanding, and the top customers by revenue. Use for any question about sales, revenue, or top customers.',
    input_schema: {
      type: 'object',
      properties: {
        days: {
          type: 'integer',
          description: 'How many days back to look. Defaults to 30.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_purchasing_overview',
    description:
      'Get a summary of purchase orders: counts by status (draft, partially received, received), total open order value, and the top suppliers by outstanding balance. Use for any question about purchasing, suppliers, or supplier balances in aggregate.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_pending_approvals',
    description:
      "Get the current user's pending approval requests (source module, amount, how long it has been waiting). Use for any question about approvals, pending requests, or what needs the user's sign-off.",
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'lookup_party_balance',
    description:
      'Look up the current balance owed by a customer, or owed to a supplier, by name (partial match). Use whenever a question names a specific customer or supplier and asks about their balance, credit, or how much they owe/are owed.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Full or partial name of the customer or supplier.' },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
];

@Injectable()
export class AssistantService {
  private client: Anthropic | null = null;

  constructor(
    private prisma: PrismaService,
    private approvals: ApprovalsService,
  ) {}

  private getClient(): Anthropic {
    const config = getAppConfig();
    if (!config.assistant.anthropicApiKey) {
      throw new ServiceUnavailableException(
        'The assistant is not configured. Ask your administrator to set ANTHROPIC_API_KEY.',
      );
    }
    if (!this.client) {
      this.client = new Anthropic({ apiKey: config.assistant.anthropicApiKey });
    }
    return this.client;
  }

  async chat(tenantId: string, userId: string, message: string, history: AssistantMessage[]): Promise<string> {
    const client = this.getClient();
    const config = getAppConfig();

    const messages: Anthropic.MessageParam[] = [
      ...history.slice(-20).map((m) => ({ role: m.role, content: m.content }) as Anthropic.MessageParam),
      { role: 'user', content: message },
    ];

    for (let iteration = 0; iteration < 6; iteration++) {
      const response = await client.messages.create({
        model: config.assistant.model,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages,
      });

      if (response.stop_reason !== 'tool_use') {
        return response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
          .trim();
      }

      messages.push({ role: 'assistant', content: response.content });

      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of toolUseBlocks) {
        let result: unknown;
        try {
          result = await this.executeTool(tenantId, userId, block.name, block.input as Record<string, unknown>);
        } catch (err) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: err instanceof Error ? err.message : 'Tool failed',
            is_error: true,
          });
          continue;
        }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }

      messages.push({ role: 'user', content: toolResults });
    }

    return 'I could not finish looking that up — please try asking again, or rephrase your question.';
  }

  private async executeTool(
    tenantId: string,
    userId: string,
    name: string,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    switch (name) {
      case 'get_inventory_overview':
        return this.getInventoryOverview(tenantId);
      case 'get_sales_overview':
        return this.getSalesOverview(tenantId, typeof input.days === 'number' ? input.days : 30);
      case 'get_purchasing_overview':
        return this.getPurchasingOverview(tenantId);
      case 'get_pending_approvals':
        return this.getPendingApprovals(tenantId, userId);
      case 'lookup_party_balance':
        return this.lookupPartyBalance(tenantId, String(input.name ?? ''));
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  private async getInventoryOverview(tenantId: string) {
    const balances = await this.prisma.stockBalance.findMany({
      where: { tenantId },
      include: { warehouse: { select: { name: true } } },
    });
    let totalValue = 0;
    for (const b of balances) totalValue += Number(b.quantity) * Number(b.avgCost);

    const lowStock = await this.prisma.product.findMany({
      where: { tenantId, deletedAt: null, isActive: true, trackInventory: true, reorderPoint: { gt: 0 } },
      select: { id: true, sku: true, name: true, reorderPoint: true, reorderQuantity: true },
      take: 200,
    });
    const stockByProduct = new Map<string, number>();
    for (const b of balances) {
      stockByProduct.set(b.productId, (stockByProduct.get(b.productId) ?? 0) + Number(b.quantity));
    }
    const belowReorder = lowStock
      .map((p) => ({
        sku: p.sku,
        name: p.name,
        onHand: stockByProduct.get(p.id) ?? 0,
        reorderPoint: Number(p.reorderPoint),
      }))
      .filter((p) => p.onHand <= p.reorderPoint)
      .slice(0, 15);

    return {
      totalStockValue: Math.round(totalValue * 100) / 100,
      warehouseCount: new Set(balances.map((b) => b.warehouseId)).size,
      lowStockItems: belowReorder,
      lowStockCount: belowReorder.length,
    };
  }

  private async getSalesOverview(tenantId: string, days: number) {
    const since = new Date();
    since.setDate(since.getDate() - Math.max(1, Math.min(days, 365)));

    const invoices = await this.prisma.salesInvoice.findMany({
      where: { tenantId, deletedAt: null, invoiceDate: { gte: since } },
      include: { customer: { select: { name: true } } },
    });

    const totalRevenue = invoices.reduce((sum, i) => sum + Number(i.total), 0);
    const totalPaid = invoices.reduce((sum, i) => sum + Number(i.paidAmount), 0);

    const byCustomer = new Map<string, number>();
    for (const inv of invoices) {
      const label = inv.customer?.name ?? 'Walk-in / unspecified';
      byCustomer.set(label, (byCustomer.get(label) ?? 0) + Number(inv.total));
    }
    const topCustomers = [...byCustomer.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, total]) => ({ name, total: Math.round(total * 100) / 100 }));

    return {
      periodDays: days,
      invoiceCount: invoices.length,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalCollected: Math.round(totalPaid * 100) / 100,
      totalOutstanding: Math.round((totalRevenue - totalPaid) * 100) / 100,
      topCustomers,
    };
  }

  private async getPurchasingOverview(tenantId: string) {
    const orders = await this.prisma.purchaseOrder.findMany({
      where: { tenantId },
      select: { status: true, total: true },
    });
    const byStatus: Record<string, { count: number; value: number }> = {};
    for (const o of orders) {
      const key = o.status;
      byStatus[key] = byStatus[key] ?? { count: 0, value: 0 };
      byStatus[key].count += 1;
      byStatus[key].value += Number(o.total);
    }

    const suppliers = await this.prisma.supplier.findMany({
      where: { tenantId, deletedAt: null, isActive: true },
      select: { name: true, balance: true },
      orderBy: { balance: 'desc' },
      take: 5,
    });

    return {
      ordersByStatus: byStatus,
      topSuppliersByBalance: suppliers.map((s) => ({ name: s.name, balance: Number(s.balance) })),
    };
  }

  private async getPendingApprovals(tenantId: string, userId: string) {
    const pending = await this.approvals.listPendingForApprover(tenantId, userId);
    return {
      count: pending.length,
      items: pending.slice(0, 15).map((p) => ({
        sourceModule: p.sourceModule,
        sourceType: p.sourceType,
        amount: p.amount ? Number(p.amount) : null,
        requestedAt: p.requestedAt,
        waitingSince: p.requestedAt,
      })),
    };
  }

  private async lookupPartyBalance(tenantId: string, name: string) {
    if (!name.trim()) return { found: false, message: 'No name provided' };

    const [customers, suppliers] = await Promise.all([
      this.prisma.customer.findMany({
        where: { tenantId, deletedAt: null, name: { contains: name, mode: 'insensitive' } },
        select: { name: true, code: true, balance: true, creditLimit: true },
        take: 5,
      }),
      this.prisma.supplier.findMany({
        where: { tenantId, deletedAt: null, name: { contains: name, mode: 'insensitive' } },
        select: { name: true, code: true, balance: true },
        take: 5,
      }),
    ]);

    if (customers.length === 0 && suppliers.length === 0) {
      return { found: false, message: `No customer or supplier matching "${name}"` };
    }

    return {
      found: true,
      customers: customers.map((c) => ({
        name: c.name,
        code: c.code,
        balanceOwedByCustomer: Number(c.balance),
        creditLimit: Number(c.creditLimit),
      })),
      suppliers: suppliers.map((s) => ({
        name: s.name,
        code: s.code,
        balanceOwedToSupplier: Number(s.balance),
      })),
    };
  }
}
