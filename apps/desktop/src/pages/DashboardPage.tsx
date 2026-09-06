import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores';

export function DashboardPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);

  const stats = [
    { label: t('dashboard.salesToday'), value: '—' },
    { label: t('dashboard.salesMonth'), value: '—' },
    { label: t('dashboard.receivables'), value: '—' },
    { label: t('dashboard.payables'), value: '—' },
    { label: t('dashboard.inventoryValue'), value: '—' },
    { label: t('dashboard.lowStock'), value: '—' },
  ];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">{t('dashboard.title')}</h1>
        <p className="page-subtitle">
          {t('dashboard.welcome', { name: user?.firstName ?? '' })}
          {user?.tenantName ? ` · ${user.tenantName}` : ''}
        </p>
      </div>

      <div className="card-grid">
        {stats.map((stat) => (
          <div key={stat.label} className="stat-card">
            <div className="stat-card-label">{stat.label}</div>
            <div className="stat-card-value">{stat.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
