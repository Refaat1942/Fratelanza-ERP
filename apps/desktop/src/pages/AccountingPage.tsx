import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, PageHeader, useApiClient } from '../components/DataTable';
import type { TrialBalanceRow } from '../lib/api';
export function AccountingPage() {
  const { t } = useTranslation();
  const client = useApiClient();
  const [refreshKey, setRefreshKey] = useState(0);
  const [message, setMessage] = useState('');

  async function seedCoa() {
    try {
      const result = await client.seedChartOfAccounts();
      setMessage(t('accounting.seeded', { count: result.seeded }));
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t('errors.generic'));
    }
  }

  return (
    <div>
      <PageHeader
        title={t('nav.accounting')}
        subtitle={t('accounting.trialBalance')}
        breadcrumbs={[{ label: t('nav.accounting') }]}
        action={
          <button type="button" className="btn btn-primary" onClick={() => void seedCoa()}>
            {t('accounting.seedCoa')}
          </button>
        }
      />
      {message && <p style={{ marginBottom: 12 }}>{message}</p>}
      <DataTable<TrialBalanceRow & { id: string }>
        refreshKey={refreshKey}
        columns={[
          { key: 'code', label: t('accounting.code') },
          { key: 'name', label: t('accounting.name') },
          { key: 'debit', label: t('accounting.debit'), align: 'end', render: (r) => Number(r.debit).toFixed(2) },
          { key: 'credit', label: t('accounting.credit'), align: 'end', render: (r) => Number(r.credit).toFixed(2) },
        ]}
        fetchData={async (c) => {
          const result = await c.getTrialBalance();
          return result.accounts.map((row) => ({ ...row, id: row.code }));
        }}
      />
    </div>
  );
}
