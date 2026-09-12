import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader, useApiClient } from '../components/DataTable';
import { formatCurrency } from '../lib/format';

export function BankPage() {
  const { t } = useTranslation();
  const client = useApiClient();
  const [rows, setRows] = useState<Array<{ id: string; name: string; bankName: string; accountNumber?: string | null; currencyCode?: string | null; openingBalance?: number | string }>>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await client.getBankAccounts());
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <PageHeader title={t('nav.bank')} subtitle={t('modules.bank.description')} />
      {loading ? (
        <p>{t('common.loading')}</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('bank.account')}</th>
                <th>{t('bank.bankName')}</th>
                <th>{t('bank.accountNumber')}</th>
                <th>{t('customers.balance')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>{row.bankName}</td>
                  <td>{row.accountNumber ?? '—'}</td>
                  <td className="stat-card-value">{formatCurrency(Number(row.openingBalance ?? 0), row.currencyCode ?? 'EGP')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
