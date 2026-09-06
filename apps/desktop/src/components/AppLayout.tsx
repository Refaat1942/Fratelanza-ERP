import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores';
import { SyncStatusBadge } from './SyncStatusBadge';
import { createApiClient } from '../lib/api';
import { useAppStore } from '../stores';

export function AppLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const apiUrl = useAppStore((s) => s.apiUrl);
  const accessToken = useAuthStore((s) => s.accessToken);

  const navItems = [
    { to: '/', label: t('nav.dashboard'), end: true },
    { to: '/settings', label: t('nav.settings') },
  ];

  async function handleLogout() {
    try {
      const client = createApiClient(() => apiUrl, () => accessToken);
      await client.logout();
    } catch {
      // Continue logout even if API call fails (offline)
    }
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
          <SyncStatusBadge />
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
