import { BadRequestException, Controller, Post, Query, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import Stripe from 'stripe';
import { Public } from '../../common/decorators';
import { getAppConfig } from '../../config/app-config';
import { WebhooksService } from './webhooks.service';

/**
 * Paymob's documented field order for the "Transaction Processed Callback"
 * HMAC (https://docs.paymob.com/docs/transaction-callbacks). Concatenate
 * these obj.* values as strings in this exact order, HMAC-SHA512 with the
 * integration's HMAC secret, hex-encode, and compare to the `hmac` query
 * param. Verify this list against Paymob's current docs before go-live -
 * their callback schema has changed between integration versions.
 */
const PAYMOB_HMAC_FIELDS = [
  'amount_cents',
  'created_at',
  'currency',
  'error_occured',
  'has_parent_transaction',
  'id',
  'integration_id',
  'is_3d_secure',
  'is_auth',
  'is_capture',
  'is_refunded',
  'is_standalone_payment',
  'is_voided',
  'order.id',
  'owner',
  'pending',
  'source_data.pan',
  'source_data.sub_type',
  'source_data.type',
  'success',
] as const;

@Controller('billing/webhooks')
export class WebhooksController {
  constructor(private webhooksService: WebhooksService) {}

  @Public()
  @Post('stripe')
  async stripe(@Req() req: RawBodyRequest<Request>) {
    const secret = getAppConfig().billing.stripeWebhookSecret;
    if (!secret) {
      throw new BadRequestException('Stripe webhook is not configured');
    }

    const signature = req.headers['stripe-signature'];
    if (!signature || typeof signature !== 'string') {
      throw new BadRequestException('Missing stripe-signature header');
    }

    let event: Stripe.Event;
    try {
      if (!req.rawBody) {
        throw new Error('Raw body unavailable - check NestFactory.create({ rawBody: true }) in main.ts');
      }
      event = Stripe.webhooks.constructEvent(req.rawBody, signature, secret);
    } catch (error) {
      throw new BadRequestException(`Invalid Stripe signature: ${(error as Error).message}`);
    }

    await this.webhooksService.handleStripeEvent(event);
    return { received: true };
  }

  @Public()
  @Post('paymob')
  async paymob(@Req() req: Request, @Query('hmac') hmac?: string) {
    const secret = getAppConfig().billing.paymobHmacSecret;
    if (!secret) {
      throw new BadRequestException('Paymob webhook is not configured');
    }
    if (!hmac) {
      throw new BadRequestException('Missing hmac query parameter');
    }

    const payload = req.body as { obj?: Record<string, unknown> };
    if (!verifyPaymobHmac(payload.obj, hmac, secret)) {
      throw new BadRequestException('Invalid Paymob HMAC');
    }

    await this.webhooksService.handlePaymobEvent(payload);
    return { received: true };
  }
}

function verifyPaymobHmac(obj: Record<string, unknown> | undefined, hmac: string, secret: string): boolean {
  if (!obj) return false;

  const concatenated = PAYMOB_HMAC_FIELDS.map((path) => stringifyField(obj, path)).join('');
  const computed = createHmac('sha512', secret).update(concatenated).digest('hex');

  const a = Buffer.from(computed, 'hex');
  const b = Buffer.from(hmac, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

function stringifyField(obj: Record<string, unknown>, path: string): string {
  const parts = path.split('.');
  let value: unknown = obj;
  for (const part of parts) {
    value = (value as Record<string, unknown> | undefined)?.[part];
  }
  if (value === null || value === undefined) return 'None';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}
