import { Module } from '@nestjs/common';
import { LedgerPostingService } from './ledger-posting.service';
import { PatientAccountService } from './patient-account.service';

@Module({
  providers: [PatientAccountService, LedgerPostingService],
  exports: [PatientAccountService, LedgerPostingService],
})
export class PmsLedgerModule {}
