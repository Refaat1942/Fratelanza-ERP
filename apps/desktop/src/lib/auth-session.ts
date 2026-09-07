import { useAuthStore, useAppStore } from '../stores';
import { createApiClient, resolveApiBaseUrl } from './api';

let refreshPromise: Promise<string | null> | null = null;

export async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const { refreshToken, clearAuth } = useAuthStore.getState();
    if (!refreshToken) {
      clearAuth();
      return null;
    }

    const apiUrl = useAppStore.getState().apiUrl;
    const client = createApiClient(() => resolveApiBaseUrl(apiUrl), () => null);

    try {
      const result = await client.refreshSession(refreshToken);
      useAuthStore.getState().updateTokens(result.accessToken, result.refreshToken);
      if (window.desktopApi) {
        await window.desktopApi.setAccessToken(result.accessToken);
      }
      return result.accessToken;
    } catch {
      clearAuth();
      if (window.desktopApi) {
        await window.desktopApi.setAccessToken(null);
      }
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function syncElectronAccessToken(): Promise<void> {
  const token = useAuthStore.getState().accessToken;
  if (window.desktopApi) {
    await window.desktopApi.setAccessToken(token);
  }
}
