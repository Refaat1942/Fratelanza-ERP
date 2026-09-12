import { useTranslation } from 'react-i18next';
import { DataTable, PageHeader } from '../components/DataTable';
import { formatCurrency } from '../lib/format';
import type { BankAccountRow } from '../lib/api';

export function BankPage() {
  const { t } = useTranslation();

  return (
    <div>
      <PageHeader title={t('nav.bank')} subtitle={t('modules.bank.description')} />
      <DataTable<BankAccountRow>
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
        ]}
      />
    </div>
  );
}
