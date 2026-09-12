import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { TenantsModule } from '../tenants/tenants.module';
import { LocalizationModule } from '../localization/localization.module';

@Module({
  imports: [TenantsModule, LocalizationModule],
  controllers: [SettingsController],
})
export class SettingsModule {}
