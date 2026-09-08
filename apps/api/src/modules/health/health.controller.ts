import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators';
import { SystemService } from '../system/system.service';

@Controller('health')
export class HealthController {
  constructor(private systemService: SystemService) {}

  @Public()
  @Get()
  async check() {
    const data = await this.systemService.getHealthSummary();
    return { success: true, data };
  }
}
