import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, FormActions, FormField, Modal, PageHeader, StatusBadge, useApiClient } from '../components/DataTable';
import { formatCurrency } from '../lib/format';
import { useAuthStore } from '../stores';
import type { CrmLeadRow, CrmOpportunityRow } from '../lib/api';

export function CrmPage() {
  const { t } = useTranslation();
  const client = useApiClient();
  const user = useAuthStore((s) => s.user);
  const [refreshKey, setRefreshKey] = useState(0);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ contactName: '', companyName: '', email: '', phone: '' });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await client.createCrmLead(form);
      setOpen(false);
      setForm({ contactName: '', companyName: '', email: '', phone: '' });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    }
  }

  return (
    <div>
      <PageHeader
        title={t('nav.crm')}
        subtitle={t('modules.crm.description')}
        action={
          <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
            {t('crm.createLead')}
          </button>
        }
      />
      <h2 className="module-card-title">{t('crm.leads')}</h2>
      <div style={{ marginBottom: '2rem' }}>
        <DataTable<CrmLeadRow>
          refreshKey={refreshKey}
          exportFilename="crm-leads"
          fetchData={(c) => c.getCrmLeads()}
          columns={[
            { key: 'code', label: t('customers.code') },
            {
              key: 'contactName',
              label: t('customers.name'),
              render: (row) => (row.companyName ? `${row.contactName} · ${row.companyName}` : row.contactName),
              exportValue: (row) => (row.companyName ? `${row.contactName} · ${row.companyName}` : row.contactName),
            },
            { key: 'status', label: t('common.status'), render: (row) => <StatusBadge status={row.status} /> },
          ]}
        />
      </div>
      <h2 className="module-card-title">{t('crm.opportunities')}</h2>
      <DataTable<CrmOpportunityRow>
        exportFilename="crm-opportunities"
        fetchData={(c) => c.getCrmOpportunities()}
        columns={[
          { key: 'code', label: t('customers.code') },
          { key: 'name', label: t('customers.name') },
          { key: 'stage', label: t('common.status'), render: (row) => <StatusBadge status={row.stage} /> },
          {
            key: 'amount',
            label: t('sales.total'),
            align: 'end',
            render: (row) => formatCurrency(Number(row.amount), row.currencyCode ?? user?.currency ?? 'EGP'),
            exportValue: (row) => Number(row.amount),
          },
        ]}
      />
      <Modal open={open} title={t('crm.createLead')} onClose={() => setOpen(false)}>
        <form onSubmit={(e) => void handleCreate(e)}>
          {error && <p className="form-error">{error}</p>}
          <FormField label={t('customers.name')} required>
            <input className="form-input" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} required />
          </FormField>
          <FormField label={t('tenants.name')}>
            <input className="form-input" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
          </FormField>
          <FormField label={t('auth.email')}>
            <input className="form-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </FormField>
          <FormActions>
            <button type="submit" className="btn btn-primary">{t('common.save')}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</button>
          </FormActions>
        </form>
      </Modal>
    </div>
  );
}
