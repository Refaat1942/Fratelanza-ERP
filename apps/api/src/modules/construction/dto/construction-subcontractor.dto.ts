import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import {
  ConstructionSubcontractorAssignmentStatus,
  ConstructionSubcontractorProfileStatus,
} from '../../../../../../packages/database/generated/server';

export class CreateConstructionSubcontractorProfileDto {
  @IsUUID()
  partyId!: string;

  @IsOptional()
  @IsString()
  trade?: string;

  @IsOptional()
  @IsString()
  specialty?: string;

  @IsOptional()
  @IsString()
  complianceNotes?: string;

  @IsOptional()
  @IsEnum(ConstructionSubcontractorProfileStatus)
  status?: ConstructionSubcontractorProfileStatus;
}

export class UpdateConstructionSubcontractorProfileDto {
  @IsOptional()
  @IsString()
  trade?: string;

  @IsOptional()
  @IsString()
  specialty?: string;

  @IsOptional()
  @IsString()
  complianceNotes?: string;

  @IsOptional()
  @IsEnum(ConstructionSubcontractorProfileStatus)
  status?: ConstructionSubcontractorProfileStatus;
}

export class ListConstructionSubcontractorsQueryDto {
  @IsOptional()
  @IsUUID()
  partyId?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsEnum(ConstructionSubcontractorProfileStatus)
  status?: ConstructionSubcontractorProfileStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class CreateConstructionSubcontractorAssignmentDto {
  @IsUUID()
  projectId!: string;

  @IsOptional()
  @IsUUID()
  contractId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDateString()
  assignedAt?: string;

  @IsOptional()
  @IsEnum(ConstructionSubcontractorAssignmentStatus)
  status?: ConstructionSubcontractorAssignmentStatus;
}

export class UpdateConstructionSubcontractorAssignmentDto {
  @IsOptional()
  @IsEnum(ConstructionSubcontractorAssignmentStatus)
  status?: ConstructionSubcontractorAssignmentStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ListConstructionSubcontractorAssignmentsQueryDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsUUID()
  contractId?: string;

  @IsOptional()
  @IsEnum(ConstructionSubcontractorAssignmentStatus)
  status?: ConstructionSubcontractorAssignmentStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
