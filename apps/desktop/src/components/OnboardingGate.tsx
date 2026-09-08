import { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../stores';
import { isOnboardingComplete, markOnboardingComplete } from '../pages/OnboardingPage';

const DEMO_TENANT_SUFFIX = '_DEMO';

/** Redirects new tenants to onboarding until completed (per-tenant local flag). */
export function OnboardingGate() {
  const user = useAuthStore((s) => s.user);
  const tenantId = user?.tenantId;
  const tenantCode = user?.tenantCode ?? '';

  useEffect(() => {
    if (tenantId && tenantCode.endsWith(DEMO_TENANT_SUFFIX)) {
      markOnboardingComplete(tenantId);
    }
  }, [tenantId, tenantCode]);

  if (tenantId && !isOnboardingComplete(tenantId)) {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}
