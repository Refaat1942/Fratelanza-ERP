import { useTranslation } from 'react-i18next';
import { LOCALE_LABELS, SUPPORTED_LOCALES } from '@fratelanza/localization';
import type { Locale, ThemeMode } from '@fratelanza/types';
import { useAppStore } from '../stores';

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const locale = useAppStore((s) => s.locale);
  const theme = useAppStore((s) => s.theme);
  const setLocale = useAppStore((s) => s.setLocale);
  const setTheme = useAppStore((s) => s.setTheme);

  function handleLocaleChange(newLocale: Locale) {
    setLocale(newLocale);
    void i18n.changeLanguage(newLocale);
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
    </div>
  );
}
