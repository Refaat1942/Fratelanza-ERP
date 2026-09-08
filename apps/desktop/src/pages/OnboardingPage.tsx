import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores';

type BusinessType =
  | 'trading'
  | 'construction'
  | 'services'
  | 'retail'
  | 'other';

const STEPS = ['welcome', 'business', 'branch', 'warehouse', 'finance', 'type', 'done'] as const;
type Step = (typeof STEPS)[number];

function onboardingKey(tenantId: string) {
  return `fratelanza_onboarding_complete_${tenantId}`;
}

export function isOnboardingComplete(tenantId: string): boolean {
  return localStorage.getItem(onboardingKey(tenantId)) === 'true';
}

export function markOnboardingComplete(tenantId: string): void {
  localStorage.setItem(onboardingKey(tenantId), 'true');
}

export function OnboardingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const tenantId = user?.tenantId ?? '';

  const [step, setStep] = useState<Step>('welcome');
  const [companyName, setCompanyName] = useState(user?.tenantName ?? '');
  const [branchName, setBranchName] = useState('');
  const [warehouseName, setWarehouseName] = useState('');
  const [businessType, setBusinessType] = useState<BusinessType>('trading');

  const stepIndex = STEPS.indexOf(step);
  const progress = Math.round(((stepIndex + 1) / STEPS.length) * 100);

  function finish() {
    if (tenantId) {
      markOnboardingComplete(tenantId);
    }
    navigate('/', { replace: true });
  }

  function next() {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) {
      setStep(STEPS[idx + 1]);
    } else {
      finish();
    }
  }

  function back() {
    const idx = STEPS.indexOf(step);
    if (idx > 0) {
      setStep(STEPS[idx - 1]);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    next();
  }

  return (
    <div className="login-page">
      <div className="login-card" style={{ maxWidth: 560 }}>
        <div className="login-brand">
          <div className="login-brand-mark">FG</div>
          <div>
            <h1 className="login-title">{t('onboarding.title')}</h1>
            <p className="login-subtitle">{t('onboarding.subtitle')}</p>
          </div>
        </div>

        <div className="form-hint" style={{ marginBottom: 16 }}>
          {t('onboarding.progress', { percent: progress })}
        </div>

        <form onSubmit={(e) => void handleSubmit(e)}>
          {step === 'welcome' && (
            <>
              <p>{t('onboarding.welcomeBody')}</p>
              <ul style={{ textAlign: 'start', margin: '16px 0' }}>
                <li>{t('onboarding.manageSales')}</li>
                <li>{t('onboarding.managePurchasing')}</li>
                <li>{t('onboarding.manageFinance')}</li>
                <li>{t('onboarding.manageProjects')}</li>
              </ul>
            </>
          )}

          {step === 'business' && (
            <div className="form-group">
              <label className="form-label" htmlFor="companyName">
                {t('onboarding.companyName')}
              </label>
              <input
                id="companyName"
                className="form-input"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder={t('onboarding.companyNamePlaceholder')}
              />
              <p className="form-hint">{t('onboarding.companyNameHint')}</p>
            </div>
          )}

          {step === 'branch' && (
            <div className="form-group">
              <label className="form-label" htmlFor="branchName">
                {t('onboarding.branchName')}
              </label>
              <input
                id="branchName"
                className="form-input"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                placeholder={t('onboarding.branchNamePlaceholder')}
              />
              <p className="form-hint">{t('onboarding.branchNameHint')}</p>
            </div>
          )}

          {step === 'warehouse' && (
            <div className="form-group">
              <label className="form-label" htmlFor="warehouseName">
                {t('onboarding.warehouseName')}
              </label>
              <input
                id="warehouseName"
                className="form-input"
                value={warehouseName}
                onChange={(e) => setWarehouseName(e.target.value)}
                placeholder={t('onboarding.warehouseNamePlaceholder')}
              />
              <p className="form-hint">{t('onboarding.warehouseNameHint')}</p>
            </div>
          )}

          {step === 'finance' && (
            <p>{t('onboarding.financeBody')}</p>
          )}

          {step === 'type' && (
            <div className="form-group">
              <label className="form-label" htmlFor="businessType">
                {t('onboarding.businessType')}
              </label>
              <select
                id="businessType"
                className="form-input"
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value as BusinessType)}
              >
                <option value="trading">{t('onboarding.typeTrading')}</option>
                <option value="construction">{t('onboarding.typeConstruction')}</option>
                <option value="services">{t('onboarding.typeServices')}</option>
                <option value="retail">{t('onboarding.typeRetail')}</option>
                <option value="other">{t('onboarding.typeOther')}</option>
              </select>
            </div>
          )}

          {step === 'done' && (
            <>
              <p>{t('onboarding.doneBody')}</p>
              <ul style={{ textAlign: 'start', margin: '16px 0' }}>
                <li>{t('onboarding.nextCustomers')}</li>
                <li>{t('onboarding.nextProducts')}</li>
                <li>{t('onboarding.nextSales')}</li>
              </ul>
            </>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
            {stepIndex > 0 && step !== 'done' && (
              <button type="button" className="btn btn-secondary" onClick={back}>
                {t('common.back')}
              </button>
            )}
            <button type="submit" className="btn btn-primary" style={{ marginInlineStart: 'auto' }}>
              {step === 'done' ? t('onboarding.goToDashboard') : t('common.next')}
            </button>
            {step !== 'done' && (
              <button type="button" className="btn btn-link" onClick={finish}>
                {t('onboarding.skipForNow')}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
