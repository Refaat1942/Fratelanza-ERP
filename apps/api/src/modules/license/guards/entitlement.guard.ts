import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { JwtPayload } from '@fratelanza/types';
import {
  IS_PUBLIC_KEY,
  LICENSE_EXEMPT_KEY,
  REQUIRE_FEATURE_KEY,
  REQUIRE_MODULE_KEY,
} from '../../../common/decorators';
import { EntitlementService } from '../entitlement.service';

@Injectable()
export class EntitlementGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private entitlementService: EntitlementService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const isLicenseExempt = this.reflector.getAllAndOverride<boolean>(
      LICENSE_EXEMPT_KEY,
      [context.getHandler(), context.getClass()],
    );

    const requiredModules = this.reflector.getAllAndOverride<string[]>(
      REQUIRE_MODULE_KEY,
      [context.getHandler(), context.getClass()],
    );
    const requiredFeatures = this.reflector.getAllAndOverride<string[]>(
      REQUIRE_FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (
      isLicenseExempt &&
      (!requiredModules || requiredModules.length === 0) &&
      (!requiredFeatures || requiredFeatures.length === 0)
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const tenantId = request.user?.tenantId;
    if (!tenantId) {
      throw new UnauthorizedException('Tenant context required');
    }

    if (requiredModules?.length) {
      for (const moduleKey of requiredModules) {
        await this.entitlementService.requireModule(tenantId, moduleKey);
      }
    }

    if (requiredFeatures?.length) {
      for (const featureKey of requiredFeatures) {
        await this.entitlementService.requireFeature(tenantId, featureKey);
      }
    }

    return true;
  }
}
