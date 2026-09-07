import { Module } from '@nestjs/common';
import { PmsLedgerModule } from '../ledger/ledger.module';
import { PatientNotesService } from './patient-notes.service';
import { PatientProfileService } from './patient-profile.service';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';

@Module({
  imports: [PmsLedgerModule],
  controllers: [PatientsController],
  providers: [
    PatientsService,
    PatientProfileService,
    PatientNotesService,
  ],
  exports: [PatientsService, PatientProfileService, PatientNotesService],
})
export class PatientsModule {}
