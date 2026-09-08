import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore, useEntitlementStore } from '../stores';
import { ConnectionStatusBadge } from './ConnectionStatusBadge';
import { ToastContainer } from './feedback/Toast';
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

interface NavItem {
  to: string;
  labelKey: string;
  end?: boolean;
  featureKey?: string;
}

interface NavGroup {
  labelKey: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: 'nav.groups.core',
    items: [{ to: '/', labelKey: 'nav.dashboard', end: true }],
  },
  {
    labelKey: 'nav.groups.business',
    items: [
      { to: '/parties', labelKey: 'nav.parties' },
      { to: '/products', labelKey: 'nav.products' },
      { to: '/customers', labelKey: 'nav.customers' },
      { to: '/suppliers', labelKey: 'nav.suppliers' },
      { to: '/warehouses', labelKey: 'nav.warehouses' },
      { to: '/inventory', labelKey: 'nav.inventory' },
      { to: '/sales', labelKey: 'nav.sales' },
      { to: '/purchasing', labelKey: 'nav.purchasing' },
      { to: '/accounting', labelKey: 'nav.accounting' },
      { to: '/pos', labelKey: 'nav.pos' },
    ],
  },
  {
    labelKey: 'nav.groups.projects',
    items: [
      { to: '/projects', labelKey: 'nav.projects', featureKey: 'projects.projects' },
      { to: '/cost-centers', labelKey: 'nav.costCenters', featureKey: 'projects.cost-centers' },
    ],
  },
  {
    labelKey: 'nav.groups.construction',
    items: [
      { to: '/construction/contracts', labelKey: 'nav.constructionContracts', featureKey: 'construction.contracts' },
      { to: '/construction/progress', labelKey: 'nav.constructionProgress', featureKey: 'construction.progress' },
    ],
  },
  {
    labelKey: 'nav.groups.administration',
    items: [
      { to: '/users', labelKey: 'nav.users' },
      { to: '/branches', labelKey: 'nav.branches' },
      { to: '/settings', labelKey: 'nav.settings' },
    ],
  },
];

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
  const [collapsed, setCollapsed] = useState(false);

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

  const visibleGroups = useMemo(() => {
    return NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        const moduleKey = NAV_MODULE_MAP[item.to];
        if (!moduleKey || moduleKey === 'core') return true;
        if (!isModuleEnabled(moduleKey)) return false;
        if (item.featureKey && !isFeatureEnabled(item.featureKey)) return false;
        if (item.to === '/inventory' && !isFeatureEnabled('inventory.stock')) return false;
        return true;
      }),
    })).filter((group) => group.items.length > 0);
  }, [isModuleEnabled, isFeatureEnabled]);

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
      <aside className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}`}>
        <div className="sidebar-brand">
          <div className="sidebar-brand-mark">FG</div>
          <span className="sidebar-brand-text">{t('common.appName')}</span>
        </div>
        <nav className="sidebar-nav">
          {visibleGroups.map((group) => (
            <div key={group.labelKey} className="sidebar-group">
              <span className="sidebar-group-label">{t(group.labelKey)}</span>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `sidebar-link${isActive ? ' active' : ''}`
                  }
                >
                  <span className="sidebar-link-label">{t(item.labelKey)}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button
            type="button"
            className="btn btn-ghost sidebar-collapse-btn btn--sm"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
          >
            {collapsed ? '»' : '«'}
          </button>
        </div>
      </aside>

      <div className="main-content">
        <header className="topbar">
          <div className="topbar-start">
            <ConnectionStatusBadge />
            <div className="topbar-context">
              <span className="topbar-context-label">{user?.tenantName ?? t('common.appName')}</span>
            </div>
          </div>
          <div className="topbar-end">
            <div className="topbar-actions">
              <div className="user-menu">
                <div className="user-avatar">{initials}</div>
                <span>{user?.firstName} {user?.lastName}</span>
              </div>
              <button type="button" className="btn btn-ghost btn--sm" onClick={() => void handleLogout()}>
                {t('auth.logout')}
              </button>
            </div>
          </div>
        </header>
        <main className="page-content">
          <div className="page-content-inner">
            <Outlet />
          </div>
        </main>
      </div>
      <ToastContainer />
    </div>
  );
}
