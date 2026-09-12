import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ConfirmDialog, DataTable, FormField, Modal, PageHeader, StatusBadge, useApiClient,
} from '../components/DataTable';
import { LineItemsEditor, type DocumentLineItem } from '../components/LineItemsEditor';
import type { PartyRow, PurchaseOrderRow } from '../lib/api';
import { formatCurrency } from '../lib/format';
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

  const [editingOrder, setEditingOrder] = useState<PurchaseOrderRow | null>(null);
  const [editSupplierId, setEditSupplierId] = useState('');
  const [editWarehouseId, setEditWarehouseId] = useState('');
  const [editLines, setEditLines] = useState<DocumentLineItem[]>([]);
  const [cancelTarget, setCancelTarget] = useState<PurchaseOrderRow | null>(null);

  const [receiveOrder, setReceiveOrder] = useState<PurchaseOrderRow | null>(null);
  const [receiveQtys, setReceiveQtys] = useState<Record<string, number>>({});
  const [approvalBlocked, setApprovalBlocked] = useState<string | null>(null);

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

  async function openEdit(row: PurchaseOrderRow) {
    setError('');
    const [order, productList, supplierList, warehouseList] = await Promise.all([
      client.getPurchaseOrder(row.id),
      client.getProducts(),
      client.getSuppliers(),
      client.getWarehouses(),
    ]);
    setProducts(productList.filter((p) => p.isActive));
    setSuppliers(supplierList);
    setWarehouses(warehouseList.filter((w) => w.isActive));
    setEditingOrder(order);
    setEditSupplierId(order.supplierId ?? order.supplier.id);
    setEditWarehouseId(order.warehouseId ?? order.warehouse?.id ?? '');
    setEditLines(
      (order.lines ?? []).map((l) => ({
        productId: l.productId,
        description: l.description,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice),
      })),
    );
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingOrder) return;
    setError('');
    const validLines = editLines.filter((l) => l.productId && l.quantity > 0);
    if (validLines.length === 0) {
      setError(t('lineItems.required'));
      return;
    }
    try {
      await client.updatePurchaseOrder(editingOrder.id, {
        supplierId: editSupplierId,
        warehouseId: editWarehouseId,
        lines: validLines,
      });
      setEditingOrder(null);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    }
  }

  async function handleCancel() {
    if (!cancelTarget) return;
    try {
      await client.cancelPurchaseOrder(cancelTarget.id);
      setMessage(t('purchasing.cancelled'));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t('errors.generic'));
    } finally {
      setCancelTarget(null);
      setRefreshKey((k) => k + 1);
    }
  }

  async function openReceive(row: PurchaseOrderRow) {
    setApprovalBlocked(null);
    const approval = await client.getApprovalForSource('purchasing', 'order', row.id).catch(() => null);
    if (approval && approval.status !== 'approved') {
      setApprovalBlocked(t('purchasing.pendingApproval', { status: approval.status }));
    }
    const order = await client.getPurchaseOrder(row.id);
    const initial: Record<string, number> = {};
    for (const line of order.lines ?? []) {
      initial[line.id] = Number(line.quantity) - Number(line.receivedQty);
    }
    setReceiveQtys(initial);
    setReceiveOrder(order);
  }

  async function handleReceiveSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!receiveOrder) return;
    const receiveLines = Object.entries(receiveQtys)
      .filter(([, qty]) => qty > 0)
      .map(([lineId, quantity]) => ({ lineId, quantity }));
    try {
      await client.receivePurchaseOrder(receiveOrder.id, receiveLines);
      setMessage(t('purchasing.received'));
      setReceiveOrder(null);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t('errors.generic'));
    }
  }

  async function payOrder(row: PurchaseOrderRow) {
    if (!user?.branchId || !row.supplier?.id) return;
    try {
      await client.recordSupplierPayment({
        branchId: user.branchId,
        supplierId: row.supplier.id,
        purchaseOrderId: row.id,
        amount: Number(row.total),
      });
      setMessage(t('purchasing.paid'));
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
        exportFilename="purchase-orders"
        columns={[
          { key: 'number', label: t('purchasing.number') },
          { key: 'supplier', label: t('nav.suppliers'), render: (r) => r.supplier?.name ?? '—', exportValue: (r) => r.supplier?.name ?? '' },
          { key: 'status', label: t('common.status'), render: (r) => <StatusBadge status={r.status} /> },
          {
            key: 'total',
            label: t('sales.total'),
            align: 'end',
            render: (r) => formatCurrency(Number(r.total), user?.currency ?? 'EGP'),
            exportValue: (r) => Number(r.total),
          },
          {
            key: 'actions',
            label: t('common.actions'),
            exportValue: () => '',
            render: (r) => (
              <div className="row-actions">
                {r.status === 'draft' ? (
                  <>
                    <button type="button" className="btn-link" onClick={() => void openEdit(r)}>{t('common.edit')}</button>
                    <button type="button" className="btn-link btn-link--danger" onClick={() => setCancelTarget(r)}>{t('common.delete')}</button>
                  </>
                ) : null}
                {r.status === 'draft' || r.status === 'partially_received' ? (
                  <button type="button" className="btn-link" onClick={() => void openReceive(r)}>
                    {t('purchasing.receive')}
                  </button>
                ) : null}
                {r.status === 'received' ? (
                  <button type="button" className="btn-link" onClick={() => void payOrder(r)}>
                    {t('purchasing.pay')}
                  </button>
                ) : null}
              </div>
            ),
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

      <Modal open={!!editingOrder} title={t('purchasing.editOrder')} onClose={() => setEditingOrder(null)}>
        <form onSubmit={(e) => void handleSaveEdit(e)}>
          <FormField label={t('nav.suppliers')}>
            <select className="select-input" value={editSupplierId} onChange={(e) => setEditSupplierId(e.target.value)} required>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </FormField>
          <FormField label={t('nav.warehouses')}>
            <select className="select-input" value={editWarehouseId} onChange={(e) => setEditWarehouseId(e.target.value)} required>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </FormField>
          <LineItemsEditor lines={editLines} products={products} onChange={setEditLines} />
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn btn-primary" style={{ marginTop: 16 }}>{t('common.save')}</button>
        </form>
      </Modal>

      <Modal open={!!receiveOrder} title={t('purchasing.receive')} onClose={() => setReceiveOrder(null)}>
        {approvalBlocked ? (
          <p className="form-error">{approvalBlocked}</p>
        ) : (
          <form onSubmit={(e) => void handleReceiveSubmit(e)}>
            {(receiveOrder?.lines ?? []).map((line) => {
              const remaining = Number(line.quantity) - Number(line.receivedQty);
              if (remaining <= 0) return null;
              return (
                <FormField key={line.id} label={`${line.product?.name ?? line.description} (${t('purchasing.remaining')}: ${remaining})`}>
                  <input
                    className="form-input"
                    type="number"
                    min={0}
                    max={remaining}
                    step="0.01"
                    value={receiveQtys[line.id] ?? 0}
                    onChange={(e) => setReceiveQtys({ ...receiveQtys, [line.id]: Number(e.target.value) })}
                  />
                </FormField>
              );
            })}
            <button type="submit" className="btn btn-primary" style={{ marginTop: 16 }}>{t('purchasing.receive')}</button>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={!!cancelTarget}
        title={t('purchasing.confirmCancelTitle')}
        message={t('common.confirmDeleteMessage')}
        onConfirm={() => void handleCancel()}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  );
}
