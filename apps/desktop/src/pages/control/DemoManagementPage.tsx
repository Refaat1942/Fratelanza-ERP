import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ERP_MODULES } from '@fratelanza/shared';
import { ConfirmDialog, FormActions, FormField, Modal, PageHeader, useApiClient } from '../../components/DataTable';

type DemoRow = {
  id: string;
  slug: string;
  name: string;
  enabled: boolean;
  linkToken: string;
  linkExpiresAt?: string | null;
  issuedTo?: string | null;
  visitCount?: number;
  lastAccessedAt?: string | null;
  modules: string[];
  tenant: { id: string; name: string; code: string };
  demoUser?: { email: string } | null;
  createdAt?: string;
};

type DemoActivity = {
  issuedTo: string | null;
  createdAt: string;
  linkExpiresAt: string | null;
  visitCount: number;
  lastAccessedAt: string | null;
  recentActivity: Array<{
    id: string;
    entity: string;
    entityId: string;
    action: string;
    createdAt: string;
    user?: { firstName: string; lastName: string; email: string } | null;
  }>;
};

function isExpired(demo: DemoRow): boolean {
  return !!demo.linkExpiresAt && new Date(demo.linkExpiresAt) < new Date();
}

export function DemoManagementPage() {
  const { t } = useTranslation();
  const client = useApiClient();
  const [rows, setRows] = useState<DemoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [seedingId, setSeedingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editRow, setEditRow] = useState<DemoRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DemoRow | null>(null);
  const [activityRow, setActivityRow] = useState<DemoRow | null>(null);
  const [activity, setActivity] = useState<DemoActivity | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [form, setForm] = useState({
    slug: '',
    name: '',
    tenantCode: '',
    modules: ERP_MODULES.slice(0, 8).map((m) => m.id),
    linkExpiresAt: '',
    issuedTo: '',
    seedVolume: true,
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
      await client.createPlatformDemo({
        ...form,
        linkExpiresAt: form.linkExpiresAt || undefined,
        issuedTo: form.issuedTo || undefined,
      });
      setOpen(false);
      setForm({
        slug: '', name: '', tenantCode: '',
        modules: ERP_MODULES.slice(0, 8).map((m) => m.id),
        linkExpiresAt: '', issuedTo: '', seedVolume: true,
      });
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
        linkExpiresAt: form.linkExpiresAt || null,
        issuedTo: form.issuedTo || null,
      });
      setEditRow(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await client.deletePlatformDemo(deleteTarget.id);
      setDeleteTarget(null);
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

  async function handleSeedVolume(demo: DemoRow) {
    setError(null);
    setNotice(null);
    setSeedingId(demo.id);
    try {
      const stats = await client.seedPlatformDemoVolume(demo.id);
      setNotice(
        t('control.demoSeedSuccess', {
          products: stats.products,
          customers: stats.customers,
          suppliers: stats.suppliers,
          invoices: stats.salesInvoices,
          orders: stats.purchaseOrders,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setSeedingId(null);
    }
  }

  function openEdit(demo: DemoRow) {
    setEditRow(demo);
    setForm({
      slug: demo.slug,
      name: demo.name,
      tenantCode: demo.tenant.code,
      modules: demo.modules ?? [],
      linkExpiresAt: demo.linkExpiresAt ? demo.linkExpiresAt.slice(0, 10) : '',
      issuedTo: demo.issuedTo ?? '',
      seedVolume: true,
    });
  }

  async function openActivity(demo: DemoRow) {
    setActivityRow(demo);
    setActivityLoading(true);
    try {
      setActivity(await client.getPlatformDemoActivity(demo.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setActivityLoading(false);
    }
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
      {notice && <p className="form-success" role="status">{notice}</p>}

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
                {demo.issuedTo && (
                  <p className="module-card-description">{t('control.demoIssuedTo')}: {demo.issuedTo}</p>
                )}
                <p className="module-card-description">
                  {demo.enabled ? t('control.demoEnabled') : t('control.demoDisabled')}
                  {demo.linkExpiresAt && (
                    <>
                      {' · '}
                      {isExpired(demo)
                        ? t('control.demoExpired')
                        : t('control.demoExpiresOn', { date: new Date(demo.linkExpiresAt).toLocaleDateString() })}
                    </>
                  )}
                  {' · '}
                  {t('control.demoVisitCount', { count: demo.visitCount ?? 0 })}
                </p>
                <div className="form-actions" style={{ borderTop: 'none', paddingTop: 0 }}>
                  <a className="btn btn-primary btn--sm" href={`/demo/${demo.slug}`} target="_blank" rel="noreferrer">
                    {t('control.openDemoLink')}
                  </a>
                  <button type="button" className="btn btn-ghost btn--sm" onClick={() => void openActivity(demo)}>
                    {t('control.demoActivity')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn--sm"
                    disabled={seedingId === demo.id}
                    onClick={() => void handleSeedVolume(demo)}
                  >
                    {seedingId === demo.id ? t('common.loading') : t('control.demoSeedNow')}
                  </button>
                  <button type="button" className="btn btn-ghost btn--sm" onClick={() => openEdit(demo)}>
                    {t('common.edit')}
                  </button>
                  <button type="button" className="btn btn-ghost btn--sm" onClick={() => void toggleEnabled(demo)}>
                    {demo.enabled ? t('control.disable') : t('control.enable')}
                  </button>
                  <button type="button" className="btn btn-ghost btn--sm" onClick={() => void regenerateLink(demo)}>
                    {t('control.regenerateLink')}
                  </button>
                  <button type="button" className="btn-link btn-link--danger" onClick={() => setDeleteTarget(demo)}>
                    {t('common.delete')}
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
          <FormField label={t('control.demoIssuedTo')}>
            <input
              className="form-input"
              placeholder={t('control.demoIssuedToPlaceholder')}
              value={form.issuedTo}
              onChange={(e) => setForm({ ...form, issuedTo: e.target.value })}
            />
          </FormField>
          <FormField label={t('control.demoExpiresLabel')}>
            <input
              className="form-input"
              type="date"
              value={form.linkExpiresAt}
              onChange={(e) => setForm({ ...form, linkExpiresAt: e.target.value })}
            />
          </FormField>
          <FormField label={t('control.demoSeedVolume')}>
            <label className="checkbox-grid-item">
              <input
                type="checkbox"
                checked={form.seedVolume}
                onChange={(e) => setForm({ ...form, seedVolume: e.target.checked })}
              />
              <span>{t('control.demoSeedVolumeHint')}</span>
            </label>
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
          <FormField label={t('control.demoIssuedTo')}>
            <input
              className="form-input"
              placeholder={t('control.demoIssuedToPlaceholder')}
              value={form.issuedTo}
              onChange={(e) => setForm({ ...form, issuedTo: e.target.value })}
            />
          </FormField>
          <FormField label={t('control.demoExpiresLabel')}>
            <input
              className="form-input"
              type="date"
              value={form.linkExpiresAt}
              onChange={(e) => setForm({ ...form, linkExpiresAt: e.target.value })}
            />
            <p className="page-subtitle" style={{ marginTop: '0.25rem', marginBottom: 0 }}>
              {t('control.demoExpiresHint')}
            </p>
          </FormField>
          <FormField label={t('control.demoModules')}>
            <div className="checkbox-grid">
              {ERP_MODULES.map((mod) => (
                <label key={mod.id} className="checkbox-grid-item">
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
                  <span>{t(mod.nameKey)}</span>
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

      <Modal
        open={!!activityRow}
        title={`${t('control.demoActivity')} · ${activityRow?.name ?? ''}`}
        onClose={() => { setActivityRow(null); setActivity(null); }}
      >
        {activityLoading || !activity ? (
          <p>{t('common.loading')}</p>
        ) : (
          <>
            <div className="card-grid" style={{ marginBottom: 'var(--frz-space-4)' }}>
              <div className="stat-card">
                <p className="stat-card-label">{t('control.demoVisits')}</p>
                <p className="stat-card-value">{activity.visitCount}</p>
              </div>
              <div className="stat-card">
                <p className="stat-card-label">{t('control.demoLastAccessed')}</p>
                <p className="stat-card-value" style={{ fontSize: 'var(--frz-text-lg)' }}>
                  {activity.lastAccessedAt ? new Date(activity.lastAccessedAt).toLocaleString() : t('control.demoNeverAccessed')}
                </p>
              </div>
            </div>
            <div className="settings-row">
              <span>{t('control.demoIssuedTo')}</span>
              <span>{activity.issuedTo ?? '—'}</span>
            </div>
            <div className="settings-row">
              <span>{t('control.demoCreatedOn')}</span>
              <span>{new Date(activity.createdAt).toLocaleDateString()}</span>
            </div>
            <div className="settings-row">
              <span>{t('control.demoExpiresLabel')}</span>
              <span>{activity.linkExpiresAt ? new Date(activity.linkExpiresAt).toLocaleDateString() : t('control.demoNoExpiry')}</span>
            </div>
            <h3 className="card-title" style={{ marginTop: 'var(--frz-space-4)' }}>{t('control.demoRecentMovements')}</h3>
            {activity.recentActivity.length === 0 ? (
              <p className="page-subtitle">{t('control.demoNoMovements')}</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t('control.table.actions')}</th>
                      <th>{t('control.table.name')}</th>
                      <th>{t('users.name')}</th>
                      <th>{t('control.table.time', { defaultValue: 'Time' })}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.recentActivity.map((a) => (
                      <tr key={a.id}>
                        <td>{a.action}</td>
                        <td>{a.entity}</td>
                        <td>{a.user ? `${a.user.firstName} ${a.user.lastName}` : '—'}</td>
                        <td>{new Date(a.createdAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title={t('control.demoDeleteTitle')}
        message={t('control.demoDeleteMessage')}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
