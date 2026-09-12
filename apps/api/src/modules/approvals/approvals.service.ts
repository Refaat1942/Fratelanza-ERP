import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../../../../packages/database/generated/server';
import { PrismaService } from '../../database/prisma.service';

interface CreateWorkflowInput {
  sourceModule: string;
  sourceType: string;
  name: string;
  minAmount?: number;
  maxAmount?: number;
  steps: Array<{ sequence: number; name: string; approverRole?: string; approverUserId?: string }>;
}

interface UpdateWorkflowInput {
  name?: string;
  minAmount?: number;
  maxAmount?: number;
  isActive?: boolean;
  steps?: Array<{ sequence: number; name: string; approverRole?: string; approverUserId?: string }>;
}

interface SubmitForApprovalInput {
  sourceModule: string;
  sourceType: string;
  sourceId: string;
  amount?: number;
  requestedById: string;
}

@Injectable()
export class ApprovalsService {
  constructor(private prisma: PrismaService) {}

  async listWorkflows(tenantId: string) {
    return this.prisma.approvalWorkflow.findMany({
      where: { tenantId },
      include: { steps: { orderBy: { sequence: 'asc' } } },
      orderBy: { name: 'asc' },
    });
  }

  async createWorkflow(tenantId: string, dto: CreateWorkflowInput) {
    if (dto.steps.length === 0) {
      throw new BadRequestException('Workflow requires at least one step');
    }
    return this.prisma.approvalWorkflow.create({
      data: {
        tenantId,
        sourceModule: dto.sourceModule,
        sourceType: dto.sourceType,
        name: dto.name,
        minAmount: dto.minAmount,
        maxAmount: dto.maxAmount,
        steps: { create: dto.steps },
      },
      include: { steps: { orderBy: { sequence: 'asc' } } },
    });
  }

  async updateWorkflow(tenantId: string, id: string, dto: UpdateWorkflowInput) {
    const workflow = await this.prisma.approvalWorkflow.findFirst({ where: { id, tenantId } });
    if (!workflow) {
      throw new NotFoundException('Approval workflow not found');
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.steps) {
        if (dto.steps.length === 0) {
          throw new BadRequestException('Workflow requires at least one step');
        }
        await tx.approvalStep.deleteMany({ where: { workflowId: id } });
        await tx.approvalStep.createMany({ data: dto.steps.map((s) => ({ ...s, workflowId: id })) });
      }

      return tx.approvalWorkflow.update({
        where: { id },
        data: {
          name: dto.name,
          minAmount: dto.minAmount,
          maxAmount: dto.maxAmount,
          isActive: dto.isActive,
        },
        include: { steps: { orderBy: { sequence: 'asc' } } },
      });
    });
  }

  async deleteWorkflow(tenantId: string, id: string) {
    const workflow = await this.prisma.approvalWorkflow.findFirst({ where: { id, tenantId } });
    if (!workflow) {
      throw new NotFoundException('Approval workflow not found');
    }
    const requestCount = await this.prisma.approvalRequest.count({ where: { workflowId: id } });
    if (requestCount > 0) {
      // Preserve history for any request ever routed through this workflow — deactivate instead of deleting.
      return this.prisma.approvalWorkflow.update({ where: { id }, data: { isActive: false } });
    }
    await this.prisma.approvalStep.deleteMany({ where: { workflowId: id } });
    await this.prisma.approvalWorkflow.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Finds the best-matching active workflow for a source (narrowest amount band wins),
   * and opens an ApprovalRequest at step 1. Idempotent per source document.
   */
  async submitForApproval(tenantId: string, dto: SubmitForApprovalInput) {
    const existing = await this.prisma.approvalRequest.findFirst({
      where: {
        tenantId,
        sourceModule: dto.sourceModule,
        sourceType: dto.sourceType,
        sourceId: dto.sourceId,
      },
    });
    if (existing) {
      return existing;
    }

    const candidates = await this.prisma.approvalWorkflow.findMany({
      where: {
        tenantId,
        sourceModule: dto.sourceModule,
        sourceType: dto.sourceType,
        isActive: true,
      },
      include: { steps: { orderBy: { sequence: 'asc' } } },
    });

    const amount = dto.amount !== undefined ? new Prisma.Decimal(dto.amount) : undefined;
    const matching = candidates.filter((workflow) => {
      if (workflow.minAmount && amount !== undefined && amount.lt(workflow.minAmount)) return false;
      if (workflow.maxAmount && amount !== undefined && amount.gt(workflow.maxAmount)) return false;
      return true;
    });

    if (matching.length === 0) {
      throw new NotFoundException(
        `No active approval workflow found for ${dto.sourceModule}:${dto.sourceType}`,
      );
    }

    const workflow = matching.reduce((best, current) => {
      const bestSpan = (Number(best.maxAmount ?? Infinity) - Number(best.minAmount ?? 0));
      const currentSpan = (Number(current.maxAmount ?? Infinity) - Number(current.minAmount ?? 0));
      return currentSpan < bestSpan ? current : best;
    });

    return this.prisma.approvalRequest.create({
      data: {
        tenantId,
        workflowId: workflow.id,
        sourceModule: dto.sourceModule,
        sourceType: dto.sourceType,
        sourceId: dto.sourceId,
        amount: dto.amount,
        requestedById: dto.requestedById,
        currentStepSequence: workflow.steps[0]?.sequence ?? 1,
      },
      include: { workflow: { include: { steps: true } } },
    });
  }

  async getRequestForSource(tenantId: string, sourceModule: string, sourceType: string, sourceId: string) {
    return this.prisma.approvalRequest.findFirst({
      where: { tenantId, sourceModule, sourceType, sourceId },
      include: { workflow: { include: { steps: { orderBy: { sequence: 'asc' } } } }, actions: true },
    });
  }

  /**
   * A step names either a specific approverUserId or a generic approverRole
   * (e.g. "manager") — but JwtPayload carries no role-name field to match
   * against, so a role-based step can't be routed to "whoever holds that
   * role" today. Until that mapping exists, treat any step with no specific
   * approverUserId as visible to any user with approvals:requests:decide
   * (the permission guard on decide() is the real access control here);
   * a step explicitly assigned to a user is visible only to that user.
   */
  async listPendingForApprover(tenantId: string, userId: string) {
    const requests = await this.prisma.approvalRequest.findMany({
      where: { tenantId, status: 'pending' },
      include: { workflow: { include: { steps: { orderBy: { sequence: 'asc' } } } } },
    });

    return requests.filter((request) => {
      const step = request.workflow.steps.find((s) => s.sequence === request.currentStepSequence);
      if (!step) return false;
      return step.approverUserId ? step.approverUserId === userId : Boolean(step.approverRole);
    });
  }

  async decide(
    tenantId: string,
    requestId: string,
    approverId: string,
    decision: 'approved' | 'rejected',
    comment?: string,
  ) {
    const request = await this.prisma.approvalRequest.findFirst({
      where: { id: requestId, tenantId },
      include: { workflow: { include: { steps: { orderBy: { sequence: 'asc' } } } } },
    });
    if (!request) {
      throw new NotFoundException('Approval request not found');
    }
    if (request.status !== 'pending') {
      throw new BadRequestException('Approval request already decided');
    }

    const currentStep = request.workflow.steps.find((s) => s.sequence === request.currentStepSequence);
    if (!currentStep) {
      throw new BadRequestException('Approval workflow step not found');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.approvalAction.create({
        data: {
          requestId: request.id,
          stepSequence: request.currentStepSequence,
          approverId,
          decision,
          comment,
        },
      });

      if (decision === 'rejected') {
        return tx.approvalRequest.update({
          where: { id: request.id },
          data: { status: 'rejected', decidedAt: new Date() },
        });
      }

      const steps = request.workflow.steps;
      const currentIndex = steps.findIndex((s) => s.sequence === request.currentStepSequence);
      const nextStep = steps[currentIndex + 1];

      if (!nextStep) {
        return tx.approvalRequest.update({
          where: { id: request.id },
          data: { status: 'approved', decidedAt: new Date() },
        });
      }

      return tx.approvalRequest.update({
        where: { id: request.id },
        data: { currentStepSequence: nextStep.sequence },
      });
    });
  }
}
