import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { JwtPayload } from '@fratelanza/types';
import { MODULE_KEY } from '../decorators';
import { TenantAccessService } from '../services/tenant-access.service';

@Injectable()
export class ModuleAccessGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private tenantAccess: TenantAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const moduleId = this.reflector.getAllAndOverride<string>(MODULE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!moduleId) return true;

    const request = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = request.user;
    if (!user?.tenantId) {
      throw new ForbiddenException('Authentication required');
    }
    if (user.isPlatformAdmin) return true;

    await this.tenantAccess.assertModuleEnabled(user.tenantId, moduleId);
    return true;
  }
}
