import { StrictMode, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { createI18nInstance } from '@fratelanza/localization';
import { ConnectivityStatus } from '@fratelanza/types';
import { App } from '@desktop/App';
import { useAppStore } from '@desktop/stores';
import { applyLocaleToDocument, applyThemeToDocument, resolveTheme } from '@desktop/lib/api';
import '@desktop/styles/global.css';

const defaultApiUrl =
  import.meta.env.VITE_API_BASE_URL ??
  (import.meta.env.DEV ? '' : `${window.location.origin}`);

function WebBootstrap() {
  const locale = useAppStore((s) => s.locale);
  const theme = useAppStore((s) => s.theme);
  const i18n = useMemo(() => createI18nInstance(locale), [locale]);

  useEffect(() => {
    useAppStore.getState().setApiUrl(defaultApiUrl);
  }, []);

  useEffect(() => {
    void i18n.changeLanguage(locale);
    applyLocaleToDocument(locale);
  }, [locale, i18n]);

  useEffect(() => {
    const resolved = resolveTheme(theme);
    applyThemeToDocument(resolved);
  }, [theme]);

  useEffect(() => {
    useAppStore.getState().setConnectivity(
      navigator.onLine ? ConnectivityStatus.ONLINE : ConnectivityStatus.OFFLINE,
    );
  }, []);

  return (
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <App />
      </I18nextProvider>
    </StrictMode>
  );
}

createRoot(document.getElementById('root')!).render(<WebBootstrap />);
