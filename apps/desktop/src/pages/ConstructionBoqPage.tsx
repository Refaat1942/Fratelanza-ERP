import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FormField, PageHeader, PageToolbar, useApiClient } from '../components/DataTable';
import type { ConstructionBoqRow } from '../lib/api';

export function ConstructionBoqPage() {
  const { contractId = '' } = useParams();
  const { t } = useTranslation();
  const client = useApiClient();
  const [boqs, setBoqs] = useState<ConstructionBoqRow[]>([]);
  const [selectedBoqId, setSelectedBoqId] = useState('');
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof client.getConstructionBoq>> | null>(null);
  const [error, setError] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [itemQty, setItemQty] = useState('1');
  const [itemRate, setItemRate] = useState('100');

  async function refresh() {
    const list = await client.getConstructionBoqs(contractId);
    setBoqs(list);
    const active = selectedBoqId || list[0]?.id;
    if (active) {
      setSelectedBoqId(active);
      setDetail(await client.getConstructionBoq(active));
    }
  }

  useEffect(() => {
    if (!contractId) return;
    void refresh().catch((err) => {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    });
  }, [contractId, selectedBoqId]);

  async function createBoq() {
    await client.createConstructionBoq(contractId, {});
    await refresh();
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedBoqId) return;
    await client.createConstructionBoqItem(selectedBoqId, {
      description: itemDescription,
      plannedQuantity: itemQty,
      unitRate: itemRate,
    });
    setItemDescription('');
    await refresh();
  }

  async function approveBoq() {
    if (!selectedBoqId) return;
    await client.approveConstructionBoq(selectedBoqId);
    await refresh();
  }

  async function reviseBoq() {
    if (!selectedBoqId) return;
    await client.reviseConstructionBoq(selectedBoqId);
    await refresh();
  }

  return (
    <div>
      <PageHeader
        title={t('construction.boqEditor')}
        breadcrumbs={[
          { label: t('nav.constructionContracts'), to: '/construction/contracts' },
          { label: t('construction.boqEditor') },
        ]}
      />
      {error && <p className="form-error">{error}</p>}
      <PageToolbar>
        <button type="button" className="btn btn-secondary" onClick={() => void createBoq()}>
          {t('construction.createBoq')}
        </button>
        <select
          className="input"
          value={selectedBoqId}
          onChange={(e) => setSelectedBoqId(e.target.value)}
        >
          {boqs.map((b) => (
            <option key={b.id} value={b.id}>
              {b.number} R{b.revisionNumber} ({b.status})
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-primary" onClick={() => void approveBoq()}>
          {t('construction.approveBoq')}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => void reviseBoq()}>
          {t('construction.reviseBoq')}
        </button>
      </PageToolbar>
      {detail && (
        <div className="card">
          <p>{t('construction.total')}: {detail.totalOriginalAmount}</p>
          <ul>
            {detail.items?.map((item) => (
              <li key={item.id}>
                {item.description} — {item.plannedQuantity} × {item.unitRate} = {item.originalAmount}
              </li>
            ))}
          </ul>
          {detail.status === 'draft' && (
            <form onSubmit={(e) => void addItem(e)}>
              <FormField label={t('construction.itemDescription')}>
                <input
                  className="form-input"
                  value={itemDescription}
                  onChange={(e) => setItemDescription(e.target.value)}
                  required
                />
              </FormField>
              <FormField label={t('construction.quantity')}>
                <input className="form-input" value={itemQty} onChange={(e) => setItemQty(e.target.value)} />
              </FormField>
              <FormField label={t('construction.unitRate')}>
                <input className="form-input" value={itemRate} onChange={(e) => setItemRate(e.target.value)} />
              </FormField>
              <button type="submit" className="btn btn-primary">{t('construction.addItem')}</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
