import { StrictMode, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { createI18nInstance } from '@fratelanza/localization';
import { ConnectivityStatus } from '@fratelanza/types';
import { App } from './App';
import { useAppStore } from './stores';
import { applyLocaleToDocument, applyThemeToDocument, resolveTheme } from './lib/api';
import './styles/global.css';

function Root() {
  const locale = useAppStore((s) => s.locale);
  const theme = useAppStore((s) => s.theme);
  const i18n = useMemo(() => createI18nInstance(locale), [locale]);

  useEffect(() => {
    void i18n.changeLanguage(locale);
    applyLocaleToDocument(locale);
  }, [locale, i18n]);

  useEffect(() => {
    const resolved = resolveTheme(theme);
    applyThemeToDocument(resolved);

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyThemeToDocument(resolveTheme('system'));
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [theme]);

  useEffect(() => {
    async function initDevice() {
      if (window.desktopApi) {
        const info = await window.desktopApi.getDeviceInfo();
        useAppStore.getState().setDeviceFingerprint(info.fingerprint);
        useAppStore.getState().setDeviceId(info.deviceId);
        const storedUrl = useAppStore.getState().apiUrl;
        const apiUrl = storedUrl || await window.desktopApi.getApiUrl();
        useAppStore.getState().setApiUrl(apiUrl);
        await window.desktopApi.setApiUrl(apiUrl);
      }
    }
    void initDevice();
  }, []);

  useEffect(() => {
    async function checkConnection() {
      if (window.desktopApi) {
        const apiUrl = useAppStore.getState().apiUrl;
        if (apiUrl) {
          await window.desktopApi.setApiUrl(apiUrl);
        }
        const online = await window.desktopApi.checkConnectivity(apiUrl);
        useAppStore.getState().setConnectivity(
          online ? ConnectivityStatus.ONLINE : ConnectivityStatus.OFFLINE,
        );
      } else {
        useAppStore.getState().setConnectivity(
          navigator.onLine ? ConnectivityStatus.ONLINE : ConnectivityStatus.OFFLINE,
        );
      }
    }

    void checkConnection();
    const interval = setInterval(() => void checkConnection(), 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <App />
      </I18nextProvider>
    </StrictMode>
  );
}

createRoot(document.getElementById('root')!).render(<Root />);
