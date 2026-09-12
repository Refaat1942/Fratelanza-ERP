import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PERMISSION_ACTIONS,
  PERMISSION_CATALOG,
  matrixActionGranted,
} from '@fratelanza/shared';
import { PageHeader } from '../../components/DataTable';
import { createApiClient, resolveApiBaseUrl } from '../../lib/api';
import { useAppStore, useAuthStore } from '../../stores';

type RoleRow = {
  id: string;
  name: string;
  permissions: Array<{ permission: { id: string; module: string; feature: string; action: string } }>;
};

export function AuthorizationMatrixPage() {
  const { t } = useTranslation();
  const apiUrl = useAppStore((s) => s.apiUrl);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [permissionIds, setPermissionIds] = useState<string[]>([]);
  const [allPermissions, setAllPermissions] = useState<
    Array<{ id: string; module: string; feature: string; action: string }>
  >([]);

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
    setPermissionIds(role.permissions.map((p) => p.permission.id));
  }, [roles, selectedRoleId]);

  const selectedKeys = allPermissions
    .filter((p) => permissionIds.includes(p.id))
    .map((p) => `${p.module}:${p.feature}:${p.action}`);

  async function savePermissions() {
    const client = createApiClient(
      () => resolveApiBaseUrl(apiUrl),
      () => accessToken,
    );
    await client.updateRolePermissions(selectedRoleId, permissionIds);
    const roleData = await client.getRoles();
    setRoles(roleData);
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
        <button type="button" className="btn btn-primary" onClick={() => void savePermissions()}>
          {t('common.save')}
        </button>
      </div>

      <div className="matrix-wrap">
        <table className="matrix-table">
          <thead>
            <tr>
              <th>{t('control.table.module')}</th>
              {PERMISSION_ACTIONS.map((action) => (
                <th key={action}>{action}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_CATALOG.map((module) =>
              module.features.map((feature) => (
                <tr key={`${module.id}-${feature.id}`}>
                  <td>
                    {module.label} / {feature.label}
                  </td>
                  {PERMISSION_ACTIONS.map((action) => {
                    if (!feature.actions.includes(action)) {
                      return <td key={action}>—</td>;
                    }
                    const granted = matrixActionGranted(selectedKeys, module.id, feature.id, action);
                    return <td key={action}>{granted ? '✓' : '✕'}</td>;
                  })}
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
