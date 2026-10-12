import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { JwtPayload } from '@fratelanza/types';
import { MODULE_KEY } from '../decorators';
import { ModuleAccessService } from '../services/module-access.service';

@Injectable()
export class ModuleAccessGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private moduleAccess: ModuleAccessService,
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

    if (user.disabledModules?.includes(moduleId)) {
      throw new ForbiddenException(`Module "${moduleId}" has been hidden for this user`);
    }

    await this.moduleAccess.assertModuleEnabled(user.tenantId, moduleId);
    return true;
  }
}
