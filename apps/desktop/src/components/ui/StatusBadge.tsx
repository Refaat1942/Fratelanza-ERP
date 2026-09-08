import type { ReactNode } from 'react';

const STATUS_MAP: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'primary'> = {
  draft: 'neutral',
  active: 'success',
  pending: 'warning',
  submitted: 'info',
  approved: 'success',
  rejected: 'danger',
  completed: 'success',
  cancelled: 'neutral',
  archived: 'neutral',
  paid: 'success',
  partially_paid: 'warning',
  overdue: 'danger',
  suspended: 'danger',
  inactive: 'neutral',
  posted: 'success',
  void: 'neutral',
  open: 'info',
  closed: 'neutral',
};

export function StatusBadge({
  status,
  label,
}: {
  status: string;
  label?: string;
}) {
  const normalized = status.toLowerCase().replace(/\s+/g, '_');
  const variant = STATUS_MAP[normalized] ?? 'neutral';
  const display = label ?? status;

  return (
    <span className={`badge badge--${variant}`}>
      {display}
    </span>
  );
}

export function Badge({
  variant = 'neutral',
  children,
}: {
  variant?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'primary';
  children: ReactNode;
}) {
  return <span className={`badge badge--${variant}`}>{children}</span>;
}
