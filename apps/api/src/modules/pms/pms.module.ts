import { Module } from '@nestjs/common';
import { PmsLedgerModule } from './ledger/ledger.module';
import { PatientsModule } from './patients/patients.module';

/**
 * PMS domain root module — parallel to frozen ERP modules.
 * Phase 1b: financial core (ledger + patient accounts).
 * Phase 1c: patients, profiles, notes.
 */
@Module({
  imports: [PmsLedgerModule, PatientsModule],
  exports: [PmsLedgerModule, PatientsModule],
})
export class PmsModule {}
