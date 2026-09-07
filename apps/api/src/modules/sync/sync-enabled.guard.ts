import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ServiceUnavailableException,
} from '@nestjs/common';
import { getAppConfig } from '../../config/app-config';

@Injectable()
export class SyncEnabledGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    if (!getAppConfig().syncEnabled) {
      throw new ServiceUnavailableException(
        'Sync is disabled in LAN MVP mode. Clients must use the central server directly.',
      );
    }
    return true;
  }
}
