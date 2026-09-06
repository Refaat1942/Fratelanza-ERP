import { contextBridge, ipcRenderer } from 'electron';

export interface DesktopApi {
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

const desktopApi: DesktopApi = {
  getDeviceInfo: () => ipcRenderer.invoke('app:getDeviceInfo'),
  checkConnectivity: () => ipcRenderer.invoke('app:checkConnectivity'),
  getApiUrl: () => ipcRenderer.invoke('app:getApiUrl'),
  setAccessToken: (token) => ipcRenderer.invoke('auth:setAccessToken', token),
  runSync: () => ipcRenderer.invoke('sync:run'),
  getLocalDbPath: () => ipcRenderer.invoke('sync:getLocalDbPath'),
  initLocalDb: () => ipcRenderer.invoke('sync:initLocalDb'),
  getLocalStats: () => ipcRenderer.invoke('sync:getLocalStats'),
};

contextBridge.exposeInMainWorld('desktopApi', desktopApi);

declare global {
  interface Window {
    desktopApi: DesktopApi;
  }
}
