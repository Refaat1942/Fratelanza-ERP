import { useTranslation } from 'react-i18next';
import { DataTable, PageHeader, StatusBadge } from '../components/DataTable';
import { formatCurrency } from '../lib/format';
import { useAuthStore } from '../stores';
import type { HrEmployeeRow } from '../lib/api';

export function HrPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);

  return (
    <div>
      <PageHeader title={t('nav.hr')} subtitle={t('modules.hr.description')} />
      <DataTable<HrEmployeeRow>
        exportFilename="employees"
        fetchData={(c) => c.getHrEmployees()}
        columns={[
          { key: 'code', label: t('customers.code') },
          {
            key: 'name',
            label: t('users.name'),
            render: (row) => `${row.firstName} ${row.lastName}`,
            exportValue: (row) => `${row.firstName} ${row.lastName}`,
          },
          {
            key: 'department',
            label: t('users.role'),
            render: (row) => row.department?.name ?? '—',
            exportValue: (row) => row.department?.name ?? '',
          },
          { key: 'status', label: t('common.status'), render: (row) => <StatusBadge status={row.status} /> },
          {
            key: 'basicSalary',
            label: t('hr.salary'),
            align: 'end',
            render: (row) => formatCurrency(Number(row.basicSalary), user?.currency ?? 'EGP'),
            exportValue: (row) => Number(row.basicSalary),
          },
        ]}
      />
    </div>
  );
}
