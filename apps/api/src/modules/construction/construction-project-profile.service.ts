import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProjectStatus } from '../../../../../packages/database/generated/server';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import { ProjectsService } from '../projects/projects.service';

const PROFILE_ELIGIBLE_STATUSES: ProjectStatus[] = [
  ProjectStatus.draft,
  ProjectStatus.active,
  ProjectStatus.on_hold,
  ProjectStatus.completed,
];

@Injectable()
export class ConstructionProjectProfileService {
  constructor(
    private prisma: PrismaService,
    private projects: ProjectsService,
    private audit: AuditService,
  ) {}

  async getByProjectId(tenantId: string, projectId: string) {
    const profile = await this.prisma.constructionProjectProfile.findFirst({
      where: { tenantId, projectId },
      include: {
        project: {
          select: {
            id: true,
            code: true,
            name: true,
            status: true,
            branchId: true,
            customerPartyId: true,
          },
        },
      },
    });
    if (!profile) {
      throw new NotFoundException('Construction profile not found for project');
    }
    return profile;
  }

  async create(
    tenantId: string,
    projectId: string,
    userId: string,
    notes?: string,
  ) {
    const project = await this.projects.findById(tenantId, projectId);
    if (project.deletedAt) {
      throw new BadRequestException('Project is archived');
    }
    if (!PROFILE_ELIGIBLE_STATUSES.includes(project.status)) {
      throw new BadRequestException('Project status does not allow construction profile');
    }

    const existing = await this.prisma.constructionProjectProfile.findUnique({
      where: { projectId },
    });
    if (existing) {
      throw new ConflictException('Construction profile already exists for project');
    }

    const profile = await this.prisma.constructionProjectProfile.create({
      data: {
        tenantId,
        projectId,
        notes,
        createdById: userId,
      },
      include: {
        project: {
          select: {
            id: true,
            code: true,
            name: true,
            status: true,
            branchId: true,
            customerPartyId: true,
          },
        },
      },
    });

    await this.audit.log({
      tenantId,
      userId,
      entity: 'construction_project_profile',
      entityId: profile.id,
      action: 'construction.profile.created',
      newValue: { projectId, notes: notes ?? null },
    });

    return profile;
  }
}
