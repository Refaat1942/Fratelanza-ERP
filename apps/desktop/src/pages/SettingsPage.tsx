import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConnectivityStatus } from '@fratelanza/types';
import { LOCALE_LABELS, SUPPORTED_LOCALES } from '@fratelanza/localization';
import type { Locale, ThemeMode } from '@fratelanza/types';
import { createApiClient, resolveApiBaseUrl } from '../lib/api';
import { FormField, PageHeader, useApiClient } from '../components/DataTable';
import { useAppStore, useAuthStore } from '../stores';

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const client = useApiClient();
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

  const [profile, setProfile] = useState({ address: '', phone: '', taxNumber: '' });
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState('');

  useEffect(() => {
    async function loadProfile() {
      try {
        const data = await client.getSettings();
        const companyProfile = data.tenant.settings?.companyProfile;
        setProfile({
          address: companyProfile?.address ?? '',
          phone: companyProfile?.phone ?? '',
          taxNumber: companyProfile?.taxNumber ?? '',
        });
      } catch {
        // leave defaults; the form still works, just starts blank
      }
    }
    void loadProfile();
  }, [client]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileError('');
    setProfileSaved(false);
    try {
      await client.updateTenantSettings({ companyProfile: profile });
      setProfileSaved(true);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : t('errors.generic'));
    }
  }

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
      const testClient = createApiClient(() => resolveApiBaseUrl(normalized), () => accessToken);
      await testClient.getSettings();
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

  const adminLinks = [
    { to: '/users', icon: '👥', titleKey: 'nav.users', descKey: 'settings.usersDesc' },
    { to: '/branches', icon: '🏢', titleKey: 'nav.branches', descKey: 'settings.branchesDesc' },
    { to: '/settings/roles', icon: '🛡️', titleKey: 'nav.roles', descKey: 'settings.rolesDesc' },
    { to: '/settings/integrations', icon: '🔌', titleKey: 'nav.integrations', descKey: 'settings.integrationsDesc' },
  ];

  return (
    <div>
      <PageHeader
        title={t('settings.title')}
        subtitle={t('settings.subtitle')}
        breadcrumbs={[{ label: t('nav.settings') }]}
      />

      {user?.isPlatformAdmin && (
        <div className="card card--flat" style={{ marginBottom: 'var(--frz-space-4)', borderColor: 'var(--frz-color-primary)' }}>
          <div className="settings-row">
            <div>
              <h2 className="card-title" style={{ marginBottom: 4 }}>{t('settings.platformAdminTitle')}</h2>
              <p className="page-subtitle" style={{ margin: 0 }}>{t('settings.platformAdminHint')}</p>
            </div>
            <Link className="btn btn-primary btn--sm" to="/control">
              {t('control.title')}
            </Link>
          </div>
        </div>
      )}

      <div className="card card--flat" style={{ marginBottom: 'var(--frz-space-4)' }}>
        <h2 className="card-title" style={{ marginBottom: 'var(--frz-space-3)' }}>
          {t('settings.company')}
        </h2>
        <div className="settings-row">
          <span className="settings-label">{t('settings.companyName')}</span>
          <span>{user?.tenantName}</span>
        </div>
        {user?.countryCode && (
          <div className="settings-row">
            <span className="settings-label">{t('integrations.country')}</span>
            <span>{user.countryCode} · {user.currency}</span>
          </div>
        )}
        <form onSubmit={(e) => void saveProfile(e)}>
          <div className="form-grid" style={{ marginTop: 'var(--frz-space-3)' }}>
            <FormField label={t('settings.companyAddress')}>
              <input
                className="form-input"
                value={profile.address}
                onChange={(e) => setProfile({ ...profile, address: e.target.value })}
              />
            </FormField>
            <FormField label={t('branches.phone')}>
              <input
                className="form-input"
                value={profile.phone}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
              />
            </FormField>
            <FormField label={t('settings.taxNumber')}>
              <input
                className="form-input"
                value={profile.taxNumber}
                onChange={(e) => setProfile({ ...profile, taxNumber: e.target.value })}
              />
            </FormField>
          </div>
          {profileError && <p className="form-error">{profileError}</p>}
          {profileSaved && <p className="form-success">{t('common.saved')}</p>}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary btn--sm">{t('common.save')}</button>
          </div>
        </form>
      </div>

      <div className="card card--flat" style={{ marginBottom: 'var(--frz-space-4)' }}>
        <h2 className="card-title" style={{ marginBottom: 'var(--frz-space-3)' }}>
          {t('settings.administration')}
        </h2>
        <p className="page-subtitle" style={{ marginTop: 0, marginBottom: 'var(--frz-space-3)' }}>
          {t('settings.administrationHint')}
        </p>
        <div className="module-hub-grid">
          {adminLinks.map((link) => (
            <Link key={link.to} to={link.to} className="module-card">
              <div className="module-card-icon" aria-hidden>{link.icon}</div>
              <div className="module-card-body">
                <h2 className="module-card-title">{t(link.titleKey)}</h2>
                <p className="module-card-description">{t(link.descKey)}</p>
              </div>
              <span className="module-card-action">{t('hub.openModule')}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="card card--flat" style={{ marginBottom: 'var(--frz-space-4)' }}>
        <h2 className="card-title" style={{ marginBottom: 'var(--frz-space-3)' }}>
          {t('settings.appearance')}
        </h2>
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

      <details className="card card--flat">
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{t('settings.advanced')}</summary>
        <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8, marginTop: 'var(--frz-space-3)' }}>
          <span>{t('connection.serverUrl')}</span>
          <input
            className="form-input"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="http://192.168.1.10:3000"
          />
          <button type="button" className="btn btn-secondary btn--sm" onClick={() => void saveServerUrl()} style={{ alignSelf: 'flex-start' }}>
            {t('connection.saveServer')}
          </button>
          {serverMessage && (
            <p className={connectivity === ConnectivityStatus.ONLINE ? 'form-success' : 'form-error'}>
              {serverMessage}
            </p>
          )}
          <p className="form-hint">{t('connection.lanHint')}</p>
        </div>
      </details>
    </div>
  );
}
