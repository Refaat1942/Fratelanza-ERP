import { app, BrowserWindow, ipcMain, net } from 'electron';
import path from 'path';
import { registerSyncHandlers } from './sync-service';
import { getOrCreateDeviceId } from './device-store';

const DEFAULT_API_URL = process.env.API_URL ?? 'http://localhost:3000';
let configuredApiUrl = DEFAULT_API_URL;
let mainWindow: BrowserWindow | null = null;
let currentAccessToken: string | null = null;

function normalizeApiUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function getHealthUrl(baseUrl?: string): string {
  const base = normalizeApiUrl(baseUrl ?? configuredApiUrl);
  return `${base}/api/v1/health`;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Fratelanza Grand ERP',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    if (process.env.ELECTRON_OPEN_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function getDeviceFingerprint(): string {
  const os = require('os') as typeof import('os');
  const parts = [os.hostname(), os.platform(), os.arch(), os.cpus()[0]?.model ?? ''];
  return Buffer.from(parts.join('|')).toString('base64url');
}

ipcMain.handle('app:getDeviceInfo', () => ({
  deviceId: getOrCreateDeviceId(),
  fingerprint: getDeviceFingerprint(),
  deviceName: require('os').hostname(),
  os: `${process.platform} ${process.arch}`,
  appVersion: app.getVersion(),
}));

ipcMain.handle('app:checkConnectivity', async (_event, apiUrl?: string) => {
  const targetUrl = getHealthUrl(apiUrl ?? configuredApiUrl);
  return new Promise<boolean>((resolve) => {
    const request = net.request(targetUrl);
    request.on('response', (response) => {
      resolve(response.statusCode === 200);
    });
    request.on('error', () => resolve(false));
    request.end();
  });
});

ipcMain.handle('app:getApiUrl', () => configuredApiUrl);

ipcMain.handle('app:setApiUrl', (_event, apiUrl: string) => {
  configuredApiUrl = normalizeApiUrl(apiUrl || DEFAULT_API_URL);
  return configuredApiUrl;
});

ipcMain.handle('auth:setAccessToken', (_event, token: string | null) => {
  currentAccessToken = token;
});

app.whenReady().then(() => {
  registerSyncHandlers(() => currentAccessToken, () => configuredApiUrl);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
