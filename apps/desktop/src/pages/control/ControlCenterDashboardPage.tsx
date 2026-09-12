import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../../components/DataTable';
import { createApiClient, resolveApiBaseUrl } from '../../lib/api';
import { useAppStore, useAuthStore } from '../../stores';

type DashboardStats = {
  organizations: number;
  activeUsers: number;
  demoTenants: number;
  enabledModules: number;
  disabledModules: number;
};

export function ControlCenterDashboardPage() {
  const { t } = useTranslation();
  const apiUrl = useAppStore((s) => s.apiUrl);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    async function load() {
      const client = createApiClient(
        () => resolveApiBaseUrl(apiUrl),
        () => accessToken,
      );
      const data = await client.getPlatformDashboard();
      setStats(data);
    }
    void load();
  }, [apiUrl, accessToken]);

  const cards = stats
    ? [
        { label: t('control.stats.organizations'), value: stats.organizations },
        { label: t('control.stats.activeUsers'), value: stats.activeUsers },
        { label: t('control.stats.demoTenants'), value: stats.demoTenants },
        { label: t('control.stats.enabledModules'), value: stats.enabledModules },
      ]
    : [];

  return (
    <div>
      <PageHeader title={t('control.dashboardTitle')} subtitle={t('control.dashboardSubtitle')} />
      <div className="dashboard-grid">
        {cards.map((card) => (
          <div key={card.label} className="stat-card">
            <p className="stat-card-label">{card.label}</p>
            <p className="stat-card-value">{card.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
