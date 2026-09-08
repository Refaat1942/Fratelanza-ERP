import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormField, PageHeader, StatusBadge, useApiClient } from '../components/DataTable';
import type { ConstructionProgressRow } from '../lib/api';

export function ConstructionProgressPage() {
  const { t } = useTranslation();
  const client = useApiClient();
  const [rows, setRows] = useState<ConstructionProgressRow[]>([]);
  const [contracts, setContracts] = useState<Array<{ id: string; number: string }>>([]);
  const [boqs, setBoqs] = useState<Array<{ id: string; number: string; revisionNumber: number }>>([]);
  const [contractId, setContractId] = useState('');
  const [boqId, setBoqId] = useState('');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [currentQty, setCurrentQty] = useState('10');
  const [selectedProgressId, setSelectedProgressId] = useState('');
  const [boqItemId, setBoqItemId] = useState('');
  const [error, setError] = useState('');

  async function refresh() {
    const list = await client.getConstructionProgress(contractId || undefined);
    setRows(list);
  }

  useEffect(() => {
    void client.getConstructionContracts().then(setContracts).catch(() => undefined);
  }, [client]);

  useEffect(() => {
    if (!contractId) {
      setBoqs([]);
      return;
    }
    void client.getConstructionBoqs(contractId).then(setBoqs).catch(() => undefined);
  }, [client, contractId]);

  useEffect(() => {
    void refresh().catch((err) => {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    });
  }, [contractId]);

  async function createProgress(e: React.FormEvent) {
    e.preventDefault();
    await client.createConstructionProgress({
      contractId,
      boqId,
      periodFrom,
      periodTo,
    });
    await refresh();
  }

  async function loadDetail(id: string) {
    setSelectedProgressId(id);
    const detail = await client.getConstructionProgressDetail(id);
    setBoqItemId(detail.items?.[0]?.boqItemId ?? '');
    const boq = await client.getConstructionBoq(detail.boq?.id ?? boqId);
    setBoqItemId(boq.items?.[0]?.id ?? '');
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProgressId || !boqItemId) return;
    await client.createConstructionProgressItem(selectedProgressId, {
      boqItemId,
      currentPeriodQuantity: currentQty,
    });
    await loadDetail(selectedProgressId);
    await refresh();
  }

  async function submitProgress() {
    if (!selectedProgressId) return;
    await client.submitConstructionProgress(selectedProgressId);
    await loadDetail(selectedProgressId);
    await refresh();
  }

  async function approveProgress() {
    if (!selectedProgressId) return;
    await client.approveConstructionProgress(selectedProgressId);
    await loadDetail(selectedProgressId);
    await refresh();
  }

  return (
    <div>
      <PageHeader
        title={t('nav.constructionProgress')}
        breadcrumbs={[{ label: t('nav.constructionProgress') }]}
      />
      {error && <p className="form-error">{error}</p>}
      <div className="card">
        <form onSubmit={(e) => void createProgress(e)}>
          <FormField label={t('construction.contractNumber')}>
            <select className="form-input" value={contractId} onChange={(e) => setContractId(e.target.value)} required>
              <option value="">{t('common.select')}</option>
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>{c.number}</option>
              ))}
            </select>
          </FormField>
          <FormField label={t('construction.boq')}>
            <select className="form-input" value={boqId} onChange={(e) => setBoqId(e.target.value)} required>
              <option value="">{t('common.select')}</option>
              {boqs.map((b) => (
                <option key={b.id} value={b.id}>{b.number} R{b.revisionNumber}</option>
              ))}
            </select>
          </FormField>
          <FormField label={t('construction.periodFrom')}>
            <input className="form-input" type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} required />
          </FormField>
          <FormField label={t('construction.periodTo')}>
            <input className="form-input" type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} required />
          </FormField>
          <button type="submit" className="btn btn-primary">{t('construction.createProgress')}</button>
        </form>
      </div>
      <div className="card">
        <ul>
          {rows.map((row) => (
            <li key={row.id}>
              <button type="button" className="btn btn-ghost" onClick={() => void loadDetail(row.id)}>
                {row.number} — <StatusBadge status={row.status} /> — {row.totalCurrentAmount}
              </button>
            </li>
          ))}
        </ul>
        {selectedProgressId && (
          <form onSubmit={(e) => void addItem(e)}>
            <FormField label={t('construction.quantity')}>
              <input className="form-input" value={currentQty} onChange={(e) => setCurrentQty(e.target.value)} />
            </FormField>
            <button type="submit" className="btn btn-secondary">{t('construction.addProgressItem')}</button>
            <button type="button" className="btn btn-secondary" onClick={() => void submitProgress()}>{t('construction.submitProgress')}</button>
            <button type="button" className="btn btn-primary" onClick={() => void approveProgress()}>{t('construction.approveProgress')}</button>
          </form>
        )}
      </div>
    </div>
  );
}
