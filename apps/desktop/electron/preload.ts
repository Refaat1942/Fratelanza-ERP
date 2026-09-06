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
      pushedCount?: number;
      processedCount?: number;
      pulledCount?: number;
      appliedCount?: number;
      localProductCount?: number;
      pendingCount?: number;
    };
  }>;
  getLocalDbPath: () => Promise<string>;
  initLocalDb: () => Promise<{ success: boolean; path?: string; message?: string }>;
  getLocalStats: () => Promise<{ ready: boolean; productCount: number; pendingCount: number }>;
  offlineCreateCustomer: (args: {
    tenantId: string;
    branchId?: string;
    payload: { code: string; name: string; email?: string; phone?: string };
  }) => Promise<{ id: string }>;
  offlineUpdateCustomer: (args: {
    tenantId: string;
    id: string;
    payload: { name?: string; email?: string; phone?: string };
  }) => Promise<{ success: boolean }>;
  offlineCreateSupplier: (args: {
    tenantId: string;
    payload: { code: string; name: string; email?: string; phone?: string };
  }) => Promise<{ id: string }>;
  offlineUpdateSupplier: (args: {
    tenantId: string;
    id: string;
    payload: { name?: string; email?: string };
  }) => Promise<{ success: boolean }>;
  offlineCreateProduct: (args: {
    tenantId: string;
    payload: {
      sku: string;
      name: string;
      unitId: string;
      barcode?: string;
      salePrice?: number;
      costPrice?: number;
    };
  }) => Promise<{ id: string }>;
  offlineUpdateProduct: (args: {
    tenantId: string;
    id: string;
    payload: { name?: string; barcode?: string; salePrice?: number };
  }) => Promise<{ success: boolean }>;
  getLocalCustomers: () => Promise<Array<{ id: string; code: string; name: string; email?: string; phone?: string; balance: number }>>;
  getLocalSuppliers: () => Promise<Array<{ id: string; code: string; name: string; email?: string; balance: number }>>;
  getLocalProducts: () => Promise<Array<{ id: string; sku: string; name: string; salePrice: number; barcode?: string; isActive: boolean }>>;
  getOrCreateLocalShift: (args: { branchId: string; userId: string }) => Promise<string>;
  setLocalShift: (args: { branchId: string; userId: string; shiftId: string }) => Promise<{ success: boolean }>;
  offlinePosSale: (args: {
    tenantId: string;
    payload: {
      branchId: string;
      userId: string;
      shiftId: string;
      warehouseId?: string;
      customerId?: string;
      lines: Array<{ productId: string; description: string; quantity: number; unitPrice: number }>;
      payments: Array<{ method: string; amount: number }>;
    };
  }) => Promise<{ id: string; number: string }>;
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
  offlineCreateCustomer: (args) => ipcRenderer.invoke('offline:createCustomer', args),
  offlineUpdateCustomer: (args) => ipcRenderer.invoke('offline:updateCustomer', args),
  offlineCreateSupplier: (args) => ipcRenderer.invoke('offline:createSupplier', args),
  offlineUpdateSupplier: (args) => ipcRenderer.invoke('offline:updateSupplier', args),
  offlineCreateProduct: (args) => ipcRenderer.invoke('offline:createProduct', args),
  offlineUpdateProduct: (args) => ipcRenderer.invoke('offline:updateProduct', args),
  getLocalCustomers: () => ipcRenderer.invoke('local:getCustomers'),
  getLocalSuppliers: () => ipcRenderer.invoke('local:getSuppliers'),
  getLocalProducts: () => ipcRenderer.invoke('local:getProducts'),
  getOrCreateLocalShift: (args) => ipcRenderer.invoke('offline:getOrCreateShift', args),
  setLocalShift: (args) => ipcRenderer.invoke('offline:setShift', args),
  offlinePosSale: (args) => ipcRenderer.invoke('offline:posSale', args),
};

contextBridge.exposeInMainWorld('desktopApi', desktopApi);

declare global {
  interface Window {
    desktopApi: DesktopApi;
  }
}
