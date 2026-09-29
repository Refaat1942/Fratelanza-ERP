import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, FormField, PageHeader, useApiClient } from '../components/DataTable';
import { formatCurrency } from '../lib/format';
import { useAuthStore } from '../stores';
import type { AccountAmountRow, BalanceSheetResult, IncomeStatementResult, TrialBalanceRow } from '../lib/api';

type JournalRow = { id: string; number: string; entryDate: string; description: string };
type Tab = 'trial' | 'journals' | 'income' | 'balance';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function startOfYearIso(): string {
  return `${new Date().getFullYear()}-01-01`;
}

export function AccountingPage() {
  const { t } = useTranslation();
  const client = useApiClient();
  const user = useAuthStore((s) => s.user);
  const currency = user?.currency ?? 'EGP';
  const [refreshKey, setRefreshKey] = useState(0);
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState<Tab>('trial');

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
      <div className="page-toolbar" style={{ marginBottom: 'var(--frz-space-4)', flexWrap: 'wrap' }}>
        {(['trial', 'journals', 'income', 'balance'] as Tab[]).map((key) => (
          <button
            key={key}
            type="button"
            className={`btn btn--sm ${tab === key ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setTab(key)}
          >
            {t(`accounting.tab.${key}`)}
          </button>
        ))}
      </div>
      {message && <p style={{ marginBottom: 12 }}>{message}</p>}
      {tab === 'trial' && (
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
      )}
      {tab === 'journals' && (
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
      {tab === 'income' && <IncomeStatementView currency={currency} />}
      {tab === 'balance' && <BalanceSheetView currency={currency} />}
    </div>
  );
}

function AmountTable({ rows, currency, emptyLabel }: { rows: AccountAmountRow[]; currency: string; emptyLabel: string }) {
  if (rows.length === 0) {
    return <p className="module-card-description" style={{ padding: 'var(--frz-space-2) 0' }}>{emptyLabel}</p>;
  }
  return (
    <table className="data-table">
      <tbody>
        {rows.map((row) => (
          <tr key={row.accountId}>
            <td style={{ color: 'var(--frz-color-text-secondary)' }}>{row.code}</td>
            <td>{row.name}</td>
            <td style={{ textAlign: 'end', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(row.amount, currency)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function IncomeStatementView({ currency }: { currency: string }) {
  const { t } = useTranslation();
  const client = useApiClient();
  const [startDate, setStartDate] = useState(startOfYearIso());
  const [endDate, setEndDate] = useState(todayIso());
  const [data, setData] = useState<IncomeStatementResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setData(await client.getIncomeStatement({ startDate, endDate }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div className="form-actions" style={{ borderTop: 'none', paddingTop: 0, marginTop: 0, marginBottom: 'var(--frz-space-5)' }}>
        <FormField label={t('accounting.startDate')}>
          <input className="form-input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </FormField>
        <FormField label={t('accounting.endDate')}>
          <input className="form-input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </FormField>
        <button type="button" className="btn btn-primary" onClick={() => void load()} disabled={loading}>
          {loading ? t('common.loading') : t('accounting.generate')}
        </button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {data && (
        <>
          <div className="card-grid" style={{ marginBottom: 'var(--frz-space-5)' }}>
            <div className="stat-card">
              <p className="stat-card-label">{t('accounting.totalRevenue')}</p>
              <p className="stat-card-value">{formatCurrency(data.totalRevenue, currency)}</p>
            </div>
            <div className="stat-card">
              <p className="stat-card-label">{t('accounting.grossProfit')}</p>
              <p className="stat-card-value">{formatCurrency(data.grossProfit, currency)}</p>
              <p className="module-card-description">{t('accounting.grossMargin')}: {data.grossMarginPct.toFixed(1)}%</p>
            </div>
            <div className="stat-card">
              <p className="stat-card-label">{t('accounting.netIncome')}</p>
              <p className="stat-card-value" style={{ color: data.netIncome >= 0 ? 'var(--frz-color-success)' : 'var(--frz-color-danger)' }}>
                {formatCurrency(data.netIncome, currency)}
              </p>
              <p className="module-card-description">{t('accounting.netMargin')}: {data.netMarginPct.toFixed(1)}%</p>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 'var(--frz-space-4)' }}>
            <h3 className="module-card-title" style={{ marginBottom: 'var(--frz-space-3)' }}>{t('accounting.revenue')}</h3>
            <AmountTable rows={data.revenue} currency={currency} emptyLabel={t('accounting.noActivity')} />
            <div className="settings-row" style={{ fontWeight: 'var(--frz-weight-semibold)' }}>
              <span>{t('accounting.totalRevenue')}</span>
              <span>{formatCurrency(data.totalRevenue, currency)}</span>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 'var(--frz-space-4)' }}>
            <h3 className="module-card-title" style={{ marginBottom: 'var(--frz-space-3)' }}>{t('accounting.cogs')}</h3>
            <AmountTable rows={data.cogs} currency={currency} emptyLabel={t('accounting.noActivity')} />
            <div className="settings-row" style={{ fontWeight: 'var(--frz-weight-semibold)' }}>
              <span>{t('accounting.totalCogs')}</span>
              <span>{formatCurrency(data.totalCogs, currency)}</span>
            </div>
            <div className="settings-row" style={{ fontWeight: 'var(--frz-weight-bold)', borderTop: '1px solid var(--frz-color-divider)' }}>
              <span>{t('accounting.grossProfit')}</span>
              <span>{formatCurrency(data.grossProfit, currency)}</span>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 'var(--frz-space-4)' }}>
            <h3 className="module-card-title" style={{ marginBottom: 'var(--frz-space-3)' }}>{t('accounting.operatingExpenses')}</h3>
            <AmountTable rows={data.expenses} currency={currency} emptyLabel={t('accounting.noActivity')} />
            <div className="settings-row" style={{ fontWeight: 'var(--frz-weight-semibold)' }}>
              <span>{t('accounting.totalExpenses')}</span>
              <span>{formatCurrency(data.totalExpenses, currency)}</span>
            </div>
            <div className="settings-row" style={{ fontWeight: 'var(--frz-weight-bold)', borderTop: '1px solid var(--frz-color-divider)' }}>
              <span>{t('accounting.netIncome')}</span>
              <span>{formatCurrency(data.netIncome, currency)}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function BalanceSheetView({ currency }: { currency: string }) {
  const { t } = useTranslation();
  const client = useApiClient();
  const [asOfDate, setAsOfDate] = useState(todayIso());
  const [data, setData] = useState<BalanceSheetResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setData(await client.getBalanceSheet({ asOfDate }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div className="form-actions" style={{ borderTop: 'none', paddingTop: 0, marginTop: 0, marginBottom: 'var(--frz-space-5)' }}>
        <FormField label={t('accounting.asOfDate')}>
          <input className="form-input" type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
        </FormField>
        <button type="button" className="btn btn-primary" onClick={() => void load()} disabled={loading}>
          {loading ? t('common.loading') : t('accounting.generate')}
        </button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {data && (
        <>
          {!data.isBalanced && (
            <p className="form-error" role="alert">{t('accounting.notBalanced')}</p>
          )}
          <div className="card-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))' }}>
            <div className="card">
              <h3 className="module-card-title" style={{ marginBottom: 'var(--frz-space-3)' }}>{t('accounting.assets')}</h3>
              <AmountTable rows={data.assets} currency={currency} emptyLabel={t('accounting.noActivity')} />
              <div className="settings-row" style={{ fontWeight: 'var(--frz-weight-bold)', borderTop: '1px solid var(--frz-color-divider)' }}>
                <span>{t('accounting.totalAssets')}</span>
                <span>{formatCurrency(data.totalAssets, currency)}</span>
              </div>
            </div>

            <div className="card">
              <h3 className="module-card-title" style={{ marginBottom: 'var(--frz-space-3)' }}>{t('accounting.liabilities')}</h3>
              <AmountTable rows={data.liabilities} currency={currency} emptyLabel={t('accounting.noActivity')} />
              <div className="settings-row" style={{ fontWeight: 'var(--frz-weight-semibold)' }}>
                <span>{t('accounting.totalLiabilities')}</span>
                <span>{formatCurrency(data.totalLiabilities, currency)}</span>
              </div>

              <h3 className="module-card-title" style={{ margin: 'var(--frz-space-4) 0 var(--frz-space-3)' }}>{t('accounting.equity')}</h3>
              <AmountTable rows={data.equity} currency={currency} emptyLabel={t('accounting.noActivity')} />
              <div className="settings-row">
                <span>{t('accounting.retainedEarnings')}</span>
                <span>{formatCurrency(data.retainedEarnings, currency)}</span>
              </div>
              <div className="settings-row" style={{ fontWeight: 'var(--frz-weight-semibold)' }}>
                <span>{t('accounting.totalEquity')}</span>
                <span>{formatCurrency(data.totalEquityWithEarnings, currency)}</span>
              </div>
              <div className="settings-row" style={{ fontWeight: 'var(--frz-weight-bold)', borderTop: '1px solid var(--frz-color-divider)' }}>
                <span>{t('accounting.totalLiabilitiesEquity')}</span>
                <span>{formatCurrency(data.totalLiabilitiesAndEquity, currency)}</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
