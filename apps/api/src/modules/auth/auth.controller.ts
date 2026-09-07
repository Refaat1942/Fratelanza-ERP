import { Controller, Post, Body, Req, UseGuards, HttpCode } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto, RefreshTokenDto } from './dto/auth.dto';
import { Public, CurrentUser, LicenseExempt } from '../../common/decorators';
import { JwtAuthGuard } from '../../common/guards';
import type { JwtPayload } from '@fratelanza/types';

@Controller('auth')
@LicenseExempt()
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const data = await this.authService.login(
      dto,
      req.ip,
      req.headers['user-agent'],
    );
    return { success: true, data };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() dto: RefreshTokenDto) {
    const data = await this.authService.refresh(dto.refreshToken);
    return { success: true, data };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(200)
  async logout(@CurrentUser() user: JwtPayload) {
    const data = await this.authService.logout(user.sessionId, user.sub);
    return { success: true, data };
  }
}
