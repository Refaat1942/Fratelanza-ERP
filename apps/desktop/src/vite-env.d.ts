/// <reference types="vite/client" />

interface DesktopApi {
  getDeviceInfo: () => Promise<{
    deviceId: string;
    fingerprint: string;
    deviceName: string;
    os: string;
    appVersion: string;
  }>;
  checkConnectivity: (apiUrl?: string) => Promise<boolean>;
  setApiUrl: (apiUrl: string) => Promise<string>;
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

interface Window {
  desktopApi?: DesktopApi;
}
