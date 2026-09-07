import { BadRequestException } from '@nestjs/common';
import { ConstructionContractStatus } from '../../../../../packages/database/generated/server';

const ALLOWED_TRANSITIONS: Record<
  ConstructionContractStatus,
  ConstructionContractStatus[]
> = {
  [ConstructionContractStatus.draft]: [
    ConstructionContractStatus.active,
    ConstructionContractStatus.cancelled,
    ConstructionContractStatus.archived,
  ],
  [ConstructionContractStatus.active]: [
    ConstructionContractStatus.suspended,
    ConstructionContractStatus.completed,
    ConstructionContractStatus.cancelled,
    ConstructionContractStatus.archived,
  ],
  [ConstructionContractStatus.suspended]: [
    ConstructionContractStatus.active,
    ConstructionContractStatus.cancelled,
    ConstructionContractStatus.archived,
  ],
  [ConstructionContractStatus.completed]: [
    ConstructionContractStatus.archived,
  ],
  [ConstructionContractStatus.cancelled]: [
    ConstructionContractStatus.archived,
  ],
  [ConstructionContractStatus.archived]: [],
};

export function assertContractStatusTransition(
  from: ConstructionContractStatus,
  to: ConstructionContractStatus,
): void {
  if (from === to) return;
  if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
    throw new BadRequestException(
      `Invalid contract status transition from ${from} to ${to}`,
    );
  }
}

export function isContractEditable(status: ConstructionContractStatus): boolean {
  return status === ConstructionContractStatus.draft;
}

export function isContractLimitedEditable(
  status: ConstructionContractStatus,
): boolean {
  return status === ConstructionContractStatus.active;
}

export function canManageBoqDraft(status: ConstructionContractStatus): boolean {
  return (
    status === ConstructionContractStatus.draft ||
    status === ConstructionContractStatus.active
  );
}

export function canApproveBoq(status: ConstructionContractStatus): boolean {
  return (
    status === ConstructionContractStatus.draft ||
    status === ConstructionContractStatus.active
  );
}
