import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore, useAppStore } from '../stores';
import { createApiClient, resolveApiBaseUrl } from '../lib/api';

export function DemoEntryPage() {
  const params = useParams();
  const slug = (params['*'] ?? params.slug ?? '').replace(/^\/+|\/+$/g, '');
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const apiUrl = useAppStore((s) => s.apiUrl);
  const [demoName, setDemoName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function bootstrap() {
      try {
        const client = createApiClient(() => resolveApiBaseUrl(apiUrl), () => null);
        const info = await client.getDemoInfo(slug);
        setDemoName(info.name);
        const result = await client.demoLogin(slug);
        setAuth(result.accessToken, result.refreshToken, result.user);
        navigate('/', { replace: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : t('demo.unavailable'));
        setLoading(false);
      }
    }
    if (slug) void bootstrap();
  }, [slug, apiUrl, setAuth, navigate, t]);

  if (loading) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>{t('demo.loadingTitle', { name: demoName || slug })}</h1>
          <p>{t('demo.loadingSubtitle')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>{t('demo.unavailableTitle')}</h1>
        <p>{error}</p>
        <button type="button" className="btn btn-primary" onClick={() => navigate('/login')}>
          {t('demo.backToLogin')}
        </button>
      </div>
    </div>
  );
}
