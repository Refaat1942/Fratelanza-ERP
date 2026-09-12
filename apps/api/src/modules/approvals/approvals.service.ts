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

  async listPendingForApprover(tenantId: string, userId: string, role?: string) {
    const requests = await this.prisma.approvalRequest.findMany({
      where: { tenantId, status: 'pending' },
      include: { workflow: { include: { steps: true } } },
    });

    return requests.filter((request) => {
      const step = request.workflow.steps.find((s) => s.sequence === request.currentStepSequence);
      if (!step) return false;
      return step.approverUserId === userId || (role && step.approverRole === role);
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
