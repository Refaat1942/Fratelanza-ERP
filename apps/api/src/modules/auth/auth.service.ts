import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import type { JwtPayload } from '@fratelanza/types';
import { buildPermissionKey } from '@fratelanza/shared';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { LoginDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private auditService: AuditService,
  ) {}

  async login(dto: LoginDto, ipAddress?: string, userAgent?: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        email: dto.email,
        isActive: true,
        deletedAt: null,
      },
      include: {
        role: {
          include: {
            permissions: { include: { permission: true } },
          },
        },
        tenant: true,
        branch: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.tenant.isActive) {
      throw new ForbiddenException('Company account is inactive');
    }

    let deviceId: string | undefined;
    if (dto.deviceFingerprint) {
      const device = await this.prisma.device.upsert({
        where: { fingerprint: dto.deviceFingerprint },
        update: {
          lastSeenAt: new Date(),
          name: dto.deviceName ?? undefined,
        },
        create: {
          tenantId: user.tenantId,
          branchId: user.branchId,
          name: dto.deviceName ?? 'Unknown Device',
          fingerprint: dto.deviceFingerprint,
          lastSeenAt: new Date(),
        },
      });
      deviceId = device.id;
    }

    const sessionId = randomUUID();
    const refreshToken = randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.session.create({
      data: {
        id: sessionId,
        userId: user.id,
        deviceId,
        refreshToken,
        ipAddress,
        userAgent,
        expiresAt,
      },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const accessPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId,
      branchId: user.branchId ?? undefined,
      sessionId,
      type: 'access',
    };

    const accessToken = this.jwtService.sign(accessPayload, {
      expiresIn: 900,
    });

    await this.auditService.log({
      tenantId: user.tenantId,
      branchId: user.branchId,
      userId: user.id,
      deviceId,
      entity: 'session',
      entityId: sessionId,
      action: 'login',
      ipAddress,
    });

    const permissions = user.role.permissions.map((rp) =>
      buildPermissionKey(rp.permission.module, rp.permission.feature, rp.permission.action),
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        locale: user.locale,
        tenantId: user.tenantId,
        branchId: user.branchId,
        tenantName: user.tenant.name,
        branchName: user.branch?.name,
        role: user.role.name,
        permissions,
      },
    };
  }

  async refresh(refreshToken: string) {
    const session = await this.prisma.session.findUnique({
      where: { refreshToken },
      include: {
        user: {
          include: { tenant: true },
        },
      },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!session.user.isActive || !session.user.tenant.isActive) {
      throw new ForbiddenException('Account is inactive');
    }

    const newRefreshToken = randomUUID();

    await this.prisma.session.update({
      where: { id: session.id },
      data: { refreshToken: newRefreshToken },
    });

    const accessPayload: JwtPayload = {
      sub: session.userId,
      email: session.user.email,
      tenantId: session.user.tenantId,
      branchId: session.user.branchId ?? undefined,
      sessionId: session.id,
      type: 'access',
    };

    const accessToken = this.jwtService.sign(accessPayload, {
      expiresIn: 900,
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    };
  }

  async assertSessionActive(sessionId: string, userId: string): Promise<void> {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, userId },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session is no longer active');
    }
  }

  async logout(sessionId: string, userId: string) {
    await this.prisma.session.updateMany({
      where: { id: sessionId, userId },
      data: { revokedAt: new Date() },
    });
    return { success: true };
  }

  async getUserPermissions(userId: string): Promise<string[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: {
          include: {
            permissions: { include: { permission: true } },
          },
        },
      },
    });

    if (!user) return [];

    return user.role.permissions.map((rp) =>
      buildPermissionKey(rp.permission.module, rp.permission.feature, rp.permission.action),
    );
  }
}
