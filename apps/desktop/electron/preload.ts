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
  runSync: () => Promise<{ success: boolean; message?: string; data?: unknown }>;
  getLocalDbPath: () => Promise<string>;
}

const desktopApi: DesktopApi = {
  getDeviceInfo: () => ipcRenderer.invoke('app:getDeviceInfo'),
  checkConnectivity: () => ipcRenderer.invoke('app:checkConnectivity'),
  getApiUrl: () => ipcRenderer.invoke('app:getApiUrl'),
  setAccessToken: (token) => ipcRenderer.invoke('auth:setAccessToken', token),
  runSync: () => ipcRenderer.invoke('sync:run'),
  getLocalDbPath: () => ipcRenderer.invoke('sync:getLocalDbPath'),
};

contextBridge.exposeInMainWorld('desktopApi', desktopApi);

declare global {
  interface Window {
    desktopApi: DesktopApi;
  }
}
