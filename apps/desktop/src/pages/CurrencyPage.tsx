import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader, useApiClient } from '../components/DataTable';

export function CurrencyPage() {
  const { t } = useTranslation();
  const client = useApiClient();
  const [currencies, setCurrencies] = useState<Array<{ id: string; code: string; name: string; symbol?: string | null; isBase: boolean }>>([]);
  const [rates, setRates] = useState<Array<{ fromCurrency: string; toCurrency: string; rate: number | string; asOfDate: string }>>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [currencyRows, rateRows] = await Promise.all([client.getCurrencies(), client.getCurrencyRates()]);
      setCurrencies(currencyRows);
      setRates(rateRows);
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <PageHeader title={t('nav.currency')} subtitle={t('modules.currency.description')} />
      {loading ? (
        <p>{t('common.loading')}</p>
      ) : (
        <>
          <h2 className="module-card-title">{t('currency.currencies')}</h2>
          <div className="table-wrap" style={{ marginBottom: '2rem' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('customers.code')}</th>
                  <th>{t('customers.name')}</th>
                  <th>{t('currency.base')}</th>
                </tr>
              </thead>
              <tbody>
                {currencies.map((row) => (
                  <tr key={row.id}>
                    <td>{row.code}</td>
                    <td>{row.name}</td>
                    <td>{row.isBase ? t('common.yes') : t('common.no')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h2 className="module-card-title">{t('currency.rates')}</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('currency.from')}</th>
                  <th>{t('currency.to')}</th>
                  <th>{t('currency.rate')}</th>
                  <th>{t('accounting.journalDate')}</th>
                </tr>
              </thead>
              <tbody>
                {rates.map((row, index) => (
                  <tr key={`${row.fromCurrency}-${row.toCurrency}-${index}`}>
                    <td>{row.fromCurrency}</td>
                    <td>{row.toCurrency}</td>
                    <td className="stat-card-value">{Number(row.rate)}</td>
                    <td>{row.asOfDate.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
