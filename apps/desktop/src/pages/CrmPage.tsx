import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormActions, FormField, Modal, PageHeader, useApiClient } from '../components/DataTable';
import { formatCurrency } from '../lib/format';
import { useAuthStore } from '../stores';

export function CrmPage() {
  const { t } = useTranslation();
  const client = useApiClient();
  const user = useAuthStore((s) => s.user);
  const [leads, setLeads] = useState<Array<{ id: string; code: string; contactName: string; companyName?: string | null; status: string }>>([]);
  const [opportunities, setOpportunities] = useState<Array<{ id: string; code: string; name: string; stage: string; amount: number | string }>>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ contactName: '', companyName: '', email: '', phone: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [leadRows, oppRows] = await Promise.all([client.getCrmLeads(), client.getCrmOpportunities()]);
      setLeads(leadRows);
      setOpportunities(oppRows);
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await client.createCrmLead(form);
    setOpen(false);
    setForm({ contactName: '', companyName: '', email: '', phone: '' });
    await load();
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
      {loading ? (
        <p>{t('common.loading')}</p>
      ) : (
        <>
          <h2 className="module-card-title">{t('crm.leads')}</h2>
          <div className="table-wrap" style={{ marginBottom: '2rem' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('customers.code')}</th>
                  <th>{t('customers.name')}</th>
                  <th>{t('common.status')}</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((row) => (
                  <tr key={row.id}>
                    <td>{row.code}</td>
                    <td>{row.companyName ? `${row.contactName} · ${row.companyName}` : row.contactName}</td>
                    <td>{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h2 className="module-card-title">{t('crm.opportunities')}</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('customers.code')}</th>
                  <th>{t('customers.name')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('sales.total')}</th>
                </tr>
              </thead>
              <tbody>
                {opportunities.map((row) => (
                  <tr key={row.id}>
                    <td>{row.code}</td>
                    <td>{row.name}</td>
                    <td>{row.stage}</td>
                    <td className="stat-card-value">{formatCurrency(Number(row.amount), user?.currency ?? 'EGP')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <Modal open={open} title={t('crm.createLead')} onClose={() => setOpen(false)}>
        <form onSubmit={(e) => void handleCreate(e)}>
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
