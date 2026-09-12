import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { JwtPayload } from '@fratelanza/types';
import { PrismaService } from '../../database/prisma.service';

export type BranchScopeFilter =
  | { mode: 'all' }
  | { mode: 'branches'; branchIds: string[] };

export type WarehouseScopeFilter =
  | { mode: 'all' }
  | { mode: 'warehouses'; warehouseIds: string[] };

@Injectable()
export class TenantAccessService {
  constructor(private prisma: PrismaService) {}

  /** Tenant-wide when null/empty allowedBranchIds and no branchId on user. */
  resolveBranchScope(user: JwtPayload): BranchScopeFilter {
    if (user.isPlatformAdmin) return { mode: 'all' };

    const explicit = user.allowedBranchIds ?? [];
    if (explicit.length > 0) {
      return { mode: 'branches', branchIds: [...new Set(explicit)] };
    }

    if (user.branchId) {
      return { mode: 'branches', branchIds: [user.branchId] };
    }

    return { mode: 'all' };
  }

  buildBranchWhere(user: JwtPayload): { branchId?: string | { in: string[] } } {
    const scope = this.resolveBranchScope(user);
    if (scope.mode === 'all') return {};
    if (scope.branchIds.length === 1) return { branchId: scope.branchIds[0] };
    return { branchId: { in: scope.branchIds } };
  }

  assertBranchAccess(user: JwtPayload, branchId: string): void {
    if (user.isPlatformAdmin) return;
    const scope = this.resolveBranchScope(user);
    if (scope.mode === 'all') return;
    if (!scope.branchIds.includes(branchId)) {
      throw new ForbiddenException('You are not authorized for this branch');
    }
  }

  assertBranchInScope(user: JwtPayload, branchId?: string | null): void {
    if (!branchId) return;
    this.assertBranchAccess(user, branchId);
  }

  resolveWarehouseScope(user: JwtPayload): WarehouseScopeFilter {
    if (user.isPlatformAdmin) return { mode: 'all' };

    const explicit = user.allowedWarehouseIds ?? [];
    if (explicit.length > 0) {
      return { mode: 'warehouses', warehouseIds: [...new Set(explicit)] };
    }

    return { mode: 'all' };
  }

  buildWarehouseWhere(user: JwtPayload): { warehouseId?: string | { in: string[] } } {
    const scope = this.resolveWarehouseScope(user);
    if (scope.mode === 'all') return {};
    if (scope.warehouseIds.length === 1) return { warehouseId: scope.warehouseIds[0] };
    return { warehouseId: { in: scope.warehouseIds } };
  }

  assertWarehouseAccess(user: JwtPayload, warehouseId: string): void {
    if (user.isPlatformAdmin) return;
    const scope = this.resolveWarehouseScope(user);
    if (scope.mode === 'all') return;
    if (!scope.warehouseIds.includes(warehouseId)) {
      throw new ForbiddenException('You are not authorized for this warehouse');
    }
  }

  buildCustomerListWhere(user: JwtPayload): {
    OR?: Array<{ branchId: null } | { branchId: string } | { branchId: { in: string[] } }>;
  } {
    const scope = this.resolveBranchScope(user);
    if (scope.mode === 'all') return {};
    return {
      OR: [
        { branchId: null },
        scope.branchIds.length === 1
          ? { branchId: scope.branchIds[0] }
          : { branchId: { in: scope.branchIds } },
      ],
    };
  }

  async buildInventoryWarehouseFilter(
    tenantId: string,
    user: JwtPayload,
  ): Promise<{ warehouseId?: string | { in: string[] } }> {
    const warehouseScope = this.resolveWarehouseScope(user);
    if (warehouseScope.mode === 'warehouses') {
      return this.buildWarehouseWhere(user);
    }

    const branchScope = this.resolveBranchScope(user);
    if (branchScope.mode === 'all') return {};

    const warehouses = await this.prisma.warehouse.findMany({
      where: {
        tenantId,
        deletedAt: null,
        branchId: branchScope.branchIds.length === 1
          ? branchScope.branchIds[0]
          : { in: branchScope.branchIds },
      },
      select: { id: true },
    });

    const ids = warehouses.map((row) => row.id);
    if (ids.length === 0) return { warehouseId: { in: ['00000000-0000-0000-0000-000000000000'] } };
    if (ids.length === 1) return { warehouseId: ids[0] };
    return { warehouseId: { in: ids } };
  }

  async buildWarehouseListWhere(
    tenantId: string,
    user: JwtPayload,
  ): Promise<{ branchId?: string | { in: string[] }; id?: string | { in: string[] } }> {
    const warehouseScope = this.resolveWarehouseScope(user);
    if (warehouseScope.mode === 'warehouses') {
      if (warehouseScope.warehouseIds.length === 1) {
        return { id: warehouseScope.warehouseIds[0] };
      }
      return { id: { in: warehouseScope.warehouseIds } };
    }

    return this.buildBranchWhere(user);
  }

  async assertModuleEnabled(tenantId: string, moduleId: string): Promise<void> {
    const rows = await this.prisma.tenantModuleAccess.findMany({ where: { tenantId } });
    if (rows.length === 0) return;
    const access = rows.find((r) => r.moduleId === moduleId);
    if (!access?.enabled) {
      throw new ForbiddenException(`Module "${moduleId}" is not enabled for this organization`);
    }
  }

  async assertBranchExists(tenantId: string, branchId: string): Promise<void> {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, tenantId, deletedAt: null, isActive: true },
    });
    if (!branch) {
      throw new BadRequestException('Branch not found');
    }
  }

  async assertBranchBelongsToTenant(tenantId: string, branchId: string): Promise<void> {
    await this.assertBranchExists(tenantId, branchId);
  }

  async assertWarehouseForBranch(
    tenantId: string,
    warehouseId: string,
    branchId: string,
  ): Promise<{ branchId: string }> {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId, tenantId, deletedAt: null },
    });
    if (!warehouse) {
      throw new BadRequestException('Warehouse not found');
    }
    if (warehouse.branchId !== branchId) {
      throw new BadRequestException('Warehouse does not belong to the specified branch');
    }
    return warehouse;
  }

  async assertWarehouseForTenant(tenantId: string, warehouseId: string) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId, tenantId, deletedAt: null },
    });
    if (!warehouse) {
      throw new BadRequestException('Warehouse not found');
    }
    return warehouse;
  }

  async assertProductForTenant(tenantId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, tenantId, deletedAt: null },
    });
    if (!product) {
      throw new BadRequestException('Product not found');
    }
    return product;
  }

  async assertCustomerForTenant(tenantId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, tenantId, deletedAt: null },
    });
    if (!customer) {
      throw new BadRequestException('Customer not found');
    }
    return customer;
  }

  async assertSupplierForTenant(tenantId: string, supplierId: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, tenantId, deletedAt: null },
    });
    if (!supplier) {
      throw new BadRequestException('Supplier not found');
    }
    return supplier;
  }

  /** Reject if a resource from another tenant is referenced by ID. */
  assertSameTenant(resourceTenantId: string, requestTenantId: string): void {
    if (resourceTenantId !== requestTenantId) {
      throw new NotFoundException('Resource not found');
    }
  }

  async assertSalesInvoiceAccess(
    tenantId: string,
    user: JwtPayload,
    invoiceId: string,
  ) {
    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id: invoiceId, tenantId, deletedAt: null },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    this.assertBranchInScope(user, invoice.branchId);
    return invoice;
  }

  async assertPurchaseOrderAccess(
    tenantId: string,
    user: JwtPayload,
    orderId: string,
  ) {
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id: orderId, tenantId },
    });
    if (!order) throw new NotFoundException('Purchase order not found');
    this.assertBranchInScope(user, order.branchId);
    return order;
  }
}
