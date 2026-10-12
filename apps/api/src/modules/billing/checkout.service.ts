import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import Stripe from 'stripe';
import { getAppConfig } from '../../config/app-config';
import { PrismaService } from '../../database/prisma.service';

type BillingCycle = 'monthly' | 'yearly';

export interface CheckoutSession {
  provider: 'stripe' | 'paymob';
  url: string;
}

@Injectable()
export class CheckoutService {
  private stripeClient: Stripe | null = null;

  constructor(private prisma: PrismaService) {}

  private getStripe(): Stripe {
    if (!this.stripeClient) {
      const key = getAppConfig().billing.stripeSecretKey;
      if (!key) {
        throw new ServiceUnavailableException(
          'Stripe checkout is not configured. Ask your administrator to set STRIPE_SECRET_KEY.',
        );
      }
      this.stripeClient = new Stripe(key);
    }
    return this.stripeClient;
  }

  async createCheckoutSession(
    tenantId: string,
    planId: string,
    billingCycle: BillingCycle,
    provider: 'stripe' | 'paymob',
  ): Promise<CheckoutSession> {
    const [tenant, plan] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId } }),
      this.prisma.plan.findUnique({ where: { id: planId } }),
    ]);
    if (!tenant) throw new NotFoundException('Tenant not found');
    if (!plan) throw new NotFoundException('Plan not found');

    const amount = billingCycle === 'yearly' ? (plan.priceYearly ?? plan.priceMonthly) : plan.priceMonthly;

    return provider === 'stripe'
      ? this.createStripeSession(tenant, plan, Number(amount), billingCycle)
      : this.createPaymobSession(tenant, plan, Number(amount));
  }

  private async createStripeSession(
    tenant: { id: string; name: string },
    plan: { id: string; name: string; currency: string },
    amount: number,
    billingCycle: BillingCycle,
  ): Promise<CheckoutSession> {
    const stripe = this.getStripe();
    const appUrl = getAppConfig().appUrl;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          price_data: {
            currency: plan.currency.toLowerCase(),
            product_data: { name: `${plan.name} (${tenant.name})` },
            unit_amount: Math.round(amount * 100),
            recurring: { interval: billingCycle === 'yearly' ? 'year' : 'month' },
          },
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/control/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/control/billing/cancel`,
      metadata: { tenantId: tenant.id, planId: plan.id, billingCycle },
      subscription_data: { metadata: { tenantId: tenant.id, planId: plan.id, billingCycle } },
    });

    if (!session.url) {
      throw new ServiceUnavailableException('Stripe did not return a checkout URL');
    }
    return { provider: 'stripe', url: session.url };
  }

  private async createPaymobSession(
    tenant: { id: string; name: string },
    plan: { id: string; name: string },
    amount: number,
  ): Promise<CheckoutSession> {
    const config = getAppConfig().billing;
    if (!config.paymobApiKey || !config.paymobIntegrationId || !config.paymobIframeId) {
      throw new ServiceUnavailableException(
        'Paymob checkout is not configured. Ask your administrator to set PAYMOB_API_KEY, PAYMOB_INTEGRATION_ID, and PAYMOB_IFRAME_ID.',
      );
    }

    const amountCents = Math.round(amount * 100);

    const authRes = await paymobFetch('https://accept.paymob.com/api/auth/tokens', {
      api_key: config.paymobApiKey,
    });
    const authToken = authRes.token as string;

    const orderRes = await paymobFetch('https://accept.paymob.com/api/ecommerce/orders', {
      auth_token: authToken,
      delivery_needed: false,
      amount_cents: amountCents,
      currency: 'EGP',
      merchant_order_id: `sub-${tenant.id}-${plan.id}-${Date.now()}`,
      items: [],
    });
    const orderId = orderRes.id as number;

    const paymentKeyRes = await paymobFetch('https://accept.paymob.com/api/acceptance/payment_keys', {
      auth_token: authToken,
      amount_cents: amountCents,
      expiration: 3600,
      order_id: orderId,
      currency: 'EGP',
      integration_id: Number(config.paymobIntegrationId),
      billing_data: {
        first_name: tenant.name,
        last_name: 'NA',
        email: `billing+${tenant.id}@fratelanza.local`,
        phone_number: 'NA',
        apartment: 'NA',
        floor: 'NA',
        street: 'NA',
        building: 'NA',
        shipping_method: 'NA',
        postal_code: 'NA',
        city: 'NA',
        country: 'NA',
        state: 'NA',
      },
    });
    const paymentToken = paymentKeyRes.token as string;

    return {
      provider: 'paymob',
      url: `https://accept.paymob.com/api/acceptance/iframes/${config.paymobIframeId}?payment_token=${paymentToken}`,
    };
  }
}

async function paymobFetch(url: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new ServiceUnavailableException(`Paymob request to ${url} failed (${response.status})`);
  }
  return response.json() as Promise<Record<string, unknown>>;
}
