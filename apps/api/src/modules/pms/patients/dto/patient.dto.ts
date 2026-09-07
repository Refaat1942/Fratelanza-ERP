import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PatientGender, PatientNoteType, PatientStatus } from '../../../../../../../packages/database/generated/server';

export class PatientProfileDto {
  @IsOptional() @IsString() preferredLocale?: string;
  @IsOptional() @IsString() referralSource?: string;
  @IsOptional() @IsString() emergencyContactName?: string;
  @IsOptional() @IsString() emergencyContactPhone?: string;
}

export class CreatePatientDto {
  @IsString() @MinLength(1) firstName!: string;
  @IsString() @MinLength(1) lastName!: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsEnum(PatientGender) gender?: PatientGender;
  @IsOptional() @IsEnum(PatientStatus) status?: PatientStatus;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @ValidateNested() @Type(() => PatientProfileDto) profile?: PatientProfileDto;
}

export class UpdatePatientDto {
  @IsOptional() @IsString() @MinLength(1) firstName?: string;
  @IsOptional() @IsString() @MinLength(1) lastName?: string;
  @IsOptional() @IsString() branchId?: string | null;
  @IsOptional() @IsString() phone?: string | null;
  @IsOptional() @IsEmail() email?: string | null;
  @IsOptional() @IsString() address?: string | null;
  @IsOptional() @IsDateString() dateOfBirth?: string | null;
  @IsOptional() @IsEnum(PatientGender) gender?: PatientGender | null;
  @IsOptional() @IsEnum(PatientStatus) status?: PatientStatus;
  @IsOptional() @IsString() notes?: string | null;
}

export class ListPatientsQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number = 20;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsEnum(PatientStatus) status?: PatientStatus;
}

export class UpsertPatientProfileDto {
  @IsOptional() @IsString() preferredLocale?: string | null;
  @IsOptional() @IsString() referralSource?: string | null;
  @IsOptional() @IsString() emergencyContactName?: string | null;
  @IsOptional() @IsString() emergencyContactPhone?: string | null;
}

export class CreatePatientNoteDto {
  @IsString() @MinLength(1) content!: string;
  @IsOptional() @IsEnum(PatientNoteType) noteType?: PatientNoteType;
}
