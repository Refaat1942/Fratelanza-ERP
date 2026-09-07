import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ConstructionContractDirection,
  ConstructionSubcontractorAssignmentStatus,
  ConstructionSubcontractorProfileStatus,
  PartyRoleType,
  Prisma,
} from '../../../../../packages/database/generated/server';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import { PartiesService } from '../parties/parties.service';
import { PartyRolesService } from '../parties/party-roles.service';
import type {
  CreateConstructionSubcontractorAssignmentDto,
  CreateConstructionSubcontractorProfileDto,
  ListConstructionSubcontractorAssignmentsQueryDto,
  ListConstructionSubcontractorsQueryDto,
  UpdateConstructionSubcontractorAssignmentDto,
  UpdateConstructionSubcontractorProfileDto,
} from './dto/construction-subcontractor.dto';

const profileInclude = {
  party: {
    select: {
      id: true,
      code: true,
      displayName: true,
      type: true,
      status: true,
      roles: {
        where: { isActive: true },
        select: { role: true, isActive: true },
      },
    },
  },
  assignments: {
    include: {
      project: { select: { id: true, code: true, name: true, status: true } },
      contract: {
        select: {
          id: true,
          number: true,
          title: true,
          direction: true,
          status: true,
        },
      },
    },
    orderBy: [{ assignedAt: 'desc' as const }],
  },
};

const assignmentInclude = {
  profile: {
    include: {
      party: {
        select: {
          id: true,
          code: true,
          displayName: true,
        },
      },
    },
  },
  project: { select: { id: true, code: true, name: true, status: true } },
  contract: {
    select: {
      id: true,
      number: true,
      title: true,
      direction: true,
      status: true,
      partyId: true,
    },
  },
};

@Injectable()
export class ConstructionSubcontractorService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private parties: PartiesService,
    private partyRoles: PartyRolesService,
  ) {}

  async list(
    tenantId: string,
    query: ListConstructionSubcontractorsQueryDto,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ConstructionSubcontractorProfileWhereInput = {
      tenantId,
      ...(query.partyId ? { partyId: query.partyId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.projectId
        ? {
            assignments: {
              some: { tenantId, projectId: query.projectId },
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.constructionSubcontractorProfile.findMany({
        where,
        include: profileInclude,
        orderBy: [{ createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.constructionSubcontractorProfile.count({ where }),
    ]);

    return {
      items,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async findById(tenantId: string, id: string) {
    const profile = await this.prisma.constructionSubcontractorProfile.findFirst({
      where: { id, tenantId },
      include: profileInclude,
    });
    if (!profile) {
      throw new NotFoundException('Construction subcontractor profile not found');
    }
    return profile;
  }

  async create(
    tenantId: string,
    userId: string,
    dto: CreateConstructionSubcontractorProfileDto,
  ) {
    await this.parties.assertActiveParty(tenantId, dto.partyId);
    await this.partyRoles.assertActiveRole(
      tenantId,
      dto.partyId,
      PartyRoleType.subcontractor,
    );

    const existing = await this.prisma.constructionSubcontractorProfile.findUnique({
      where: { tenantId_partyId: { tenantId, partyId: dto.partyId } },
    });
    if (existing) {
      throw new ConflictException(
        'Construction subcontractor profile already exists for this party',
      );
    }

    const profile = await this.prisma.constructionSubcontractorProfile.create({
      data: {
        tenantId,
        partyId: dto.partyId,
        trade: dto.trade?.trim() ?? null,
        specialty: dto.specialty?.trim() ?? null,
        complianceNotes: dto.complianceNotes?.trim() ?? null,
        status: dto.status ?? ConstructionSubcontractorProfileStatus.active,
        createdById: userId,
      },
      include: profileInclude,
    });

    await this.audit.log({
      tenantId,
      userId,
      entity: 'construction_subcontractor_profile',
      entityId: profile.id,
      action: 'construction.subcontractor.profile.created',
      newValue: {
        partyId: dto.partyId,
        trade: profile.trade,
        specialty: profile.specialty,
        status: profile.status,
      },
    });

    return profile;
  }

  async update(
    tenantId: string,
    id: string,
    userId: string,
    dto: UpdateConstructionSubcontractorProfileDto,
  ) {
    const existing = await this.findById(tenantId, id);

    const profile = await this.prisma.constructionSubcontractorProfile.update({
      where: { id },
      data: {
        ...(dto.trade !== undefined ? { trade: dto.trade?.trim() ?? null } : {}),
        ...(dto.specialty !== undefined
          ? { specialty: dto.specialty?.trim() ?? null }
          : {}),
        ...(dto.complianceNotes !== undefined
          ? { complianceNotes: dto.complianceNotes?.trim() ?? null }
          : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
      include: profileInclude,
    });

    await this.audit.log({
      tenantId,
      userId,
      entity: 'construction_subcontractor_profile',
      entityId: profile.id,
      action: 'construction.subcontractor.profile.updated',
      oldValue: {
        trade: existing.trade,
        specialty: existing.specialty,
        complianceNotes: existing.complianceNotes,
        status: existing.status,
      },
      newValue: {
        trade: profile.trade,
        specialty: profile.specialty,
        complianceNotes: profile.complianceNotes,
        status: profile.status,
      },
    });

    return profile;
  }

  async listAssignments(
    tenantId: string,
    profileId: string,
    query: ListConstructionSubcontractorAssignmentsQueryDto,
  ) {
    await this.findById(tenantId, profileId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ConstructionSubcontractorAssignmentWhereInput = {
      tenantId,
      profileId,
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.contractId ? { contractId: query.contractId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.constructionSubcontractorAssignment.findMany({
        where,
        include: assignmentInclude,
        orderBy: [{ assignedAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.constructionSubcontractorAssignment.count({ where }),
    ]);

    return {
      items,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async createAssignment(
    tenantId: string,
    profileId: string,
    userId: string,
    dto: CreateConstructionSubcontractorAssignmentDto,
  ) {
    const profile = await this.findById(tenantId, profileId);
    if (profile.status === ConstructionSubcontractorProfileStatus.suspended) {
      throw new BadRequestException(
        'Cannot assign a suspended subcontractor profile',
      );
    }

    await this.assertConstructionProfile(tenantId, dto.projectId);

    if (dto.contractId) {
      await this.validateContractAssignment(
        tenantId,
        profile.partyId,
        dto.projectId,
        dto.contractId,
      );
    } else {
      const existingProjectOnly =
        await this.prisma.constructionSubcontractorAssignment.findFirst({
          where: {
            tenantId,
            profileId,
            projectId: dto.projectId,
            contractId: null,
          },
        });
      if (existingProjectOnly) {
        throw new ConflictException(
          'Subcontractor is already assigned to this project without a contract',
        );
      }
    }

    const assignment = await this.prisma.constructionSubcontractorAssignment.create({
      data: {
        tenantId,
        profileId,
        projectId: dto.projectId,
        contractId: dto.contractId ?? null,
        status: dto.status ?? ConstructionSubcontractorAssignmentStatus.active,
        assignedAt: dto.assignedAt ? new Date(dto.assignedAt) : new Date(),
        notes: dto.notes?.trim() ?? null,
        createdById: userId,
      },
      include: assignmentInclude,
    });

    await this.audit.log({
      tenantId,
      userId,
      entity: 'construction_subcontractor_assignment',
      entityId: assignment.id,
      action: 'construction.subcontractor.assignment.created',
      newValue: {
        profileId,
        projectId: dto.projectId,
        contractId: dto.contractId ?? null,
        status: assignment.status,
      },
    });

    return assignment;
  }

  async updateAssignment(
    tenantId: string,
    assignmentId: string,
    userId: string,
    dto: UpdateConstructionSubcontractorAssignmentDto,
  ) {
    const existing = await this.prisma.constructionSubcontractorAssignment.findFirst({
      where: { id: assignmentId, tenantId },
      include: assignmentInclude,
    });
    if (!existing) {
      throw new NotFoundException('Construction subcontractor assignment not found');
    }

    const assignment = await this.prisma.constructionSubcontractorAssignment.update({
      where: { id: assignmentId },
      data: {
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() ?? null } : {}),
      },
      include: assignmentInclude,
    });

    await this.audit.log({
      tenantId,
      userId,
      entity: 'construction_subcontractor_assignment',
      entityId: assignment.id,
      action: 'construction.subcontractor.assignment.updated',
      oldValue: { status: existing.status, notes: existing.notes },
      newValue: { status: assignment.status, notes: assignment.notes },
    });

    return assignment;
  }

  private async assertConstructionProfile(
    tenantId: string,
    projectId: string,
  ): Promise<void> {
    const profile = await this.prisma.constructionProjectProfile.findFirst({
      where: { tenantId, projectId },
    });
    if (!profile) {
      throw new BadRequestException(
        'Construction profile must exist on project before subcontractor assignment',
      );
    }
  }

  private async validateContractAssignment(
    tenantId: string,
    partyId: string,
    projectId: string,
    contractId: string,
  ): Promise<void> {
    const contract = await this.prisma.constructionContract.findFirst({
      where: { id: contractId, tenantId },
    });
    if (!contract) {
      throw new NotFoundException('Construction contract not found');
    }
    if (contract.projectId !== projectId) {
      throw new BadRequestException(
        'Contract does not belong to the specified project',
      );
    }
    if (contract.direction !== ConstructionContractDirection.subcontractor) {
      throw new BadRequestException(
        'Contract must be a subcontractor-direction agreement',
      );
    }
    if (contract.partyId !== partyId) {
      throw new BadRequestException(
        'Contract party must match the subcontractor profile party',
      );
    }
  }
}
