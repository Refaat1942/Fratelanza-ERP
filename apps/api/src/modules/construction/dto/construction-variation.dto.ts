import {
  ConstructionVariationStatus,
  ConstructionVariationType,
} from '../../../../../../packages/database/generated/server';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ListConstructionVariationsQueryDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsUUID()
  contractId?: string;

  @IsOptional()
  @IsUUID()
  boqId?: string;

  @IsOptional()
  @IsEnum(ConstructionVariationStatus)
  status?: ConstructionVariationStatus;

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

export class CreateConstructionVariationDto {
  @IsUUID()
  contractId!: string;

  @IsUUID()
  boqId!: string;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateConstructionVariationDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class RejectConstructionVariationDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

export class CreateConstructionVariationItemDto {
  @IsEnum(ConstructionVariationType)
  variationType!: ConstructionVariationType;

  @IsOptional()
  @IsUUID()
  boqItemId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  quantityDelta?: string;

  @IsOptional()
  @IsString()
  rateDelta?: string;

  @IsOptional()
  @IsString()
  lumpSumAmount?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  lineNumber?: number;

  @IsOptional()
  @IsUUID()
  costCenterId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  costCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateConstructionVariationItemDto {
  @IsOptional()
  @IsEnum(ConstructionVariationType)
  variationType?: ConstructionVariationType;

  @IsOptional()
  @IsUUID()
  boqItemId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  quantityDelta?: string;

  @IsOptional()
  @IsString()
  rateDelta?: string;

  @IsOptional()
  @IsString()
  lumpSumAmount?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  lineNumber?: number;

  @IsOptional()
  @IsUUID()
  costCenterId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  costCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
