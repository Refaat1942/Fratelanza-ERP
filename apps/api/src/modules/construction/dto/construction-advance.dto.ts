import { ConstructionSubledgerPartyType } from '../../../../../../packages/database/generated/server';
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

export class ListConstructionAdvanceQueryDto {
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

export class RecordAdvanceReceivedDto {
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

export class RecordAdvanceRecoveredDto {
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

export class GetAdvanceBalanceQueryDto {
  @IsUUID()
  contractId!: string;

  @IsEnum(ConstructionSubledgerPartyType)
  partyType!: ConstructionSubledgerPartyType;
}

export class CalculateRecoverableAdvanceQueryDto {
  @IsUUID()
  contractId!: string;

  @IsEnum(ConstructionSubledgerPartyType)
  partyType!: ConstructionSubledgerPartyType;

  @IsNumberString()
  grossAmount!: string;
}
