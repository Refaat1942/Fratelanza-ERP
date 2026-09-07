import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { createApiClient, resolveApiBaseUrl } from '../lib/api';
import { useAppStore, useAuthStore } from '../stores';
import { PageState } from './PageState';

interface Column<T> {
  key: keyof T | string;
  label: string;
  render?: (row: T) => ReactNode;
}

interface DataTableProps<T extends { id: string }> {
  columns: Column<T>[];
  fetchData: (client: ReturnType<typeof createApiClient>) => Promise<T[]>;
  emptyMessage?: string;
  refreshKey?: number;
}

export function DataTable<T extends { id: string }>({
  columns,
  fetchData,
  emptyMessage,
  refreshKey = 0,
}: DataTableProps<T>) {
  const { t } = useTranslation();
  const apiUrl = useAppStore((s) => s.apiUrl);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const client = createApiClient(
        () => resolveApiBaseUrl(apiUrl),
        () => accessToken,
      );
      const data = await fetchData(client);
      setRows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    } finally {
      setLoading(false);
    }
  }, [apiUrl, accessToken, fetchData, t]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (loading) {
    return <PageState variant="loading" />;
  }

  if (error) {
    return (
      <PageState
        variant="error"
        message={error}
        action={
          <button type="button" className="btn btn-primary" onClick={() => void load()}>
            {t('common.retry')}
          </button>
        }
      />
    );
  }

  if (rows.length === 0) {
    return (
      <PageState
        variant="empty"
        message={emptyMessage ?? t('common.noDataHint')}
      />
    );
  }

  return (
    <div className="card data-table" style={{ padding: 0, overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
            {columns.map((col) => (
              <th key={String(col.key)} style={{ padding: '12px 16px', fontSize: '0.85rem' }}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
              {columns.map((col) => (
                <td key={String(col.key)} style={{ padding: '12px 16px' }}>
                  {col.render
                    ? col.render(row)
                    : String((row as Record<string, unknown>)[col.key as string] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content card" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{title}</h2>
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function FormField({
  label,
  children,
  error,
}: {
  label: string;
  children: ReactNode;
  error?: string;
}) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      {children}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

export function useApiClient() {
  const apiUrl = useAppStore((s) => s.apiUrl);
  const accessToken = useAuthStore((s) => s.accessToken);
  return createApiClient(() => resolveApiBaseUrl(apiUrl), () => accessToken);
}
