import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, FormField, Modal, PageHeader, useApiClient } from '../components/DataTable';
import type { ProductRow } from '../lib/api';

export function ProductsPage() {
  const { t } = useTranslation();
  const client = useApiClient();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ sku: '', name: '', barcode: '', salePrice: '', costPrice: '' });
  const [editForm, setEditForm] = useState({ id: '', name: '', barcode: '', salePrice: '' });
  const [unitId, setUnitId] = useState('');

  async function openForm() {
    setError('');
    const units = await client.getUnitsOfMeasure();
    setUnitId(units[0]?.id ?? '');
    setOpen(true);
  }

  function openEdit(row: ProductRow) {
    setEditForm({
      id: row.id,
      name: row.name,
      barcode: row.barcode ?? '',
      salePrice: String(row.salePrice),
    });
    setEditOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!unitId) {
      setError(t('products.unitRequired'));
      return;
    }
    try {
      await client.createProduct({
        sku: form.sku,
        name: form.name,
        unitId,
        barcode: form.barcode || undefined,
        salePrice: form.salePrice ? Number(form.salePrice) : undefined,
        costPrice: form.costPrice ? Number(form.costPrice) : undefined,
      });
      setOpen(false);
      setForm({ sku: '', name: '', barcode: '', salePrice: '', costPrice: '' });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await client.updateProduct(editForm.id, {
        name: editForm.name,
        barcode: editForm.barcode || undefined,
        salePrice: Number(editForm.salePrice),
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
        title={t('nav.products')}
        action={
          <button type="button" className="btn btn-primary" onClick={() => void openForm()}>
            {t('common.create')}
          </button>
        }
      />
      <DataTable<ProductRow>
        refreshKey={refreshKey}
        columns={[
          { key: 'sku', label: 'SKU' },
          { key: 'name', label: t('products.name') },
          { key: 'salePrice', label: t('products.price'), render: (r) => Number(r.salePrice).toFixed(2) },
          { key: 'barcode', label: t('products.barcode') },
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
        fetchData={(c) => c.getProducts()}
      />
      <Modal open={open} title={t('products.create')} onClose={() => setOpen(false)}>
        <form onSubmit={(e) => void handleSubmit(e)}>
          <FormField label="SKU">
            <input className="form-input" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} required />
          </FormField>
          <FormField label={t('products.name')}>
            <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </FormField>
          <FormField label={t('products.barcode')}>
            <input className="form-input" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
          </FormField>
          <FormField label={t('products.price')}>
            <input className="form-input" type="number" min="0" step="0.01" value={form.salePrice} onChange={(e) => setForm({ ...form, salePrice: e.target.value })} />
          </FormField>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn btn-primary">{t('common.save')}</button>
        </form>
      </Modal>
      <Modal open={editOpen} title={t('products.edit')} onClose={() => setEditOpen(false)}>
        <form onSubmit={(e) => void handleEdit(e)}>
          <FormField label={t('products.name')}>
            <input className="form-input" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required />
          </FormField>
          <FormField label={t('products.barcode')}>
            <input className="form-input" value={editForm.barcode} onChange={(e) => setEditForm({ ...editForm, barcode: e.target.value })} />
          </FormField>
          <FormField label={t('products.price')}>
            <input className="form-input" type="number" min="0" step="0.01" value={editForm.salePrice} onChange={(e) => setEditForm({ ...editForm, salePrice: e.target.value })} />
          </FormField>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn btn-primary">{t('common.save')}</button>
        </form>
      </Modal>
    </div>
  );
}
