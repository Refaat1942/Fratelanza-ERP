import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ConfirmDialog, DataTable, FormActions, FormField, Modal, PageHeader, useApiClient,
} from '../components/DataTable';
import { LineChart } from '../components/ui/Charts';
import type { CurrencyRow, ExchangeRateRow } from '../lib/api';

export function CurrencyPage() {
  const { t } = useTranslation();
  const client = useApiClient();
  const [refreshKey, setRefreshKey] = useState(0);

  const [currencies, setCurrencies] = useState<CurrencyRow[]>([]);
  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [rateForm, setRateForm] = useState({ fromCurrency: '', toCurrency: '', rate: 0 });
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ExchangeRateRow | null>(null);

  const [trendPair, setTrendPair] = useState<{ from: string; to: string } | null>(null);
  const [trend, setTrend] = useState<Array<{ asOfDate: string; rate: string }>>([]);

  const loadCurrencies = useCallback(async () => {
    setCurrencies(await client.getCurrencies());
  }, [client]);

  useEffect(() => {
    void loadCurrencies();
  }, [loadCurrencies]);

  useEffect(() => {
    if (!trendPair) return;
    client.getCurrencyRateTrend(trendPair.from, trendPair.to).then(setTrend);
  }, [trendPair, client]);

  function openAddRate() {
    const base = currencies.find((c) => c.isBase)?.code ?? '';
    setRateForm({ fromCurrency: '', toCurrency: base, rate: 0 });
    setRateModalOpen(true);
  }

  async function handleSaveRate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await client.recordCurrencyRate(rateForm);
      setRateModalOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    }
  }

  async function handleDeleteRate() {
    if (!deleteTarget) return;
    await client.deleteCurrencyRate(deleteTarget.id);
    setDeleteTarget(null);
    setRefreshKey((k) => k + 1);
  }

  return (
    <div>
      <PageHeader title={t('nav.currency')} subtitle={t('modules.currency.description')} />
      <h2 className="module-card-title">{t('currency.currencies')}</h2>
      <div style={{ marginBottom: '2rem' }}>
        <DataTable<CurrencyRow>
          refreshKey={refreshKey}
          exportFilename="currencies"
          fetchData={(c) => c.getCurrencies()}
          columns={[
            { key: 'code', label: t('customers.code') },
            { key: 'name', label: t('customers.name') },
            {
              key: 'isBase',
              label: t('currency.base'),
              render: (row) => (row.isBase ? t('common.yes') : t('common.no')),
              exportValue: (row) => (row.isBase ? t('common.yes') : t('common.no')),
            },
          ]}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 className="module-card-title">{t('currency.rates')}</h2>
        <button type="button" className="btn btn-primary btn--sm" onClick={openAddRate}>{t('currency.addRate')}</button>
      </div>
      <DataTable<ExchangeRateRow>
        refreshKey={refreshKey}
        exportFilename="exchange-rates"
        fetchData={(c) => c.getCurrencyRates()}
        columns={[
          { key: 'fromCurrency', label: t('currency.from') },
          { key: 'toCurrency', label: t('currency.to') },
          {
            key: 'rate',
            label: t('currency.rate'),
            align: 'end',
            render: (row) => Number(row.rate),
            exportValue: (row) => Number(row.rate),
          },
          {
            key: 'asOfDate',
            label: t('accounting.journalDate'),
            render: (row) => row.asOfDate.slice(0, 10),
            exportValue: (row) => row.asOfDate.slice(0, 10),
          },
          {
            key: 'actions',
            label: t('common.actions'),
            exportValue: () => '',
            render: (row) => (
              <div className="row-actions">
                <button type="button" className="btn-link" onClick={() => setTrendPair({ from: row.fromCurrency, to: row.toCurrency })}>{t('currency.viewTrend')}</button>
                <button type="button" className="btn-link btn-link--danger" onClick={() => setDeleteTarget(row)}>{t('common.delete')}</button>
              </div>
            ),
          },
        ]}
      />

      <Modal open={rateModalOpen} title={t('currency.addRate')} onClose={() => setRateModalOpen(false)}>
        <form onSubmit={(e) => void handleSaveRate(e)}>
          {error && <p className="form-error">{error}</p>}
          <FormField label={t('currency.from')} required>
            <input className="form-input" value={rateForm.fromCurrency} onChange={(e) => setRateForm({ ...rateForm, fromCurrency: e.target.value.toUpperCase() })} placeholder="USD" required maxLength={3} />
          </FormField>
          <FormField label={t('currency.to')} required>
            <input className="form-input" value={rateForm.toCurrency} onChange={(e) => setRateForm({ ...rateForm, toCurrency: e.target.value.toUpperCase() })} placeholder="EGP" required maxLength={3} />
          </FormField>
          <FormField label={t('currency.rate')} required>
            <input className="form-input" type="number" min={0} step="0.0001" value={rateForm.rate} onChange={(e) => setRateForm({ ...rateForm, rate: Number(e.target.value) })} required />
          </FormField>
          <FormActions>
            <button type="submit" className="btn btn-primary">{t('common.save')}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setRateModalOpen(false)}>{t('common.cancel')}</button>
          </FormActions>
        </form>
      </Modal>

      <Modal open={!!trendPair} title={trendPair ? `${trendPair.from} → ${trendPair.to}` : ''} onClose={() => setTrendPair(null)}>
        {trend.length < 2 ? (
          <p>{t('currency.notEnoughHistory')}</p>
        ) : (
          <LineChart points={trend.map((p) => ({ x: p.asOfDate, y: Number(p.rate) }))} />
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title={t('common.confirmDeleteTitle')}
        message={t('common.confirmDeleteMessage')}
        onConfirm={() => void handleDeleteRate()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
