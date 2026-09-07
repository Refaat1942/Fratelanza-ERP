import { BadRequestException } from '@nestjs/common';
import { ConstructionProgressStatus } from '../../../../../packages/database/generated/server';

const ALLOWED_TRANSITIONS: Record<
  ConstructionProgressStatus,
  ConstructionProgressStatus[]
> = {
  [ConstructionProgressStatus.draft]: [
    ConstructionProgressStatus.submitted,
    ConstructionProgressStatus.archived,
  ],
  [ConstructionProgressStatus.submitted]: [
    ConstructionProgressStatus.approved,
    ConstructionProgressStatus.rejected,
    ConstructionProgressStatus.archived,
  ],
  [ConstructionProgressStatus.approved]: [
    ConstructionProgressStatus.archived,
  ],
  [ConstructionProgressStatus.rejected]: [
    ConstructionProgressStatus.draft,
    ConstructionProgressStatus.archived,
  ],
  [ConstructionProgressStatus.archived]: [],
};

export function assertProgressStatusTransition(
  from: ConstructionProgressStatus,
  to: ConstructionProgressStatus,
): void {
  if (from === to) return;
  if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
    throw new BadRequestException(
      `Invalid progress status transition from ${from} to ${to}`,
    );
  }
}

export function isProgressEditable(
  status: ConstructionProgressStatus,
): boolean {
  return status === ConstructionProgressStatus.draft;
}

export function isProgressQuantityFrozen(
  status: ConstructionProgressStatus,
): boolean {
  return (
    status === ConstructionProgressStatus.submitted
    || status === ConstructionProgressStatus.approved
    || status === ConstructionProgressStatus.archived
  );
}
