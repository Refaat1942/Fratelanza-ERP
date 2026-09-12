import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ERP_MODULES, formatPermissionAction, formatPermissionLabel } from '@fratelanza/shared';
import { PageHeader } from '../../components/DataTable';
import { createApiClient, resolveApiBaseUrl } from '../../lib/api';
import { useAppStore, useAuthStore } from '../../stores';

type RoleRow = {
  id: string;
  name: string;
  permissions: Array<{ permission: { id: string; module: string; feature: string; action: string } }>;
};

type PermissionRow = { id: string; module: string; feature: string; action: string };

export function AuthorizationMatrixPage() {
  const { t } = useTranslation();
  const apiUrl = useAppStore((s) => s.apiUrl);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [permissionIds, setPermissionIds] = useState<Set<string>>(new Set());
  const [allPermissions, setAllPermissions] = useState<PermissionRow[]>([]);
  const [filter, setFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      const client = createApiClient(
        () => resolveApiBaseUrl(apiUrl),
        () => accessToken,
      );
      const [roleData, permData] = await Promise.all([
        client.getRoles(),
        client.getPermissions(),
      ]);
      setRoles(roleData);
      setAllPermissions(permData);
      if (roleData[0]) setSelectedRoleId(roleData[0].id);
    }
    void load();
  }, [apiUrl, accessToken]);

  useEffect(() => {
    const role = roles.find((r) => r.id === selectedRoleId);
    if (!role) return;
    setPermissionIds(new Set(role.permissions.map((p) => p.permission.id)));
    setSaved(false);
  }, [roles, selectedRoleId]);

  function moduleLabel(moduleId: string): string {
    const module = ERP_MODULES.find((m) => m.id === moduleId);
    if (module) return t(module.nameKey, { defaultValue: formatPermissionLabel(moduleId) });
    return t(`nav.${moduleId}`, { defaultValue: formatPermissionLabel(moduleId) });
  }

  function actionLabel(action: string): string {
    return t(`permissions.actions.${action}`, { defaultValue: formatPermissionAction(action) });
  }

  const groups = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const filtered = needle
      ? allPermissions.filter(
          (p) =>
            p.module.toLowerCase().includes(needle) ||
            p.feature.toLowerCase().includes(needle) ||
            p.action.toLowerCase().includes(needle) ||
            moduleLabel(p.module).toLowerCase().includes(needle),
        )
      : allPermissions;

    const byModule = new Map<string, Map<string, PermissionRow[]>>();
    for (const perm of filtered) {
      if (!byModule.has(perm.module)) byModule.set(perm.module, new Map());
      const byFeature = byModule.get(perm.module)!;
      if (!byFeature.has(perm.feature)) byFeature.set(perm.feature, []);
      byFeature.get(perm.feature)!.push(perm);
    }
    return [...byModule.entries()]
      .map(([moduleId, byFeature]) => ({
        moduleId,
        label: moduleLabel(moduleId),
        features: [...byFeature.entries()]
          .map(([featureId, perms]) => ({ featureId, label: formatPermissionLabel(featureId), perms }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPermissions, filter]);

  function togglePermission(id: string) {
    setPermissionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSaved(false);
  }

  function toggleModule(moduleId: string, grant: boolean) {
    const idsInModule = allPermissions.filter((p) => p.module === moduleId).map((p) => p.id);
    setPermissionIds((prev) => {
      const next = new Set(prev);
      for (const id of idsInModule) {
        if (grant) next.add(id);
        else next.delete(id);
      }
      return next;
    });
    setSaved(false);
  }

  async function savePermissions() {
    setSaving(true);
    try {
      const client = createApiClient(
        () => resolveApiBaseUrl(apiUrl),
        () => accessToken,
      );
      await client.updateRolePermissions(selectedRoleId, [...permissionIds]);
      const roleData = await client.getRoles();
      setRoles(roleData);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title={t('control.authorizationTitle')} subtitle={t('control.authorizationSubtitle')} />
      <div className="form-row">
        <label htmlFor="role-select">{t('control.selectRole')}</label>
        <select
          id="role-select"
          value={selectedRoleId}
          onChange={(e) => setSelectedRoleId(e.target.value)}
        >
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </select>
        <input
          className="input"
          placeholder={t('control.filterPermissions')}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void savePermissions()}>
          {saving ? t('common.loading') : t('common.save')}
        </button>
        {saved && <span className="badge badge--success">{t('control.moduleUpdated')}</span>}
      </div>

      {groups.map((group) => {
        const idsInModule = allPermissions.filter((p) => p.module === group.moduleId).map((p) => p.id);
        const allGranted = idsInModule.length > 0 && idsInModule.every((id) => permissionIds.has(id));
        return (
          <div key={group.moduleId} style={{ marginBottom: 'var(--frz-space-5)' }}>
            <h3 className="module-card-title">
              {group.label}{' '}
              <label style={{ fontSize: 'var(--frz-text-xs)', fontWeight: 'normal', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={allGranted}
                  onChange={(e) => toggleModule(group.moduleId, e.target.checked)}
                />{' '}
                {t('control.selectAllInModule')}
              </label>
            </h3>
            <div className="matrix-wrap">
              <table className="matrix-table">
                <thead>
                  <tr>
                    <th>{t('control.table.module')}</th>
                    <th>{t('control.table.actions', { defaultValue: 'Permissions' })}</th>
                  </tr>
                </thead>
                <tbody>
                  {group.features.map((feature) => (
                    <tr key={feature.featureId}>
                      <td>{feature.label}</td>
                      <td className="permission-chip-row">
                        {feature.perms.map((perm) => (
                          <label key={perm.id} className="permission-chip">
                            <input
                              type="checkbox"
                              checked={permissionIds.has(perm.id)}
                              onChange={() => togglePermission(perm.id)}
                            />
                            {actionLabel(perm.action)}
                          </label>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
