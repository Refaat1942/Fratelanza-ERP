import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DataTable, FormActions, FormField, Modal, PageHeader, StatusBadge, useApiClient,
} from '../components/DataTable';
import { formatCurrency } from '../lib/format';
import type { BankAccountRow, BankMatchSuggestion, BankStatementLineRow } from '../lib/api';

export function BankPage() {
  const { t } = useTranslation();
  const client = useApiClient();
  const [refreshKey, setRefreshKey] = useState(0);

  const [editingAccount, setEditingAccount] = useState<BankAccountRow | null>(null);
  const [form, setForm] = useState({ name: '', bankName: '', accountNumber: '' });
  const [error, setError] = useState('');

  const [selectedAccount, setSelectedAccount] = useState<BankAccountRow | null>(null);
  const [lines, setLines] = useState<BankStatementLineRow[]>([]);
  const [linesLoading, setLinesLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<BankMatchSuggestion[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);

  const loadLines = useCallback(async (accountId: string) => {
    setLinesLoading(true);
    try {
      setLines(await client.getBankStatementLines(accountId));
    } finally {
      setLinesLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (selectedAccount) void loadLines(selectedAccount.id);
  }, [selectedAccount, loadLines]);

  function openEdit(account: BankAccountRow) {
    setEditingAccount(account);
    setForm({ name: account.name, bankName: account.bankName, accountNumber: account.accountNumber ?? '' });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editingAccount) return;
    setError('');
    try {
      await client.updateBankAccount(editingAccount.id, form);
      setEditingAccount(null);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    }
  }

  async function handleSuggest() {
    if (!selectedAccount) return;
    setSuggestLoading(true);
    try {
      setSuggestions(await client.suggestBankMatches(selectedAccount.id));
    } finally {
      setSuggestLoading(false);
    }
  }

  async function acceptSuggestion(statementLineId: string, journalEntryId: string) {
    await client.matchBankStatementLine(statementLineId, journalEntryId);
    setSuggestions((prev) => prev.filter((s) => s.statementLineId !== statementLineId));
    if (selectedAccount) await loadLines(selectedAccount.id);
  }

  async function handleIgnore(lineId: string) {
    await client.ignoreBankStatementLine(lineId);
    if (selectedAccount) await loadLines(selectedAccount.id);
  }

  async function handleUnmatch(lineId: string) {
    await client.unmatchBankStatementLine(lineId);
    if (selectedAccount) await loadLines(selectedAccount.id);
  }

  return (
    <div>
      <PageHeader title={t('nav.bank')} subtitle={t('modules.bank.description')} />
      <DataTable<BankAccountRow>
        refreshKey={refreshKey}
        exportFilename="bank-accounts"
        fetchData={(c) => c.getBankAccounts()}
        columns={[
          { key: 'name', label: t('bank.account') },
          { key: 'bankName', label: t('bank.bankName') },
          {
            key: 'accountNumber',
            label: t('bank.accountNumber'),
            render: (row) => row.accountNumber ?? '—',
            exportValue: (row) => row.accountNumber ?? '',
          },
          {
            key: 'openingBalance',
            label: t('customers.balance'),
            align: 'end',
            render: (row) => formatCurrency(Number(row.openingBalance ?? 0), row.currencyCode ?? 'EGP'),
            exportValue: (row) => Number(row.openingBalance ?? 0),
          },
          {
            key: 'actions',
            label: t('common.actions'),
            exportValue: () => '',
            render: (row) => (
              <div className="row-actions">
                <button type="button" className="btn-link" onClick={() => { setSelectedAccount(row); setSuggestions([]); }}>{t('bank.viewStatements')}</button>
                <button type="button" className="btn-link" onClick={() => openEdit(row)}>{t('common.edit')}</button>
              </div>
            ),
          },
        ]}
      />

      {selectedAccount && (
        <div style={{ marginTop: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 className="module-card-title">{t('bank.statementLines')} · {selectedAccount.name}</h2>
            <button type="button" className="btn btn-primary btn--sm" onClick={() => void handleSuggest()} disabled={suggestLoading}>
              {suggestLoading ? t('common.loading') : t('bank.suggestMatches')}
            </button>
          </div>

          {suggestions.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              {suggestions.map((s) => (
                <div key={s.statementLineId} className="match-suggestion">
                  <div className="match-suggestion__header">
                    <strong>{s.description}</strong>
                    <span>{formatCurrency(Number(s.amount))} · {s.transactionDate}</span>
                  </div>
                  {s.suggestions.map((c) => (
                    <div key={c.journalEntryId} className="match-suggestion__candidate">
                      <span>{c.journalEntryNumber} — {c.journalEntryDescription ?? '—'} ({c.journalEntryDate})</span>
                      <span>
                        <span className={`confidence-badge confidence-badge--${c.confidence}`}>{t(`bank.confidence.${c.confidence}`)}</span>{' '}
                        <button type="button" className="btn-link" onClick={() => void acceptSuggestion(s.statementLineId, c.journalEntryId)}>{t('bank.accept')}</button>
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {linesLoading ? (
            <p>{t('common.loading')}</p>
          ) : lines.length === 0 ? (
            <p className="page-subtitle">{t('common.noDataHint')}</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('accounting.journalDate')}</th>
                    <th>{t('customers.name')}</th>
                    <th>{t('sales.total')}</th>
                    <th>{t('common.status')}</th>
                    <th>{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.id}>
                      <td>{line.transactionDate.slice(0, 10)}</td>
                      <td>{line.description}</td>
                      <td className="cell-numeric">{formatCurrency(Number(line.amount))}</td>
                      <td><StatusBadge status={line.status} /></td>
                      <td className="row-actions">
                        {line.status === 'matched' && (
                          <button type="button" className="btn-link" onClick={() => void handleUnmatch(line.id)}>{t('bank.unmatch')}</button>
                        )}
                        {line.status === 'unmatched' && (
                          <button type="button" className="btn-link" onClick={() => void handleIgnore(line.id)}>{t('bank.ignore')}</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <Modal open={!!editingAccount} title={t('bank.editAccount')} onClose={() => setEditingAccount(null)}>
        <form onSubmit={(e) => void handleSave(e)}>
          {error && <p className="form-error">{error}</p>}
          <FormField label={t('bank.account')} required>
            <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </FormField>
          <FormField label={t('bank.bankName')} required>
            <input className="form-input" value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} required />
          </FormField>
          <FormField label={t('bank.accountNumber')}>
            <input className="form-input" value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} />
          </FormField>
          <FormActions>
            <button type="submit" className="btn btn-primary">{t('common.save')}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setEditingAccount(null)}>{t('common.cancel')}</button>
          </FormActions>
        </form>
      </Modal>
    </div>
  );
}
