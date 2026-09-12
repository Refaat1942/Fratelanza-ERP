import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DataTable, FormActions, FormField, Modal, PageHeader, StatusBadge, useApiClient,
} from '../components/DataTable';
import { PageState } from '../components/PageState';
import { BarChart } from '../components/ui/Charts';
import { formatCurrency } from '../lib/format';
import { useAuthStore } from '../stores';
import type { HrEmployeeRow, OrgChartNode } from '../lib/api';

function OrgChartTree({ nodes }: { nodes: OrgChartNode[] }) {
  return (
    <ul>
      {nodes.map((node) => (
        <li key={node.id}>
          <div className="org-node">
            <span className="org-node__name">{node.firstName} {node.lastName}</span>
            <span className="org-node__title">{node.position?.title ?? node.department?.name ?? '—'}</span>
          </div>
          {node.reports.length > 0 && <OrgChartTree nodes={node.reports} />}
        </li>
      ))}
    </ul>
  );
}

export function HrPage() {
  const { t } = useTranslation();
  const client = useApiClient();
  const user = useAuthStore((s) => s.user);
  const [refreshKey, setRefreshKey] = useState(0);

  const [orgChart, setOrgChart] = useState<{ tree: OrgChartNode[]; headcount: Array<{ department: string; count: number }>; totalActive: number } | null>(null);
  const [orgLoading, setOrgLoading] = useState(true);

  const [editingEmployee, setEditingEmployee] = useState<HrEmployeeRow | null>(null);
  const [employeeForm, setEmployeeForm] = useState({ firstName: '', lastName: '', email: '', phone: '', basicSalary: 0 });
  const [error, setError] = useState('');

  const loadOrgChart = useCallback(async () => {
    setOrgLoading(true);
    try {
      setOrgChart(await client.getHrOrgChart());
    } finally {
      setOrgLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadOrgChart();
  }, [loadOrgChart, refreshKey]);

  function openEdit(employee: HrEmployeeRow) {
    setEditingEmployee(employee);
    setEmployeeForm({
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.email ?? '',
      phone: employee.phone ?? '',
      basicSalary: Number(employee.basicSalary),
    });
  }

  async function handleSaveEmployee(e: React.FormEvent) {
    e.preventDefault();
    if (!editingEmployee) return;
    setError('');
    try {
      await client.updateHrEmployee(editingEmployee.id, employeeForm);
      setEditingEmployee(null);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    }
  }

  return (
    <div>
      <PageHeader title={t('nav.hr')} subtitle={t('modules.hr.description')} />

      <h2 className="module-card-title">{t('hr.employees')}</h2>
      <div style={{ marginBottom: '2rem' }}>
        <DataTable<HrEmployeeRow>
          refreshKey={refreshKey}
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
            {
              key: 'actions',
              label: t('common.actions'),
              exportValue: () => '',
              render: (row) => (
                <button type="button" className="btn-link" onClick={() => openEdit(row)}>{t('common.edit')}</button>
              ),
            },
          ]}
        />
      </div>

      <h2 className="module-card-title">{t('hr.orgChart')}</h2>
      {orgLoading ? (
        <PageState variant="loading" />
      ) : orgChart && orgChart.tree.length > 0 ? (
        <div className="org-chart" style={{ marginBottom: '2rem' }}>
          <OrgChartTree nodes={orgChart.tree} />
        </div>
      ) : (
        <p className="page-subtitle" style={{ marginBottom: '2rem' }}>{t('common.noDataHint')}</p>
      )}

      {orgChart && orgChart.headcount.length > 0 && (
        <>
          <h2 className="module-card-title">{t('hr.headcountByDepartment')}</h2>
          <div className="card card--flat" style={{ padding: '1rem', marginBottom: '2rem' }}>
            <BarChart data={orgChart.headcount.map((h) => ({ label: h.department, value: h.count }))} />
          </div>
        </>
      )}

      <Modal open={!!editingEmployee} title={t('hr.editEmployee')} onClose={() => setEditingEmployee(null)}>
        <form onSubmit={(e) => void handleSaveEmployee(e)}>
          {error && <p className="form-error">{error}</p>}
          <FormField label={t('users.name')} required>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input className="form-input" value={employeeForm.firstName} onChange={(e) => setEmployeeForm({ ...employeeForm, firstName: e.target.value })} required />
              <input className="form-input" value={employeeForm.lastName} onChange={(e) => setEmployeeForm({ ...employeeForm, lastName: e.target.value })} required />
            </div>
          </FormField>
          <FormField label={t('auth.email')}>
            <input className="form-input" type="email" value={employeeForm.email} onChange={(e) => setEmployeeForm({ ...employeeForm, email: e.target.value })} />
          </FormField>
          <FormField label={t('bank.accountNumber')}>
            <input className="form-input" value={employeeForm.phone} onChange={(e) => setEmployeeForm({ ...employeeForm, phone: e.target.value })} />
          </FormField>
          <FormField label={t('hr.salary')}>
            <input className="form-input" type="number" min={0} step="0.01" value={employeeForm.basicSalary} onChange={(e) => setEmployeeForm({ ...employeeForm, basicSalary: Number(e.target.value) })} />
          </FormField>
          <FormActions>
            <button type="submit" className="btn btn-primary">{t('common.save')}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setEditingEmployee(null)}>{t('common.cancel')}</button>
          </FormActions>
        </form>
      </Modal>
    </div>
  );
}
