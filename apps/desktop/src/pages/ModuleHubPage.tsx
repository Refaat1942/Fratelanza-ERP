import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ERP_MODULES, userCanAccessModule } from '@fratelanza/shared';
import { PageHeader } from '../components/DataTable';
import { createApiClient, resolveApiBaseUrl } from '../lib/api';
import { useAppStore, useAuthStore } from '../stores';

export function ModuleHubPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const apiUrl = useAppStore((s) => s.apiUrl);
  const permissions = user?.permissions ?? [];
  const [enabledModules, setEnabledModules] = useState<string[] | undefined>();

  useEffect(() => {
    async function loadModules() {
      try {
        const client = createApiClient(
          () => resolveApiBaseUrl(apiUrl),
          () => accessToken,
        );
        const data = await client.getTenantModules();
        setEnabledModules(data);
      } catch {
        setEnabledModules(undefined);
      }
    }
    if (accessToken) void loadModules();
  }, [apiUrl, accessToken]);

  const modules = useMemo(
    () =>
      ERP_MODULES.filter((m) => userCanAccessModule(permissions, m, enabledModules)).sort(
        (a, b) => a.sortOrder - b.sortOrder,
      ),
    [permissions, enabledModules],
  );

  return (
    <div>
      <PageHeader
        title={t('hub.title')}
        subtitle={t('hub.subtitle', { company: user?.tenantName ?? '' })}
        breadcrumbs={[{ label: t('nav.home') }]}
      />

      <div className="module-hub-grid">
        {modules.map((mod) => (
          <button
            key={mod.id}
            type="button"
            className="module-card"
            onClick={() => navigate(mod.route)}
          >
            <div className="module-card-icon" aria-hidden>
              {mod.icon}
            </div>
            <div className="module-card-body">
              <h2 className="module-card-title">{t(mod.nameKey)}</h2>
              <p className="module-card-description">{t(mod.descriptionKey)}</p>
            </div>
            <span className="module-card-action">{t('hub.openModule')}</span>
          </button>
        ))}
      </div>

      {modules.length === 0 && (
        <div className="page-state page-state--empty">
          <p>{t('hub.noModules')}</p>
        </div>
      )}
    </div>
  );
}
