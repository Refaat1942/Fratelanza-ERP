import { useTranslation } from 'react-i18next';
import { DataTable, PageHeader, StatusBadge } from '../components/DataTable';
import { formatCurrency } from '../lib/format';
import { useAuthStore } from '../stores';
import type { AssetRow } from '../lib/api';

export function AssetsPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);

  return (
    <div>
      <PageHeader title={t('nav.assets')} subtitle={t('modules.assets.description')} />
      <DataTable<AssetRow>
        exportFilename="assets"
        fetchData={(c) => c.getAssets()}
        columns={[
          { key: 'code', label: t('customers.code') },
          { key: 'name', label: t('products.name') },
          { key: 'status', label: t('common.status'), render: (row) => <StatusBadge status={row.status} /> },
          {
            key: 'acquisitionCost',
            label: t('assets.cost'),
            align: 'end',
            render: (row) => formatCurrency(Number(row.acquisitionCost), user?.currency ?? 'EGP'),
            exportValue: (row) => Number(row.acquisitionCost),
          },
        ]}
      />
    </div>
  );
}
