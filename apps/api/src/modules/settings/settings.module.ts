import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { TenantsModule } from '../tenants/tenants.module';

@Module({
  imports: [TenantsModule],
  controllers: [SettingsController],
})
export class SettingsModule {}
