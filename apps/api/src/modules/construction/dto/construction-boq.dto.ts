import {
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
  ConstructionBoqStatus,
  ConstructionCostCategory,
} from '../../../../../../packages/database/generated/server';

export class CreateConstructionBoqDto {
  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  currency?: string;
}

export class UpdateConstructionBoqDto {
  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsString()
  currency?: string;
}

export class ListConstructionBoqsQueryDto {
  @IsOptional()
  @IsEnum(ConstructionBoqStatus)
  status?: ConstructionBoqStatus;

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

export class CreateConstructionBoqSectionDto {
  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sequence?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  parentSectionId?: string;
}

export class UpdateConstructionBoqSectionDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sequence?: number;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsUUID()
  parentSectionId?: string | null;
}

export class CreateConstructionBoqItemDto {
  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  lineNumber?: number;

  @IsOptional()
  @IsString()
  itemCode?: string;

  @IsString()
  description!: string;

  @IsOptional()
  @IsUUID()
  unitId?: string;

  @IsOptional()
  @IsString()
  unitCode?: string;

  @IsNumberString()
  plannedQuantity!: string;

  @IsNumberString()
  unitRate!: string;

  @IsOptional()
  @IsString()
  costCode?: string;

  @IsOptional()
  @IsUUID()
  costCenterId?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsEnum(ConstructionCostCategory)
  category?: ConstructionCostCategory;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateConstructionBoqItemDto {
  @IsOptional()
  @IsUUID()
  sectionId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  lineNumber?: number;

  @IsOptional()
  @IsString()
  itemCode?: string | null;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  unitId?: string | null;

  @IsOptional()
  @IsString()
  unitCode?: string | null;

  @IsOptional()
  @IsNumberString()
  plannedQuantity?: string;

  @IsOptional()
  @IsNumberString()
  unitRate?: string;

  @IsOptional()
  @IsString()
  costCode?: string | null;

  @IsOptional()
  @IsUUID()
  costCenterId?: string | null;

  @IsOptional()
  @IsUUID()
  productId?: string | null;

  @IsOptional()
  @IsEnum(ConstructionCostCategory)
  category?: ConstructionCostCategory | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}
