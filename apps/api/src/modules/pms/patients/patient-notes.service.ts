import { Injectable, NotFoundException } from '@nestjs/common';
import { PatientNoteType } from '../../../../../../packages/database/generated/server';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class PatientNotesService {
  constructor(private prisma: PrismaService) {}

  async listNotes(tenantId: string, patientId: string) {
    await this.assertPatientInTenant(tenantId, patientId);
    return this.prisma.patientNote.findMany({
      where: { tenantId, patientId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createNote(
    tenantId: string,
    patientId: string,
    createdById: string,
    data: { content: string; noteType?: PatientNoteType },
  ) {
    await this.assertPatientInTenant(tenantId, patientId);
    return this.prisma.patientNote.create({
      data: {
        tenantId,
        patientId,
        content: data.content,
        noteType: data.noteType ?? PatientNoteType.general,
        createdById,
      },
    });
  }

  async softDeleteNote(tenantId: string, patientId: string, noteId: string) {
    await this.assertPatientInTenant(tenantId, patientId);
    const note = await this.prisma.patientNote.findFirst({
      where: { id: noteId, tenantId, patientId, deletedAt: null },
    });
    if (!note) {
      throw new NotFoundException('Patient note not found');
    }
    return this.prisma.patientNote.update({
      where: { id: noteId },
      data: { deletedAt: new Date() },
    });
  }

  async countNotes(tenantId: string, patientId: string): Promise<number> {
    return this.prisma.patientNote.count({
      where: { tenantId, patientId, deletedAt: null },
    });
  }

  private async assertPatientInTenant(
    tenantId: string,
    patientId: string,
  ): Promise<void> {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, tenantId, deletedAt: null },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }
  }
}
