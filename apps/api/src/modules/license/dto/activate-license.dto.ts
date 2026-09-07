import {
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class LicenseModuleDto {
  @IsString()
  key!: string;

  @IsIn(['perpetual', 'time_limited'])
  termType!: 'perpetual' | 'time_limited';

  @IsOptional()
  @IsISO8601()
  expiresAt?: string | null;
}

export class ActivateLicenseDto {
  @IsUUID()
  licenseId!: string;

  @IsString()
  licenseKey!: string;

  @IsIn(['perpetual', 'time_limited'])
  licenseType!: 'perpetual' | 'time_limited';

  @IsIn(['starter', 'professional', 'business', 'enterprise'])
  edition!: 'starter' | 'professional' | 'business' | 'enterprise';

  @IsISO8601()
  issuedAt!: string;

  @IsString()
  tenantId!: string;

  @ValidateNested({ each: true })
  @Type(() => LicenseModuleDto)
  @IsArray()
  modules!: LicenseModuleDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @IsOptional()
  @IsISO8601()
  expiresAt?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  graceDays?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxUsers?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxBranches?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxDevices?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxStorageMb?: number | null;

  @IsOptional()
  @IsString()
  installationId?: string | null;

  @IsString()
  signature!: string;
}
