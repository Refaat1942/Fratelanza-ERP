import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { JwtPayload } from '@fratelanza/types';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const PERMISSIONS_KEY = 'permissions';
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const REQUIRE_MODULE_KEY = 'requireModule';
export const RequireModule = (...modules: string[]) =>
  SetMetadata(REQUIRE_MODULE_KEY, modules);

export const REQUIRE_FEATURE_KEY = 'requireFeature';
export const RequireFeature = (...features: string[]) =>
  SetMetadata(REQUIRE_FEATURE_KEY, features);

export const LICENSE_EXEMPT_KEY = 'licenseExempt';
export const LicenseExempt = () => SetMetadata(LICENSE_EXEMPT_KEY, true);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest<{ user: JwtPayload }>();
    return request.user;
  },
);

export const TenantId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<{ user: JwtPayload }>();
    return request.user.tenantId;
  },
);
