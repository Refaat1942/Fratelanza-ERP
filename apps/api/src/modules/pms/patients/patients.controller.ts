import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, RequirePermissions, TenantId, RequireModule } from '../../../common/decorators';
import { PermissionsGuard } from '../../../common/guards';
import type { JwtPayload } from '@fratelanza/types';
import {
  CreatePatientDto,
  CreatePatientNoteDto,
  ListPatientsQueryDto,
  UpdatePatientDto,
  UpsertPatientProfileDto,
} from './dto/patient.dto';
import { PatientNotesService } from './patient-notes.service';
import { PatientProfileService } from './patient-profile.service';
import { PatientsService } from './patients.service';

@Controller('pms/patients')
@UseGuards(PermissionsGuard)
@RequireModule('pms')
export class PatientsController {
  constructor(
    private patientsService: PatientsService,
    private patientProfiles: PatientProfileService,
    private patientNotes: PatientNotesService,
  ) {}

  @Get()
  @RequirePermissions('pms:patients:read')
  async list(
    @TenantId() tenantId: string,
    @Query() query: ListPatientsQueryDto,
  ) {
    const data = await this.patientsService.list(tenantId, query);
    return {
      success: true,
      data: data.items,
      meta: {
        page: data.page,
        limit: data.limit,
        total: data.total,
        totalPages: data.totalPages,
      },
    };
  }

  @Get(':id')
  @RequirePermissions('pms:patients:read')
  async findOne(@TenantId() tenantId: string, @Param('id') id: string) {
    const data = await this.patientsService.findById(tenantId, id);
    return { success: true, data };
  }

  @Get(':id/account')
  @RequirePermissions('pms:patients:read')
  async getAccount(@TenantId() tenantId: string, @Param('id') id: string) {
    const data = await this.patientsService.getAccountForPatient(tenantId, id);
    return { success: true, data };
  }

  @Post()
  @RequirePermissions('pms:patients:create')
  async create(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreatePatientDto,
  ) {
    const data = await this.patientsService.create(tenantId, user.sub, dto);
    return { success: true, data };
  }

  @Patch(':id')
  @RequirePermissions('pms:patients:update')
  async update(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdatePatientDto,
  ) {
    const data = await this.patientsService.update(tenantId, id, user.sub, dto);
    return { success: true, data };
  }

  @Post(':id/archive')
  @RequirePermissions('pms:patients:delete')
  async archive(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const data = await this.patientsService.archive(tenantId, id, user.sub);
    return { success: true, data };
  }

  @Delete(':id')
  @RequirePermissions('pms:patients:delete')
  async remove(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const data = await this.patientsService.remove(tenantId, id, user.sub);
    return { success: true, data };
  }

  @Get(':id/profile')
  @RequirePermissions('pms:patients:read')
  async getProfile(@TenantId() tenantId: string, @Param('id') id: string) {
    const data = await this.patientProfiles.getProfile(tenantId, id);
    return { success: true, data };
  }

  @Put(':id/profile')
  @RequirePermissions('pms:patients:update')
  async upsertProfile(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpsertPatientProfileDto,
  ) {
    const data = await this.patientProfiles.upsertProfile(tenantId, id, dto);
    return { success: true, data };
  }

  @Get(':id/notes')
  @RequirePermissions('pms:patients:notes')
  async listNotes(@TenantId() tenantId: string, @Param('id') id: string) {
    const data = await this.patientNotes.listNotes(tenantId, id);
    return { success: true, data };
  }

  @Post(':id/notes')
  @RequirePermissions('pms:patients:notes')
  async createNote(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CreatePatientNoteDto,
  ) {
    const data = await this.patientNotes.createNote(tenantId, id, user.sub, dto);
    return { success: true, data };
  }

  @Delete(':id/notes/:noteId')
  @RequirePermissions('pms:patients:notes')
  async deleteNote(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Param('noteId') noteId: string,
  ) {
    const data = await this.patientNotes.softDeleteNote(tenantId, id, noteId);
    return { success: true, data };
  }
}
