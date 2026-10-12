import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader, useApiClient } from '../../components/DataTable';

type OrgOption = { id: string; name: string; code: string; displayName?: string | null };

type ResolvedModule = {
  id: string;
  enabled: boolean;
  nameKey: string;
  category: string;
  source: 'override' | 'plan' | 'open';
  overrideValue: boolean | null;
  planValue: boolean | null;
};

type PlanOption = { id: string; code: string; name: string };

type Subscription = {
  id: string;
  planId: string;
  status: string;
  billingCycle: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  plan: { id: string; code: string; name: string };
};

export function ModuleManagementPage() {
  const { t } = useTranslation();
  const client = useApiClient();
  const [organizations, setOrganizations] = useState<OrgOption[]>([]);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [modules, setModules] = useState<ResolvedModule[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    async function loadOrgsAndPlans() {
      try {
        const [orgs, planList] = await Promise.all([client.getPlatformOrganizations(), client.getPlans()]);
        setOrganizations(orgs);
        setPlans(planList);
        if (orgs[0]?.id) setTenantId(orgs[0].id);
      } catch (e) {
        setError(e instanceof Error ? e.message : t('common.error'));
      }
    }
    void loadOrgsAndPlans();
  }, [client, t]);

  const loadModules = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const [data, sub] = await Promise.all([
        client.getPlatformTenantModules(tenantId),
        client.getTenantSubscription(tenantId),
      ]);
      setModules(data);
      setSubscription(sub);
      setSelectedPlanId(sub?.planId ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [client, tenantId, t]);

  useEffect(() => {
    void loadModules();
  }, [loadModules]);

  async function toggleModule(moduleId: string, enabled: boolean) {
    setSaving(moduleId);
    try {
      await client.setPlatformTenantModule(tenantId, moduleId, enabled);
      await loadModules();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setSaving(null);
    }
  }

  async function clearOverride(moduleId: string) {
    setSaving(moduleId);
    try {
      await client.clearPlatformTenantModuleOverride(tenantId, moduleId);
      await loadModules();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setSaving(null);
    }
  }

  async function handleAssignPlan() {
    if (!selectedPlanId) return;
    setAssigning(true);
    setError(null);
    try {
      if (subscription) {
        await client.updateTenantSubscription(tenantId, { planId: selectedPlanId });
      } else {
        await client.assignTenantSubscription(tenantId, { planId: selectedPlanId });
      }
      await loadModules();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div>
      <PageHeader title={t('control.modulesTitle')} subtitle={t('control.modulesSubtitle')} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="page-toolbar" style={{ marginBottom: 'var(--frz-space-4)' }}>
        <label className="form-label" htmlFor="tenant-select">{t('control.selectOrganization')}</label>
        <select
          id="tenant-select"
          className="form-input"
          style={{ maxWidth: 420 }}
          value={tenantId}
          onChange={(e) => setTenantId(e.target.value)}
        >
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>
              {org.displayName ?? org.name} ({org.code})
            </option>
          ))}
        </select>
      </div>

      <div className="card card--flat" style={{ marginBottom: 'var(--frz-space-5)', padding: 'var(--frz-space-4)' }}>
        <h3 className="form-section-title">{t('control.modules.subscriptionTitle')}</h3>
        {subscription ? (
          <p className="page-subtitle">
            {t('control.modules.currentPlan')}: <strong>{subscription.plan.name}</strong> ·{' '}
            <span className={`badge badge--${subscription.status === 'active' ? 'active' : 'suspended'}`}>
              {subscription.status}
            </span>{' '}
            · {subscription.billingCycle}
          </p>
        ) : (
          <p className="page-subtitle">{t('control.modules.noSubscription')}</p>
        )}
        <div className="page-toolbar">
          <select
            className="form-input"
            style={{ maxWidth: 320 }}
            value={selectedPlanId}
            onChange={(e) => setSelectedPlanId(e.target.value)}
          >
            <option value="">{t('control.modules.selectPlan')}</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name} ({plan.code})
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-primary btn--sm"
            disabled={!selectedPlanId || assigning}
            onClick={() => void handleAssignPlan()}
          >
            {assigning ? t('common.loading') : subscription ? t('control.modules.changePlan') : t('control.modules.assignPlan')}
          </button>
        </div>
      </div>

      {loading ? (
        <p>{t('common.loading')}</p>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('control.table.module')}</th>
                <th>{t('control.table.enabled')}</th>
                <th>{t('control.modules.source')}</th>
                <th>{t('control.table.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {modules.map((mod) => (
                <tr key={mod.id}>
                  <td>{t(mod.nameKey)}</td>
                  <td>{mod.enabled ? '✓' : '✕'}</td>
                  <td>
                    <span className={`badge badge--${mod.source === 'override' ? 'active' : mod.source === 'plan' ? 'info' : 'suspended'}`}>
                      {t(`control.modules.source${mod.source.charAt(0).toUpperCase()}${mod.source.slice(1)}`)}
                    </span>
                    {mod.source === 'override' && mod.planValue !== null && (
                      <span className="page-subtitle" style={{ fontSize: '0.75rem', marginInlineStart: 4 }}>
                        ({t('control.modules.planDefault')}: {mod.planValue ? '✓' : '✕'})
                      </span>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-ghost btn--sm"
                      disabled={saving === mod.id}
                      onClick={() => void toggleModule(mod.id, !mod.enabled)}
                    >
                      {mod.enabled ? t('control.disable') : t('control.enable')}
                    </button>
                    {mod.source === 'override' && (
                      <button
                        type="button"
                        className="btn btn-ghost btn--sm"
                        disabled={saving === mod.id}
                        onClick={() => void clearOverride(mod.id)}
                      >
                        {t('control.modules.clearOverride')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
