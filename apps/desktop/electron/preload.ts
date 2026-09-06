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
}

const desktopApi: DesktopApi = {
  getDeviceInfo: () => ipcRenderer.invoke('app:getDeviceInfo'),
  checkConnectivity: () => ipcRenderer.invoke('app:checkConnectivity'),
  getApiUrl: () => ipcRenderer.invoke('app:getApiUrl'),
};

contextBridge.exposeInMainWorld('desktopApi', desktopApi);

declare global {
  interface Window {
    desktopApi: DesktopApi;
  }
}
