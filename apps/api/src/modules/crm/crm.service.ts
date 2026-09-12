import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { DocumentNumberService } from '../../common/services/document-number.service';

interface CreateLeadInput {
  branchId?: string;
  companyName?: string;
  contactName: string;
  email?: string;
  phone?: string;
  source?: string;
  ownerId?: string;
  notes?: string;
}

interface CreateOpportunityInput {
  branchId?: string;
  leadId?: string;
  partyId?: string;
  name: string;
  amount?: number;
  currencyCode?: string;
  probability?: number;
  expectedCloseDate?: string;
  ownerId?: string;
  notes?: string;
}

interface UpdateLeadInput {
  companyName?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  source?: string;
  ownerId?: string;
  notes?: string;
}

interface UpdateOpportunityInput {
  name?: string;
  amount?: number;
  currencyCode?: string;
  probability?: number;
  expectedCloseDate?: string;
  ownerId?: string;
  notes?: string;
}

interface CreateActivityInput {
  leadId?: string;
  opportunityId?: string;
  partyId?: string;
  type?: 'call' | 'meeting' | 'email' | 'task' | 'note';
  subject: string;
  notes?: string;
  dueDate?: string;
  ownerId?: string;
}

@Injectable()
export class CrmService {
  constructor(
    private prisma: PrismaService,
    private documentNumbers: DocumentNumberService,
  ) {}

  async listLeads(tenantId: string, branchWhere: { branchId?: string | { in: string[] } } = {}) {
    return this.prisma.lead.findMany({
      where: { tenantId, ...branchWhere },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getLead(tenantId: string, id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, tenantId },
      include: { opportunities: true, activities: { orderBy: { dueDate: 'asc' } } },
    });
    if (!lead) {
      throw new NotFoundException('Lead not found');
    }
    return lead;
  }

  async createLead(tenantId: string, dto: CreateLeadInput) {
    const code = await this.documentNumbers.nextNumber(tenantId, 'LEAD', 'LEAD', dto.branchId ?? null);
    return this.prisma.lead.create({
      data: {
        tenantId,
        branchId: dto.branchId,
        code,
        companyName: dto.companyName,
        contactName: dto.contactName,
        email: dto.email,
        phone: dto.phone,
        source: dto.source,
        ownerId: dto.ownerId,
        notes: dto.notes,
      },
    });
  }

  async updateLeadStatus(tenantId: string, id: string, status: string) {
    const lead = await this.prisma.lead.findFirst({ where: { id, tenantId } });
    if (!lead) {
      throw new NotFoundException('Lead not found');
    }
    return this.prisma.lead.update({ where: { id }, data: { status: status as never } });
  }

  async updateLead(tenantId: string, id: string, dto: UpdateLeadInput) {
    const lead = await this.prisma.lead.findFirst({ where: { id, tenantId } });
    if (!lead) {
      throw new NotFoundException('Lead not found');
    }
    return this.prisma.lead.update({ where: { id }, data: dto });
  }

  async deleteLead(tenantId: string, id: string) {
    const lead = await this.prisma.lead.findFirst({ where: { id, tenantId } });
    if (!lead) {
      throw new NotFoundException('Lead not found');
    }
    if (lead.status === 'converted') {
      throw new BadRequestException('Cannot delete a converted lead — it is linked to a customer and opportunity');
    }
    await this.prisma.crmActivity.deleteMany({ where: { tenantId, leadId: id } });
    await this.prisma.lead.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Converts a lead into a Party (via legacy Customer for now) and an Opportunity.
   * Keeps the lead record for pipeline history.
   */
  async convertLead(tenantId: string, id: string, opportunityName?: string) {
    const lead = await this.prisma.lead.findFirst({ where: { id, tenantId } });
    if (!lead) {
      throw new NotFoundException('Lead not found');
    }
    if (lead.status === 'converted') {
      throw new BadRequestException('Lead already converted');
    }
    if (!lead.branchId) {
      throw new BadRequestException('Lead requires a branch to convert into a customer');
    }

    return this.prisma.$transaction(async (tx) => {
      const customerCode = await this.documentNumbers.nextNumber(tenantId, 'CUSTOMER', 'CUST', lead.branchId, tx);
      const customer = await tx.customer.create({
        data: {
          tenantId,
          branchId: lead.branchId!,
          code: customerCode,
          name: lead.companyName ?? lead.contactName,
          phone: lead.phone,
          email: lead.email,
        },
      });

      const opportunityCode = await this.documentNumbers.nextNumber(tenantId, 'OPP', 'OPP', lead.branchId, tx);
      const opportunity = await tx.opportunity.create({
        data: {
          tenantId,
          branchId: lead.branchId,
          leadId: lead.id,
          code: opportunityCode,
          name: opportunityName ?? `${lead.companyName ?? lead.contactName} opportunity`,
          ownerId: lead.ownerId,
        },
      });

      const updatedLead = await tx.lead.update({
        where: { id: lead.id },
        data: {
          status: 'converted',
          convertedPartyId: customer.id,
          convertedOpportunityId: opportunity.id,
          convertedAt: new Date(),
        },
      });

      return { lead: updatedLead, customer, opportunity };
    });
  }

  async listOpportunities(tenantId: string, branchWhere: { branchId?: string | { in: string[] } } = {}) {
    return this.prisma.opportunity.findMany({
      where: { tenantId, ...branchWhere },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOpportunity(tenantId: string, id: string) {
    const opportunity = await this.prisma.opportunity.findFirst({
      where: { id, tenantId },
      include: { activities: { orderBy: { dueDate: 'asc' } }, lead: true },
    });
    if (!opportunity) {
      throw new NotFoundException('Opportunity not found');
    }
    return opportunity;
  }

  async createOpportunity(tenantId: string, dto: CreateOpportunityInput) {
    const code = await this.documentNumbers.nextNumber(tenantId, 'OPP', 'OPP', dto.branchId ?? null);
    return this.prisma.opportunity.create({
      data: {
        tenantId,
        branchId: dto.branchId,
        leadId: dto.leadId,
        partyId: dto.partyId,
        code,
        name: dto.name,
        amount: dto.amount ?? 0,
        currencyCode: dto.currencyCode,
        probability: dto.probability ?? 0,
        expectedCloseDate: dto.expectedCloseDate ? new Date(dto.expectedCloseDate) : undefined,
        ownerId: dto.ownerId,
        notes: dto.notes,
      },
    });
  }

  async updateOpportunity(tenantId: string, id: string, dto: UpdateOpportunityInput) {
    const opportunity = await this.prisma.opportunity.findFirst({ where: { id, tenantId } });
    if (!opportunity) {
      throw new NotFoundException('Opportunity not found');
    }
    return this.prisma.opportunity.update({
      where: { id },
      data: {
        name: dto.name,
        amount: dto.amount,
        currencyCode: dto.currencyCode,
        probability: dto.probability,
        expectedCloseDate: dto.expectedCloseDate ? new Date(dto.expectedCloseDate) : undefined,
        ownerId: dto.ownerId,
        notes: dto.notes,
      },
    });
  }

  async deleteOpportunity(tenantId: string, id: string) {
    const opportunity = await this.prisma.opportunity.findFirst({ where: { id, tenantId } });
    if (!opportunity) {
      throw new NotFoundException('Opportunity not found');
    }
    await this.prisma.crmActivity.deleteMany({ where: { tenantId, opportunityId: id } });
    await this.prisma.opportunity.delete({ where: { id } });
    return { deleted: true };
  }

  async moveOpportunityStage(tenantId: string, id: string, stage: string, lostReason?: string) {
    const opportunity = await this.prisma.opportunity.findFirst({ where: { id, tenantId } });
    if (!opportunity) {
      throw new NotFoundException('Opportunity not found');
    }

    return this.prisma.opportunity.update({
      where: { id },
      data: {
        stage: stage as never,
        wonAt: stage === 'won' ? new Date() : opportunity.wonAt,
        lostAt: stage === 'lost' ? new Date() : opportunity.lostAt,
        lostReason: stage === 'lost' ? lostReason : opportunity.lostReason,
        probability: stage === 'won' ? 100 : stage === 'lost' ? 0 : opportunity.probability,
      },
    });
  }

  async createActivity(tenantId: string, dto: CreateActivityInput) {
    if (!dto.leadId && !dto.opportunityId && !dto.partyId) {
      throw new BadRequestException('Activity must relate to a lead, opportunity, or party');
    }
    return this.prisma.crmActivity.create({
      data: {
        tenantId,
        leadId: dto.leadId,
        opportunityId: dto.opportunityId,
        partyId: dto.partyId,
        type: dto.type ?? 'task',
        subject: dto.subject,
        notes: dto.notes,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        ownerId: dto.ownerId,
      },
    });
  }

  async completeActivity(tenantId: string, id: string) {
    const activity = await this.prisma.crmActivity.findFirst({ where: { id, tenantId } });
    if (!activity) {
      throw new NotFoundException('Activity not found');
    }
    return this.prisma.crmActivity.update({
      where: { id },
      data: { status: 'completed', completedAt: new Date() },
    });
  }

  async listMyActivities(tenantId: string, ownerId: string) {
    return this.prisma.crmActivity.findMany({
      where: { tenantId, ownerId, status: 'open' },
      orderBy: { dueDate: 'asc' },
    });
  }

  async pipelineSummary(tenantId: string, branchWhere: { branchId?: string | { in: string[] } } = {}) {
    const opportunities = await this.prisma.opportunity.findMany({
      where: { tenantId, ...branchWhere },
      select: { stage: true, amount: true },
    });

    const byStage = new Map<string, { count: number; amount: number }>();
    for (const opp of opportunities) {
      const current = byStage.get(opp.stage) ?? { count: 0, amount: 0 };
      current.count += 1;
      current.amount += Number(opp.amount);
      byStage.set(opp.stage, current);
    }

    return Array.from(byStage.entries()).map(([stage, value]) => ({ stage, ...value }));
  }
}
