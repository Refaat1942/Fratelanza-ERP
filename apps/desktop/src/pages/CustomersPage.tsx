import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, FormField, Modal, PageHeader, useApiClient } from '../components/DataTable';
import type { CustomerRow } from '../lib/api';
import { fetchListWithOffline, mutateWithOffline } from '../lib/offline-api';
import { useAppStore, useAuthStore } from '../stores';

export function CustomersPage() {
  const { t } = useTranslation();
  const client = useApiClient();
  const connectivity = useAppStore((s) => s.connectivity);
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ code: '', name: '', phone: '', email: '' });
  const [editForm, setEditForm] = useState({ id: '', name: '', phone: '', email: '' });

  function openEdit(row: CustomerRow) {
    setEditForm({ id: row.id, name: row.name, phone: row.phone ?? '', email: row.email ?? '' });
    setEditOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    try {
      await mutateWithOffline({
        connectivity,
        online: () => client.createCustomer(form),
        offline: () =>
          window.desktopApi!.offlineCreateCustomer({
            tenantId: user.tenantId,
            branchId: user.branchId,
            payload: form,
          }),
      });
      setOpen(false);
      setForm({ code: '', name: '', phone: '', email: '' });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    try {
      await mutateWithOffline({
        connectivity,
        online: () =>
          client.updateCustomer(editForm.id, {
            name: editForm.name,
            phone: editForm.phone || undefined,
            email: editForm.email || undefined,
          }),
        offline: () =>
          window.desktopApi!.offlineUpdateCustomer({
            tenantId: user.tenantId,
            id: editForm.id,
            payload: {
              name: editForm.name,
              phone: editForm.phone || undefined,
              email: editForm.email || undefined,
            },
          }),
      });
      setEditOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    }
  }

  return (
    <div>
      <PageHeader
        title={t('nav.customers')}
        breadcrumbs={[{ label: t('nav.customers') }]}
        action={
          <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
            {t('common.create')}
          </button>
        }
      />
      <DataTable<CustomerRow>
        refreshKey={refreshKey}
        columns={[
          { key: 'code', label: t('customers.code') },
          { key: 'name', label: t('customers.name') },
          { key: 'phone', label: t('customers.phone') },
          { key: 'balance', label: t('customers.balance'), render: (r) => Number(r.balance).toFixed(2) },
          {
            key: 'actions',
            label: t('common.actions'),
            render: (r) => (
              <button type="button" className="btn btn-ghost" onClick={() => openEdit(r)}>
                {t('common.edit')}
              </button>
            ),
          },
        ]}
        fetchData={(c) =>
          fetchListWithOffline({
            connectivity,
            client: c,
            online: (api) => api.getCustomers(),
            offline: () => window.desktopApi!.getLocalCustomers(),
          })
        }
      />
      <Modal open={open} title={t('customers.create')} onClose={() => setOpen(false)}>
        <form onSubmit={(e) => void handleSubmit(e)}>
          <FormField label={t('customers.code')}>
            <input className="form-input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
          </FormField>
          <FormField label={t('customers.name')}>
            <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </FormField>
          <FormField label={t('customers.phone')}>
            <input className="form-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </FormField>
          <FormField label={t('auth.email')}>
            <input className="form-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </FormField>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn btn-primary">{t('common.save')}</button>
        </form>
      </Modal>
      <Modal open={editOpen} title={t('customers.edit')} onClose={() => setEditOpen(false)}>
        <form onSubmit={(e) => void handleEdit(e)}>
          <FormField label={t('customers.name')}>
            <input className="form-input" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required />
          </FormField>
          <FormField label={t('customers.phone')}>
            <input className="form-input" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
          </FormField>
          <FormField label={t('auth.email')}>
            <input className="form-input" type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
          </FormField>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn btn-primary">{t('common.save')}</button>
        </form>
      </Modal>
    </div>
  );
}
