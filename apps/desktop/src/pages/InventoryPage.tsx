import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, FormField, Modal, PageHeader, useApiClient } from '../components/DataTable';
import { formatCurrency } from '../lib/format';
import type { InventoryBalanceRow, LowStockItem, StockValuation } from '../lib/api';
import { useAuthStore } from '../stores';

export function InventoryPage() {
  const { t } = useTranslation();
  const client = useApiClient();
  const user = useAuthStore((s) => s.user);
  const [refreshKey, setRefreshKey] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [products, setProducts] = useState<Array<{ id: string; name: string; sku: string }>>([]);
  const [warehouses, setWarehouses] = useState<Array<{ id: string; name: string }>>([]);

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [warehouseId, setWarehouseId] = useState('');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('10');
  const [notes, setNotes] = useState('');

  const [transferOpen, setTransferOpen] = useState(false);
  const [fromWarehouseId, setFromWarehouseId] = useState('');
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [transferProductId, setTransferProductId] = useState('');
  const [transferQty, setTransferQty] = useState('1');

  const [valuation, setValuation] = useState<StockValuation | null>(null);
  const [lowStockWarehouseId, setLowStockWarehouseId] = useState('');
  const [lowStock, setLowStock] = useState<LowStockItem[]>([]);
  const [lowStockOpen, setLowStockOpen] = useState(false);
  const [lowStockLoading, setLowStockLoading] = useState(false);

  const loadValuation = useCallback(async () => {
    setValuation(await client.getInventoryValuation());
  }, [client]);

  useEffect(() => {
    void loadValuation();
  }, [loadValuation, refreshKey]);

  async function openAdjust() {
    setError('');
    const [productList, warehouseList] = await Promise.all([
      client.getProducts(),
      client.getWarehouses(),
    ]);
    setProducts(productList.filter((p) => p.isActive));
    setWarehouses(warehouseList.filter((w) => w.isActive));
    setProductId(productList[0]?.id ?? '');
    setWarehouseId(warehouseList[0]?.id ?? '');
    setAdjustOpen(true);
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
      setAdjustOpen(false);
      setMessage(t('inventory.adjusted'));
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    }
  }

  async function openTransfer() {
    setError('');
    const [productList, warehouseList] = await Promise.all([
      client.getProducts(),
      client.getWarehouses(),
    ]);
    setProducts(productList.filter((p) => p.isActive));
    const active = warehouseList.filter((w) => w.isActive);
    setWarehouses(active);
    setFromWarehouseId(active[0]?.id ?? '');
    setToWarehouseId(active[1]?.id ?? active[0]?.id ?? '');
    setTransferProductId(productList[0]?.id ?? '');
    setTransferOpen(true);
  }

  async function handleTransfer(e: React.FormEvent) {
    e.preventDefault();
    if (fromWarehouseId === toWarehouseId) {
      setError(t('inventory.transferSameWarehouse'));
      return;
    }
    try {
      await client.transferStock({
        fromWarehouseId,
        toWarehouseId,
        productId: transferProductId,
        quantity: Number(transferQty),
      });
      setTransferOpen(false);
      setMessage(t('inventory.transferred'));
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    }
  }

  async function openLowStock() {
    const warehouseList = await client.getWarehouses();
    const active = warehouseList.filter((w) => w.isActive);
    setWarehouses(active);
    const target = lowStockWarehouseId || active[0]?.id || '';
    setLowStockWarehouseId(target);
    setLowStockOpen(true);
    if (target) await loadLowStock(target);
  }

  async function loadLowStock(id: string) {
    setLowStockLoading(true);
    try {
      setLowStock(await client.getLowStock(id));
    } finally {
      setLowStockLoading(false);
    }
  }

  async function handleGenerateReorder() {
    if (!user?.branchId || !lowStockWarehouseId) return;
    try {
      const result = await client.generateReorderPurchaseOrders(user.branchId, lowStockWarehouseId);
      setMessage(
        t('inventory.reorderGenerated', {
          count: result.createdOrders.length,
          skipped: result.skipped.length,
        }),
      );
      setLowStockOpen(false);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t('errors.generic'));
    }
  }

  return (
    <div>
      <PageHeader
        title={t('nav.inventory')}
        breadcrumbs={[{ label: t('nav.inventory') }]}
        action={
          <div className="row-actions">
            <button type="button" className="btn btn-ghost" onClick={() => void openLowStock()}>
              {t('inventory.lowStock')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => void openTransfer()}>
              {t('inventory.transfer')}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void openAdjust()}>
              {t('inventory.adjust')}
            </button>
          </div>
        }
      />
      {message && <p style={{ marginBottom: 12 }}>{message}</p>}
      {valuation && (
        <p className="page-subtitle" style={{ marginBottom: '1rem' }}>
          {t('inventory.totalValue')}: <strong>{formatCurrency(valuation.totalValue, user?.currency ?? 'EGP')}</strong>
        </p>
      )}
      <DataTable<InventoryBalanceRow>
        refreshKey={refreshKey}
        exportFilename="stock-balances"
        columns={[
          { key: 'product', label: t('products.name'), render: (r) => r.product.name, exportValue: (r) => r.product.name },
          { key: 'sku', label: 'SKU', render: (r) => r.product.sku, exportValue: (r) => r.product.sku },
          { key: 'warehouse', label: t('nav.warehouses'), render: (r) => r.warehouse.name, exportValue: (r) => r.warehouse.name },
          { key: 'quantity', label: t('inventory.quantity'), align: 'end', render: (r) => Number(r.quantity).toFixed(2) },
          {
            key: 'value',
            label: t('inventory.value'),
            align: 'end',
            render: (r) => formatCurrency(Number(r.quantity) * Number(r.avgCost ?? 0), user?.currency ?? 'EGP'),
            exportValue: (r) => Number(r.quantity) * Number(r.avgCost ?? 0),
          },
        ]}
        fetchData={(c) => c.getInventoryBalances()}
      />
      <Modal open={adjustOpen} title={t('inventory.adjust')} onClose={() => setAdjustOpen(false)}>
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

      <Modal open={transferOpen} title={t('inventory.transfer')} onClose={() => setTransferOpen(false)}>
        <form onSubmit={(e) => void handleTransfer(e)}>
          <FormField label={t('inventory.fromWarehouse')}>
            <select className="select-input" value={fromWarehouseId} onChange={(e) => setFromWarehouseId(e.target.value)} required>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </FormField>
          <FormField label={t('inventory.toWarehouse')}>
            <select className="select-input" value={toWarehouseId} onChange={(e) => setToWarehouseId(e.target.value)} required>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </FormField>
          <FormField label={t('products.name')}>
            <select className="select-input" value={transferProductId} onChange={(e) => setTransferProductId(e.target.value)} required>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>
              ))}
            </select>
          </FormField>
          <FormField label={t('inventory.quantity')}>
            <input className="form-input" type="number" min={0.0001} step="0.01" value={transferQty} onChange={(e) => setTransferQty(e.target.value)} required />
          </FormField>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn btn-primary">{t('common.save')}</button>
        </form>
      </Modal>

      <Modal open={lowStockOpen} title={t('inventory.lowStock')} onClose={() => setLowStockOpen(false)}>
        <FormField label={t('nav.warehouses')}>
          <select
            className="select-input"
            value={lowStockWarehouseId}
            onChange={(e) => { setLowStockWarehouseId(e.target.value); void loadLowStock(e.target.value); }}
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </FormField>
        {lowStockLoading ? (
          <p>{t('common.loading')}</p>
        ) : lowStock.length === 0 ? (
          <p className="page-subtitle">{t('inventory.noLowStock')}</p>
        ) : (
          <>
            <table className="data-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>{t('products.name')}</th>
                  <th>{t('inventory.onHand')}</th>
                  <th>{t('inventory.reorderPoint')}</th>
                  <th>{t('nav.suppliers')}</th>
                </tr>
              </thead>
              <tbody>
                {lowStock.map((item) => (
                  <tr key={item.productId}>
                    <td>{item.sku} — {item.name}</td>
                    <td className="cell-numeric">{item.onHand}</td>
                    <td className="cell-numeric">{item.reorderPoint}</td>
                    <td>{item.preferredSupplierName ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="button" className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => void handleGenerateReorder()}>
              {t('inventory.generateReorderPOs')}
            </button>
          </>
        )}
      </Modal>
    </div>
  );
}
