import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/DataTable';
import { createApiClient, resolveApiBaseUrl } from '../lib/api';
import { useAppStore, useAuthStore } from '../stores';

export function DashboardPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const apiUrl = useAppStore((s) => s.apiUrl);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [stats, setStats] = useState({
    salesToday: 0,
    salesMonth: 0,
    receivables: 0,
    payables: 0,
    inventoryValue: 0,
    lowStockCount: 0,
  });

  useEffect(() => {
    async function load() {
      try {
        const client = createApiClient(
          () => resolveApiBaseUrl(apiUrl),
          () => accessToken,
        );
        const data = await client.getDashboardStats();
        setStats(data);
      } catch {
        // Keep zeros if API unavailable
      }
    }
    void load();
  }, [apiUrl, accessToken]);

  const formatMoney = (n: number) =>
    new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EGP' }).format(n);

  const cards = [
    { label: t('dashboard.salesToday'), value: formatMoney(stats.salesToday) },
    { label: t('dashboard.salesMonth'), value: formatMoney(stats.salesMonth) },
    { label: t('dashboard.receivables'), value: formatMoney(stats.receivables) },
    { label: t('dashboard.payables'), value: formatMoney(stats.payables) },
    { label: t('dashboard.inventoryValue'), value: formatMoney(stats.inventoryValue) },
    { label: t('dashboard.lowStock'), value: String(stats.lowStockCount) },
  ];

  return (
    <div>
      <PageHeader
        title={t('dashboard.title')}
        subtitle={`${t('dashboard.welcome', { name: user?.firstName ?? '' })}${user?.tenantName ? ` · ${user.tenantName}` : ''}`}
      />
      <div className="card-grid">
        {cards.map((stat) => (
          <div key={stat.label} className="stat-card">
            <div className="stat-card-label">{stat.label}</div>
            <div className="stat-card-value">{stat.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
