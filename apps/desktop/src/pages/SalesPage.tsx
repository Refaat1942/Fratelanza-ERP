import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, FormField, Modal, PageHeader, StatusBadge, useApiClient } from '../components/DataTable';
import { LineItemsEditor, type DocumentLineItem } from '../components/LineItemsEditor';
import type { PartyRow, SalesInvoiceRow } from '../lib/api';
import { useAuthStore } from '../stores';

type BuyerMode = 'customer' | 'party';

export function SalesPage() {
  const { t } = useTranslation();
  const client = useApiClient();
  const user = useAuthStore((s) => s.user);
  const [refreshKey, setRefreshKey] = useState(0);
  const [message, setMessage] = useState('');
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [buyerMode, setBuyerMode] = useState<BuyerMode>('customer');
  const [partyRoutingEnabled, setPartyRoutingEnabled] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [partyId, setPartyId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [lines, setLines] = useState<DocumentLineItem[]>([]);
  const [products, setProducts] = useState<Array<{ id: string; name: string; salePrice: number; sku?: string }>>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string }>>([]);
  const [parties, setParties] = useState<PartyRow[]>([]);
  const [warehouses, setWarehouses] = useState<Array<{ id: string; name: string }>>([]);
  const [salesPilotEnabled, setSalesPilotEnabled] = useState(false);
  const [postProjectId, setPostProjectId] = useState('');
  const [postCostCenterId, setPostCostCenterId] = useState('');
  const [projects, setProjects] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [costCenters, setCostCenters] = useState<Array<{ id: string; name: string; code: string }>>([]);

  useEffect(() => {
    void (async () => {
      const settings = await client.getSettings();
      const enabled = Boolean(
        (settings as { deploymentFlags?: { universalFinanceSalesPilotEnabled?: boolean } })
          ?.deploymentFlags?.universalFinanceSalesPilotEnabled,
      );
      setSalesPilotEnabled(enabled);
      if (enabled) {
        const [projectList, costCenterList] = await Promise.all([
          client.getProjects(),
          client.getCostCenters(),
        ]);
        setProjects(projectList);
        setCostCenters(costCenterList);
      }
    })();
  }, [client]);

  async function openForm() {
    setError('');
    const [productList, customerList, warehouseList, settings, partyList] = await Promise.all([
      client.getProducts(),
      client.getCustomers(),
      client.getWarehouses(),
      client.getSettings(),
      client.listParties(),
    ]);
    setProducts(productList.filter((p) => p.isActive));
    setCustomers(customerList);
    setWarehouses(warehouseList.filter((w) => w.isActive));
    setParties(
      partyList.filter((p) => p.roles?.some((r) => r.role === 'customer')),
    );
    setPartyRoutingEnabled(
      Boolean(
        (settings as { deploymentFlags?: { partyLegacyRoutingEnabled?: boolean } })
          ?.deploymentFlags?.partyLegacyRoutingEnabled,
      ),
    );
    setBuyerMode('customer');
    setCustomerId(customerList[0]?.id ?? '');
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
    const validLines = lines.filter((l) => l.productId && l.quantity > 0);
    if (validLines.length === 0) {
      setError(t('lineItems.required'));
      return;
    }
    try {
      const invoice =
        buyerMode === 'party' && partyRoutingEnabled
          ? await client.createSalesInvoiceFromParty({
              partyId,
              branchId: user.branchId,
              warehouseId: warehouseId || undefined,
              lines: validLines,
            })
          : await client.createSalesInvoice({
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
      const dimensions =
        salesPilotEnabled && (postProjectId || postCostCenterId)
          ? {
              ...(postProjectId ? { projectId: postProjectId } : {}),
              ...(postCostCenterId ? { costCenterId: postCostCenterId } : {}),
            }
          : undefined;
      await client.postSalesInvoice(id, dimensions);
      setMessage(t('sales.posted'));
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t('errors.generic'));
    }
  }

  async function payInvoice(row: SalesInvoiceRow) {
    if (!user?.branchId || !row.customer?.id) {
      setMessage(t('sales.paymentRequiresCustomer'));
      return;
    }
    try {
      await client.recordSalesPayment({
        branchId: user.branchId,
        customerId: row.customer.id,
        invoiceId: row.id,
        amount: Number(row.total),
      });
      setMessage(t('sales.paid'));
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t('errors.generic'));
    }
  }

  async function returnInvoice(id: string) {
    try {
      await client.returnSalesInvoice(id);
      setMessage(t('sales.returned'));
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t('errors.generic'));
    }
  }

  return (
    <div>
      <PageHeader
        title={t('nav.sales')}
        breadcrumbs={[{ label: t('nav.sales') }]}
        action={
          <button type="button" className="btn btn-primary" onClick={() => void openForm()}>
            {t('common.create')}
          </button>
        }
      />
      {message && <p style={{ marginBottom: 12 }}>{message}</p>}
      {salesPilotEnabled && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <FormField label={t('nav.projects')}>
            <select className="select-input" value={postProjectId} onChange={(e) => setPostProjectId(e.target.value)}>
              <option value="">—</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
              ))}
            </select>
          </FormField>
          <FormField label={t('nav.costCenters')}>
            <select className="select-input" value={postCostCenterId} onChange={(e) => setPostCostCenterId(e.target.value)}>
              <option value="">—</option>
              {costCenters.map((c) => (
                <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
              ))}
            </select>
          </FormField>
        </div>
      )}
      <DataTable<SalesInvoiceRow>
        refreshKey={refreshKey}
        columns={[
          { key: 'number', label: t('sales.number') },
          { key: 'customer', label: t('nav.customers'), render: (r) => r.customer?.name ?? '—' },
          { key: 'status', label: t('common.status'), render: (r) => <StatusBadge status={r.status} /> },
          { key: 'total', label: t('sales.total'), align: 'end', render: (r) => Number(r.total).toFixed(2) },
          {
            key: 'actions',
            label: t('common.actions'),
            render: (r) => (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {r.status === 'draft' ? (
                  <button type="button" className="btn btn-ghost" onClick={() => void postInvoice(r.id)}>
                    {t('sales.post')}
                  </button>
                ) : null}
                {r.status === 'posted' ? (
                  <>
                    <button type="button" className="btn btn-ghost" onClick={() => void payInvoice(r)}>
                      {t('sales.receivePayment')}
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => void returnInvoice(r.id)}>
                      {t('sales.return')}
                    </button>
                  </>
                ) : null}
              </div>
            ),
          },
        ]}
        fetchData={(c) => c.getSalesInvoices()}
      />
      <Modal open={open} title={t('sales.create')} onClose={() => setOpen(false)}>
        <form onSubmit={(e) => void handleCreate(e)}>
          {partyRoutingEnabled && (
            <FormField label={t('sales.buyerMode')}>
              <select
                className="select-input"
                value={buyerMode}
                onChange={(e) => setBuyerMode(e.target.value as BuyerMode)}
              >
                <option value="customer">{t('nav.customers')}</option>
                <option value="party">{t('nav.parties')}</option>
              </select>
            </FormField>
          )}
          {buyerMode === 'party' && partyRoutingEnabled ? (
            <FormField label={t('nav.parties')}>
              <select className="select-input" value={partyId} onChange={(e) => setPartyId(e.target.value)}>
                {parties.map((p) => (
                  <option key={p.id} value={p.id}>{p.displayName}</option>
                ))}
              </select>
            </FormField>
          ) : (
            <FormField label={t('nav.customers')}>
              <select className="select-input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">—</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </FormField>
          )}
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
