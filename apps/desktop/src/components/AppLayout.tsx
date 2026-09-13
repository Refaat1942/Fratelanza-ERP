import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { COUNTRY_PROFILES, ERP_MODULES, type CountryCode } from '@fratelanza/shared';
import { useAuthStore } from '../stores';
import { ConnectionStatusBadge } from './ConnectionStatusBadge';
import { ToastContainer } from './feedback/Toast';
import { createApiClient, resolveApiBaseUrl } from '../lib/api';
import { syncElectronAccessToken } from '../lib/auth-session';
import { useAppStore } from '../stores';
import { useEffect } from 'react';

interface NavItem {
  to: string;
  labelKey: string;
  end?: boolean;
}

interface NavGroup {
  labelKey: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: 'nav.groups.home',
    items: [
      { to: '/', labelKey: 'nav.home', end: true },
      { to: '/dashboard', labelKey: 'nav.dashboard' },
    ],
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
      { to: '/pos', labelKey: 'nav.pos' },
    ],
  },
  {
    labelKey: 'nav.groups.finance',
    items: [
      { to: '/accounting', labelKey: 'nav.accounting' },
      { to: '/currency', labelKey: 'nav.currency' },
      { to: '/bank', labelKey: 'nav.bank' },
      { to: '/assets', labelKey: 'nav.assets' },
      { to: '/reports', labelKey: 'nav.reports' },
    ],
  },
  {
    labelKey: 'nav.groups.enterprise',
    items: [
      { to: '/crm', labelKey: 'nav.crm' },
      { to: '/hr', labelKey: 'nav.hr' },
      { to: '/approvals', labelKey: 'nav.approvals' },
    ],
  },
  {
    labelKey: 'nav.groups.projects',
    items: [
      { to: '/projects', labelKey: 'nav.projects' },
      { to: '/cost-centers', labelKey: 'nav.costCenters' },
    ],
  },
  {
    labelKey: 'nav.groups.construction',
    items: [
      { to: '/construction/contracts', labelKey: 'nav.constructionContracts' },
      { to: '/construction/progress', labelKey: 'nav.constructionProgress' },
    ],
  },
  {
    labelKey: 'nav.groups.administration',
    items: [
      { to: '/users', labelKey: 'nav.users' },
      { to: '/branches', labelKey: 'nav.branches' },
      { to: '/settings/roles', labelKey: 'nav.roles' },
      { to: '/settings', labelKey: 'nav.settings' },
      { to: '/settings/integrations', labelKey: 'nav.integrations' },
    ],
  },
];

const ROUTE_TO_MODULE_ID: Record<string, string> = Object.fromEntries(
  ERP_MODULES.map((m) => [m.route, m.id]),
);

export function AppLayout() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const apiUrl = useAppStore((s) => s.apiUrl);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (accessToken) {
      void syncElectronAccessToken();
    }
  }, [accessToken]);

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
    clearAuth();
    navigate('/login');
  }

  const initials = user
    ? `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase()
    : '?';
  const countryCode = (user?.countryCode ?? 'SA') as CountryCode;
  const countryProfile = COUNTRY_PROFILES[countryCode] ?? COUNTRY_PROFILES.SA;

  return (
    <div className="app-layout">
      <aside className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}`}>
        <div className="sidebar-brand">
          <div className="sidebar-brand-mark">FG</div>
          <span className="sidebar-brand-text">{t('common.appName')}</span>
        </div>
        <nav className="sidebar-nav">
          {NAV_GROUPS.map((group) => {
            const visibleItems = group.items.filter((item) => {
              const moduleId = ROUTE_TO_MODULE_ID[item.to];
              return !moduleId || !user?.disabledModules?.includes(moduleId);
            });
            if (visibleItems.length === 0) return null;
            return (
              <div key={group.labelKey} className="sidebar-group">
                <span className="sidebar-group-label">{t(group.labelKey)}</span>
                {visibleItems.map((item) => (
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
            );
          })}
          {user?.isPlatformAdmin && (
            <div className="sidebar-group">
              <span className="sidebar-group-label">{t('control.title')}</span>
              {[
                { to: '/control', end: true, labelKey: 'control.nav.dashboard' },
                { to: '/control/organizations', labelKey: 'control.nav.organizations' },
                { to: '/control/demos', labelKey: 'control.nav.demos' },
                { to: '/control/modules', labelKey: 'control.nav.modules' },
                { to: '/control/authorization', labelKey: 'control.nav.authorization' },
              ].map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
                >
                  <span className="sidebar-link-label">{t(link.labelKey)}</span>
                </NavLink>
              ))}
            </div>
          )}
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
              {user?.countryCode && (
                <span className="topbar-country-badge">
                  {countryProfile.flag} {countryProfile.name} · {user.currency ?? countryProfile.currency}
                </span>
              )}
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
            <Outlet key={location.pathname} />
          </div>
        </main>
      </div>
      <ToastContainer />
    </div>
  );
}
