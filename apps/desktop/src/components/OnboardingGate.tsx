import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../stores';
import { isOnboardingComplete, markOnboardingComplete } from '../pages/OnboardingPage';

const DEMO_TENANT_SUFFIX = '_DEMO';

/** Redirects new tenants to onboarding until completed (per-tenant local flag). */
export function OnboardingGate() {
  const user = useAuthStore((s) => s.user);
  const tenantId = user?.tenantId;
  const tenantCode = user?.tenantCode ?? '';

  // Demo tenants skip onboarding synchronously (avoid redirect flash / stuck navigation).
  if (tenantId && tenantCode.endsWith(DEMO_TENANT_SUFFIX) && !isOnboardingComplete(tenantId)) {
    markOnboardingComplete(tenantId);
  }

  if (tenantId && !isOnboardingComplete(tenantId)) {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}
