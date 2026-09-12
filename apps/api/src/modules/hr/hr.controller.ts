import {
  Body, Controller, Get, Param, Post, UseGuards,
} from '@nestjs/common';
import {
  IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { HrService } from './hr.service';
import { TenantId, CurrentUser, RequirePermissions, RequireModule } from '../../common/decorators';
import { PermissionsGuard, ModuleAccessGuard } from '../../common/guards';
import { TenantAccessService } from '../../common/services/tenant-access.service';
import type { JwtPayload } from '@fratelanza/types';

class CreateDepartmentDto {
  @IsOptional() @IsString() branchId?: string;
  @IsString() code!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() managerId?: string;
}

class CreatePositionDto {
  @IsOptional() @IsString() departmentId?: string;
  @IsString() code!: string;
  @IsString() title!: string;
}

class CreateEmployeeDto {
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() positionId?: string;
  @IsOptional() @IsString() managerId?: string;
  @IsOptional() @IsString() code?: string;
  @IsString() firstName!: string;
  @IsString() lastName!: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() nationalId?: string;
  @IsString() hireDate!: string;
  @IsOptional() @IsNumber() @Min(0) basicSalary?: number;
  @IsOptional() @IsString() currencyCode?: string;
}

class TerminateEmployeeDto {
  @IsString() terminationDate!: string;
}

class CreateLeaveTypeDto {
  @IsString() code!: string;
  @IsString() name!: string;
  @IsOptional() @IsBoolean() paidLeave?: boolean;
  @IsOptional() @IsInt() @Min(0) daysPerYear?: number;
}

class CreateLeaveRequestDto {
  @IsString() employeeId!: string;
  @IsString() leaveTypeId!: string;
  @IsString() startDate!: string;
  @IsString() endDate!: string;
  @IsOptional() @IsString() reason?: string;
}

class PayrollLineDto {
  @IsString() employeeId!: string;
  @IsOptional() @IsNumber() @Min(0) allowances?: number;
  @IsOptional() @IsNumber() @Min(0) deductions?: number;
}

class CreatePayrollRunDto {
  @IsOptional() @IsString() branchId?: string;
  @IsString() periodStart!: string;
  @IsString() periodEnd!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => PayrollLineDto)
  lines!: PayrollLineDto[];
}

@Controller('hr')
@UseGuards(PermissionsGuard, ModuleAccessGuard)
@RequireModule('hr')
export class HrController {
  constructor(
    private hrService: HrService,
    private tenantAccess: TenantAccessService,
  ) {}

  @Get('departments')
  @RequirePermissions('hr:departments:read')
  async listDepartments(@TenantId() tenantId: string) {
    return { success: true, data: await this.hrService.listDepartments(tenantId) };
  }

  @Post('departments')
  @RequirePermissions('hr:departments:manage')
  async createDepartment(@TenantId() tenantId: string, @Body() dto: CreateDepartmentDto) {
    return { success: true, data: await this.hrService.createDepartment(tenantId, dto) };
  }

  @Get('positions')
  @RequirePermissions('hr:positions:read')
  async listPositions(@TenantId() tenantId: string) {
    return { success: true, data: await this.hrService.listPositions(tenantId) };
  }

  @Post('positions')
  @RequirePermissions('hr:positions:manage')
  async createPosition(@TenantId() tenantId: string, @Body() dto: CreatePositionDto) {
    return { success: true, data: await this.hrService.createPosition(tenantId, dto) };
  }

  @Get('employees')
  @RequirePermissions('hr:employees:read')
  async listEmployees(@TenantId() tenantId: string, @CurrentUser() user: JwtPayload) {
    const data = await this.hrService.listEmployees(tenantId, this.tenantAccess.buildBranchWhere(user));
    return { success: true, data };
  }

  @Get('employees/:id')
  @RequirePermissions('hr:employees:read')
  async getEmployee(@TenantId() tenantId: string, @Param('id') id: string) {
    return { success: true, data: await this.hrService.getEmployee(tenantId, id) };
  }

  @Post('employees')
  @RequirePermissions('hr:employees:create')
  async createEmployee(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateEmployeeDto,
  ) {
    if (dto.branchId) this.tenantAccess.assertBranchAccess(user, dto.branchId);
    return { success: true, data: await this.hrService.createEmployee(tenantId, dto) };
  }

  @Post('employees/:id/terminate')
  @RequirePermissions('hr:employees:update')
  async terminateEmployee(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: TerminateEmployeeDto,
  ) {
    return { success: true, data: await this.hrService.terminateEmployee(tenantId, id, dto.terminationDate) };
  }

  @Get('leave-types')
  @RequirePermissions('hr:leave:read')
  async listLeaveTypes(@TenantId() tenantId: string) {
    return { success: true, data: await this.hrService.listLeaveTypes(tenantId) };
  }

  @Post('leave-types')
  @RequirePermissions('hr:leave:manage')
  async createLeaveType(@TenantId() tenantId: string, @Body() dto: CreateLeaveTypeDto) {
    return { success: true, data: await this.hrService.createLeaveType(tenantId, dto) };
  }

  @Post('leave-requests')
  @RequirePermissions('hr:leave:create')
  async requestLeave(@TenantId() tenantId: string, @Body() dto: CreateLeaveRequestDto) {
    return { success: true, data: await this.hrService.requestLeave(tenantId, dto) };
  }

  @Post('leave-requests/:id/approve')
  @RequirePermissions('hr:leave:approve')
  async approveLeave(@TenantId() tenantId: string, @CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return { success: true, data: await this.hrService.decideLeaveRequest(tenantId, id, true, user.sub) };
  }

  @Post('leave-requests/:id/reject')
  @RequirePermissions('hr:leave:approve')
  async rejectLeave(@TenantId() tenantId: string, @CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return { success: true, data: await this.hrService.decideLeaveRequest(tenantId, id, false, user.sub) };
  }

  @Post('payroll/runs')
  @RequirePermissions('hr:payroll:create')
  async createPayrollRun(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreatePayrollRunDto,
  ) {
    if (dto.branchId) this.tenantAccess.assertBranchAccess(user, dto.branchId);
    return { success: true, data: await this.hrService.createPayrollRun(tenantId, dto, user.sub) };
  }

  @Post('payroll/runs/:id/post')
  @RequirePermissions('hr:payroll:post')
  async postPayrollRun(@TenantId() tenantId: string, @Param('id') id: string) {
    return { success: true, data: await this.hrService.postPayrollRun(tenantId, id) };
  }
}
