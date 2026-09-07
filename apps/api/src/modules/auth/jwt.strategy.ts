import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { JwtPayload } from '@fratelanza/types';
import { getAppConfig } from '../../config/app-config';
import { AuthService } from './auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    const config = getAppConfig();
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.jwt.secret,
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload & { permissions: string[] }> {
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }

    await this.authService.assertSessionActive(payload.sessionId, payload.sub);

    const permissions = await this.authService.getUserPermissions(payload.sub);
    return { ...payload, permissions };
  }
}
