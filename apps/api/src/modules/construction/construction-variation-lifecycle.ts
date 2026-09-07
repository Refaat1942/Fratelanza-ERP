import { BadRequestException } from '@nestjs/common';
import { ConstructionVariationStatus } from '../../../../../packages/database/generated/server';

const ALLOWED_TRANSITIONS: Record<
  ConstructionVariationStatus,
  ConstructionVariationStatus[]
> = {
  [ConstructionVariationStatus.draft]: [
    ConstructionVariationStatus.submitted,
    ConstructionVariationStatus.archived,
  ],
  [ConstructionVariationStatus.submitted]: [
    ConstructionVariationStatus.approved,
    ConstructionVariationStatus.rejected,
    ConstructionVariationStatus.archived,
  ],
  [ConstructionVariationStatus.approved]: [
    ConstructionVariationStatus.archived,
  ],
  [ConstructionVariationStatus.rejected]: [
    ConstructionVariationStatus.draft,
    ConstructionVariationStatus.archived,
  ],
  [ConstructionVariationStatus.archived]: [],
};

export function assertVariationStatusTransition(
  from: ConstructionVariationStatus,
  to: ConstructionVariationStatus,
): void {
  if (from === to) return;
  if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
    throw new BadRequestException(
      `Invalid variation status transition from ${from} to ${to}`,
    );
  }
}

export function isVariationEditable(status: ConstructionVariationStatus): boolean {
  return status === ConstructionVariationStatus.draft;
}
