import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConnectivityStatus } from '@fratelanza/types';
import { LOCALE_LABELS, SUPPORTED_LOCALES } from '@fratelanza/localization';
import type { Locale, ThemeMode } from '@fratelanza/types';
import { createApiClient, resolveApiBaseUrl } from '../lib/api';
import { PageHeader } from '../components/DataTable';
import { useAppStore, useAuthStore } from '../stores';

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
  const [serverUrl, setServerUrl] = useState(apiUrl);
  const [serverMessage, setServerMessage] = useState('');

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

      {user && (
        <div className="card card--flat" style={{ marginTop: 'var(--frz-space-4)' }}>
          <h2 className="card-title" style={{ marginBottom: 'var(--frz-space-3)' }}>
            {t('settings.company')}
          </h2>
          <div className="settings-row">
            <span className="settings-label">{t('settings.companyName')}</span>
            <span>{user.tenantName}</span>
          </div>
          {user.countryCode && (
            <div className="settings-row">
              <span className="settings-label">{t('integrations.country')}</span>
              <span>{user.countryCode} · {user.currency}</span>
            </div>
          )}
          <div className="settings-row">
            <Link className="btn btn-secondary btn--sm" to="/settings/integrations">
              {t('nav.integrations')}
            </Link>
          </div>
          {user.branchName && (
            <div className="settings-row">
              <span className="settings-label">{t('users.branch')}</span>
              <span>{user.branchName}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
