import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Locale, ThemeMode } from '@fratelanza/types';
import { ConnectivityStatus } from '@fratelanza/types';

interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  locale: string;
  tenantId: string;
  branchId?: string;
  tenantCode: string;
  tenantName: string;
  branchName?: string;
  role: string;
  permissions: string[];
  isPlatformAdmin?: boolean;
  countryCode?: string;
  currency?: string;
  timezone?: string;
  taxAuthority?: string;
  eInvoicingProvider?: string;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  setAuth: (accessToken: string, refreshToken: string, user: AuthUser) => void;
  updateAccessToken: (accessToken: string) => void;
  updateTokens: (accessToken: string, refreshToken: string) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setAuth: (accessToken, refreshToken, user) =>
        set({ accessToken, refreshToken, user }),
      updateAccessToken: (accessToken) => set({ accessToken }),
      updateTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
      clearAuth: () => {
        set({ accessToken: null, refreshToken: null, user: null });
        window.dispatchEvent(new Event('frz:auth-cleared'));
      },
    }),
    {
      name: 'fratelanza-auth',
    },
  ),
);

const WEB_DEFAULT_API_URL =
  import.meta.env.VITE_WEB_APP === 'true'
    ? (import.meta.env.VITE_API_BASE_URL ??
        (import.meta.env.DEV ? '' : typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'))
    : 'http://localhost:3000';

interface AppState {
  locale: Locale;
  theme: ThemeMode;
  connectivity: ConnectivityStatus;
  apiUrl: string;
  deviceFingerprint: string | null;
  deviceId: string | null;
  setLocale: (locale: Locale) => void;
  setTheme: (theme: ThemeMode) => void;
  setConnectivity: (status: ConnectivityStatus) => void;
  setApiUrl: (url: string) => void;
  setDeviceFingerprint: (fp: string) => void;
  setDeviceId: (id: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      locale: 'en',
      theme: 'system',
      connectivity: ConnectivityStatus.OFFLINE,
      apiUrl: WEB_DEFAULT_API_URL,
      deviceFingerprint: null,
      deviceId: null,
      setLocale: (locale) => set({ locale }),
      setTheme: (theme) => set({ theme }),
      setConnectivity: (connectivity) => set({ connectivity }),
      setApiUrl: (apiUrl) => set({ apiUrl }),
      setDeviceFingerprint: (deviceFingerprint) => set({ deviceFingerprint }),
      setDeviceId: (deviceId) => set({ deviceId }),
    }),
    {
      name: 'fratelanza-app',
      merge: (persisted, current) => {
        const state = { ...current, ...(persisted as Partial<AppState>) };
        if (import.meta.env.VITE_WEB_APP === 'true') {
          state.apiUrl = WEB_DEFAULT_API_URL;
        }
        return state;
      },
    },
  ),
);
