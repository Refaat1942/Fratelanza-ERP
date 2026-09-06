import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, FormField, Modal, PageHeader, useApiClient } from '../components/DataTable';
import type { UserRow } from '../lib/api';
import { useAuthStore } from '../stores';

export function UsersPage() {
  const { t } = useTranslation();
  const client = useApiClient();
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState('');
  const [roles, setRoles] = useState<Array<{ id: string; name: string }>>([]);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [form, setForm] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    roleId: '',
    branchId: '',
    phone: '',
  });

  async function openForm() {
    setError('');
    const [roleList, branchList] = await Promise.all([
      client.getRoles(),
      client.getBranches() as Promise<Array<{ id: string; name: string; isDefault?: boolean }>>,
    ]);
    setRoles(roleList);
    setBranches(branchList);
    setForm({
      email: '',
      password: '',
      firstName: '',
      lastName: '',
      roleId: roleList[0]?.id ?? '',
      branchId: user?.branchId ?? branchList.find((b) => b.isDefault)?.id ?? branchList[0]?.id ?? '',
      phone: '',
    });
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await client.createUser({
        email: form.email,
        password: form.password,
        firstName: form.firstName,
        lastName: form.lastName,
        roleId: form.roleId,
        branchId: form.branchId || undefined,
        phone: form.phone || undefined,
      });
      setOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    }
  }

  return (
    <div>
      <PageHeader
        title={t('users.title')}
        action={
          <button type="button" className="btn btn-primary" onClick={() => void openForm()}>
            {t('users.create')}
          </button>
        }
      />
      <DataTable<UserRow>
        refreshKey={refreshKey}
        columns={[
          { key: 'email', label: t('users.email') },
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
        ]}
        fetchData={(c) => c.getUsers()}
      />
      <Modal open={open} title={t('users.create')} onClose={() => setOpen(false)}>
        <form onSubmit={(e) => void handleSubmit(e)}>
          <FormField label={t('users.email')}>
            <input
              className="form-input"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </FormField>
          <FormField label={t('auth.password')}>
            <input
              className="form-input"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              minLength={8}
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
