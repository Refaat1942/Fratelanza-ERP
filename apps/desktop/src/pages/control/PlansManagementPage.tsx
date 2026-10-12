import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormActions, FormField, Modal, PageHeader, useApiClient } from '../../components/DataTable';

type PlanRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priceMonthly: string;
  priceYearly: string | null;
  currency: string;
  maxUsers: number | null;
  maxBranches: number | null;
  isActive: boolean;
  isPublic: boolean;
  sortOrder: number;
  modules: Array<{ moduleId: string }>;
  _count?: { subscriptions: number };
};

type ModuleOption = { id: string; nameKey: string };

const emptyForm = {
  code: '',
  name: '',
  description: '',
  priceMonthly: '0',
  priceYearly: '',
  currency: 'USD',
  maxUsers: '',
  maxBranches: '',
  isActive: true,
  isPublic: true,
  moduleIds: [] as string[],
};

export function PlansManagementPage() {
  const { t } = useTranslation();
  const client = useApiClient();
  const [rows, setRows] = useState<PlanRow[]>([]);
  const [moduleOptions, setModuleOptions] = useState<ModuleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [plans, catalog] = await Promise.all([client.getPlans(), client.getPlatformModuleCatalog()]);
      setRows(plans);
      setModuleOptions(catalog);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [client, t]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(row: PlanRow) {
    setEditingId(row.id);
    setForm({
      code: row.code,
      name: row.name,
      description: row.description ?? '',
      priceMonthly: row.priceMonthly,
      priceYearly: row.priceYearly ?? '',
      currency: row.currency,
      maxUsers: row.maxUsers != null ? String(row.maxUsers) : '',
      maxBranches: row.maxBranches != null ? String(row.maxBranches) : '',
      isActive: row.isActive,
      isPublic: row.isPublic,
      moduleIds: row.modules.map((m) => m.moduleId),
    });
    setOpen(true);
  }

  function toggleModule(moduleId: string) {
    setForm((f) => ({
      ...f,
      moduleIds: f.moduleIds.includes(moduleId)
        ? f.moduleIds.filter((id) => id !== moduleId)
        : [...f.moduleIds, moduleId],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        description: form.description || undefined,
        priceMonthly: Number(form.priceMonthly),
        priceYearly: form.priceYearly ? Number(form.priceYearly) : undefined,
        currency: form.currency,
        maxUsers: form.maxUsers ? Number(form.maxUsers) : undefined,
        maxBranches: form.maxBranches ? Number(form.maxBranches) : undefined,
        isActive: form.isActive,
        isPublic: form.isPublic,
        moduleIds: form.moduleIds,
      };
      if (editingId) {
        await client.updatePlan(editingId, payload);
      } else {
        await client.createPlan({ ...payload, code: form.code });
      }
      setOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={t('control.plansTitle')}
        subtitle={t('control.plansSubtitle')}
        action={
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            {t('control.createPlan')}
          </button>
        }
      />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p>{t('common.loading')}</p>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('control.table.name')}</th>
                <th>{t('control.table.code')}</th>
                <th>{t('control.plans.price')}</th>
                <th>{t('control.plans.limits')}</th>
                <th>{t('control.plans.modules')}</th>
                <th>{t('control.table.status')}</th>
                <th>{t('control.plans.subscribers')}</th>
                <th>{t('control.table.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>{row.code}</td>
                  <td>
                    {row.currency} {row.priceMonthly}/mo
                    {row.priceYearly ? ` · ${row.priceYearly}/yr` : ''}
                  </td>
                  <td>
                    {row.maxUsers ?? '∞'} {t('control.plans.users')} · {row.maxBranches ?? '∞'}{' '}
                    {t('control.plans.branches')}
                  </td>
                  <td>{row.modules.length}</td>
                  <td>
                    <span className={`badge badge--${row.isActive ? 'active' : 'suspended'}`}>
                      {row.isActive ? t('control.plans.active') : t('control.plans.inactive')}
                    </span>
                    {row.isPublic && <span className="badge" style={{ marginInlineStart: 4 }}>{t('control.plans.public')}</span>}
                  </td>
                  <td>{row._count?.subscriptions ?? 0}</td>
                  <td>
                    <button type="button" className="btn btn-ghost btn--sm" onClick={() => openEdit(row)}>
                      {t('common.edit')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={open} title={editingId ? t('control.editPlan') : t('control.createPlan')} onClose={() => setOpen(false)} wide>
        <form onSubmit={(e) => void handleSubmit(e)}>
          <FormField label={t('control.table.code')} required>
            <input
              className="form-input"
              value={form.code}
              disabled={!!editingId}
              onChange={(e) => setForm({ ...form, code: e.target.value.toLowerCase() })}
              required
            />
          </FormField>
          <FormField label={t('control.table.name')} required>
            <input
              className="form-input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </FormField>
          <FormField label={t('control.plans.description')}>
            <textarea
              className="form-input"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </FormField>
          <div className="form-grid">
            <FormField label={t('control.plans.priceMonthly')} required>
              <input
                type="number"
                min={0}
                step="0.01"
                className="form-input"
                value={form.priceMonthly}
                onChange={(e) => setForm({ ...form, priceMonthly: e.target.value })}
                required
              />
            </FormField>
            <FormField label={t('control.plans.priceYearly')}>
              <input
                type="number"
                min={0}
                step="0.01"
                className="form-input"
                value={form.priceYearly}
                onChange={(e) => setForm({ ...form, priceYearly: e.target.value })}
              />
            </FormField>
          </div>
          <div className="form-grid">
            <FormField label={t('control.plans.currency')}>
              <select
                className="form-input"
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
              >
                <option value="USD">USD</option>
                <option value="SAR">SAR</option>
                <option value="EGP">EGP</option>
              </select>
            </FormField>
          </div>
          <div className="form-grid">
            <FormField label={t('control.plans.maxUsers')}>
              <input
                type="number"
                min={1}
                className="form-input"
                value={form.maxUsers}
                onChange={(e) => setForm({ ...form, maxUsers: e.target.value })}
                placeholder="∞"
              />
            </FormField>
            <FormField label={t('control.plans.maxBranches')}>
              <input
                type="number"
                min={1}
                className="form-input"
                value={form.maxBranches}
                onChange={(e) => setForm({ ...form, maxBranches: e.target.value })}
                placeholder="∞"
              />
            </FormField>
          </div>
          <div className="checkbox-grid">
            <label className="checkbox-grid-item">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              {t('control.plans.active')}
            </label>
            <label className="checkbox-grid-item">
              <input
                type="checkbox"
                checked={form.isPublic}
                onChange={(e) => setForm({ ...form, isPublic: e.target.checked })}
              />
              {t('control.plans.public')}
            </label>
          </div>
          <FormField label={t('control.plans.modules')}>
            <div className="checkbox-grid">
              {moduleOptions.map((mod) => (
                <label key={mod.id} className="checkbox-grid-item">
                  <input
                    type="checkbox"
                    checked={form.moduleIds.includes(mod.id)}
                    onChange={() => toggleModule(mod.id)}
                  />
                  {t(mod.nameKey)}
                </label>
              ))}
            </div>
          </FormField>
          <FormActions>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? t('common.loading') : t('common.save')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </button>
          </FormActions>
        </form>
      </Modal>
    </div>
  );
}
