import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Party,
  PartyStatus,
  Prisma,
} from '../../../../../packages/database/generated/server';
import { DocumentNumberService } from '../../common/services/document-number.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import type {
  CreatePartyDto,
  ListPartiesQueryDto,
  UpdatePartyDto,
} from './dto/party.dto';

export interface PaginatedParties {
  items: Party[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const partyInclude = {
  roles: { where: { isActive: true }, orderBy: { assignedAt: 'asc' as const } },
  identifiers: { orderBy: { createdAt: 'asc' as const } },
  addresses: {
    where: { deletedAt: null, isActive: true },
    orderBy: { createdAt: 'asc' as const },
  },
  contacts: {
    where: { deletedAt: null, isActive: true },
    orderBy: [{ isPrimary: 'desc' as const }, { name: 'asc' as const }],
  },
  customer: {
    select: { id: true, code: true, name: true, branchId: true },
  },
  supplier: {
    select: { id: true, code: true, name: true },
  },
} satisfies Prisma.PartyInclude;

@Injectable()
export class PartiesService {
  constructor(
    private prisma: PrismaService,
    private documentNumbers: DocumentNumberService,
    private audit: AuditService,
  ) {}

  async list(tenantId: string, query: ListPartiesQueryDto): Promise<PaginatedParties> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;
    const where = this.buildListWhere(tenantId, query);

    const [items, total] = await Promise.all([
      this.prisma.party.findMany({
        where,
        include: {
          roles: { where: { isActive: true } },
          identifiers: { where: { isPrimary: true }, take: 1 },
        },
        orderBy: [{ displayName: 'asc' }, { code: 'asc' }],
        skip,
        take: limit,
      }),
      this.prisma.party.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async findById(tenantId: string, id: string) {
    const party = await this.prisma.party.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: partyInclude,
    });
    if (!party) {
      throw new NotFoundException('Party not found');
    }
    return party;
  }

  async create(
    tenantId: string,
    userId: string,
    dto: CreatePartyDto,
  ) {
    const numberingBranchId = await this.resolveDefaultBranchId(tenantId);
    const code = dto.code ?? await this.documentNumbers.nextNumber(
      tenantId,
      'PTY',
      'PTY',
      numberingBranchId,
    );

    const existing = await this.prisma.party.findUnique({
      where: { tenantId_code: { tenantId, code } },
    });
    if (existing) {
      throw new ConflictException('Party code already exists');
    }

    const party = await this.prisma.$transaction(async (tx) => {
      const created = await tx.party.create({
        data: {
          tenantId,
          type: dto.type,
          code,
          displayName: dto.displayName.trim(),
          legalName: dto.legalName?.trim(),
          email: dto.email,
          phone: dto.phone,
          website: dto.website,
          notes: dto.notes,
          status: PartyStatus.active,
          identifiers: dto.identifiers?.length
            ? {
              create: dto.identifiers.map((identifier) => ({
                tenantId,
                type: identifier.type,
                value: identifier.value.trim(),
                country: identifier.country,
                isPrimary: identifier.isPrimary ?? false,
              })),
            }
            : undefined,
          addresses: dto.addresses?.length
            ? {
              create: dto.addresses.map((address) => ({
                tenantId,
                type: address.type ?? 'office',
                line1: address.line1.trim(),
                line2: address.line2,
                city: address.city,
                state: address.state,
                postalCode: address.postalCode,
                country: address.country,
                isPrimary: address.isPrimary ?? false,
              })),
            }
            : undefined,
        },
        include: partyInclude,
      });

      return created;
    });

    await this.audit.log({
      tenantId,
      userId,
      entity: 'party',
      entityId: party.id,
      action: 'created',
      newValue: {
        code: party.code,
        type: party.type,
        displayName: party.displayName,
      },
    });

    return party;
  }

  async update(
    tenantId: string,
    id: string,
    userId: string,
    dto: UpdatePartyDto,
  ) {
    const existing = await this.findById(tenantId, id);
    if (existing.status === PartyStatus.archived) {
      throw new BadRequestException('Archived parties cannot be updated');
    }

    const party = await this.prisma.party.update({
      where: { id },
      data: {
        displayName: dto.displayName?.trim(),
        legalName: dto.legalName?.trim(),
        email: dto.email,
        phone: dto.phone,
        website: dto.website,
        notes: dto.notes,
      },
      include: partyInclude,
    });

    await this.audit.log({
      tenantId,
      userId,
      entity: 'party',
      entityId: party.id,
      action: 'updated',
      oldValue: {
        displayName: existing.displayName,
        legalName: existing.legalName,
        email: existing.email,
        phone: existing.phone,
      },
      newValue: {
        displayName: party.displayName,
        legalName: party.legalName,
        email: party.email,
        phone: party.phone,
      },
    });

    return party;
  }

  async archive(tenantId: string, id: string, userId: string) {
    const existing = await this.findById(tenantId, id);

    const party = await this.prisma.$transaction(async (tx) => {
      await tx.partyRole.updateMany({
        where: { tenantId, partyId: id, isActive: true },
        data: { isActive: false, removedAt: new Date() },
      });

      return tx.party.update({
        where: { id },
        data: {
          status: PartyStatus.archived,
          deletedAt: new Date(),
        },
        include: partyInclude,
      });
    });

    await this.audit.log({
      tenantId,
      userId,
      entity: 'party',
      entityId: party.id,
      action: 'archived',
      oldValue: { status: existing.status },
      newValue: { status: party.status },
    });

    return party;
  }

  async assertActiveParty(tenantId: string, partyId: string): Promise<Party> {
    const party = await this.prisma.party.findFirst({
      where: {
        id: partyId,
        tenantId,
        deletedAt: null,
        status: PartyStatus.active,
      },
    });
    if (!party) {
      throw new NotFoundException('Party not found');
    }
    return party;
  }

  private buildListWhere(
    tenantId: string,
    query: ListPartiesQueryDto,
  ): Prisma.PartyWhereInput {
    const where: Prisma.PartyWhereInput = {
      tenantId,
      deletedAt: null,
    };

    if (query.status) {
      where.status = query.status;
    } else {
      where.status = PartyStatus.active;
    }

    if (query.type) {
      where.type = query.type;
    }

    if (query.role) {
      where.roles = {
        some: {
          tenantId,
          role: query.role,
          isActive: true,
        },
      };
    }

    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { displayName: { contains: search, mode: 'insensitive' } },
        { legalName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        {
          identifiers: {
            some: {
              tenantId,
              value: { contains: search, mode: 'insensitive' },
            },
          },
        },
      ];
    }

    return where;
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
