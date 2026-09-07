import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { getAppConfig } from '../../../config/app-config';

@Injectable()
export class PartyLegacyRoutingGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    if (!getAppConfig().partyLegacyRoutingEnabled) {
      throw new NotFoundException('Party-aware Sales routing is not enabled');
    }
    return true;
  }
}
