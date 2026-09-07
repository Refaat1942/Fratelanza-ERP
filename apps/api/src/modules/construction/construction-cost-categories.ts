import { ConstructionCostCategory } from '../../../../../packages/database/generated/server';

export const CONSTRUCTION_COST_CATEGORIES = Object.values(ConstructionCostCategory);

export function parseConstructionCostCategory(
  value: string,
): ConstructionCostCategory {
  if (CONSTRUCTION_COST_CATEGORIES.includes(value as ConstructionCostCategory)) {
    return value as ConstructionCostCategory;
  }
  throw new Error(`Invalid construction cost category: ${value}`);
}
