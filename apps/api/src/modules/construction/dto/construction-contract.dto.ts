import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ConstructionContractDirection,
  ConstructionContractPricingModel,
  ConstructionContractStatus,
} from '../../../../../../packages/database/generated/server';

export class CreateConstructionContractDto {
  @IsUUID()
  projectId!: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(ConstructionContractDirection)
  direction!: ConstructionContractDirection;

  @IsUUID()
  partyId!: string;

  @IsEnum(ConstructionContractPricingModel)
  pricingModel!: ConstructionContractPricingModel;

  @IsOptional()
  @IsNumberString()
  originalValue?: string;

  @IsOptional()
  @IsBoolean()
  originalValueLocked?: boolean;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsNumberString()
  retentionPercent?: string;

  @IsOptional()
  @IsNumberString()
  retentionCap?: string;

  @IsOptional()
  @IsNumberString()
  advanceAmount?: string;

  @IsOptional()
  @IsNumberString()
  advancePercent?: string;

  @IsOptional()
  @IsString()
  paymentTerms?: string;
}

export class UpdateConstructionContractDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(ConstructionContractPricingModel)
  pricingModel?: ConstructionContractPricingModel;

  @IsOptional()
  @IsNumberString()
  originalValue?: string;

  @IsOptional()
  @IsBoolean()
  originalValueLocked?: boolean;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string | null;

  @IsOptional()
  @IsDateString()
  endDate?: string | null;

  @IsOptional()
  @IsNumberString()
  retentionPercent?: string | null;

  @IsOptional()
  @IsNumberString()
  retentionCap?: string | null;

  @IsOptional()
  @IsNumberString()
  advanceAmount?: string | null;

  @IsOptional()
  @IsNumberString()
  advancePercent?: string | null;

  @IsOptional()
  @IsString()
  paymentTerms?: string | null;
}

export class ListConstructionContractsQueryDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsEnum(ConstructionContractStatus)
  status?: ConstructionContractStatus;

  @IsOptional()
  @IsEnum(ConstructionContractDirection)
  direction?: ConstructionContractDirection;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class ContractStatusActionDto {
  @IsEnum(ConstructionContractStatus)
  status!: ConstructionContractStatus;
}
