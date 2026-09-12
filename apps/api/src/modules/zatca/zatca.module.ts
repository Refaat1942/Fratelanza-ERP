import { Module } from '@nestjs/common';
import { LocalizationModule } from '../localization/localization.module';
import { ZatcaController } from './zatca.controller';
import { ZatcaService } from './zatca.service';

@Module({
  imports: [LocalizationModule],
  controllers: [ZatcaController],
  providers: [ZatcaService],
  exports: [ZatcaService],
})
export class ZatcaModule {}
