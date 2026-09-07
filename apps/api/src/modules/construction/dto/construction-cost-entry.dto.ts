import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';
import { ConstructionCostCategory } from '../../../../../../packages/database/generated/server';

export class CreateConstructionCostEntryDto {
  @IsEnum(ConstructionCostCategory)
  category!: ConstructionCostCategory;

  @IsString()
  @Matches(/^\d+(\.\d{1,4})?$/)
  amount!: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsUUID()
  costCenterId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsString()
  sourceModule!: string;

  @IsString()
  sourceType!: string;

  @IsUUID()
  sourceId!: string;

  @IsString()
  sourceEvent!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsDateString()
  occurredAt!: string;
}
