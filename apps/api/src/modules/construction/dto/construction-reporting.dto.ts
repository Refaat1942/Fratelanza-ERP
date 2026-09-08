import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { ConstructionCostCategory } from '../../../../../../packages/database/generated/server';
import type {
  ConstructionCostCategoryTotalsDto,
  ConstructionCostingProfitabilityDto,
  ConstructionCostingSnapshotDto,
  ConstructionRemainingBoqDto,
} from './construction-costing.dto';

export class ConstructionReportingQueryDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsUUID()
  contractId?: string;

  @IsOptional()
  @IsUUID()
  costCenterId?: string;

  @IsOptional()
  @IsEnum(ConstructionCostCategory)
  category?: ConstructionCostCategory;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export interface ConstructionReportingFiltersDto {
  projectId?: string;
  contractId?: string;
  costCenterId?: string;
  category?: ConstructionCostCategory;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
}

export interface ConstructionProjectSummaryReportDto {
  projectId: string;
  projectCode: string;
  projectName: string;
  projectStatus: string;
  hasConstructionProfile: boolean;
  counts: {
    contracts: number;
    boqs: number;
    progressCertificates: number;
    variations: number;
    costEntries: number;
    billings: number;
    materialIssues: number;
  };
  snapshot: ConstructionCostingSnapshotDto;
  filters: ConstructionReportingFiltersDto;
}

export interface ConstructionContractSummaryItemDto {
  contractId: string;
  contractNumber: string;
  contractTitle: string;
  status: string;
  direction: string;
  partyName: string;
  originalValue: string;
  revisedValue: string | null;
  approvedBoqCount: number;
  latestBoqStatus: string | null;
  progressCertificateCount: number;
  variationCount: number;
  billingCount: number;
}

export interface ConstructionContractSummaryReportDto {
  filters: ConstructionReportingFiltersDto;
  contracts: ConstructionContractSummaryItemDto[];
}

export interface ConstructionBoqStatusItemDto {
  boqId: string;
  boqNumber: string;
  revisionNumber: number;
  status: string;
  contractId: string;
  contractNumber: string;
  totalOriginalAmount: string;
  itemCount: number;
  approvedAt: string | null;
}

export interface ConstructionBoqStatusReportDto {
  filters: ConstructionReportingFiltersDto;
  boqs: ConstructionBoqStatusItemDto[];
}

export interface ConstructionProgressVsBoqItemDto {
  boqItemId: string;
  description: string;
  costCenterId: string | null;
  plannedQuantity: string;
  plannedValue: string;
  executedQuantity: string;
  executedValue: string;
  completionPercent: string | null;
  remainingQuantity: string;
  remainingValue: string;
}

export interface ConstructionProgressVsBoqReportDto {
  filters: ConstructionReportingFiltersDto;
  contractId: string | null;
  boqId: string | null;
  totalPlannedValue: string;
  totalExecutedValue: string;
  totalRemainingValue: string;
  items: ConstructionProgressVsBoqItemDto[];
}

export interface ConstructionVariationImpactItemDto {
  variationId: string;
  variationNumber: string;
  status: string;
  contractId: string;
  contractNumber: string;
  boqId: string;
  totalAmountDelta: string;
  approvedAt: string | null;
}

export interface ConstructionVariationImpactReportDto {
  filters: ConstructionReportingFiltersDto;
  approvedDeltaTotal: string;
  pendingDeltaTotal: string;
  variations: ConstructionVariationImpactItemDto[];
}

export interface ConstructionActualCostReportDto {
  filters: ConstructionReportingFiltersDto;
  byCategory: ConstructionCostCategoryTotalsDto;
  entryCount: number;
}

export interface ConstructionCostByCostCenterItemDto {
  costCenterId: string;
  costCenterCode: string;
  costCenterName: string;
  byCategory: ConstructionCostCategoryTotalsDto;
}

export interface ConstructionCostByCostCenterReportDto {
  filters: ConstructionReportingFiltersDto;
  costCenters: ConstructionCostByCostCenterItemDto[];
  unassigned: ConstructionCostCategoryTotalsDto;
}

export interface ConstructionRevenueBillingStatusTotalsDto {
  count: number;
  grossAmount: string;
  retentionAmount: string;
  advanceRecoveryAmount: string;
  netBillableAmount: string;
  postedSalesInvoiceTotal: string;
}

export interface ConstructionRevenueBillingReportDto {
  filters: ConstructionReportingFiltersDto;
  totals: ConstructionRevenueBillingStatusTotalsDto;
  byStatus: Record<string, ConstructionRevenueBillingStatusTotalsDto>;
  billings: Array<{
    billingId: string;
    billingNumber: string;
    status: string;
    contractId: string;
    contractNumber: string;
    grossAmount: string;
    netBillableAmount: string;
    salesInvoiceId: string | null;
    salesInvoiceNumber: string | null;
    salesInvoiceTotal: string | null;
    postedAt: string | null;
  }>;
}

export interface ConstructionRetentionContractSummaryDto {
  contractId: string;
  contractNumber: string;
  partyType: string;
  totalHeld: string;
  totalReleased: string;
  currentBalance: string;
}

export interface ConstructionRetentionReportDto {
  filters: ConstructionReportingFiltersDto;
  totals: {
    totalHeld: string;
    totalReleased: string;
    currentBalance: string;
  };
  contracts: ConstructionRetentionContractSummaryDto[];
}

export interface ConstructionAdvanceContractSummaryDto {
  contractId: string;
  contractNumber: string;
  partyType: string;
  totalReceived: string;
  totalRecovered: string;
  currentBalance: string;
}

export interface ConstructionAdvanceReportDto {
  filters: ConstructionReportingFiltersDto;
  totals: {
    totalReceived: string;
    totalRecovered: string;
    currentBalance: string;
  };
  contracts: ConstructionAdvanceContractSummaryDto[];
}

export interface ConstructionProfitabilityReportDto extends ConstructionCostingSnapshotDto {
  filters: ConstructionReportingFiltersDto;
  projectId: string | null;
  contractId: string | null;
  financial?: {
    journalLineCount: number;
    totalDebits: string;
    totalCredits: string;
  };
}

export interface ConstructionRemainingWorkReportDto {
  filters: ConstructionReportingFiltersDto;
  projectId: string | null;
  contractId: string | null;
  remainingBoq: ConstructionRemainingBoqDto;
  profitability: ConstructionCostingProfitabilityDto;
}
