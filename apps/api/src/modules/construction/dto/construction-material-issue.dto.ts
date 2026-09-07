import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { ConstructionMaterialIssueStatus } from '../../../../../../packages/database/generated/server';

export class CreateConstructionMaterialIssueLineDto {
  @IsUUID()
  productId!: string;

  @IsString()
  quantity!: string;

  @IsOptional()
  @IsUUID()
  costCenterId?: string;
}

export class CreateConstructionMaterialIssueDto {
  @IsUUID()
  projectId!: string;

  @IsUUID()
  warehouseId!: string;

  @IsOptional()
  @IsUUID()
  boqItemId?: string;

  @IsOptional()
  @IsUUID()
  costCenterId?: string;

  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  sourceModule?: string;

  @IsOptional()
  @IsString()
  sourceType?: string;

  @IsOptional()
  @IsUUID()
  sourceId?: string;

  @IsOptional()
  @IsString()
  sourceEvent?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateConstructionMaterialIssueLineDto)
  lines!: CreateConstructionMaterialIssueLineDto[];
}

export class ListConstructionMaterialIssuesQueryDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsEnum(ConstructionMaterialIssueStatus)
  status?: ConstructionMaterialIssueStatus;

  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  limit?: number;
}
