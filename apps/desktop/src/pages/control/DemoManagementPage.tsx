import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../../components/DataTable';
import { createApiClient, resolveApiBaseUrl } from '../../lib/api';
import { useAppStore, useAuthStore } from '../../stores';

type DemoRow = {
  id: string;
  slug: string;
  name: string;
  enabled: boolean;
  linkToken: string;
  modules: string[];
  tenant: { name: string; code: string };
};

export function DemoManagementPage() {
  const { t } = useTranslation();
  const apiUrl = useAppStore((s) => s.apiUrl);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [rows, setRows] = useState<DemoRow[]>([]);

  useEffect(() => {
    async function load() {
      const client = createApiClient(
        () => resolveApiBaseUrl(apiUrl),
        () => accessToken,
      );
      const data = await client.getPlatformDemos();
      setRows(data);
    }
    void load();
  }, [apiUrl, accessToken]);

  return (
    <div>
      <PageHeader title={t('control.demosTitle')} subtitle={t('control.demosSubtitle')} />
      <div className="module-hub-grid">
        {rows.map((demo) => (
          <div key={demo.id} className="module-card module-card--static">
            <div className="module-card-body">
              <h2 className="module-card-title">{demo.name}</h2>
              <p className="module-card-description">/{demo.slug}</p>
              <p className="module-card-description">
                {demo.enabled ? t('control.demoEnabled') : t('control.demoDisabled')}
              </p>
              <a className="module-card-action" href={`/demo/${demo.slug}`}>
                {t('control.openDemoLink')}
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
