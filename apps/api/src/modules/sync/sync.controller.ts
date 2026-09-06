import {
  Controller, Get, Post, Body, Query, UseGuards,
} from '@nestjs/common';
import {
  IsString, IsArray, ValidateNested, IsOptional, IsNumber, IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SyncService } from './sync.service';
import { TenantId, RequirePermissions } from '../../common/decorators';
import { PermissionsGuard } from '../../common/guards';

class SyncItemDto {
  @IsString() entityType!: string;
  @IsString() entityId!: string;
  @IsString() operation!: string;
  @IsObject() payload!: Record<string, unknown>;
  @IsString() idempotencyKey!: string;
  @IsOptional() @IsNumber() version?: number;
}

class PushDto {
  @IsString() deviceId!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => SyncItemDto)
  items!: SyncItemDto[];
}

@Controller('sync')
@UseGuards(PermissionsGuard)
export class SyncController {
  constructor(private syncService: SyncService) {}

  @Post('push')
  @RequirePermissions('sync:sync:push')
  async push(@TenantId() tenantId: string, @Body() dto: PushDto) {
    const data = await this.syncService.push(tenantId, dto.deviceId, dto.items);
    return { success: true, data };
  }

  @Get('pull')
  @RequirePermissions('sync:sync:pull')
  async pull(
    @TenantId() tenantId: string,
    @Query('deviceId') deviceId: string,
    @Query('cursor') cursor?: string,
    @Query('entityType') entityType?: string,
  ) {
    const data = await this.syncService.pull(tenantId, deviceId, cursor, entityType);
    return { success: true, data };
  }

  @Get('status')
  @RequirePermissions('sync:sync:pull')
  async status(@TenantId() tenantId: string, @Query('deviceId') deviceId: string) {
    const data = await this.syncService.getStatus(tenantId, deviceId);
    return { success: true, data };
  }

  @Get('conflicts')
  @RequirePermissions('sync:sync:pull')
  async conflicts(@TenantId() tenantId: string, @Query('deviceId') deviceId: string) {
    const data = await this.syncService.listConflicts(tenantId, deviceId);
    return { success: true, data };
  }
}
