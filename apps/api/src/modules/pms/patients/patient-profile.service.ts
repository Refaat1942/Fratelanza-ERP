import { Injectable, NotFoundException } from '@nestjs/common';
import {
  Patient,
  PatientProfile,
  Prisma,
} from '../../../../../../packages/database/generated/server';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class PatientProfileService {
  constructor(private prisma: PrismaService) {}

  async getProfile(tenantId: string, patientId: string): Promise<PatientProfile | null> {
    await this.assertPatientInTenant(tenantId, patientId);
    return this.prisma.patientProfile.findFirst({
      where: { patientId, patient: { tenantId } },
    });
  }

  async upsertProfile(
    tenantId: string,
    patientId: string,
    data: {
      preferredLocale?: string | null;
      referralSource?: string | null;
      emergencyContactName?: string | null;
      emergencyContactPhone?: string | null;
    },
  ): Promise<PatientProfile> {
    await this.assertPatientInTenant(tenantId, patientId);

    return this.prisma.patientProfile.upsert({
      where: { patientId },
      update: {
        preferredLocale: data.preferredLocale ?? undefined,
        referralSource: data.referralSource ?? undefined,
        emergencyContactName: data.emergencyContactName ?? undefined,
        emergencyContactPhone: data.emergencyContactPhone ?? undefined,
      },
      create: {
        patientId,
        preferredLocale: data.preferredLocale ?? undefined,
        referralSource: data.referralSource ?? undefined,
        emergencyContactName: data.emergencyContactName ?? undefined,
        emergencyContactPhone: data.emergencyContactPhone ?? undefined,
      },
    });
  }

  async createProfileInTransaction(
    tenantId: string,
    patientId: string,
    data: {
      preferredLocale?: string;
      referralSource?: string;
      emergencyContactName?: string;
      emergencyContactPhone?: string;
    },
    tx: Prisma.TransactionClient,
  ): Promise<PatientProfile> {
    await this.assertPatientInTenant(tenantId, patientId, tx);
    return tx.patientProfile.create({
      data: {
        patientId,
        ...data,
      },
    });
  }

  private async assertPatientInTenant(
    tenantId: string,
    patientId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Patient> {
    const db = tx ?? this.prisma;
    const patient = await db.patient.findFirst({
      where: { id: patientId, tenantId, deletedAt: null },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }
    return patient;
  }
}
