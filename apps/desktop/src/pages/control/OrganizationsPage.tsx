import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormActions, FormField, Modal, PageHeader, useApiClient } from '../../components/DataTable';

type OrganizationRow = {
  id: string;
  name: string;
  code: string;
  displayName?: string | null;
  status: string;
  country: string;
  currency: string;
  _count: { users: number; branches: number };
};

export function OrganizationsPage() {
  const { t } = useTranslation();
  const client = useApiClient();
  const [rows, setRows] = useState<OrganizationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    code: '',
    displayName: '',
    country: 'SA',
    currency: 'SAR',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await client.getPlatformOrganizations();
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [client, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await client.createPlatformOrganization({
        name: form.name,
        code: form.code,
        displayName: form.displayName || form.name,
        country: form.country,
        currency: form.currency,
      });
      setOpen(false);
      setForm({ name: '', code: '', displayName: '', country: 'SA', currency: 'SAR' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    }
  }

  async function toggleStatus(row: OrganizationRow) {
    const next = row.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      await client.updatePlatformOrganization(row.id, { status: next });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    }
  }

  return (
    <div>
      <PageHeader
        title={t('control.organizationsTitle')}
        subtitle={t('control.organizationsSubtitle')}
        action={
          <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
            {t('control.createOrganization')}
          </button>
        }
      />
      {error && <p className="form-error" role="alert">{error}</p>}
      {loading ? (
        <p>{t('common.loading')}</p>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('control.table.name')}</th>
                <th>{t('control.table.code')}</th>
                <th>{t('control.table.status')}</th>
                <th>{t('control.table.country')}</th>
                <th>{t('control.table.users')}</th>
                <th>{t('control.table.branches')}</th>
                <th>{t('control.table.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.displayName ?? row.name}</td>
                  <td>{row.code}</td>
                  <td>
                    <span className={`badge badge--${row.status.toLowerCase()}`}>{row.status}</span>
                  </td>
                  <td>{row.country}</td>
                  <td>{row._count.users}</td>
                  <td>{row._count.branches}</td>
                  <td>
                    <button type="button" className="btn btn-ghost btn--sm" onClick={() => void toggleStatus(row)}>
                      {row.status === 'ACTIVE' ? t('control.suspend') : t('control.activate')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={open} title={t('control.createOrganization')} onClose={() => setOpen(false)}>
        <form onSubmit={(e) => void handleCreate(e)}>
          <FormField label={t('control.table.name')} required>
            <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </FormField>
          <FormField label={t('control.table.code')} required>
            <input className="form-input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} required />
          </FormField>
          <FormField label={t('control.displayName')}>
            <input className="form-input" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
          </FormField>
          <FormField label={t('control.table.country')}>
            <select className="form-input" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value, currency: e.target.value === 'EG' ? 'EGP' : 'SAR' })}>
              <option value="SA">SA</option>
              <option value="EG">EG</option>
            </select>
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
