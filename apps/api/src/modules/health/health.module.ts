import { Module } from '@nestjs/common';
import { SystemModule } from '../system/system.module';
import { HealthController } from './health.controller';

@Module({
  imports: [SystemModule],
  controllers: [HealthController],
})
export class HealthModule {}
