import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Patient,
  PatientAccount,
  PatientProfile,
  PatientStatus,
  Prisma,
} from '../../../../../../packages/database/generated/server';
import { DocumentNumberService } from '../../../common/services/document-number.service';
import { PrismaService } from '../../../database/prisma.service';
import { PatientAccountService } from '../ledger/patient-account.service';
import { PatientProfileService } from './patient-profile.service';
import { PatientNotesService } from './patient-notes.service';
import type { CreatePatientDto, ListPatientsQueryDto, UpdatePatientDto } from './dto/patient.dto';

export interface PaginatedPatients {
  items: Patient[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PatientFoundation {
  patient: Patient;
  profile: PatientProfile | null;
  account: Pick<PatientAccount, 'id' | 'cachedBalance' | 'currency' | 'status' | 'openedAt'>;
  notesCount: number;
}

@Injectable()
export class PatientsService {
  constructor(
    private prisma: PrismaService,
    private documentNumbers: DocumentNumberService,
    private patientAccounts: PatientAccountService,
    private patientProfiles: PatientProfileService,
    private patientNotes: PatientNotesService,
  ) {}

  async list(tenantId: string, query: ListPatientsQueryDto): Promise<PaginatedPatients> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where = this.buildListWhere(tenantId, query);

    const search = query.search?.trim();
    const [items, total] = await Promise.all([
      this.prisma.patient.findMany({
        where,
        orderBy: search
          ? [{ createdAt: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }, { code: 'asc' }]
          : [{ lastName: 'asc' }, { firstName: 'asc' }, { code: 'asc' }],
        skip,
        take: limit,
      }),
      this.prisma.patient.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async findById(tenantId: string, id: string): Promise<Patient> {
    const patient = await this.prisma.patient.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }
    return patient;
  }

  async getAccountForPatient(tenantId: string, patientId: string): Promise<PatientAccount> {
    await this.findById(tenantId, patientId);
    return this.patientAccounts.getAccountForPatient(tenantId, patientId);
  }

  async getPatientFoundation(tenantId: string, patientId: string): Promise<PatientFoundation> {
    const patient = await this.findById(tenantId, patientId);
    const [profile, account, notesCount] = await Promise.all([
      this.patientProfiles.getProfile(tenantId, patientId),
      this.patientAccounts.getAccountForPatient(tenantId, patientId),
      this.patientNotes.countNotes(tenantId, patientId),
    ]);

    return {
      patient,
      profile,
      account: {
        id: account.id,
        cachedBalance: account.cachedBalance,
        currency: account.currency,
        status: account.status,
        openedAt: account.openedAt,
      },
      notesCount,
    };
  }

  async create(
    tenantId: string,
    createdById: string,
    dto: CreatePatientDto,
  ): Promise<{ patient: Patient; account: PatientAccount }> {
    if (dto.branchId) {
      await this.assertBranchInTenant(tenantId, dto.branchId);
    }

    const numberingBranchId = dto.branchId ?? await this.resolveDefaultBranchId(tenantId);

    return this.prisma.$transaction(async (tx) => {
      const code = await this.documentNumbers.nextNumber(
        tenantId,
        'PAT',
        'PAT',
        numberingBranchId,
        tx,
      );

      const fullName = this.buildFullName(dto.firstName, dto.lastName);

      let patient: Patient;
      try {
        patient = await tx.patient.create({
          data: {
            tenantId,
            branchId: dto.branchId,
            code,
            firstName: dto.firstName.trim(),
            lastName: dto.lastName.trim(),
            fullName,
            phone: dto.phone,
            email: dto.email,
            address: dto.address,
            dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
            gender: dto.gender,
            status: dto.status ?? PatientStatus.active,
            notes: dto.notes,
            createdById,
            updatedById: createdById,
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError
          && error.code === 'P2002'
        ) {
          throw new ConflictException('Patient code already exists');
        }
        throw error;
      }

      const account = await this.patientAccounts.getOrCreateAccount(
        tenantId,
        patient.id,
        tx,
      );

      if (dto.profile) {
        await this.patientProfiles.createProfileInTransaction(
          tenantId,
          patient.id,
          dto.profile,
          tx,
        );
      }

      return { patient, account };
    });
  }

  async update(
    tenantId: string,
    id: string,
    updatedById: string,
    dto: UpdatePatientDto,
  ): Promise<Patient> {
    const existing = await this.findById(tenantId, id);

    if (dto.branchId) {
      await this.assertBranchInTenant(tenantId, dto.branchId);
    }

    const firstName = dto.firstName?.trim() ?? existing.firstName;
    const lastName = dto.lastName?.trim() ?? existing.lastName;
    const fullName = dto.firstName || dto.lastName
      ? this.buildFullName(firstName, lastName)
      : undefined;

    return this.prisma.patient.update({
      where: { id },
      data: {
        firstName: dto.firstName?.trim(),
        lastName: dto.lastName?.trim(),
        fullName,
        branchId: dto.branchId,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        dateOfBirth: dto.dateOfBirth === null
          ? null
          : dto.dateOfBirth
            ? new Date(dto.dateOfBirth)
            : undefined,
        gender: dto.gender,
        status: dto.status,
        notes: dto.notes,
        updatedById,
      },
    });
  }

  async archive(tenantId: string, id: string, updatedById: string): Promise<Patient> {
    await this.findById(tenantId, id);
    return this.prisma.patient.update({
      where: { id },
      data: {
        status: PatientStatus.inactive,
        updatedById,
      },
    });
  }

  async remove(tenantId: string, id: string, updatedById: string): Promise<Patient> {
    await this.findById(tenantId, id);

    if (await this.hasTransactionalHistory(tenantId, id)) {
      throw new BadRequestException(
        'Cannot delete a patient with transactional history. Archive the patient instead.',
      );
    }

    return this.prisma.patient.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: PatientStatus.inactive,
        updatedById,
      },
    });
  }

  async hasTransactionalHistory(tenantId: string, patientId: string): Promise<boolean> {
    const [
      charges,
      payments,
      encounters,
      refunds,
      adjustments,
      ledgerEntries,
    ] = await Promise.all([
      this.prisma.charge.count({ where: { tenantId, patientId } }),
      this.prisma.payment.count({ where: { tenantId, patientId } }),
      this.prisma.encounter.count({ where: { tenantId, patientId } }),
      this.prisma.refund.count({ where: { tenantId, patientId } }),
      this.prisma.adjustment.count({ where: { tenantId, patientId } }),
      this.prisma.ledgerEntry.count({
        where: { tenantId, account: { patientId } },
      }),
    ]);

    return (
      charges + payments + encounters + refunds + adjustments + ledgerEntries
    ) > 0;
  }

  private buildListWhere(
    tenantId: string,
    query: ListPatientsQueryDto,
  ): Prisma.PatientWhereInput {
    const where: Prisma.PatientWhereInput = {
      tenantId,
      deletedAt: null,
    };

    if (query.branchId) {
      where.branchId = query.branchId;
    }

    if (query.status) {
      where.status = query.status;
    }

    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { fullName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private buildFullName(firstName: string, lastName: string): string {
    return `${firstName.trim()} ${lastName.trim()}`.replace(/\s+/g, ' ');
  }

  private async assertBranchInTenant(tenantId: string, branchId: string): Promise<void> {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, tenantId },
    });
    if (!branch) {
      throw new BadRequestException('Branch not found');
    }
  }

  private async resolveDefaultBranchId(tenantId: string): Promise<string> {
    const branch = await this.prisma.branch.findFirst({
      where: { tenantId, isDefault: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!branch) {
      throw new BadRequestException('No default branch configured for tenant');
    }
    return branch.id;
  }
}
