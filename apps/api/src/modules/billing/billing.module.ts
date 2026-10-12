import { Module } from '@nestjs/common';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { CheckoutService } from './checkout.service';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { BillingController } from './billing.controller';

@Module({
  controllers: [PlansController, SubscriptionsController, WebhooksController, BillingController],
  providers: [PlansService, SubscriptionsService, CheckoutService, WebhooksService],
})
export class BillingModule {}
