import type { Locale } from '@fratelanza/types';

const API_BASE = '/api/v1';

export type ProductRow = { id: string; sku: string; name: string; salePrice: number; barcode?: string; isActive: boolean };
export type CustomerRow = { id: string; code: string; name: string; email?: string; phone?: string; balance: number };
export type SupplierRow = { id: string; code: string; name: string; email?: string; balance: number };
export type InventoryBalanceRow = { id: string; quantity: number; product: { id: string; name: string; sku: string }; warehouse: { id: string; name: string } };
export type SalesInvoiceRow = { id: string; number: string; status: string; total: number; invoiceDate: string; customer?: { name: string } };
export type PurchaseOrderRow = { id: string; number: string; status: string; total: number; supplier: { name: string } };
export type TrialBalanceRow = { code: string; name: string; debit: number; credit: number };
export type UserRow = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  isActive: boolean;
  branch?: { id: string; name: string; code: string };
  role?: { id: string; name: string; code: string };
};
export type BranchRow = { id: string; code: string; name: string; isActive: boolean; isDefault?: boolean };
export type SyncConflictRow = {
  id: string;
  entityType: string;
  entityId: string;
  localVersion: Record<string, unknown>;
  serverVersion: Record<string, unknown>;
  createdAt: string;
};

export function resolveApiBaseUrl(storedUrl: string): string {
  // In Vite dev, route through the proxy (same origin) to avoid CORS/network issues
  if (import.meta.env.DEV) {
    return '';
  }
  return storedUrl || 'http://localhost:3000';
}

export class ApiClient {
  constructor(
    private getBaseUrl: () => string,
    private getAccessToken: () => string | null,
  ) {}

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.getBaseUrl()}${API_BASE}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    const token = this.getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(url, { ...options, headers });

    let json: { data?: T; error?: { message?: string } };
    try {
      json = await response.json();
    } catch {
      throw new Error(
        response.ok
          ? 'Invalid server response'
          : `Server error (${response.status}). Is the API running on port 3000?`,
      );
    }

    if (!response.ok) {
      throw new Error(json.error?.message ?? 'Request failed');
    }

    return json.data as T;
  }

  login(email: string, password: string, deviceFingerprint?: string, deviceName?: string) {
    return this.request<{
      accessToken: string;
      refreshToken: string;
      user: {
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
      };
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, deviceFingerprint, deviceName }),
    });
  }

  logout() {
    return this.request('/auth/logout', { method: 'POST' });
  }

  getCurrentTenant() {
    return this.request('/tenants/current');
  }

  getBranches() {
    return this.request('/branches');
  }

  getSettings() {
    return this.request('/settings');
  }

  getDashboardStats() {
    return this.request<{
      salesToday: number;
      salesMonth: number;
      receivables: number;
      payables: number;
      inventoryValue: number;
      lowStockCount: number;
    }>('/dashboard/stats');
  }

  getProducts() {
    return this.request<ProductRow[]>('/products');
  }

  getCustomers() {
    return this.request<CustomerRow[]>('/customers');
  }

  getSuppliers() {
    return this.request<SupplierRow[]>('/suppliers');
  }

  getWarehouses() {
    return this.request<Array<{ id: string; code: string; name: string; isActive: boolean; branch?: { name: string } }>>('/warehouses');
  }

  createWarehouse(payload: { branchId: string; code: string; name: string; address?: string }) {
    return this.request('/warehouses', { method: 'POST', body: JSON.stringify(payload) });
  }

  getInventoryBalances() {
    return this.request<InventoryBalanceRow[]>('/inventory/balances');
  }

  getSalesInvoices() {
    return this.request<SalesInvoiceRow[]>('/sales/invoices');
  }

  getPurchaseOrders() {
    return this.request<PurchaseOrderRow[]>('/purchasing/orders');
  }

  getAccounts() {
    return this.request<Array<{ id: string; code: string; name: string; type: string }>>('/accounting/accounts');
  }

  getTrialBalance() {
    return this.request<TrialBalanceRow[]>('/accounting/trial-balance');
  }

  triggerSync(deviceId: string) {
    return this.request<{ processed?: number }>('/sync/push', {
      method: 'POST',
      body: JSON.stringify({ deviceId, items: [] }),
    });
  }

  pullSync(deviceId: string, cursor?: string) {
    const params = new URLSearchParams({ deviceId });
    if (cursor) params.set('cursor', cursor);
    return this.request<{ changes: unknown[]; cursor: string }>(`/sync/pull?${params.toString()}`);
  }

  getSyncConflicts(deviceId: string) {
    return this.request<SyncConflictRow[]>(`/sync/conflicts?deviceId=${encodeURIComponent(deviceId)}`);
  }

  resolveSyncConflict(id: string, resolution: 'dismiss' | 'server_wins' | 'retry_local') {
    return this.request(`/sync/conflicts/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ resolution }),
    });
  }

  getUsers() {
    return this.request<UserRow[]>('/users');
  }

  createUser(payload: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    roleId: string;
    branchId?: string;
    phone?: string;
  }) {
    return this.request('/users', { method: 'POST', body: JSON.stringify(payload) });
  }

  getRoles() {
    return this.request<Array<{ id: string; name: string; code: string }>>('/roles');
  }

  createBranch(payload: { name: string; code: string; address?: string }) {
    return this.request('/branches', { method: 'POST', body: JSON.stringify(payload) });
  }

  getUnitsOfMeasure() {
    return this.request<Array<{ id: string; code: string; name: string }>>('/units-of-measure');
  }

  createProduct(payload: {
    sku: string;
    name: string;
    unitId: string;
    categoryId?: string;
    barcode?: string;
    salePrice?: number;
    costPrice?: number;
  }) {
    return this.request('/products', { method: 'POST', body: JSON.stringify(payload) });
  }

  updateProduct(id: string, payload: {
    name?: string;
    barcode?: string;
    salePrice?: number;
    costPrice?: number;
    isActive?: boolean;
  }) {
    return this.request(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
  }

  createCustomer(payload: {
    code: string;
    name: string;
    email?: string;
    phone?: string;
    address?: string;
  }) {
    return this.request('/customers', { method: 'POST', body: JSON.stringify(payload) });
  }

  updateCustomer(id: string, payload: {
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
    isActive?: boolean;
  }) {
    return this.request(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
  }

  createSupplier(payload: {
    code: string;
    name: string;
    email?: string;
    phone?: string;
  }) {
    return this.request('/suppliers', { method: 'POST', body: JSON.stringify(payload) });
  }

  updateSupplier(id: string, payload: {
    name?: string;
    email?: string;
    phone?: string;
    isActive?: boolean;
  }) {
    return this.request(`/suppliers/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
  }

  createSalesInvoice(payload: {
    branchId: string;
    customerId?: string;
    warehouseId?: string;
    lines: Array<{ productId?: string; description: string; quantity: number; unitPrice: number }>;
  }) {
    return this.request<{ id: string; number: string }>('/sales/invoices', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  postSalesInvoice(id: string) {
    return this.request(`/sales/invoices/${id}/post`, { method: 'POST' });
  }

  createPurchaseOrder(payload: {
    branchId: string;
    supplierId: string;
    warehouseId: string;
    lines: Array<{ productId: string; description: string; quantity: number; unitPrice: number }>;
  }) {
    return this.request<{ id: string; number: string }>('/purchasing/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  receivePurchaseOrder(id: string) {
    return this.request(`/purchasing/orders/${id}/receive`, { method: 'POST' });
  }

  adjustInventory(payload: {
    warehouseId: string;
    productId: string;
    quantity: number;
    notes?: string;
  }) {
    return this.request('/inventory/adjust', { method: 'POST', body: JSON.stringify(payload) });
  }

  seedChartOfAccounts() {
    return this.request<{ seeded: number }>('/accounting/seed-coa', { method: 'POST' });
  }

  openPosShift(payload: { branchId: string; openingCash?: number; deviceId?: string }) {
    return this.request<{ id: string }>('/pos/shifts/open', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  closePosShift(payload: { shiftId: string; closingCash: number }) {
    return this.request('/pos/shifts/close', { method: 'POST', body: JSON.stringify(payload) });
  }

  postPosSale(payload: {
    branchId: string;
    shiftId: string;
    warehouseId?: string;
    customerId?: string;
    lines: Array<{ productId: string; description: string; quantity: number; unitPrice: number }>;
    payments: Array<{ method: string; amount: number }>;
  }) {
    return this.request<{ id: string; number: string }>('/pos/sales', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }
}

export function createApiClient(
  getBaseUrl: () => string,
  getAccessToken: () => string | null,
) {
  return new ApiClient(getBaseUrl, getAccessToken);
}

export function applyLocaleToDocument(locale: Locale) {
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
}

export function applyThemeToDocument(theme: 'light' | 'dark') {
  document.documentElement.setAttribute('data-theme', theme);
}

export function resolveTheme(mode: 'light' | 'dark' | 'system'): 'light' | 'dark' {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return mode;
}
