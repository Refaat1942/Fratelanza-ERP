import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { HrService } from './hr.service';
import { HrController } from './hr.controller';

@Module({
  imports: [FinanceModule],
  providers: [HrService],
  controllers: [HrController],
  exports: [HrService],
})
export class HrModule {}
