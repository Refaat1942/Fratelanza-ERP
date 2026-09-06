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
  runSync: () => Promise<{ success: boolean; message?: string; data?: unknown }>;
  getLocalDbPath: () => Promise<string>;
}

interface Window {
  desktopApi?: DesktopApi;
}
