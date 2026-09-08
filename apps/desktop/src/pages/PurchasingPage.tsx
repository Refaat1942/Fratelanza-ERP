import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, FormField, Modal, PageHeader, StatusBadge, useApiClient } from '../components/DataTable';
import { LineItemsEditor, type DocumentLineItem } from '../components/LineItemsEditor';
import type { PartyRow, PurchaseOrderRow } from '../lib/api';
import { useAuthStore } from '../stores';

type SupplierMode = 'supplier' | 'party';

export function PurchasingPage() {
  const { t } = useTranslation();
  const client = useApiClient();
  const user = useAuthStore((s) => s.user);
  const [refreshKey, setRefreshKey] = useState(0);
  const [message, setMessage] = useState('');
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [supplierMode, setSupplierMode] = useState<SupplierMode>('supplier');
  const [partyRoutingEnabled, setPartyRoutingEnabled] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [partyId, setPartyId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [lines, setLines] = useState<DocumentLineItem[]>([]);
  const [products, setProducts] = useState<Array<{ id: string; name: string; salePrice: number; sku?: string }>>([]);
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  const [parties, setParties] = useState<PartyRow[]>([]);
  const [warehouses, setWarehouses] = useState<Array<{ id: string; name: string }>>([]);

  async function openForm() {
    setError('');
    const [productList, supplierList, warehouseList, settings, partyList] = await Promise.all([
      client.getProducts(),
      client.getSuppliers(),
      client.getWarehouses(),
      client.getSettings(),
      client.listParties(),
    ]);
    setProducts(productList.filter((p) => p.isActive));
    setSuppliers(supplierList);
    setWarehouses(warehouseList.filter((w) => w.isActive));
    setParties(partyList.filter((p) => p.roles?.some((r) => r.role === 'supplier')));
    setPartyRoutingEnabled(
      Boolean(
        (settings as { deploymentFlags?: { purchasingPartyRoutingEnabled?: boolean } })
          ?.deploymentFlags?.purchasingPartyRoutingEnabled,
      ),
    );
    setSupplierMode('supplier');
    setSupplierId(supplierList[0]?.id ?? '');
    setPartyId(partyList[0]?.id ?? '');
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
    if (!warehouseId) {
      setError(t('purchasing.requiredFields'));
      return;
    }
    const validLines = lines.filter((l) => l.productId && l.quantity > 0);
    if (validLines.length === 0) {
      setError(t('lineItems.required'));
      return;
    }
    try {
      const order =
        supplierMode === 'party' && partyRoutingEnabled
          ? await client.createPurchaseOrderFromParty({
              partyId,
              branchId: user.branchId,
              warehouseId,
              lines: validLines.map((l) => ({ ...l, productId: l.productId })),
            })
          : await client.createPurchaseOrder({
              branchId: user.branchId,
              supplierId,
              warehouseId,
              lines: validLines.map((l) => ({ ...l, productId: l.productId })),
            });
      setOpen(false);
      setMessage(`${t('purchasing.created')} (${order.number})`);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    }
  }

  async function receiveOrder(id: string) {
    try {
      await client.receivePurchaseOrder(id);
      setMessage(t('purchasing.received'));
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t('errors.generic'));
    }
  }

  return (
    <div>
      <PageHeader
        title={t('nav.purchasing')}
        breadcrumbs={[{ label: t('nav.purchasing') }]}
        action={
          <button type="button" className="btn btn-primary" onClick={() => void openForm()}>
            {t('common.create')}
          </button>
        }
      />
      {message && <p style={{ marginBottom: 12 }}>{message}</p>}
      <DataTable<PurchaseOrderRow>
        refreshKey={refreshKey}
        columns={[
          { key: 'number', label: t('purchasing.number') },
          { key: 'supplier', label: t('nav.suppliers'), render: (r) => r.supplier?.name ?? '—' },
          { key: 'status', label: t('common.status'), render: (r) => <StatusBadge status={r.status} /> },
          { key: 'total', label: t('sales.total'), align: 'end', render: (r) => Number(r.total).toFixed(2) },
          {
            key: 'actions',
            label: t('common.actions'),
            render: (r) =>
              r.status !== 'received' ? (
                <button type="button" className="btn btn-ghost" onClick={() => void receiveOrder(r.id)}>
                  {t('purchasing.receive')}
                </button>
              ) : null,
          },
        ]}
        fetchData={(c) => c.getPurchaseOrders()}
      />
      <Modal open={open} title={t('purchasing.create')} onClose={() => setOpen(false)}>
        <form onSubmit={(e) => void handleCreate(e)}>
          {partyRoutingEnabled && (
            <FormField label={t('purchasing.supplierMode')}>
              <select
                className="select-input"
                value={supplierMode}
                onChange={(e) => setSupplierMode(e.target.value as SupplierMode)}
              >
                <option value="supplier">{t('nav.suppliers')}</option>
                <option value="party">{t('nav.parties')}</option>
              </select>
            </FormField>
          )}
          {supplierMode === 'party' && partyRoutingEnabled ? (
            <FormField label={t('nav.parties')}>
              <select className="select-input" value={partyId} onChange={(e) => setPartyId(e.target.value)} required>
                {parties.map((p) => (
                  <option key={p.id} value={p.id}>{p.displayName}</option>
                ))}
              </select>
            </FormField>
          ) : (
            <FormField label={t('nav.suppliers')}>
              <select className="select-input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </FormField>
          )}
          <FormField label={t('nav.warehouses')}>
            <select className="select-input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} required>
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
