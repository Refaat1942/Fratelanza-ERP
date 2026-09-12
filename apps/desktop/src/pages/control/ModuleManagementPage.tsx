import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader, useApiClient } from '../../components/DataTable';

type OrgOption = { id: string; name: string; code: string; displayName?: string | null };

export function ModuleManagementPage() {
  const { t } = useTranslation();
  const client = useApiClient();
  const [organizations, setOrganizations] = useState<OrgOption[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [modules, setModules] = useState<Array<{ id: string; enabled: boolean; nameKey: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    async function loadOrgs() {
      try {
        const orgs = await client.getPlatformOrganizations();
        setOrganizations(orgs);
        if (orgs[0]?.id) setTenantId(orgs[0].id);
      } catch (e) {
        setError(e instanceof Error ? e.message : t('common.error'));
      }
    }
    void loadOrgs();
  }, [client, t]);

  const loadModules = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await client.getPlatformTenantModules(tenantId);
      setModules(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [client, tenantId, t]);

  useEffect(() => {
    void loadModules();
  }, [loadModules]);

  async function toggleModule(moduleId: string, enabled: boolean) {
    setSaving(moduleId);
    try {
      await client.setPlatformTenantModule(tenantId, moduleId, enabled);
      await loadModules();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div>
      <PageHeader title={t('control.modulesTitle')} subtitle={t('control.modulesSubtitle')} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="page-toolbar" style={{ marginBottom: 'var(--frz-space-4)' }}>
        <label className="form-label" htmlFor="tenant-select">{t('control.selectOrganization')}</label>
        <select
          id="tenant-select"
          className="form-input"
          style={{ maxWidth: 420 }}
          value={tenantId}
          onChange={(e) => setTenantId(e.target.value)}
        >
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>
              {org.displayName ?? org.name} ({org.code})
            </option>
          ))}
        </select>
      </div>
      {loading ? (
        <p>{t('common.loading')}</p>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('control.table.module')}</th>
                <th>{t('control.table.enabled')}</th>
                <th>{t('control.table.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {modules.map((mod) => (
                <tr key={mod.id}>
                  <td>{t(mod.nameKey)}</td>
                  <td>{mod.enabled ? '✓' : '✕'}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-ghost btn--sm"
                      disabled={saving === mod.id}
                      onClick={() => void toggleModule(mod.id, !mod.enabled)}
                    >
                      {mod.enabled ? t('control.disable') : t('control.enable')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
