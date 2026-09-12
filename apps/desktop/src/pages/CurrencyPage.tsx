import { useTranslation } from 'react-i18next';
import { DataTable, PageHeader } from '../components/DataTable';
import type { CurrencyRow, ExchangeRateRow } from '../lib/api';

export function CurrencyPage() {
  const { t } = useTranslation();

  return (
    <div>
      <PageHeader title={t('nav.currency')} subtitle={t('modules.currency.description')} />
      <h2 className="module-card-title">{t('currency.currencies')}</h2>
      <div style={{ marginBottom: '2rem' }}>
        <DataTable<CurrencyRow>
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
      <h2 className="module-card-title">{t('currency.rates')}</h2>
      <DataTable<ExchangeRateRow>
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
        ]}
      />
    </div>
  );
}
