import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConnectivityStatus } from '@fratelanza/types';
import { LOCALE_LABELS, SUPPORTED_LOCALES } from '@fratelanza/localization';
import type { Locale, ThemeMode } from '@fratelanza/types';
import { createApiClient, resolveApiBaseUrl, type LicenseAdminView } from '../lib/api';
import { PageHeader } from '../components/DataTable';
import { useAppStore, useAuthStore, useEntitlementStore } from '../stores';

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const locale = useAppStore((s) => s.locale);
  const theme = useAppStore((s) => s.theme);
  const apiUrl = useAppStore((s) => s.apiUrl);
  const setApiUrl = useAppStore((s) => s.setApiUrl);
  const connectivity = useAppStore((s) => s.connectivity);
  const setConnectivity = useAppStore((s) => s.setConnectivity);
  const setLocale = useAppStore((s) => s.setLocale);
  const setTheme = useAppStore((s) => s.setTheme);
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const edition = useEntitlementStore((s) => s.edition);
  const status = useEntitlementStore((s) => s.status);
  const modules = useEntitlementStore((s) => s.modules);
  const [serverUrl, setServerUrl] = useState(apiUrl);
  const [serverMessage, setServerMessage] = useState('');
  const [licenseView, setLicenseView] = useState<LicenseAdminView | null>(null);

  const canReadLicense = user?.permissions.includes('core:license:read') ?? false;

  function handleLocaleChange(newLocale: Locale) {
    setLocale(newLocale);
    void i18n.changeLanguage(newLocale);
  }

  async function saveServerUrl() {
    setServerMessage('');
    const normalized = serverUrl.trim() || 'http://localhost:3000';
    setApiUrl(normalized);
    if (window.desktopApi) {
      await window.desktopApi.setApiUrl(normalized);
      const online = await window.desktopApi.checkConnectivity(normalized);
      setConnectivity(online ? ConnectivityStatus.ONLINE : ConnectivityStatus.OFFLINE);
      setServerMessage(
        online ? t('connection.serverReachable') : t('connection.serverUnreachable'),
      );
      return;
    }

    try {
      const client = createApiClient(() => resolveApiBaseUrl(normalized), () => accessToken);
      await client.getSettings();
      setConnectivity(ConnectivityStatus.ONLINE);
      setServerMessage(t('connection.serverReachable'));
    } catch {
      setConnectivity(ConnectivityStatus.OFFLINE);
      setServerMessage(t('connection.serverUnreachable'));
    }
  }

  useEffect(() => {
    setServerUrl(apiUrl);
  }, [apiUrl]);

  useEffect(() => {
    if (!canReadLicense || !accessToken) return;
    const client = createApiClient(() => resolveApiBaseUrl(apiUrl), () => accessToken);
    void client.getLicenseAdminView().then(setLicenseView).catch(() => setLicenseView(null));
  }, [canReadLicense, accessToken, apiUrl]);

  return (
    <div>
      <PageHeader title={t('settings.title')} breadcrumbs={[{ label: t('nav.settings') }]} />

      <div className="card card--flat">
        <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
          <span>{t('connection.serverUrl')}</span>
          <input
            className="form-input"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="http://192.168.1.10:3000"
          />
          <button type="button" className="btn btn-primary" onClick={() => void saveServerUrl()}>
            {t('connection.saveServer')}
          </button>
          {serverMessage && (
            <p className={connectivity === ConnectivityStatus.ONLINE ? 'form-success' : 'form-error'}>
              {serverMessage}
            </p>
          )}
          <p className="form-hint">{t('connection.lanHint')}</p>
        </div>

        <div className="settings-row">
          <span>{t('settings.language')}</span>
          <select
            className="select-input"
            value={locale}
            onChange={(e) => handleLocaleChange(e.target.value as Locale)}
          >
            {SUPPORTED_LOCALES.map((loc) => (
              <option key={loc} value={loc}>
                {LOCALE_LABELS[loc]}
              </option>
            ))}
          </select>
        </div>

        <div className="settings-row">
          <span>{t('settings.theme')}</span>
          <select
            className="select-input"
            value={theme}
            onChange={(e) => setTheme(e.target.value as ThemeMode)}
          >
            <option value="light">{t('settings.themeLight')}</option>
            <option value="dark">{t('settings.themeDark')}</option>
            <option value="system">{t('settings.themeSystem')}</option>
          </select>
        </div>
      </div>

      <div className="card card--flat" style={{ marginTop: 'var(--frz-space-4)' }}>
        <h2 className="card-title" style={{ marginBottom: 'var(--frz-space-4)' }}>{t('license.title')}</h2>
        <div className="settings-row">
          <span className="settings-label">{t('license.edition')}</span>
          <span>{edition ?? licenseView?.license.edition ?? '—'}</span>
        </div>
        <div className="settings-row">
          <span className="settings-label">{t('license.status')}</span>
          <span>{status ?? licenseView?.license.status ?? '—'}</span>
        </div>
        {licenseView && (
          <>
            <div className="settings-row">
              <span>License key</span>
              <span>{licenseView.license.licenseKey}</span>
            </div>
            <div className="settings-row">
              <span>Usage</span>
              <span>
                Users {licenseView.entitlements.usage.users}/{licenseView.entitlements.limits.maxUsers ?? '—'}
                {' · '}
                Branches {licenseView.entitlements.usage.branches}/{licenseView.entitlements.limits.maxBranches ?? '—'}
              </span>
            </div>
          </>
        )}
        <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
          <span className="settings-label">{t('license.modules')}</span>
          <span className="form-hint">
            {(licenseView?.entitlements.modules ?? modules)
              .filter((m) => m.enabled)
              .map((m) => m.displayName)
              .join(', ') || '—'}
          </span>
        </div>
      </div>
    </div>
  );
}
