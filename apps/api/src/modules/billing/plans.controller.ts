import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PlansService } from './plans.service';
import { PlatformAdminGuard } from '../platform/platform-admin.guard';

class CreatePlanDto {
  @IsString() code!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsNumber() @Min(0) priceMonthly!: number;
  @IsOptional() @IsNumber() @Min(0) priceYearly?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsNumber() @Min(1) maxUsers?: number;
  @IsOptional() @IsNumber() @Min(1) maxBranches?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isPublic?: boolean;
  @IsOptional() @IsNumber() sortOrder?: number;
  @IsArray() moduleIds!: string[];
}

class UpdatePlanDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() @Min(0) priceMonthly?: number;
  @IsOptional() @IsNumber() @Min(0) priceYearly?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsNumber() @Min(1) maxUsers?: number;
  @IsOptional() @IsNumber() @Min(1) maxBranches?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isPublic?: boolean;
  @IsOptional() @IsNumber() sortOrder?: number;
  @IsOptional() @IsArray() moduleIds?: string[];
}

@Controller('billing/plans')
@UseGuards(PlatformAdminGuard)
export class PlansController {
  constructor(private plansService: PlansService) {}

  @Get()
  async list() {
    const data = await this.plansService.list();
    return { success: true, data };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const data = await this.plansService.findById(id);
    return { success: true, data };
  }

  @Post()
  async create(@Body() dto: CreatePlanDto) {
    const data = await this.plansService.create(dto);
    return { success: true, data };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    const data = await this.plansService.update(id, dto);
    return { success: true, data };
  }
}
