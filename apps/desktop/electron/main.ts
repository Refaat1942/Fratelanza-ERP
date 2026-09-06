import { app, BrowserWindow, ipcMain, net } from 'electron';
import path from 'path';
import { registerSyncHandlers } from './sync-service';
import { getOrCreateDeviceId } from './device-store';
import { initLocalDatabase } from './local-db';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
let mainWindow: BrowserWindow | null = null;
let currentAccessToken: string | null = null;

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
    mainWindow.webContents.openDevTools({ mode: 'detach' });
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

ipcMain.handle('app:checkConnectivity', async () => {
  return new Promise<boolean>((resolve) => {
    const request = net.request(`${API_URL}/api/v1/health`);
    request.on('response', (response) => {
      resolve(response.statusCode === 200);
    });
    request.on('error', () => resolve(false));
    request.end();
  });
});

ipcMain.handle('app:getApiUrl', () => API_URL);

ipcMain.handle('auth:setAccessToken', (_event, token: string | null) => {
  currentAccessToken = token;
});

app.whenReady().then(() => {
  registerSyncHandlers(() => currentAccessToken);
  void initLocalDatabase().catch(() => {
    // Local DB optional until first sync; errors surfaced in sync UI.
  });
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
