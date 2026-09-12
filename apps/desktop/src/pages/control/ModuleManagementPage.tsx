import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ERP_MODULES } from '@fratelanza/shared';
import { PageHeader } from '../../components/DataTable';
import { createApiClient, resolveApiBaseUrl } from '../../lib/api';
import { useAppStore, useAuthStore } from '../../stores';

export function ModuleManagementPage() {
  const { t } = useTranslation();
  const apiUrl = useAppStore((s) => s.apiUrl);
  const accessToken = useAuthStore((s) => s.accessToken);
  const tenantId = useAuthStore((s) => s.user?.tenantId);
  const [modules, setModules] = useState<Array<{ id: string; enabled: boolean; nameKey: string }>>([]);

  useEffect(() => {
    if (!tenantId) return;
    async function load() {
      const client = createApiClient(
        () => resolveApiBaseUrl(apiUrl),
        () => accessToken,
      );
      const data = await client.getPlatformTenantModules(tenantId!);
      setModules(
        data.map((m: { id: string; enabled: boolean; nameKey: string }) => ({
          id: m.id,
          enabled: m.enabled,
          nameKey: m.nameKey,
        })),
      );
    }
    void load();
  }, [apiUrl, accessToken, tenantId]);

  return (
    <div>
      <PageHeader title={t('control.modulesTitle')} subtitle={t('control.modulesSubtitle')} />
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('control.table.module')}</th>
              <th>{t('control.table.enabled')}</th>
            </tr>
          </thead>
          <tbody>
            {(modules.length ? modules : ERP_MODULES.map((m) => ({ id: m.id, enabled: true, nameKey: m.nameKey }))).map(
              (mod) => (
                <tr key={mod.id}>
                  <td>{t(mod.nameKey)}</td>
                  <td>{mod.enabled ? '✓' : '✕'}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
