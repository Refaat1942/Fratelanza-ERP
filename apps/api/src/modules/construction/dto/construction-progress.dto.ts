import {
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
import { ConstructionProgressStatus } from '../../../../../../packages/database/generated/server';

export class CreateConstructionProgressDto {
  @IsUUID()
  contractId!: string;

  @IsUUID()
  boqId!: string;

  @IsDateString()
  periodFrom!: string;

  @IsDateString()
  periodTo!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateConstructionProgressDto {
  @IsOptional()
  @IsDateString()
  periodFrom?: string;

  @IsOptional()
  @IsDateString()
  periodTo?: string;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class ListConstructionProgressQueryDto {
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
  @IsEnum(ConstructionProgressStatus)
  status?: ConstructionProgressStatus;

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

export class RejectConstructionProgressDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class CreateConstructionProgressItemDto {
  @IsUUID()
  boqItemId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  lineNumber?: number;

  @IsNumberString()
  currentPeriodQuantity!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateConstructionProgressItemDto {
  @IsOptional()
  @IsNumberString()
  currentPeriodQuantity?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  lineNumber?: number;

  @IsOptional()
  @IsString()
  notes?: string | null;
}
