import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, FormField, Modal, PageHeader, useApiClient } from '../components/DataTable';
import type { UserRow } from '../lib/api';
import { displayLoginName } from '../lib/login-identity';
import { useAuthStore } from '../stores';

export function UsersPage() {
  const { t } = useTranslation();
  const client = useApiClient();
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState('');
  const [roles, setRoles] = useState<Array<{ id: string; name: string }>>([]);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [form, setForm] = useState({
    username: '',
    password: '',
    firstName: '',
    lastName: '',
    roleId: '',
    branchId: '',
    phone: '',
  });

  async function loadFormDefaults(existing?: UserRow) {
    setError('');
    const [roleList, branchList] = await Promise.all([
      client.getAssignableRoles(),
      client.getBranches() as Promise<Array<{ id: string; name: string; isDefault?: boolean }>>,
    ]);
    setRoles(roleList);
    setBranches(branchList);
    setForm({
      username: existing ? displayLoginName(existing.email) : '',
      password: '',
      firstName: existing?.firstName ?? '',
      lastName: existing?.lastName ?? '',
      roleId: existing?.role?.id ?? roleList[0]?.id ?? '',
      branchId:
        existing?.branch?.id ??
        user?.branchId ??
        branchList.find((b) => b.isDefault)?.id ??
        branchList[0]?.id ??
        '',
      phone: existing?.phone ?? '',
    });
    setEditing(existing ?? null);
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editing) {
        await client.updateUser(editing.id, {
          username: form.username,
          password: form.password || undefined,
          firstName: form.firstName,
          lastName: form.lastName,
          roleId: form.roleId,
          branchId: form.branchId || undefined,
          phone: form.phone || undefined,
        });
      } else {
        await client.createUser({
          username: form.username,
          password: form.password,
          firstName: form.firstName,
          lastName: form.lastName,
          roleId: form.roleId,
          branchId: form.branchId || undefined,
          phone: form.phone || undefined,
        });
      }
      setOpen(false);
      setEditing(null);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    }
  }

  return (
    <div>
      <PageHeader
        title={t('users.title')}
        breadcrumbs={[{ label: t('nav.users') }]}
        action={
          <button type="button" className="btn btn-primary" onClick={() => void loadFormDefaults()}>
            {t('users.create')}
          </button>
        }
      />
      <DataTable<UserRow>
        refreshKey={refreshKey}
        columns={[
          {
            key: 'username',
            label: t('users.username'),
            render: (r) => displayLoginName(r.email),
          },
          {
            key: 'name',
            label: t('users.name'),
            render: (r) => `${r.firstName} ${r.lastName}`,
          },
          { key: 'role', label: t('users.role'), render: (r) => r.role?.name ?? '—' },
          { key: 'branch', label: t('users.branch'), render: (r) => r.branch?.name ?? '—' },
          {
            key: 'isActive',
            label: t('common.status'),
            render: (r) => (r.isActive ? t('common.active') : t('common.inactive')),
          },
          {
            key: 'actions',
            label: t('common.actions'),
            render: (r) => (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void loadFormDefaults(r)}>
                {t('common.edit')}
              </button>
            ),
          },
        ]}
        fetchData={(c) => c.getUsers()}
      />
      <Modal
        open={open}
        title={editing ? t('users.edit') : t('users.create')}
        onClose={() => {
          setOpen(false);
          setEditing(null);
        }}
      >
        <form onSubmit={(e) => void handleSubmit(e)}>
          <FormField label={t('users.username')}>
            <input
              className="form-input"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              required
              autoComplete="username"
            />
          </FormField>
          <FormField label={t('auth.password')}>
            <input
              className="form-input"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required={!editing}
              minLength={8}
              placeholder={editing ? t('users.passwordHint') : undefined}
            />
          </FormField>
          <FormField label={t('users.firstName')}>
            <input
              className="form-input"
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              required
            />
          </FormField>
          <FormField label={t('users.lastName')}>
            <input
              className="form-input"
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              required
            />
          </FormField>
          <FormField label={t('users.role')}>
            <select
              className="select-input"
              value={form.roleId}
              onChange={(e) => setForm({ ...form, roleId: e.target.value })}
              required
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </FormField>
          <FormField label={t('users.branch')}>
            <select
              className="select-input"
              value={form.branchId}
              onChange={(e) => setForm({ ...form, branchId: e.target.value })}
            >
              <option value="">—</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </FormField>
          <FormField label={t('customers.phone')}>
            <input
              className="form-input"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </FormField>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn btn-primary">{t('common.save')}</button>
        </form>
      </Modal>
    </div>
  );
}
