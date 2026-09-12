import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../../../../packages/database/generated/server';
import { PrismaService } from '../../database/prisma.service';
import { DocumentNumberService } from '../../common/services/document-number.service';
import { FinancialPostingService } from '../finance/posting/financial-posting.service';
import { ACCOUNT_ROLES } from '../finance/posting/account-roles.constants';

interface CreateDepartmentInput {
  branchId?: string;
  code: string;
  name: string;
  managerId?: string;
}

interface CreatePositionInput {
  departmentId?: string;
  code: string;
  title: string;
}

interface CreateEmployeeInput {
  branchId?: string;
  userId?: string;
  departmentId?: string;
  positionId?: string;
  managerId?: string;
  code?: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  nationalId?: string;
  hireDate: string;
  basicSalary?: number;
  currencyCode?: string;
}

interface CreateLeaveTypeInput {
  code: string;
  name: string;
  paidLeave?: boolean;
  daysPerYear?: number;
}

interface CreateLeaveRequestInput {
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  reason?: string;
}

interface PayrollLineInput {
  employeeId: string;
  allowances?: number;
  deductions?: number;
}

interface CreatePayrollRunInput {
  branchId?: string;
  periodStart: string;
  periodEnd: string;
  lines: PayrollLineInput[];
}

function daysBetweenInclusive(start: Date, end: Date): number {
  const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return diff + 1;
}

@Injectable()
export class HrService {
  constructor(
    private prisma: PrismaService,
    private documentNumbers: DocumentNumberService,
    private financialPosting: FinancialPostingService,
  ) {}

  // ── Departments / Positions ──
  async listDepartments(tenantId: string) {
    return this.prisma.department.findMany({ where: { tenantId }, orderBy: { code: 'asc' } });
  }

  async createDepartment(tenantId: string, dto: CreateDepartmentInput) {
    return this.prisma.department.create({ data: { tenantId, ...dto } });
  }

  async listPositions(tenantId: string) {
    return this.prisma.position.findMany({ where: { tenantId }, orderBy: { code: 'asc' } });
  }

  async createPosition(tenantId: string, dto: CreatePositionInput) {
    return this.prisma.position.create({ data: { tenantId, ...dto } });
  }

  // ── Employees ──
  async listEmployees(tenantId: string, branchWhere: { branchId?: string | { in: string[] } } = {}) {
    return this.prisma.employee.findMany({
      where: { tenantId, ...branchWhere },
      include: { department: true, position: true },
      orderBy: { code: 'asc' },
    });
  }

  async getEmployee(tenantId: string, id: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, tenantId },
      include: { department: true, position: true, leaveRequests: { orderBy: { startDate: 'desc' } } },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    return employee;
  }

  async createEmployee(tenantId: string, dto: CreateEmployeeInput) {
    const code = dto.code ?? (await this.documentNumbers.nextNumber(tenantId, 'EMP', 'EMP', dto.branchId ?? null));
    return this.prisma.employee.create({
      data: {
        tenantId,
        branchId: dto.branchId,
        userId: dto.userId,
        departmentId: dto.departmentId,
        positionId: dto.positionId,
        managerId: dto.managerId,
        code,
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
        nationalId: dto.nationalId,
        hireDate: new Date(dto.hireDate),
        basicSalary: dto.basicSalary ?? 0,
        currencyCode: dto.currencyCode,
      },
    });
  }

  async terminateEmployee(tenantId: string, id: string, terminationDate: string) {
    const employee = await this.prisma.employee.findFirst({ where: { id, tenantId } });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    return this.prisma.employee.update({
      where: { id },
      data: { status: 'terminated', terminationDate: new Date(terminationDate) },
    });
  }

  // ── Leave ──
  async listLeaveTypes(tenantId: string) {
    return this.prisma.leaveType.findMany({ where: { tenantId }, orderBy: { code: 'asc' } });
  }

  async createLeaveType(tenantId: string, dto: CreateLeaveTypeInput) {
    return this.prisma.leaveType.create({ data: { tenantId, ...dto } });
  }

  async requestLeave(tenantId: string, dto: CreateLeaveRequestInput) {
    const employee = await this.prisma.employee.findFirst({ where: { id: dto.employeeId, tenantId } });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (endDate < startDate) {
      throw new BadRequestException('endDate must be on or after startDate');
    }

    return this.prisma.leaveRequest.create({
      data: {
        tenantId,
        employeeId: dto.employeeId,
        leaveTypeId: dto.leaveTypeId,
        startDate,
        endDate,
        days: daysBetweenInclusive(startDate, endDate),
        reason: dto.reason,
      },
    });
  }

  async decideLeaveRequest(tenantId: string, id: string, approve: boolean, approverId: string) {
    const request = await this.prisma.leaveRequest.findFirst({ where: { id, tenantId } });
    if (!request) {
      throw new NotFoundException('Leave request not found');
    }
    if (request.status !== 'pending') {
      throw new BadRequestException('Leave request already decided');
    }

    return this.prisma.leaveRequest.update({
      where: { id },
      data: {
        status: approve ? 'approved' : 'rejected',
        approvedById: approverId,
        approvedAt: new Date(),
      },
    });
  }

  // ── Payroll ──
  async createPayrollRun(tenantId: string, dto: CreatePayrollRunInput, actorUserId?: string) {
    if (dto.lines.length === 0) {
      throw new BadRequestException('Payroll run requires at least one line');
    }

    const employees = await this.prisma.employee.findMany({
      where: { tenantId, id: { in: dto.lines.map((l) => l.employeeId) } },
    });
    const employeeMap = new Map(employees.map((e) => [e.id, e]));

    let totalGross = new Prisma.Decimal(0);
    let totalDeductions = new Prisma.Decimal(0);
    let totalNet = new Prisma.Decimal(0);

    const lineData = dto.lines.map((line) => {
      const employee = employeeMap.get(line.employeeId);
      if (!employee) {
        throw new NotFoundException(`Employee not found: ${line.employeeId}`);
      }
      const allowances = new Prisma.Decimal(line.allowances ?? 0);
      const deductions = new Prisma.Decimal(line.deductions ?? 0);
      const gross = employee.basicSalary.add(allowances);
      const net = gross.sub(deductions);

      totalGross = totalGross.add(gross);
      totalDeductions = totalDeductions.add(deductions);
      totalNet = totalNet.add(net);

      return {
        employeeId: employee.id,
        basicSalary: employee.basicSalary,
        allowances,
        deductions,
        netPay: net,
      };
    });

    const code = await this.documentNumbers.nextNumber(tenantId, 'PAYROLL', 'PR', dto.branchId ?? null);

    return this.prisma.payrollRun.create({
      data: {
        tenantId,
        branchId: dto.branchId,
        code,
        periodStart: new Date(dto.periodStart),
        periodEnd: new Date(dto.periodEnd),
        totalGross,
        totalDeductions,
        totalNet,
        createdById: actorUserId,
        lines: { create: lineData },
      },
      include: { lines: true },
    });
  }

  async postPayrollRun(tenantId: string, id: string) {
    const run = await this.prisma.payrollRun.findFirst({ where: { id, tenantId } });
    if (!run) {
      throw new NotFoundException('Payroll run not found');
    }
    if (run.status !== 'draft') {
      throw new BadRequestException('Only draft payroll runs can be posted');
    }
    if (!run.branchId) {
      throw new BadRequestException('Payroll run must have a branch to post to the GL');
    }

    return this.prisma.$transaction(async (tx) => {
      const entry = await this.financialPosting.post(
        {
          mode: 'lines',
          tenantId,
          branchId: run.branchId!,
          postingDate: run.periodEnd,
          description: `Payroll ${run.code} (${run.periodStart.toISOString().slice(0, 10)} - ${run.periodEnd.toISOString().slice(0, 10)})`,
          sourceModule: 'hr',
          sourceType: 'payroll_run',
          sourceId: run.id,
          sourceEvent: 'post',
          lines: [
            { accountRole: ACCOUNT_ROLES.SALARY_EXPENSE, debit: run.totalGross, credit: 0 },
            { accountRole: ACCOUNT_ROLES.SALARY_PAYABLE, debit: 0, credit: run.totalNet },
            ...(run.totalDeductions.gt(0)
              ? [{ accountRole: ACCOUNT_ROLES.TAX_PAYABLE, debit: 0, credit: run.totalDeductions }]
              : []),
          ],
        },
        tx,
      );

      return tx.payrollRun.update({
        where: { id },
        data: { status: 'posted', journalEntryId: entry.id, postedAt: new Date() },
        include: { lines: true },
      });
    });
  }
}
