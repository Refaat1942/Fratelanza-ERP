import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, FormField, Modal, PageHeader, useApiClient } from '../components/DataTable';
import type { InventoryBalanceRow } from '../lib/api';

export function InventoryPage() {
  const { t } = useTranslation();
  const client = useApiClient();
  const [refreshKey, setRefreshKey] = useState(0);
  const [message, setMessage] = useState('');
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('10');
  const [notes, setNotes] = useState('');
  const [products, setProducts] = useState<Array<{ id: string; name: string; sku: string }>>([]);
  const [warehouses, setWarehouses] = useState<Array<{ id: string; name: string }>>([]);

  async function openForm() {
    setError('');
    const [productList, warehouseList] = await Promise.all([
      client.getProducts(),
      client.getWarehouses(),
    ]);
    setProducts(productList.filter((p) => p.isActive));
    setWarehouses(warehouseList.filter((w) => w.isActive));
    setProductId(productList[0]?.id ?? '');
    setWarehouseId(warehouseList[0]?.id ?? '');
    setOpen(true);
  }

  async function handleAdjust(e: React.FormEvent) {
    e.preventDefault();
    if (!warehouseId || !productId) {
      setError(t('inventory.requiredFields'));
      return;
    }
    try {
      await client.adjustInventory({
        warehouseId,
        productId,
        quantity: Number(quantity),
        notes: notes || undefined,
      });
      setOpen(false);
      setMessage(t('inventory.adjusted'));
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    }
  }

  return (
    <div>
      <PageHeader
        title={t('nav.inventory')}
        breadcrumbs={[{ label: t('nav.inventory') }]}
        action={
          <button type="button" className="btn btn-primary" onClick={() => void openForm()}>
            {t('inventory.adjust')}
          </button>
        }
      />
      {message && <p style={{ marginBottom: 12 }}>{message}</p>}
      <DataTable<InventoryBalanceRow>
        refreshKey={refreshKey}
        columns={[
          { key: 'product', label: t('products.name'), render: (r) => r.product.name },
          { key: 'sku', label: 'SKU', render: (r) => r.product.sku },
          { key: 'warehouse', label: t('nav.warehouses'), render: (r) => r.warehouse.name },
          { key: 'quantity', label: t('inventory.quantity'), render: (r) => Number(r.quantity).toFixed(2) },
        ]}
        fetchData={(c) => c.getInventoryBalances()}
      />
      <Modal open={open} title={t('inventory.adjust')} onClose={() => setOpen(false)}>
        <form onSubmit={(e) => void handleAdjust(e)}>
          <FormField label={t('nav.warehouses')}>
            <select className="select-input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} required>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </FormField>
          <FormField label={t('products.name')}>
            <select className="select-input" value={productId} onChange={(e) => setProductId(e.target.value)} required>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>
              ))}
            </select>
          </FormField>
          <FormField label={t('inventory.quantity')}>
            <input
              className="form-input"
              type="number"
              step="0.01"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
            />
          </FormField>
          <FormField label={t('inventory.notes')}>
            <input className="form-input" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </FormField>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn btn-primary">{t('common.save')}</button>
        </form>
      </Modal>
    </div>
  );
}
