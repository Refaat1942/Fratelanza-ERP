/// <reference types="vite/client" />

interface DesktopApi {
  getDeviceInfo: () => Promise<{
    deviceId: string;
    fingerprint: string;
    deviceName: string;
    os: string;
    appVersion: string;
  }>;
  checkConnectivity: () => Promise<boolean>;
  getApiUrl: () => Promise<string>;
  setAccessToken: (token: string | null) => Promise<void>;
  runSync: () => Promise<{
    success: boolean;
    message?: string;
    data?: {
      pulledCount?: number;
      appliedCount?: number;
      localProductCount?: number;
    };
  }>;
  getLocalDbPath: () => Promise<string>;
  initLocalDb: () => Promise<{ success: boolean; path?: string; message?: string }>;
  getLocalStats: () => Promise<{ ready: boolean; productCount: number }>;
}

interface Window {
  desktopApi?: DesktopApi;
}
