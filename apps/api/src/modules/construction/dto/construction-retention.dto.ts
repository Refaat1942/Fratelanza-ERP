import {
  IsEnum,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ConstructionSubledgerPartyType } from '../../../../../../packages/database/generated/server';

export class ListConstructionRetentionQueryDto {
  @IsOptional()
  @IsUUID()
  contractId?: string;

  @IsOptional()
  @IsEnum(ConstructionSubledgerPartyType)
  partyType?: ConstructionSubledgerPartyType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export class RecordRetentionReleaseDto {
  @IsUUID()
  contractId!: string;

  @IsEnum(ConstructionSubledgerPartyType)
  partyType!: ConstructionSubledgerPartyType;

  @IsNumberString()
  amount!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class RecordRetentionHoldFromProgressDto {
  @IsUUID()
  progressId!: string;

  @IsEnum(ConstructionSubledgerPartyType)
  partyType!: ConstructionSubledgerPartyType;
}

export class GetRetentionBalanceQueryDto {
  @IsUUID()
  contractId!: string;

  @IsEnum(ConstructionSubledgerPartyType)
  partyType!: ConstructionSubledgerPartyType;
}
