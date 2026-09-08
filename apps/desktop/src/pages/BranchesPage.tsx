import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, FormField, Modal, PageHeader, useApiClient } from '../components/DataTable';
import type { BranchRow } from '../lib/api';

export function BranchesPage() {
  const { t } = useTranslation();
  const client = useApiClient();
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ code: '', name: '', address: '' });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await client.createBranch({
        code: form.code,
        name: form.name,
        address: form.address || undefined,
      });
      setOpen(false);
      setForm({ code: '', name: '', address: '' });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    }
  }

  return (
    <div>
      <PageHeader
        title={t('branches.title')}
        breadcrumbs={[{ label: t('nav.branches') }]}
        action={
          <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
            {t('branches.create')}
          </button>
        }
      />
      <DataTable<BranchRow>
        refreshKey={refreshKey}
        columns={[
          { key: 'code', label: t('branches.code') },
          { key: 'name', label: t('branches.name') },
          {
            key: 'isActive',
            label: t('common.status'),
            render: (r) => (r.isActive ? t('common.active') : t('common.inactive')),
          },
        ]}
        fetchData={(c) => c.getBranches() as Promise<BranchRow[]>}
      />
      <Modal open={open} title={t('branches.create')} onClose={() => setOpen(false)}>
        <form onSubmit={(e) => void handleSubmit(e)}>
          <FormField label={t('branches.code')}>
            <input
              className="form-input"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              required
            />
          </FormField>
          <FormField label={t('branches.name')}>
            <input
              className="form-input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </FormField>
          <FormField label={t('warehouses.address')}>
            <input
              className="form-input"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </FormField>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn btn-primary">{t('common.save')}</button>
        </form>
      </Modal>
    </div>
  );
}
