import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore, useEntitlementStore } from '../stores';
import { ConnectionStatusBadge } from './ConnectionStatusBadge';
import { createApiClient, resolveApiBaseUrl } from '../lib/api';
import { syncElectronAccessToken } from '../lib/auth-session';
import { useAppStore } from '../stores';

const NAV_MODULE_MAP: Record<string, string | undefined> = {
  '/': 'core',
  '/parties': 'party',
  '/products': 'products',
  '/customers': 'customers',
  '/suppliers': 'suppliers',
  '/warehouses': 'warehouses',
  '/inventory': 'inventory',
  '/sales': 'sales',
  '/purchasing': 'purchasing',
  '/projects': 'projects',
  '/cost-centers': 'projects',
  '/construction/contracts': 'construction',
  '/construction/progress': 'construction',
  '/accounting': 'accounting',
  '/pos': 'pos',
  '/users': 'core',
  '/branches': 'core',
  '/settings': 'core',
};

export function AppLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const clearEntitlements = useEntitlementStore((s) => s.clearEntitlements);
  const setEntitlements = useEntitlementStore((s) => s.setEntitlements);
  const isModuleEnabled = useEntitlementStore((s) => s.isModuleEnabled);
  const isFeatureEnabled = useEntitlementStore((s) => s.isFeatureEnabled);
  const apiUrl = useAppStore((s) => s.apiUrl);

  useEffect(() => {
    if (accessToken) {
      void syncElectronAccessToken();
    }
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) {
      clearEntitlements();
      return;
    }

    const client = createApiClient(() => resolveApiBaseUrl(apiUrl), () => accessToken);
    void client.getEntitlements().then((data) => {
      setEntitlements({
        edition: data.edition,
        status: data.status,
        isOperational: data.isOperational,
        modules: data.modules,
        features: data.features,
      });
    }).catch(() => {
      clearEntitlements();
    });
  }, [accessToken, apiUrl, clearEntitlements, setEntitlements]);

  const navItems = [
    { to: '/', label: t('nav.dashboard'), end: true },
    { to: '/parties', label: t('nav.parties') },
    { to: '/products', label: t('nav.products') },
    { to: '/customers', label: t('nav.customers') },
    { to: '/suppliers', label: t('nav.suppliers') },
    { to: '/warehouses', label: t('nav.warehouses') },
    { to: '/inventory', label: t('nav.inventory') },
    { to: '/sales', label: t('nav.sales') },
    { to: '/purchasing', label: t('nav.purchasing') },
    { to: '/projects', label: t('nav.projects'), featureKey: 'projects.projects' as const },
    { to: '/cost-centers', label: t('nav.costCenters'), featureKey: 'projects.cost-centers' as const },
    { to: '/construction/contracts', label: t('nav.constructionContracts'), featureKey: 'construction.contracts' as const },
    { to: '/construction/progress', label: t('nav.constructionProgress'), featureKey: 'construction.progress' as const },
    { to: '/accounting', label: t('nav.accounting') },
    { to: '/pos', label: t('nav.pos') },
    { to: '/users', label: t('nav.users') },
    { to: '/branches', label: t('nav.branches') },
    { to: '/settings', label: t('nav.settings') },
  ].filter((item) => {
    const moduleKey = NAV_MODULE_MAP[item.to];
    if (!moduleKey || moduleKey === 'core') return true;
    if (!isModuleEnabled(moduleKey)) return false;
    if ('featureKey' in item && item.featureKey && !isFeatureEnabled(item.featureKey)) return false;
    if (item.to === '/inventory' && !isFeatureEnabled('inventory.stock')) return false;
    return true;
  });

  async function handleLogout() {
    try {
      const client = createApiClient(() => resolveApiBaseUrl(apiUrl), () => accessToken);
      await client.logout();
    } catch {
      // Continue logout even if API call fails (offline)
    }
    if (window.desktopApi) {
      await window.desktopApi.setAccessToken(null);
    }
    clearEntitlements();
    clearAuth();
    navigate('/login');
  }

  const initials = user
    ? `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase()
    : '?';

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">{t('common.appName')}</div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `sidebar-link${isActive ? ' active' : ''}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="main-content">
        <header className="topbar">
          <ConnectionStatusBadge />
          <div className="topbar-actions">
            <div className="user-menu">
              <div className="user-avatar">{initials}</div>
              <span>{user?.firstName} {user?.lastName}</span>
            </div>
            <button type="button" className="btn btn-ghost" onClick={() => void handleLogout()}>
              {t('auth.logout')}
            </button>
          </div>
        </header>
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
