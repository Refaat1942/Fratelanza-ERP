import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId, deletedAt: null },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        locale: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        branch: { select: { id: true, name: true, code: true } },
        role: { select: { id: true, name: true, code: true } },
      },
      orderBy: { firstName: 'asc' },
    });
  }

  async findById(tenantId: string, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        locale: true,
        isActive: true,
        lastLoginAt: true,
        branchId: true,
        roleId: true,
        branch: { select: { id: true, name: true } },
        role: { select: { id: true, name: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(tenantId: string, data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    roleId: string;
    branchId?: string;
    phone?: string;
    locale?: string;
  }) {
    const existing = await this.prisma.user.findFirst({
      where: { tenantId, email: data.email, deletedAt: null },
    });
    if (existing) throw new ConflictException('Email already in use');

    const passwordHash = await bcrypt.hash(data.password, 12);
    return this.prisma.user.create({
      data: {
        tenantId,
        email: data.email,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        roleId: data.roleId,
        branchId: data.branchId,
        phone: data.phone,
        locale: data.locale ?? 'en',
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
      },
    });
  }

  async update(tenantId: string, id: string, data: Partial<{
    firstName: string;
    lastName: string;
    phone: string;
    locale: string;
    roleId: string;
    branchId: string;
    isActive: boolean;
    password: string;
  }>) {
    await this.findById(tenantId, id);
    const updateData: Record<string, unknown> = { ...data };
    if (data.password) {
      updateData.passwordHash = await bcrypt.hash(data.password, 12);
      delete updateData.password;
    }
    return this.prisma.user.update({
      where: { id },
      data: updateData,
      select: { id: true, email: true, firstName: true, lastName: true, isActive: true },
    });
  }

  async softDelete(tenantId: string, id: string) {
    await this.findById(tenantId, id);
    return this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }
}
