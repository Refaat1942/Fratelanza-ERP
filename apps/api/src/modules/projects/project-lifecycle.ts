import { BadRequestException } from '@nestjs/common';
import { ProjectStatus } from '../../../../../packages/database/generated/server';

const ALLOWED_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  [ProjectStatus.draft]: [
    ProjectStatus.active,
    ProjectStatus.cancelled,
    ProjectStatus.archived,
  ],
  [ProjectStatus.active]: [
    ProjectStatus.on_hold,
    ProjectStatus.completed,
    ProjectStatus.cancelled,
    ProjectStatus.archived,
  ],
  [ProjectStatus.on_hold]: [
    ProjectStatus.active,
    ProjectStatus.cancelled,
    ProjectStatus.archived,
  ],
  [ProjectStatus.completed]: [ProjectStatus.archived],
  [ProjectStatus.cancelled]: [ProjectStatus.archived],
  [ProjectStatus.archived]: [],
};

export function assertProjectStatusTransition(
  from: ProjectStatus,
  to: ProjectStatus,
): void {
  if (from === to) return;
  if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
    throw new BadRequestException(
      `Invalid project status transition from ${from} to ${to}`,
    );
  }
}

export function canTransitionToArchived(from: ProjectStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(ProjectStatus.archived) ?? false;
}
