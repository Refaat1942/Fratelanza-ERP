import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { getAppConfig } from '../../../config/app-config';

@Injectable()
export class PurchasingPartyRoutingGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    if (!getAppConfig().purchasingPartyRoutingEnabled) {
      throw new NotFoundException('Party-aware Purchasing routing is not enabled');
    }
    return true;
  }
}
