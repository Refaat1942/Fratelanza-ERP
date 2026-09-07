import type {
  ConstructionCostCategory,
  ConstructionCostEntry,
} from '../../../../../packages/database/generated/server';

export interface ConstructionCostEntryInput {
  tenantId: string;
  projectId: string;
  branchId: string;
  costCenterId?: string;
  category: ConstructionCostCategory;
  amount: string;
  currency?: string;
  sourceModule: string;
  sourceType: string;
  sourceId: string;
  sourceEvent: string;
  description?: string;
  occurredAt: Date;
  createdById?: string;
}

export interface ConstructionCostEntryPostResult {
  entry: ConstructionCostEntry;
  created: boolean;
}
