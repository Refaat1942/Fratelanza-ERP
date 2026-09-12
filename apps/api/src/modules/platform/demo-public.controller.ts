import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { Public } from '../../common/decorators';
import { PrismaService } from '../../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import { PlatformService } from './platform.service';

class DemoLoginDto {
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() password?: string;
}

@Controller('demo')
export class DemoPublicController {
  constructor(
    private platformService: PlatformService,
    private authService: AuthService,
    private prisma: PrismaService,
  ) {}

  @Public()
  @Get(':country/:vertical')
  async getDemoNested(
    @Param('country') country: string,
    @Param('vertical') vertical: string,
  ) {
    const data = await this.platformService.getDemoBySlug(`${country}/${vertical}`.toLowerCase());
    return { success: true, data };
  }

  @Public()
  @Post(':country/:vertical/login')
  async demoLoginNested(
    @Param('country') country: string,
    @Param('vertical') vertical: string,
    @Body() dto: DemoLoginDto,
  ) {
    return this.performDemoLogin(`${country}/${vertical}`.toLowerCase(), dto);
  }

  @Public()
  @Get(':slug')
  async getDemo(@Param('slug') slug: string) {
    const data = await this.platformService.getDemoBySlug(slug);
    return { success: true, data };
  }

  @Public()
  @Post(':slug/login')
  async demoLogin(@Param('slug') slug: string, @Body() dto: DemoLoginDto) {
    return this.performDemoLogin(slug.toLowerCase(), dto);
  }

  private async performDemoLogin(slug: string, dto: DemoLoginDto) {
    const demoRecord = await this.prisma.demoEnvironment.findFirst({
      where: { slug, enabled: true },
      include: {
        demoUser: true,
        tenant: true,
      },
    });

    if (!demoRecord || !demoRecord.tenant.isActive || demoRecord.tenant.status !== 'ACTIVE') {
      return { success: false, error: { code: 'DEMO_UNAVAILABLE', message: 'Demo not available' } };
    }

    const fallbackUser = await this.prisma.user.findFirst({
      where: { tenantId: demoRecord.tenantId, isActive: true, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });

    const loginId = dto.username ?? demoRecord.demoUser?.email ?? fallbackUser?.email;
    if (!loginId) {
      return { success: false, error: { code: 'DEMO_USER_MISSING', message: 'Demo user not configured' } };
    }

    const password = dto.password ?? process.env.DEMO_SEED_PASSWORD ?? 'Eval@2026!Demo';
    const result = await this.authService.login(
      { username: loginId, password },
      undefined,
      'Demo Browser',
    );

    return {
      success: true,
      data: {
        ...result,
        demo: {
          slug: demoRecord.slug,
          name: demoRecord.name,
          modules: demoRecord.modules,
        },
      },
    };
  }
}
