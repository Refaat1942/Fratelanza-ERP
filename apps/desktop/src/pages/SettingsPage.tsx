import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConnectivityStatus } from '@fratelanza/types';
import { LOCALE_LABELS, SUPPORTED_LOCALES } from '@fratelanza/localization';
import type { Locale, ThemeMode } from '@fratelanza/types';
import { createApiClient, resolveApiBaseUrl, type SyncConflictRow } from '../lib/api';
import { useAppStore, useAuthStore } from '../stores';

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const locale = useAppStore((s) => s.locale);
  const theme = useAppStore((s) => s.theme);
  const connectivity = useAppStore((s) => s.connectivity);
  const apiUrl = useAppStore((s) => s.apiUrl);
  const deviceId = useAppStore((s) => s.deviceId);
  const setDeviceId = useAppStore((s) => s.setDeviceId);
  const setLocale = useAppStore((s) => s.setLocale);
  const setTheme = useAppStore((s) => s.setTheme);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [conflicts, setConflicts] = useState<SyncConflictRow[]>([]);
  const [conflictError, setConflictError] = useState('');
  const [conflictLoading, setConflictLoading] = useState(false);

  function handleLocaleChange(newLocale: Locale) {
    setLocale(newLocale);
    void i18n.changeLanguage(newLocale);
  }

  const loadConflicts = useCallback(async () => {
    if (connectivity === ConnectivityStatus.OFFLINE) return;
    setConflictLoading(true);
    setConflictError('');
    try {
      let id = deviceId;
      if (!id && window.desktopApi) {
        const info = await window.desktopApi.getDeviceInfo();
        id = info.deviceId;
        setDeviceId(info.deviceId);
      }
      if (!id) return;

      const client = createApiClient(() => resolveApiBaseUrl(apiUrl), () => accessToken);
      const rows = await client.getSyncConflicts(id);
      setConflicts(rows);
    } catch (err) {
      setConflictError(err instanceof Error ? err.message : t('errors.generic'));
    } finally {
      setConflictLoading(false);
    }
  }, [accessToken, apiUrl, connectivity, deviceId, setDeviceId, t]);

  useEffect(() => {
    void loadConflicts();
  }, [loadConflicts]);

  async function resolveConflict(id: string, resolution: 'dismiss' | 'server_wins' | 'retry_local') {
    setConflictError('');
    try {
      const client = createApiClient(() => resolveApiBaseUrl(apiUrl), () => accessToken);
      await client.resolveSyncConflict(id, resolution);
      setConflicts((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setConflictError(err instanceof Error ? err.message : t('errors.generic'));
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">{t('settings.title')}</h1>
      </div>

      <div className="card">
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

      <div className="card" style={{ marginTop: 16 }}>
        <div className="page-header" style={{ marginBottom: 12 }}>
          <h2 style={{ fontSize: '1.1rem', margin: 0 }}>{t('sync.conflictsTitle')}</h2>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void loadConflicts()}
            disabled={conflictLoading || connectivity === ConnectivityStatus.OFFLINE}
          >
            {t('common.refresh')}
          </button>
        </div>

        {conflictLoading && <p>{t('common.loading')}</p>}
        {conflictError && <p className="form-error">{conflictError}</p>}
        {!conflictLoading && conflicts.length === 0 && (
          <p style={{ color: 'var(--color-text-secondary)' }}>{t('sync.noConflicts')}</p>
        )}

        {conflicts.map((conflict) => (
          <div
            key={conflict.id}
            className="settings-row"
            style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8, padding: '12px 0', borderTop: '1px solid var(--color-border)' }}
          >
            <div>
              <strong>{conflict.entityType}</strong>
              <span style={{ marginLeft: 8, color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
                {conflict.entityId}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => void resolveConflict(conflict.id, 'retry_local')}
              >
                {t('sync.retryLocal')}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => void resolveConflict(conflict.id, 'server_wins')}
              >
                {t('sync.keepServer')}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => void resolveConflict(conflict.id, 'dismiss')}
              >
                {t('sync.dismiss')}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
