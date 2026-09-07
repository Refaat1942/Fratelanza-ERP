import { PostingSide, Prisma } from '../../../../../../packages/database/generated/server';

export interface PostingDimensions {
  branchId?: string | null;
  projectId?: string | null;
  costCenterId?: string | null;
  department?: string | null;
}

export interface FinancialPostingSource {
  sourceModule: string;
  sourceType: string;
  sourceId: string;
  sourceEvent: string;
  idempotencyKey?: string;
}

export interface ResolvedPostingLine {
  accountId: string;
  accountRole?: string;
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
  description?: string;
  dimensions?: PostingDimensions;
}

export interface RuleBasedFinancialPostingInput extends FinancialPostingSource {
  tenantId: string;
  branchId: string;
  postingDate: Date;
  description: string;
  amounts: Record<string, Prisma.Decimal | string | number>;
  dimensions?: PostingDimensions;
}

export interface LineBasedFinancialPostingInput extends FinancialPostingSource {
  tenantId: string;
  branchId: string;
  postingDate: Date;
  description: string;
  dimensions?: PostingDimensions;
  lines: Array<{
    accountRole?: string;
    accountId?: string;
    debit: Prisma.Decimal | string | number;
    credit: Prisma.Decimal | string | number;
    description?: string;
    dimensions?: PostingDimensions;
  }>;
}

export type FinancialPostingInput =
  | ({ mode: 'rule' } & RuleBasedFinancialPostingInput)
  | ({ mode: 'lines' } & LineBasedFinancialPostingInput);

export interface PostingRuleDefinition {
  sourceModule: string;
  sourceType: string;
  event: string;
  description?: string;
  lines: Array<{
    sequence: number;
    accountRole: string;
    side: PostingSide;
    amountSource: string;
    description?: string;
  }>;
}

/**
 * Future PMS → GL integration contract (not wired in Phase 2).
 * PMS GL posting remains OFF BY DEFAULT.
 */
export interface PmsFinancialPostingRequest {
  tenantId: string;
  branchId: string;
  postingDate: Date;
  description: string;
  sourceType: 'charge' | 'payment' | 'refund' | 'adjustment';
  sourceId: string;
  sourceEvent: 'post' | 'void' | 'reverse';
  amounts: Record<string, Prisma.Decimal | string | number>;
  idempotencyKey?: string;
}
