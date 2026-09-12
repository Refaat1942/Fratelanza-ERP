import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader, useApiClient } from '../components/DataTable';
import { formatCurrency } from '../lib/format';
import { useAuthStore } from '../stores';

export function ReportsPage() {
  const { t } = useTranslation();
  const client = useApiClient();
  const user = useAuthStore((s) => s.user);
  const [stats, setStats] = useState({
    salesMonth: 0,
    purchasesMonth: 0,
    receivables: 0,
    payables: 0,
    inventoryValue: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await client.getDashboardStats();
        setStats(data);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [client]);

  const rows = [
    { label: t('dashboard.salesMonth'), value: formatCurrency(stats.salesMonth) },
    { label: t('dashboard.purchasesMonth'), value: formatCurrency(stats.purchasesMonth) },
    { label: t('dashboard.receivables'), value: formatCurrency(stats.receivables) },
    { label: t('dashboard.payables'), value: formatCurrency(stats.payables) },
    { label: t('dashboard.inventoryValue'), value: formatCurrency(stats.inventoryValue) },
  ];

  return (
    <div>
      <PageHeader
        title={t('modules.reports.name')}
        subtitle={t('reports.subtitle')}
        breadcrumbs={[{ label: t('modules.reports.name') }]}
      />
      <p className="page-subtitle">{user?.tenantName}</p>
      {loading ? (
        <p>{t('common.loading')}</p>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('reports.metric')}</th>
                <th style={{ textAlign: 'end' }}>{t('reports.value')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td style={{ textAlign: 'end' }}>{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
