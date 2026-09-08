import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { createApiClient, resolveApiBaseUrl } from '../lib/api';
import { useAppStore, useAuthStore } from '../stores';
import { PageState } from './PageState';

interface Column<T> {
  key: keyof T | string;
  label: string;
  render?: (row: T) => ReactNode;
  align?: 'start' | 'end';
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
    <div className="card card--flat data-table">
      <table>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={String(col.key)}
                className={col.align === 'end' ? 'cell-numeric' : undefined}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((col) => (
                <td
                  key={String(col.key)}
                  className={col.align === 'end' ? 'cell-numeric' : undefined}
                >
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

export { PageHeader, ListPageLayout, PageToolbar } from './layout/PageLayout';
export { FormField, FormSection, FormActions, Modal, ConfirmDialog } from './feedback/Dialog';
export { StatusBadge, Badge } from './ui/StatusBadge';

export function useApiClient() {
  const apiUrl = useAppStore((s) => s.apiUrl);
  const accessToken = useAuthStore((s) => s.accessToken);
  return createApiClient(() => resolveApiBaseUrl(apiUrl), () => accessToken);
}
