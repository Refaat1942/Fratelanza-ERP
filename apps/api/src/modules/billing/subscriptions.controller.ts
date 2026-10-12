import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { SubscriptionsService } from './subscriptions.service';
import { PlatformAdminGuard } from '../platform/platform-admin.guard';

const STATUSES = ['trialing', 'active', 'past_due', 'canceled', 'suspended'] as const;
const CYCLES = ['monthly', 'yearly'] as const;

class AssignSubscriptionDto {
  @IsString() planId!: string;
  @IsOptional() @IsIn(STATUSES) status?: (typeof STATUSES)[number];
  @IsOptional() @IsIn(CYCLES) billingCycle?: (typeof CYCLES)[number];
  @IsOptional() @IsString() trialEndsAt?: string;
  @IsOptional() @IsString() currentPeriodEnd?: string;
  @IsOptional() @IsNumber() @Min(1) seats?: number;
}

class UpdateSubscriptionDto {
  @IsOptional() @IsString() planId?: string;
  @IsOptional() @IsIn(STATUSES) status?: (typeof STATUSES)[number];
  @IsOptional() @IsIn(CYCLES) billingCycle?: (typeof CYCLES)[number];
  @IsOptional() @IsBoolean() cancelAtPeriodEnd?: boolean;
  @IsOptional() @IsNumber() @Min(1) seats?: number;
}

@Controller('billing')
@UseGuards(PlatformAdminGuard)
export class SubscriptionsController {
  constructor(private subscriptionsService: SubscriptionsService) {}

  @Get('subscriptions')
  async list() {
    const data = await this.subscriptionsService.list();
    return { success: true, data };
  }

  @Get('tenants/:tenantId/subscription')
  async getForTenant(@Param('tenantId') tenantId: string) {
    const data = await this.subscriptionsService.findForTenant(tenantId);
    return { success: true, data };
  }

  @Post('tenants/:tenantId/subscription')
  async assign(@Param('tenantId') tenantId: string, @Body() dto: AssignSubscriptionDto) {
    const data = await this.subscriptionsService.assign(tenantId, dto);
    return { success: true, data };
  }

  @Patch('tenants/:tenantId/subscription')
  async update(@Param('tenantId') tenantId: string, @Body() dto: UpdateSubscriptionDto) {
    const data = await this.subscriptionsService.update(tenantId, dto);
    return { success: true, data };
  }
}
