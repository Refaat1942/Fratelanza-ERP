import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores';

function BootScreen() {
  const { t } = useTranslation();

  return (
    <div className="boot-screen">
      <div className="boot-card">
        <div className="boot-logo">FG</div>
        <h1 className="boot-title">{t('common.appName')}</h1>
        <p className="boot-subtitle">{t('boot.loading')}</p>
        <div className="boot-spinner" />
      </div>
    </div>
  );
}

export function AuthHydrationGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(() => useAuthStore.persist.hasHydrated());

  useEffect(() => {
    if (useAuthStore.persist.hasHydrated()) {
      setReady(true);
      return;
    }

    const unsub = useAuthStore.persist.onFinishHydration(() => setReady(true));
    const fallback = window.setTimeout(() => setReady(true), 1500);

    return () => {
      unsub();
      window.clearTimeout(fallback);
    };
  }, []);

  if (!ready) return <BootScreen />;
  return <>{children}</>;
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  if (!accessToken) return null;
  return <>{children}</>;
}
