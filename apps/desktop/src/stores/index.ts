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
  tenantName: string;
  branchName?: string;
  role: string;
  permissions: string[];
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  setAuth: (accessToken: string, refreshToken: string, user: AuthUser) => void;
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
      clearAuth: () => set({ accessToken: null, refreshToken: null, user: null }),
    }),
    { name: 'fratelanza-auth' },
  ),
);

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
      apiUrl: 'http://localhost:3000',
      deviceFingerprint: null,
      deviceId: null,
      setLocale: (locale) => set({ locale }),
      setTheme: (theme) => set({ theme }),
      setConnectivity: (connectivity) => set({ connectivity }),
      setApiUrl: (apiUrl) => set({ apiUrl }),
      setDeviceFingerprint: (deviceFingerprint) => set({ deviceFingerprint }),
      setDeviceId: (deviceId) => set({ deviceId }),
    }),
    { name: 'fratelanza-app' },
  ),
);
