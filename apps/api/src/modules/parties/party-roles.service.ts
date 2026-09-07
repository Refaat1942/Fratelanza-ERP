import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PartyRoleType } from '../../../../../packages/database/generated/server';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import { PartiesService } from './parties.service';

@Injectable()
export class PartyRolesService {
  constructor(
    private prisma: PrismaService,
    private parties: PartiesService,
    private audit: AuditService,
  ) {}

  async assignRole(
    tenantId: string,
    partyId: string,
    userId: string,
    role: PartyRoleType,
  ) {
    await this.parties.assertActiveParty(tenantId, partyId);

    const existing = await this.prisma.partyRole.findUnique({
      where: {
        tenantId_partyId_role: { tenantId, partyId, role },
      },
    });

    if (existing?.isActive) {
      throw new ConflictException(`Party already has active role: ${role}`);
    }

    const partyRole = existing
      ? await this.prisma.partyRole.update({
        where: { id: existing.id },
        data: {
          isActive: true,
          removedAt: null,
          assignedAt: new Date(),
        },
      })
      : await this.prisma.partyRole.create({
        data: {
          tenantId,
          partyId,
          role,
        },
      });

    await this.audit.log({
      tenantId,
      userId,
      entity: 'party_role',
      entityId: partyRole.id,
      action: 'assigned',
      newValue: { partyId, role },
    });

    return partyRole;
  }

  async assertActiveRole(
    tenantId: string,
    partyId: string,
    role: PartyRoleType,
  ): Promise<void> {
    const partyRole = await this.prisma.partyRole.findUnique({
      where: {
        tenantId_partyId_role: { tenantId, partyId, role },
      },
    });
    if (!partyRole?.isActive) {
      throw new BadRequestException(`Party must have active ${role} role`);
    }
  }

  async removeRole(
    tenantId: string,
    partyId: string,
    userId: string,
    role: PartyRoleType,
  ) {
    await this.parties.findById(tenantId, partyId);

    const partyRole = await this.prisma.partyRole.findUnique({
      where: {
        tenantId_partyId_role: { tenantId, partyId, role },
      },
    });

    if (!partyRole || !partyRole.isActive) {
      throw new NotFoundException(`Active party role not found: ${role}`);
    }

    const updated = await this.prisma.partyRole.update({
      where: { id: partyRole.id },
      data: {
        isActive: false,
        removedAt: new Date(),
      },
    });

    await this.audit.log({
      tenantId,
      userId,
      entity: 'party_role',
      entityId: updated.id,
      action: 'removed',
      oldValue: { partyId, role, isActive: true },
      newValue: { isActive: false },
    });

    return updated;
  }

  static parseRoleParam(role: string): PartyRoleType {
    if (
      role === PartyRoleType.customer ||
      role === PartyRoleType.supplier ||
      role === PartyRoleType.contractor ||
      role === PartyRoleType.subcontractor
    ) {
      return role;
    }
    throw new BadRequestException(`Invalid party role: ${role}`);
  }
}
