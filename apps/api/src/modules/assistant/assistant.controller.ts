import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IsArray, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AssistantService } from './assistant.service';
import { CurrentUser, TenantId } from '../../common/decorators';
import { PermissionsGuard } from '../../common/guards';
import type { JwtPayload } from '@fratelanza/types';

class HistoryItemDto {
  @IsIn(['user', 'assistant']) role!: 'user' | 'assistant';
  @IsString() @MaxLength(8000) content!: string;
}

class ChatDto {
  @IsString() @MaxLength(4000) message!: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => HistoryItemDto)
  history?: HistoryItemDto[];
}

@Controller('assistant')
@UseGuards(PermissionsGuard)
export class AssistantController {
  constructor(private assistantService: AssistantService) {}

  @Post('chat')
  async chat(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChatDto,
  ) {
    const reply = await this.assistantService.chat(tenantId, user.sub, dto.message, dto.history ?? []);
    return { success: true, data: { reply } };
  }
}
