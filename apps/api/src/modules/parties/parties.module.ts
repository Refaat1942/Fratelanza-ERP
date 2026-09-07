import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PartiesController } from './parties.controller';
import { PartyLegacyController } from './party-legacy.controller';
import { PartiesService } from './parties.service';
import { PartyContactsService } from './party-contacts.service';
import { PartyLegacyAdapterService } from './party-legacy-adapter.service';
import { PartyRolesService } from './party-roles.service';

@Module({
  imports: [AuditModule],
  controllers: [PartyLegacyController, PartiesController],
  providers: [
    PartiesService,
    PartyRolesService,
    PartyContactsService,
    PartyLegacyAdapterService,
  ],
  exports: [
    PartiesService,
    PartyRolesService,
    PartyContactsService,
    PartyLegacyAdapterService,
  ],
})
export class PartiesModule {}
