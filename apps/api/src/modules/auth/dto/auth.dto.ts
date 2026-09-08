import { IsNotEmpty, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

export class LoginDto {
  @ValidateIf((dto: LoginDto) => !dto.email)
  @IsString()
  @IsNotEmpty()
  username?: string;

  /** @deprecated Old clients send email — treated as username. */
  @ValidateIf((dto: LoginDto) => !dto.username)
  @IsString()
  @IsNotEmpty()
  email?: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsOptional()
  @IsString()
  deviceFingerprint?: string;

  @IsOptional()
  @IsString()
  deviceName?: string;
}

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
