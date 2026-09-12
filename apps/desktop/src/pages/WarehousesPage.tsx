import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog, DataTable, FormField, Modal, PageHeader, useApiClient } from '../components/DataTable';
import { formatCurrency } from '../lib/format';
import type { InventoryBalanceRow } from '../lib/api';
import { useAuthStore } from '../stores';

type WarehouseRow = { id: string; code: string; name: string; address?: string | null; isActive: boolean; branch?: { name: string } };

export function WarehousesPage() {
  const { t } = useTranslation();
  const client = useApiClient();
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ code: '', name: '', address: '' });
  const [branchId, setBranchId] = useState('');

  const [editing, setEditing] = useState<WarehouseRow | null>(null);
  const [editForm, setEditForm] = useState({ name: '', address: '' });
  const [deleteTarget, setDeleteTarget] = useState<WarehouseRow | null>(null);

  const [stockWarehouse, setStockWarehouse] = useState<WarehouseRow | null>(null);
  const [stockRows, setStockRows] = useState<InventoryBalanceRow[]>([]);
  const [stockLoading, setStockLoading] = useState(false);

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

  function openEdit(row: WarehouseRow) {
    setEditing(row);
    setEditForm({ name: row.name, address: row.address ?? '' });
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setError('');
    try {
      await client.updateWarehouse(editing.id, editForm);
      setEditing(null);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await client.deleteWarehouse(deleteTarget.id);
    setDeleteTarget(null);
    setRefreshKey((k) => k + 1);
  }

  async function openStock(row: WarehouseRow) {
    setStockWarehouse(row);
    setStockLoading(true);
    try {
      setStockRows(await client.getInventoryBalances(row.id));
    } finally {
      setStockLoading(false);
    }
  }

  const stockTotalValue = stockRows.reduce((sum, r) => sum + Number(r.quantity) * Number(r.avgCost ?? 0), 0);

  return (
    <div>
      <PageHeader
        title={t('nav.warehouses')}
        breadcrumbs={[{ label: t('nav.warehouses') }]}
        action={
          <button type="button" className="btn btn-primary" onClick={() => void openForm()}>
            {t('common.create')}
          </button>
        }
      />
      <DataTable<WarehouseRow>
        refreshKey={refreshKey}
        exportFilename="warehouses"
        columns={[
          { key: 'code', label: t('warehouses.code') },
          { key: 'name', label: t('warehouses.name') },
          { key: 'branch', label: t('nav.branches'), render: (r) => r.branch?.name ?? '—', exportValue: (r) => r.branch?.name ?? '' },
          {
            key: 'isActive',
            label: t('common.status'),
            render: (r) => (r.isActive ? t('common.active') : t('common.inactive')),
            exportValue: (r) => (r.isActive ? t('common.active') : t('common.inactive')),
          },
          {
            key: 'actions',
            label: t('common.actions'),
            exportValue: () => '',
            render: (r) => (
              <div className="row-actions">
                <button type="button" className="btn-link" onClick={() => void openStock(r)}>{t('warehouses.viewStock')}</button>
                <button type="button" className="btn-link" onClick={() => openEdit(r)}>{t('common.edit')}</button>
                <button type="button" className="btn-link btn-link--danger" onClick={() => setDeleteTarget(r)}>{t('common.delete')}</button>
              </div>
            ),
          },
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

      <Modal open={!!editing} title={t('warehouses.edit')} onClose={() => setEditing(null)}>
        <form onSubmit={(e) => void handleSaveEdit(e)}>
          <FormField label={t('warehouses.name')}>
            <input className="form-input" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required />
          </FormField>
          <FormField label={t('warehouses.address')}>
            <input className="form-input" value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} />
          </FormField>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn btn-primary">{t('common.save')}</button>
        </form>
      </Modal>

      <Modal open={!!stockWarehouse} title={`${t('warehouses.viewStock')} · ${stockWarehouse?.name ?? ''}`} onClose={() => setStockWarehouse(null)}>
        {stockLoading ? (
          <p>{t('common.loading')}</p>
        ) : stockRows.length === 0 ? (
          <p className="page-subtitle">{t('common.noDataHint')}</p>
        ) : (
          <>
            <table className="data-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>{t('products.name')}</th>
                  <th>{t('inventory.quantity')}</th>
                  <th>{t('inventory.value')}</th>
                </tr>
              </thead>
              <tbody>
                {stockRows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.product.sku} — {r.product.name}</td>
                    <td className="cell-numeric">{Number(r.quantity).toFixed(2)}</td>
                    <td className="cell-numeric">{formatCurrency(Number(r.quantity) * Number(r.avgCost ?? 0), user?.currency ?? 'EGP')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="page-subtitle" style={{ marginTop: '0.75rem' }}>
              {t('inventory.totalValue')}: <strong>{formatCurrency(stockTotalValue, user?.currency ?? 'EGP')}</strong>
            </p>
          </>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title={t('common.confirmDeleteTitle')}
        message={t('common.confirmDeleteMessage')}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
