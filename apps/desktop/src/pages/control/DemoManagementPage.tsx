import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ERP_MODULES } from '@fratelanza/shared';
import { FormActions, FormField, Modal, PageHeader, useApiClient } from '../../components/DataTable';

type DemoRow = {
  id: string;
  slug: string;
  name: string;
  enabled: boolean;
  linkToken: string;
  modules: string[];
  tenant: { id: string; name: string; code: string };
  demoUser?: { email: string } | null;
  createdAt?: string;
};

export function DemoManagementPage() {
  const { t } = useTranslation();
  const client = useApiClient();
  const [rows, setRows] = useState<DemoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editRow, setEditRow] = useState<DemoRow | null>(null);
  const [form, setForm] = useState({
    slug: '',
    name: '',
    tenantCode: '',
    modules: ERP_MODULES.slice(0, 8).map((m) => m.id),
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await client.getPlatformDemos();
      setRows(data as DemoRow[]);
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
      await client.createPlatformDemo(form);
      setOpen(false);
      setForm({ slug: '', name: '', tenantCode: '', modules: ERP_MODULES.slice(0, 8).map((m) => m.id) });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editRow) return;
    try {
      await client.updatePlatformDemo(editRow.id, {
        name: form.name,
        enabled: editRow.enabled,
        modules: form.modules,
      });
      setEditRow(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    }
  }

  async function toggleEnabled(demo: DemoRow) {
    try {
      await client.updatePlatformDemo(demo.id, { enabled: !demo.enabled });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    }
  }

  async function regenerateLink(demo: DemoRow) {
    try {
      await client.regeneratePlatformDemoLink(demo.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    }
  }

  function openEdit(demo: DemoRow) {
    setEditRow(demo);
    setForm({
      slug: demo.slug,
      name: demo.name,
      tenantCode: demo.tenant.code,
      modules: demo.modules ?? [],
    });
  }

  function demoUrl(slug: string): string {
    return `${window.location.origin}/demo/${slug}`;
  }

  function copyText(text: string) {
    void navigator.clipboard.writeText(text);
  }

  const enabledDemos = rows.filter((d) => d.enabled);
  const allLinksText = enabledDemos
    .map((d) => `${d.name}\n${demoUrl(d.slug)}\nLogin: ${d.demoUser?.email ?? 'admin@fratelanza.local'} / Eval@2026!Demo`)
    .join('\n\n');

  return (
    <div>
      <PageHeader
        title={t('control.demosTitle')}
        subtitle={t('control.demosSubtitle')}
        action={
          <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
            {t('control.createDemo')}
          </button>
        }
      />
      {error && <p className="form-error" role="alert">{error}</p>}

      {!loading && enabledDemos.length > 0 && (
        <section className="module-card module-card--static" style={{ marginBottom: '1.5rem' }}>
          <div className="module-card-body">
            <h2 className="module-card-title">{t('control.customerDemoLinks')}</h2>
            <p className="module-card-description">{t('control.customerDemoLinksHint')}</p>
            <div className="form-actions" style={{ borderTop: 'none', paddingTop: 0, marginBottom: '1rem' }}>
              <button
                type="button"
                className="btn btn-primary btn--sm"
                onClick={() => copyText(allLinksText)}
              >
                {t('control.copyAllDemoLinks')}
              </button>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('control.table.name')}</th>
                    <th>{t('control.customerLink')}</th>
                    <th>{t('control.table.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {enabledDemos.map((demo) => {
                    const url = demoUrl(demo.slug);
                    return (
                      <tr key={demo.id}>
                        <td>{demo.name}</td>
                        <td>
                          <code>{url}</code>
                        </td>
                        <td>
                          <button type="button" className="btn btn-ghost btn--sm" onClick={() => copyText(url)}>
                            {t('control.copyLink')}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {loading ? (
        <p>{t('common.loading')}</p>
      ) : (
        <div className="module-hub-grid">
          {rows.map((demo) => (
            <div key={demo.id} className="module-card module-card--static">
              <div className="module-card-body">
                <h2 className="module-card-title">{demo.name}</h2>
                <p className="module-card-description">
                  <code>{demoUrl(demo.slug)}</code>
                </p>
                <p className="module-card-description">{demo.tenant.name} ({demo.tenant.code})</p>
                <p className="module-card-description">
                  {demo.enabled ? t('control.demoEnabled') : t('control.demoDisabled')}
                </p>
                <div className="form-actions" style={{ borderTop: 'none', paddingTop: 0 }}>
                  <a className="btn btn-primary btn--sm" href={`/demo/${demo.slug}`} target="_blank" rel="noreferrer">
                    {t('control.openDemoLink')}
                  </a>
                  <button type="button" className="btn btn-ghost btn--sm" onClick={() => openEdit(demo)}>
                    {t('common.edit')}
                  </button>
                  <button type="button" className="btn btn-ghost btn--sm" onClick={() => void toggleEnabled(demo)}>
                    {demo.enabled ? t('control.disable') : t('control.enable')}
                  </button>
                  <button type="button" className="btn btn-ghost btn--sm" onClick={() => void regenerateLink(demo)}>
                    {t('control.regenerateLink')}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} title={t('control.createDemo')} onClose={() => setOpen(false)}>
        <form onSubmit={(e) => void handleCreate(e)}>
          <FormField label={t('control.demoSlug')} required>
            <input className="form-input" placeholder="egypt/trading" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} required />
          </FormField>
          <FormField label={t('control.table.name')} required>
            <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </FormField>
          <FormField label={t('control.table.code')} required>
            <input className="form-input" value={form.tenantCode} onChange={(e) => setForm({ ...form, tenantCode: e.target.value.toUpperCase() })} required />
          </FormField>
          <FormActions>
            <button type="submit" className="btn btn-primary">{t('common.save')}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</button>
          </FormActions>
        </form>
      </Modal>

      <Modal open={!!editRow} title={t('control.editDemo')} onClose={() => setEditRow(null)}>
        <form onSubmit={(e) => void handleUpdate(e)}>
          <FormField label={t('control.table.name')} required>
            <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </FormField>
          <FormField label={t('control.demoModules')}>
            <div className="checkbox-grid">
              {ERP_MODULES.map((mod) => (
                <label key={mod.id} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={form.modules.includes(mod.id)}
                    onChange={(e) => {
                      setForm({
                        ...form,
                        modules: e.target.checked
                          ? [...form.modules, mod.id]
                          : form.modules.filter((id) => id !== mod.id),
                      });
                    }}
                  />
                  {t(mod.nameKey)}
                </label>
              ))}
            </div>
          </FormField>
          <FormActions>
            <button type="submit" className="btn btn-primary">{t('common.save')}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setEditRow(null)}>{t('common.cancel')}</button>
          </FormActions>
        </form>
      </Modal>
    </div>
  );
}
