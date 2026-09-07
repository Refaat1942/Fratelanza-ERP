import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { ConstructionCostCategory } from '../../../../../../packages/database/generated/server';

export class ConstructionCostingQueryDto {
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
}

export interface ConstructionCostCategoryTotalsDto {
  material: string;
  labor: string;
  subcontract: string;
  equipment: string;
  other: string;
  total: string;
}

export interface ConstructionCostingPlannedDto {
  originalBoqValue: string;
}

export interface ConstructionCostingContractualDto {
  contractValue: string;
  approvedVariationsValue: string;
  currentContractValue: string;
}

export interface ConstructionCostingExecutedValueDto {
  progressValuation: string;
}

export interface ConstructionCostingActualCostDto {
  byCategory: ConstructionCostCategoryTotalsDto;
}

export interface ConstructionCostingProfitabilityDto {
  grossMargin: string;
  grossMarginPercent: string | null;
}

export interface ConstructionRemainingBoqItemDto {
  boqItemId: string;
  description: string;
  plannedQuantity: string;
  effectiveQuantity: string;
  executedQuantity: string;
  remainingQuantity: string;
  plannedValue: string;
  executedValue: string;
  remainingValue: string;
}

export interface ConstructionRemainingBoqDto {
  totalRemainingValue: string;
  items: ConstructionRemainingBoqItemDto[];
}

export interface ConstructionCostingSnapshotDto {
  planned: ConstructionCostingPlannedDto;
  contractual: ConstructionCostingContractualDto;
  executedValue: ConstructionCostingExecutedValueDto;
  actualCost: ConstructionCostingActualCostDto;
  profitability: ConstructionCostingProfitabilityDto;
  remainingBoq: ConstructionRemainingBoqDto;
}

export interface ConstructionContractCostingDto extends ConstructionCostingSnapshotDto {
  contractId: string;
  contractNumber: string;
  contractTitle: string;
  boqId: string | null;
}

export interface ConstructionProjectCostingDto extends ConstructionCostingSnapshotDto {
  projectId: string;
  filters: {
    contractId?: string;
    costCenterId?: string;
    category?: ConstructionCostCategory;
    dateFrom?: string;
    dateTo?: string;
  };
  contracts: ConstructionContractCostingDto[];
}

export interface ConstructionCostCenterCostingDto extends ConstructionCostingSnapshotDto {
  costCenterId: string;
  costCenterCode: string;
  costCenterName: string;
  projectId: string | null;
}
