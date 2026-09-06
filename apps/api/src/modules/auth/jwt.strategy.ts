import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { JwtPayload } from '@fratelanza/types';
import { AuthService } from '../../modules/auth/auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'development-secret-change-in-production',
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload & { permissions: string[] }> {
    if (payload.type !== 'access') {
      throw new Error('Invalid token type');
    }
    const permissions = await this.authService.getUserPermissions(payload.sub);
    return { ...payload, permissions };
  }
}
