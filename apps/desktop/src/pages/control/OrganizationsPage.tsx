import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../../components/DataTable';
import { createApiClient, resolveApiBaseUrl } from '../../lib/api';
import { useAppStore, useAuthStore } from '../../stores';

type OrganizationRow = {
  id: string;
  name: string;
  code: string;
  displayName?: string | null;
  status: string;
  country: string;
  currency: string;
  _count: { users: number; branches: number };
};

export function OrganizationsPage() {
  const { t } = useTranslation();
  const apiUrl = useAppStore((s) => s.apiUrl);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [rows, setRows] = useState<OrganizationRow[]>([]);

  useEffect(() => {
    async function load() {
      const client = createApiClient(
        () => resolveApiBaseUrl(apiUrl),
        () => accessToken,
      );
      const data = await client.getPlatformOrganizations();
      setRows(data);
    }
    void load();
  }, [apiUrl, accessToken]);

  return (
    <div>
      <PageHeader title={t('control.organizationsTitle')} subtitle={t('control.organizationsSubtitle')} />
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('control.table.name')}</th>
              <th>{t('control.table.code')}</th>
              <th>{t('control.table.status')}</th>
              <th>{t('control.table.users')}</th>
              <th>{t('control.table.branches')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.displayName ?? row.name}</td>
                <td>{row.code}</td>
                <td>
                  <span className={`badge badge--${row.status.toLowerCase()}`}>{row.status}</span>
                </td>
                <td>{row._count.users}</td>
                <td>{row._count.branches}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
