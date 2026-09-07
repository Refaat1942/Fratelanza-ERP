import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Customer,
  Party,
  PartyRoleType,
  Supplier,
} from '../../../../../packages/database/generated/server';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import { PartiesService } from './parties.service';

@Injectable()
export class PartyLegacyAdapterService {
  constructor(
    private prisma: PrismaService,
    private parties: PartiesService,
    private audit: AuditService,
  ) {}

  async getLinkedCustomer(tenantId: string, partyId: string): Promise<Customer | null> {
    await this.assertPartyInTenant(tenantId, partyId);
    return this.prisma.customer.findFirst({
      where: { tenantId, partyId, deletedAt: null },
    });
  }

  /**
   * Resolve Party → legacy Customer for Sales operations.
   * Does not create Customers. Requires active customer role and existing link.
   */
  async resolveLinkedCustomerForSales(
    tenantId: string,
    partyId: string,
  ): Promise<Customer> {
    await this.parties.assertActiveParty(tenantId, partyId);
    await this.assertActiveRole(tenantId, partyId, PartyRoleType.customer);

    const customer = await this.getLinkedCustomer(tenantId, partyId);
    if (!customer) {
      throw new BadRequestException(
        'Party must be linked to a legacy Customer before it can be used in Sales',
      );
    }
    return customer;
  }

  async linkCustomer(
    tenantId: string,
    partyId: string,
    customerId: string,
    userId: string,
  ): Promise<Customer> {
    await this.parties.assertActiveParty(tenantId, partyId);
    await this.assertActiveRole(tenantId, partyId, PartyRoleType.customer);

    const customer = await this.findLegacyCustomer(tenantId, customerId);

    if (customer.partyId === partyId) {
      return customer;
    }

    if (customer.partyId) {
      throw new ConflictException('Customer is already linked to another party');
    }

    const partyLinkedCustomer = await this.prisma.customer.findFirst({
      where: { tenantId, partyId },
    });
    if (partyLinkedCustomer && partyLinkedCustomer.id !== customerId) {
      throw new ConflictException('Party is already linked to another customer');
    }

    const updated = await this.prisma.customer.update({
      where: { id: customerId },
      data: { partyId },
    });

    await this.audit.log({
      tenantId,
      userId,
      entity: 'party_legacy_customer',
      entityId: customerId,
      action: 'linked',
      newValue: { partyId, customerId },
    });

    return updated;
  }

  async unlinkCustomer(
    tenantId: string,
    partyId: string,
    userId: string,
  ): Promise<void> {
    await this.assertPartyInTenant(tenantId, partyId);

    const customer = await this.prisma.customer.findFirst({
      where: { tenantId, partyId, deletedAt: null },
    });
    if (!customer) {
      throw new NotFoundException('No linked customer found for this party');
    }

    await this.prisma.customer.update({
      where: { id: customer.id },
      data: { partyId: null },
    });

    await this.audit.log({
      tenantId,
      userId,
      entity: 'party_legacy_customer',
      entityId: customer.id,
      action: 'unlinked',
      oldValue: { partyId, customerId: customer.id },
    });
  }

  async resolvePartyFromCustomer(
    tenantId: string,
    customerId: string,
  ): Promise<Party | null> {
    const customer = await this.findLegacyCustomer(tenantId, customerId);
    if (!customer.partyId) {
      return null;
    }

    const party = await this.prisma.party.findFirst({
      where: { id: customer.partyId, tenantId },
    });
    if (!party) {
      throw new NotFoundException('Party not found');
    }
    return party;
  }

  async getLinkedSupplier(tenantId: string, partyId: string): Promise<Supplier | null> {
    await this.assertPartyInTenant(tenantId, partyId);
    return this.prisma.supplier.findFirst({
      where: { tenantId, partyId, deletedAt: null },
    });
  }

  /**
   * Resolve Party → legacy Supplier for Purchasing operations.
   * Does not create Suppliers. Requires active supplier role and existing link.
   */
  async resolveLinkedSupplierForPurchasing(
    tenantId: string,
    partyId: string,
  ): Promise<Supplier> {
    await this.parties.assertActiveParty(tenantId, partyId);
    await this.assertActiveRole(tenantId, partyId, PartyRoleType.supplier);

    const supplier = await this.getLinkedSupplier(tenantId, partyId);
    if (!supplier) {
      throw new BadRequestException(
        'Party must be linked to a legacy Supplier before it can be used in Purchasing',
      );
    }
    return supplier;
  }

  async linkSupplier(
    tenantId: string,
    partyId: string,
    supplierId: string,
    userId: string,
  ): Promise<Supplier> {
    await this.parties.assertActiveParty(tenantId, partyId);
    await this.assertActiveRole(tenantId, partyId, PartyRoleType.supplier);

    const supplier = await this.findLegacySupplier(tenantId, supplierId);

    if (supplier.partyId === partyId) {
      return supplier;
    }

    if (supplier.partyId) {
      throw new ConflictException('Supplier is already linked to another party');
    }

    const partyLinkedSupplier = await this.prisma.supplier.findFirst({
      where: { tenantId, partyId },
    });
    if (partyLinkedSupplier && partyLinkedSupplier.id !== supplierId) {
      throw new ConflictException('Party is already linked to another supplier');
    }

    const updated = await this.prisma.supplier.update({
      where: { id: supplierId },
      data: { partyId },
    });

    await this.audit.log({
      tenantId,
      userId,
      entity: 'party_legacy_supplier',
      entityId: supplierId,
      action: 'linked',
      newValue: { partyId, supplierId },
    });

    return updated;
  }

  async unlinkSupplier(
    tenantId: string,
    partyId: string,
    userId: string,
  ): Promise<void> {
    await this.assertPartyInTenant(tenantId, partyId);

    const supplier = await this.prisma.supplier.findFirst({
      where: { tenantId, partyId, deletedAt: null },
    });
    if (!supplier) {
      throw new NotFoundException('No linked supplier found for this party');
    }

    await this.prisma.supplier.update({
      where: { id: supplier.id },
      data: { partyId: null },
    });

    await this.audit.log({
      tenantId,
      userId,
      entity: 'party_legacy_supplier',
      entityId: supplier.id,
      action: 'unlinked',
      oldValue: { partyId, supplierId: supplier.id },
    });
  }

  async resolvePartyFromSupplier(
    tenantId: string,
    supplierId: string,
  ): Promise<Party | null> {
    const supplier = await this.findLegacySupplier(tenantId, supplierId);
    if (!supplier.partyId) {
      return null;
    }

    const party = await this.prisma.party.findFirst({
      where: { id: supplier.partyId, tenantId },
    });
    if (!party) {
      throw new NotFoundException('Party not found');
    }
    return party;
  }

  private async assertPartyInTenant(tenantId: string, partyId: string): Promise<void> {
    const party = await this.prisma.party.findFirst({
      where: { id: partyId, tenantId },
    });
    if (!party) {
      throw new NotFoundException('Party not found');
    }
  }

  private async assertActiveRole(
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
      throw new BadRequestException(
        `Party must have an active ${role} role before linking`,
      );
    }
  }

  private async findLegacyCustomer(tenantId: string, customerId: string): Promise<Customer> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, tenantId, deletedAt: null },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    return customer;
  }

  private async findLegacySupplier(tenantId: string, supplierId: string): Promise<Supplier> {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, tenantId, deletedAt: null },
    });
    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }
    return supplier;
  }
}
