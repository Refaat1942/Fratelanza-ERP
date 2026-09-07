import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PartyType } from '../../../../../packages/database/generated/server';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import type {
  CreatePartyContactDto,
  UpdatePartyContactDto,
} from './dto/party.dto';
import { PartiesService } from './parties.service';

@Injectable()
export class PartyContactsService {
  constructor(
    private prisma: PrismaService,
    private parties: PartiesService,
    private audit: AuditService,
  ) {}

  async listContacts(tenantId: string, partyId: string) {
    const party = await this.parties.findById(tenantId, partyId);
    if (party.type !== PartyType.organization) {
      throw new BadRequestException('Contacts are supported for organization parties only');
    }

    return this.prisma.partyContact.findMany({
      where: { tenantId, partyId, deletedAt: null },
      orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
    });
  }

  async createContact(
    tenantId: string,
    partyId: string,
    userId: string,
    dto: CreatePartyContactDto,
  ) {
    const party = await this.parties.assertActiveParty(tenantId, partyId);
    if (party.type !== PartyType.organization) {
      throw new BadRequestException('Contacts are supported for organization parties only');
    }

    const contact = await this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary) {
        await tx.partyContact.updateMany({
          where: { tenantId, partyId, deletedAt: null, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      return tx.partyContact.create({
        data: {
          tenantId,
          partyId,
          name: dto.name.trim(),
          title: dto.title,
          email: dto.email,
          phone: dto.phone,
          mobile: dto.mobile,
          notes: dto.notes,
          isPrimary: dto.isPrimary ?? false,
        },
      });
    });

    await this.audit.log({
      tenantId,
      userId,
      entity: 'party_contact',
      entityId: contact.id,
      action: 'created',
      newValue: { partyId, name: contact.name },
    });

    return contact;
  }

  async updateContact(
    tenantId: string,
    partyId: string,
    contactId: string,
    userId: string,
    dto: UpdatePartyContactDto,
  ) {
    await this.parties.assertActiveParty(tenantId, partyId);
    const existing = await this.findContact(tenantId, partyId, contactId);

    const contact = await this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary) {
        await tx.partyContact.updateMany({
          where: {
            tenantId,
            partyId,
            deletedAt: null,
            isPrimary: true,
            id: { not: contactId },
          },
          data: { isPrimary: false },
        });
      }

      return tx.partyContact.update({
        where: { id: contactId },
        data: {
          name: dto.name?.trim(),
          title: dto.title,
          email: dto.email,
          phone: dto.phone,
          mobile: dto.mobile,
          notes: dto.notes,
          isPrimary: dto.isPrimary,
        },
      });
    });

    await this.audit.log({
      tenantId,
      userId,
      entity: 'party_contact',
      entityId: contact.id,
      action: 'updated',
      oldValue: { name: existing.name, email: existing.email },
      newValue: { name: contact.name, email: contact.email },
    });

    return contact;
  }

  async archiveContact(
    tenantId: string,
    partyId: string,
    contactId: string,
    userId: string,
  ) {
    await this.parties.findById(tenantId, partyId);
    const existing = await this.findContact(tenantId, partyId, contactId);

    const contact = await this.prisma.partyContact.update({
      where: { id: contactId },
      data: {
        isActive: false,
        deletedAt: new Date(),
        isPrimary: false,
      },
    });

    await this.audit.log({
      tenantId,
      userId,
      entity: 'party_contact',
      entityId: contact.id,
      action: 'archived',
      oldValue: { isActive: existing.isActive },
      newValue: { isActive: false },
    });

    return contact;
  }

  private async findContact(tenantId: string, partyId: string, contactId: string) {
    const contact = await this.prisma.partyContact.findFirst({
      where: {
        id: contactId,
        tenantId,
        partyId,
        deletedAt: null,
      },
    });
    if (!contact) {
      throw new NotFoundException('Party contact not found');
    }
    return contact;
  }
}
