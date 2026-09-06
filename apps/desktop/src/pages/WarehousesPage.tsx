import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, FormField, Modal, PageHeader, useApiClient } from '../components/DataTable';
import { useAuthStore } from '../stores';

type WarehouseRow = { id: string; code: string; name: string; isActive: boolean; branch?: { name: string } };

export function WarehousesPage() {
  const { t } = useTranslation();
  const client = useApiClient();
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ code: '', name: '', address: '' });
  const [branchId, setBranchId] = useState('');

  async function openForm() {
    setError('');
    const branches = await client.getBranches() as Array<{ id: string; name: string; isDefault?: boolean }>;
    setBranchId(user?.branchId ?? branches.find((b) => b.isDefault)?.id ?? branches[0]?.id ?? '');
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!branchId) {
      setError(t('warehouses.branchRequired'));
      return;
    }
    try {
      await client.createWarehouse({
        branchId,
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
        title={t('nav.warehouses')}
        action={
          <button type="button" className="btn btn-primary" onClick={() => void openForm()}>
            {t('common.create')}
          </button>
        }
      />
      <DataTable<WarehouseRow>
        refreshKey={refreshKey}
        columns={[
          { key: 'code', label: t('warehouses.code') },
          { key: 'name', label: t('warehouses.name') },
          { key: 'branch', label: t('nav.branches'), render: (r) => r.branch?.name ?? '—' },
          { key: 'isActive', label: t('common.status'), render: (r) => (r.isActive ? t('common.active') : t('common.inactive')) },
        ]}
        fetchData={(c) => c.getWarehouses() as Promise<WarehouseRow[]>}
      />
      <Modal open={open} title={t('warehouses.create')} onClose={() => setOpen(false)}>
        <form onSubmit={(e) => void handleSubmit(e)}>
          <FormField label={t('warehouses.code')}>
            <input className="form-input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
          </FormField>
          <FormField label={t('warehouses.name')}>
            <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </FormField>
          <FormField label={t('warehouses.address')}>
            <input className="form-input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </FormField>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn btn-primary">{t('common.save')}</button>
        </form>
      </Modal>
    </div>
  );
}
