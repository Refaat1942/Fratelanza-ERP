import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, FormField, Modal, PageHeader, useApiClient } from '../components/DataTable';
import { LineItemsEditor, type DocumentLineItem } from '../components/LineItemsEditor';
import type { SalesInvoiceRow } from '../lib/api';
import { useAuthStore } from '../stores';

export function SalesPage() {
  const { t } = useTranslation();
  const client = useApiClient();
  const user = useAuthStore((s) => s.user);
  const [refreshKey, setRefreshKey] = useState(0);
  const [message, setMessage] = useState('');
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [lines, setLines] = useState<DocumentLineItem[]>([]);
  const [products, setProducts] = useState<Array<{ id: string; name: string; salePrice: number; sku?: string }>>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string }>>([]);
  const [warehouses, setWarehouses] = useState<Array<{ id: string; name: string }>>([]);

  async function openForm() {
    setError('');
    const [productList, customerList, warehouseList] = await Promise.all([
      client.getProducts(),
      client.getCustomers(),
      client.getWarehouses(),
    ]);
    setProducts(productList.filter((p) => p.isActive));
    setCustomers(customerList);
    setWarehouses(warehouseList.filter((w) => w.isActive));
    setCustomerId(customerList[0]?.id ?? '');
    setWarehouseId(warehouseList[0]?.id ?? '');
    setLines([{ productId: '', description: '', quantity: 1, unitPrice: 0 }]);
    setOpen(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.branchId) {
      setError(t('pos.noBranch'));
      return;
    }
    const validLines = lines.filter((l) => l.productId && l.quantity > 0);
    if (validLines.length === 0) {
      setError(t('lineItems.required'));
      return;
    }
    try {
      const invoice = await client.createSalesInvoice({
        branchId: user.branchId,
        customerId: customerId || undefined,
        warehouseId: warehouseId || undefined,
        lines: validLines,
      });
      setOpen(false);
      setMessage(`${t('sales.created')} (${invoice.number})`);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    }
  }

  async function postInvoice(id: string) {
    try {
      await client.postSalesInvoice(id);
      setMessage(t('sales.posted'));
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t('errors.generic'));
    }
  }

  return (
    <div>
      <PageHeader
        title={t('nav.sales')}
        action={
          <button type="button" className="btn btn-primary" onClick={() => void openForm()}>
            {t('common.create')}
          </button>
        }
      />
      {message && <p style={{ marginBottom: 12 }}>{message}</p>}
      <DataTable<SalesInvoiceRow>
        refreshKey={refreshKey}
        columns={[
          { key: 'number', label: t('sales.number') },
          { key: 'customer', label: t('nav.customers'), render: (r) => r.customer?.name ?? '—' },
          { key: 'status', label: t('common.status') },
          { key: 'total', label: t('sales.total'), render: (r) => Number(r.total).toFixed(2) },
          {
            key: 'actions',
            label: t('common.actions'),
            render: (r) =>
              r.status === 'draft' ? (
                <button type="button" className="btn btn-ghost" onClick={() => void postInvoice(r.id)}>
                  {t('sales.post')}
                </button>
              ) : null,
          },
        ]}
        fetchData={(c) => c.getSalesInvoices()}
      />
      <Modal open={open} title={t('sales.create')} onClose={() => setOpen(false)}>
        <form onSubmit={(e) => void handleCreate(e)}>
          <FormField label={t('nav.customers')}>
            <select className="select-input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">—</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </FormField>
          <FormField label={t('nav.warehouses')}>
            <select className="select-input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </FormField>
          <LineItemsEditor lines={lines} products={products} onChange={setLines} />
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn btn-primary" style={{ marginTop: 16 }}>{t('common.save')}</button>
        </form>
      </Modal>
    </div>
  );
}
