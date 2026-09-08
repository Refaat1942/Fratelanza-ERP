import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore, useAppStore } from '../stores';
import { createApiClient, resolveApiBaseUrl } from '../lib/api';

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const apiUrl = useAppStore((s) => s.apiUrl);
  const deviceFingerprint = useAppStore((s) => s.deviceFingerprint);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const client = createApiClient(() => resolveApiBaseUrl(apiUrl), () => null);
      let deviceName: string | undefined;
      if (window.desktopApi) {
        const info = await window.desktopApi.getDeviceInfo();
        deviceName = info.deviceName;
      }

      const result = await client.login(
        username,
        password,
        deviceFingerprint ?? undefined,
        deviceName,
      );

      setAuth(result.accessToken, result.refreshToken, result.user);
      if (window.desktopApi) {
        const info = await window.desktopApi.getDeviceInfo();
        useAppStore.getState().setDeviceId(info.deviceId);
        await window.desktopApi.setAccessToken(result.accessToken);
      }
      navigate('/');
    } catch (err) {
      const message = err instanceof Error ? err.message : t('auth.invalidCredentials');
      if (message === 'Failed to fetch') {
        setError('Cannot reach API. Make sure `npm run dev:api` is running on port 3000.');
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-brand-mark">FG</div>
          <div>
            <h1 className="login-title">{t('auth.loginTitle')}</h1>
            <p className="login-subtitle" style={{ marginBottom: 0 }}>{t('auth.loginSubtitle')}</p>
          </div>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)}>
          <div className="form-group">
            <label className="form-label" htmlFor="username">{t('auth.username')}</label>
            <input
              id="username"
              type="text"
              className="form-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
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
