import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Public } from '../../common/decorators';

@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Public()
  @Get()
  async check() {
    let dbStatus = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'error';
    }

    return {
      success: true,
      data: {
        status: dbStatus === 'ok' ? 'healthy' : 'degraded',
        version: '0.1.0',
        database: dbStatus,
        timestamp: new Date().toISOString(),
      },
    };
  }
}
