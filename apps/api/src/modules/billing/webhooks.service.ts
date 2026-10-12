import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { Prisma, SubscriptionStatus } from '../../../../../packages/database/generated/server';
import { PrismaService } from '../../database/prisma.service';

const STRIPE_STATUS_MAP: Record<string, SubscriptionStatus> = {
  trialing: SubscriptionStatus.trialing,
  active: SubscriptionStatus.active,
  past_due: SubscriptionStatus.past_due,
  canceled: SubscriptionStatus.canceled,
  unpaid: SubscriptionStatus.past_due,
  incomplete: SubscriptionStatus.trialing,
  incomplete_expired: SubscriptionStatus.canceled,
  paused: SubscriptionStatus.suspended,
};

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private prisma: PrismaService) {}

  /** Returns true if this event was already processed (safe to no-op). */
  private async recordEvent(
    provider: 'stripe' | 'paymob',
    eventType: string,
    providerEventId: string,
    payload: unknown,
  ): Promise<boolean> {
    try {
      await this.prisma.billingWebhookEvent.create({
        data: {
          provider,
          eventType,
          providerEventId,
          payload: payload as Prisma.InputJsonValue,
        },
      });
      return false;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        this.logger.log(`Duplicate ${provider} webhook ${providerEventId}, skipping`);
        return true;
      }
      throw error;
    }
  }

  private async markProcessed(providerEventId: string) {
    await this.prisma.billingWebhookEvent.update({
      where: { providerEventId },
      data: { processedAt: new Date() },
    });
  }

  async handleStripeEvent(event: Stripe.Event): Promise<void> {
    const alreadyProcessed = await this.recordEvent('stripe', event.type, event.id, event);
    if (alreadyProcessed) return;

    switch (event.type) {
      case 'checkout.session.completed':
        await this.onStripeCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.updated':
        await this.onStripeSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await this.onStripeSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.paid':
        await this.onStripeInvoice(event.data.object as Stripe.Invoice, 'paid');
        break;
      case 'invoice.payment_failed':
        await this.onStripeInvoice(event.data.object as Stripe.Invoice, 'open');
        break;
      default:
        this.logger.log(`Unhandled Stripe event type: ${event.type}`);
    }

    await this.markProcessed(event.id);
  }

  private async onStripeCheckoutCompleted(session: Stripe.Checkout.Session) {
    const tenantId = session.metadata?.tenantId;
    const planId = session.metadata?.planId;
    const billingCycle = (session.metadata?.billingCycle as 'monthly' | 'yearly') ?? 'monthly';
    if (!tenantId || !planId) {
      this.logger.warn(`Stripe checkout.session.completed missing tenantId/planId metadata (session ${session.id})`);
      return;
    }

    const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
    const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;

    await this.prisma.subscription.upsert({
      where: { tenantId },
      create: {
        tenantId,
        planId,
        status: 'active',
        billingCycle,
        provider: 'stripe',
        providerCustomerId: customerId,
        providerSubscriptionId: subscriptionId,
        currentPeriodStart: new Date(),
      },
      update: {
        planId,
        status: 'active',
        billingCycle,
        provider: 'stripe',
        providerCustomerId: customerId,
        providerSubscriptionId: subscriptionId,
      },
    });
  }

  private async onStripeSubscriptionUpdated(subscription: Stripe.Subscription) {
    const existing = await this.prisma.subscription.findFirst({
      where: { providerSubscriptionId: subscription.id },
    });
    if (!existing) return;

    await this.prisma.subscription.update({
      where: { tenantId: existing.tenantId },
      data: {
        status: STRIPE_STATUS_MAP[subscription.status] ?? existing.status,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      },
    });
  }

  private async onStripeSubscriptionDeleted(subscription: Stripe.Subscription) {
    const existing = await this.prisma.subscription.findFirst({
      where: { providerSubscriptionId: subscription.id },
    });
    if (!existing) return;

    await this.prisma.subscription.update({
      where: { tenantId: existing.tenantId },
      data: { status: 'canceled', canceledAt: new Date() },
    });
  }

  private async onStripeInvoice(invoice: Stripe.Invoice, status: 'paid' | 'open') {
    const subscriptionRef = (invoice as unknown as { subscription?: string | { id: string } }).subscription;
    const stripeSubscriptionId = typeof subscriptionRef === 'string' ? subscriptionRef : subscriptionRef?.id;
    if (!stripeSubscriptionId) return;

    const subscription = await this.prisma.subscription.findFirst({
      where: { providerSubscriptionId: stripeSubscriptionId },
    });
    if (!subscription) return;

    if (status === 'open') {
      await this.prisma.subscription.update({
        where: { tenantId: subscription.tenantId },
        data: { status: 'past_due' },
      });
    }

    await this.prisma.subscriptionInvoice.create({
      data: {
        subscriptionId: subscription.id,
        tenantId: subscription.tenantId,
        provider: 'stripe',
        providerInvoiceId: invoice.id,
        status,
        amount: (invoice.amount_paid || invoice.amount_due) / 100,
        currency: invoice.currency.toUpperCase(),
        issuedAt: invoice.created ? new Date(invoice.created * 1000) : new Date(),
        paidAt: status === 'paid' ? new Date() : undefined,
        hostedInvoiceUrl: invoice.hosted_invoice_url ?? undefined,
      },
    });
  }

  /**
   * Paymob has no native recurring-subscription concept the way Stripe does;
   * each billing period is its own one-time "transaction processed" webhook.
   * We recover (tenantId, planId) from the merchant_order_id we set at
   * checkout time (see CheckoutService) rather than from a stored customer
   * mapping. Renewal/dunning automation is out of scope for this phase.
   */
  async handlePaymobEvent(payload: { obj?: Record<string, unknown> }): Promise<void> {
    const obj = payload.obj;
    if (!obj) return;

    const transactionId = String(obj.id ?? '');
    if (!transactionId) return;

    const alreadyProcessed = await this.recordEvent('paymob', 'transaction.processed', transactionId, payload);
    if (alreadyProcessed) return;

    const success = obj.success === true && obj.pending === false;
    const order = obj.order as { id?: number; merchant_order_id?: string } | undefined;
    const merchantOrderId = order?.merchant_order_id ?? '';
    const [, tenantId, planId] = merchantOrderId.split('-');

    if (success && tenantId && planId) {
      const amount = Number(obj.amount_cents ?? 0) / 100;

      const subscription = await this.prisma.subscription.upsert({
        where: { tenantId },
        create: {
          tenantId,
          planId,
          status: 'active',
          billingCycle: 'monthly',
          provider: 'paymob',
          providerSubscriptionId: order?.id ? String(order.id) : undefined,
          currentPeriodStart: new Date(),
        },
        update: {
          planId,
          status: 'active',
          provider: 'paymob',
          providerSubscriptionId: order?.id ? String(order.id) : undefined,
        },
      });

      await this.prisma.subscriptionInvoice.create({
        data: {
          subscriptionId: subscription.id,
          tenantId,
          provider: 'paymob',
          providerPaymentId: transactionId,
          status: 'paid',
          amount,
          currency: String(obj.currency ?? 'EGP'),
          issuedAt: new Date(),
          paidAt: new Date(),
        },
      });
    } else {
      this.logger.warn(`Paymob transaction ${transactionId} not successful or missing order metadata`);
    }

    await this.markProcessed(transactionId);
  }
}
