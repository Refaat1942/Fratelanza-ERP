import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, PageHeader, useApiClient } from '../components/DataTable';
import type { TrialBalanceRow } from '../lib/api';

type JournalRow = { id: string; number: string; entryDate: string; description: string };

export function AccountingPage() {
  const { t } = useTranslation();
  const client = useApiClient();
  const [refreshKey, setRefreshKey] = useState(0);
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState<'trial' | 'journals'>('trial');

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
      <div className="page-toolbar" style={{ marginBottom: 'var(--frz-space-4)' }}>
        <button
          type="button"
          className={`btn btn--sm ${tab === 'trial' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setTab('trial')}
        >
          {t('accounting.trialBalance')}
        </button>
        <button
          type="button"
          className={`btn btn--sm ${tab === 'journals' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setTab('journals')}
        >
          {t('accounting.journals')}
        </button>
      </div>
      {message && <p style={{ marginBottom: 12 }}>{message}</p>}
      {tab === 'trial' ? (
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
      ) : (
        <DataTable<JournalRow>
          refreshKey={refreshKey}
          columns={[
            { key: 'number', label: t('accounting.journalNumber') },
            {
              key: 'entryDate',
              label: t('accounting.journalDate'),
              render: (r) => new Date(r.entryDate).toLocaleDateString(),
            },
            { key: 'description', label: t('accounting.description') },
          ]}
          fetchData={async (c) => {
            const rows = await c.getJournalEntries();
            return rows.map((row) => ({ ...row, id: row.id }));
          }}
        />
      )}
    </div>
  );
}
