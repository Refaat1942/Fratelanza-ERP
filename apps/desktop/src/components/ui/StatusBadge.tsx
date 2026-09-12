import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

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
  new: 'info',
  contacted: 'warning',
  qualified: 'info',
  unqualified: 'neutral',
  converted: 'success',
  prospecting: 'neutral',
  qualification: 'info',
  proposal: 'warning',
  negotiation: 'warning',
  won: 'success',
  lost: 'danger',
  on_leave: 'warning',
  terminated: 'danger',
  disposed: 'neutral',
  written_off: 'neutral',
  unmatched: 'warning',
  matched: 'success',
  ignored: 'neutral',
  in_progress: 'info',
};

export function StatusBadge({
  status,
  label,
}: {
  status: string;
  label?: string;
}) {
  const { t } = useTranslation();
  const normalized = status.toLowerCase().replace(/\s+/g, '_');
  const variant = STATUS_MAP[normalized] ?? 'neutral';
  const display = label ?? t(`status.${normalized}`, { defaultValue: status });

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
