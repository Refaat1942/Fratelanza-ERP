import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsString } from 'class-validator';
import { CheckoutService } from './checkout.service';
import { SubscriptionsService } from './subscriptions.service';
import { TenantId, RequirePermissions } from '../../common/decorators';
import { PermissionsGuard } from '../../common/guards';

const CYCLES = ['monthly', 'yearly'] as const;
const PROVIDERS = ['stripe', 'paymob'] as const;

class CreateCheckoutDto {
  @IsString() planId!: string;
  @IsIn(CYCLES) billingCycle!: (typeof CYCLES)[number];
  @IsIn(PROVIDERS) provider!: (typeof PROVIDERS)[number];
}

/** Tenant-facing billing endpoints - the Super Admin side lives in PlansController / SubscriptionsController. */
@Controller('billing')
@UseGuards(PermissionsGuard)
export class BillingController {
  constructor(
    private checkoutService: CheckoutService,
    private subscriptionsService: SubscriptionsService,
  ) {}

  @Get('my-subscription')
  @RequirePermissions('core:settings:read')
  async mySubscription(@TenantId() tenantId: string) {
    const data = await this.subscriptionsService.findForTenant(tenantId);
    return { success: true, data };
  }

  @Post('checkout')
  @RequirePermissions('core:settings:update')
  async checkout(@TenantId() tenantId: string, @Body() dto: CreateCheckoutDto) {
    const data = await this.checkoutService.createCheckoutSession(
      tenantId,
      dto.planId,
      dto.billingCycle,
      dto.provider,
    );
    return { success: true, data };
  }
}
