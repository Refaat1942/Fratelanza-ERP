import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, Outlet, useNavigate } from 'react-router-dom';
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

/** Stable layout guard — never renders blank when session expires. */
export function RequireAuth() {
  const accessToken = useAuthStore((s) => s.accessToken);
  if (!accessToken) {
    return <Navigate to="/login" replace state={{ reason: 'session-expired' }} />;
  }
  return <Outlet />;
}

/** Redirect authenticated users away from guest-only routes (login). */
export function GuestOnly() {
  const accessToken = useAuthStore((s) => s.accessToken);
  if (accessToken) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}

/** @deprecated Use RequireAuth layout route instead. */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  if (!accessToken) {
    return <Navigate to="/login" replace state={{ reason: 'session-expired' }} />;
  }
  return <>{children}</>;
}

/** Navigates to login whenever clearAuth() runs (token refresh failure, 401, etc.). */
export function AuthSessionListener() {
  const navigate = useNavigate();

  useEffect(() => {
    const onAuthCleared = () => {
      navigate('/login', { replace: true, state: { reason: 'session-expired' } });
    };
    window.addEventListener('frz:auth-cleared', onAuthCleared);
    return () => window.removeEventListener('frz:auth-cleared', onAuthCleared);
  }, [navigate]);

  return null;
}
