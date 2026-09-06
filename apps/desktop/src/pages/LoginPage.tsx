import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore, useAppStore } from '../stores';
import { createApiClient } from '../lib/api';

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const apiUrl = useAppStore((s) => s.apiUrl);
  const deviceFingerprint = useAppStore((s) => s.deviceFingerprint);

  const [email, setEmail] = useState('admin@fratelanza.local');
  const [password, setPassword] = useState('Admin@123456');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const client = createApiClient(() => apiUrl, () => null);
      let deviceName: string | undefined;
      if (window.desktopApi) {
        const info = await window.desktopApi.getDeviceInfo();
        deviceName = info.deviceName;
      }

      const result = await client.login(
        email,
        password,
        deviceFingerprint ?? undefined,
        deviceName,
      );

      setAuth(result.accessToken, result.refreshToken, result.user);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.invalidCredentials'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">{t('auth.loginTitle')}</h1>
        <p className="login-subtitle">{t('auth.loginSubtitle')}</p>

        <form onSubmit={(e) => void handleSubmit(e)}>
          <div className="form-group">
            <label className="form-label" htmlFor="email">{t('auth.email')}</label>
            <input
              id="email"
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">{t('auth.password')}</label>
            <input
              id="password"
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          {error && <p className="form-error">{error}</p>}

          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? t('common.loading') : t('auth.login')}
          </button>
        </form>
      </div>
    </div>
  );
}
