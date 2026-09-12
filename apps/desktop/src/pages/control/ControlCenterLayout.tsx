import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { APP_NAME } from '@fratelanza/shared';

const links = [
  { to: '/control', end: true, labelKey: 'control.nav.dashboard' },
  { to: '/control/organizations', labelKey: 'control.nav.organizations' },
  { to: '/control/demos', labelKey: 'control.nav.demos' },
  { to: '/control/modules', labelKey: 'control.nav.modules' },
  { to: '/control/authorization', labelKey: 'control.nav.authorization' },
];

export function ControlCenterLayout() {
  const { t } = useTranslation();

  return (
    <div className="control-center">
      <header className="control-center-header">
        <div>
          <p className="control-center-kicker">{APP_NAME}</p>
          <h1>{t('control.title')}</h1>
        </div>
        <NavLink to="/" className="btn btn-secondary">
          {t('control.backToErp')}
        </NavLink>
      </header>
      <nav className="control-center-nav">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) =>
              `control-center-nav-link${isActive ? ' control-center-nav-link--active' : ''}`
            }
          >
            {t(link.labelKey)}
          </NavLink>
        ))}
      </nav>
      <main className="control-center-main">
        <Outlet />
      </main>
    </div>
  );
}
