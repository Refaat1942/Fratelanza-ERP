import type { Locale } from '@fratelanza/types';

const API_BASE = '/api/v1';

export type ProductRow = { id: string; sku: string; name: string; salePrice: number; barcode?: string; isActive: boolean };
export type CustomerRow = { id: string; code: string; name: string; email?: string; phone?: string; balance: number };
export type SupplierRow = { id: string; code: string; name: string; email?: string; balance: number };
export type PartyRow = {
  id: string;
  code: string;
  displayName: string;
  type: string;
  email?: string | null;
  phone?: string | null;
  roles?: Array<{ role: string }>;
};
export type InventoryBalanceRow = { id: string; quantity: number; product: { id: string; name: string; sku: string }; warehouse: { id: string; name: string } };
export type SalesInvoiceRow = { id: string; number: string; status: string; total: number; invoiceDate: string; customer?: { name: string } };
export type PurchaseOrderRow = { id: string; number: string; status: string; total: number; supplier: { name: string } };
export type ProjectRow = {
  id: string;
  code: string;
  name: string;
  status: string;
  description?: string | null;
  branch?: { id: string; name: string } | null;
};
export type CostCenterRow = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  parent?: { id: string; code: string; name: string } | null;
  project?: { id: string; code: string; name: string } | null;
};
export type ConstructionContractRow = {
  id: string;
  number: string;
  title: string;
  direction: string;
  status: string;
  project?: { id: string; code: string; name: string };
  party?: { id: string; code: string; displayName: string };
};
export type ConstructionBoqRow = {
  id: string;
  number: string;
  revisionNumber: number;
  status: string;
  totalOriginalAmount: string;
};
export type ConstructionBoqDetail = ConstructionBoqRow & {
  items?: Array<{
    id: string;
    description: string;
    plannedQuantity: string;
    unitRate: string;
    originalAmount: string;
  }>;
};
export type TrialBalanceRow = { code: string; name: string; debit: number; credit: number; balance?: number };
export type TrialBalanceResult = {
  accounts: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
};
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
export type EntitlementSnapshot = {
  edition: string;
  status: string;
  isOperational: boolean;
  expiresAt: string | null;
  graceEndsAt: string | null;
  modules: Array<{ key: string; enabled: boolean; displayName: string }>;
  features: Array<{ key: string; enabled: boolean; displayName: string }>;
  limits: Record<string, number | null>;
  usage: Record<'users' | 'branches' | 'devices', number>;
};
export type LicenseAdminView = {
  license: {
    id: string;
    licenseKey: string;
    edition: string;
    status: string;
    isOperational: boolean;
    expiresAt: string | null;
    graceEndsAt: string | null;
  };
  entitlements: EntitlementSnapshot;
};
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
    allowRefresh = true,
  ): Promise<T> {
    const url = `${this.getBaseUrl()}${API_BASE}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    const token = this.getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(url, { ...options, headers });

    let json: { data?: T; error?: { message?: string; code?: string } };
    try {
      json = await response.json();
    } catch {
      throw new Error(
        response.ok
          ? 'Invalid server response'
          : `Server error (${response.status}). Is the API running on port 3000?`,
      );
    }

    if (response.status === 401 && allowRefresh && !path.startsWith('/auth/')) {
      const { refreshAccessToken } = await import('./auth-session');
      const newToken = await refreshAccessToken();
      if (newToken) {
        return this.request<T>(path, options, false);
      }
      throw new Error(json.error?.message ?? 'Your session has expired. Please sign in again.');
    }

    if (!response.ok) {
      const message = json.error?.message ?? 'Request failed';
      if (response.status === 401) {
        throw new Error(message || 'Your session has expired. Please sign in again.');
      }
      if (response.status >= 500) {
        throw new Error(`Server error (${response.status}). Please try again shortly.`);
      }
      throw new Error(message);
    }

    return json.data as T;
  }

  refreshSession(refreshToken: string) {
    return this.request<{ accessToken: string; refreshToken: string; expiresIn: string }>(
      '/auth/refresh',
      {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      },
      false,
    );
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

  getEntitlements() {
    return this.request<EntitlementSnapshot>('/license/entitlements');
  }

  getLicenseAdminView() {
    return this.request<LicenseAdminView>('/license');
  }

  getLicenseUsage() {
    return this.request<{ limits: EntitlementSnapshot['limits']; usage: EntitlementSnapshot['usage'] }>(
      '/license/usage',
    );
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
    return this.request<TrialBalanceResult>('/accounting/trial-balance');
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

  listParties(search?: string) {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    return this.request<PartyRow[]>(`/parties${query}`);
  }

  createParty(payload: {
    type: 'individual' | 'organization';
    displayName: string;
    legalName?: string;
    email?: string;
    phone?: string;
    code?: string;
  }) {
    return this.request('/parties', { method: 'POST', body: JSON.stringify(payload) });
  }

  updateParty(id: string, payload: {
    displayName?: string;
    email?: string;
    phone?: string;
    legalName?: string;
  }) {
    return this.request(`/parties/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
  }

  archiveParty(id: string) {
    return this.request(`/parties/${id}/archive`, { method: 'POST' });
  }

  assignPartyRole(id: string, role: 'customer' | 'supplier') {
    return this.request(`/parties/${id}/roles`, {
      method: 'POST',
      body: JSON.stringify({ role }),
    });
  }

  getParty(id: string) {
    return this.request<PartyRow & {
      customer?: { id: string; code: string; name: string } | null;
      supplier?: { id: string; code: string; name: string } | null;
    }>(`/parties/${id}`);
  }

  linkLegacyCustomer(partyId: string, customerId: string) {
    return this.request(`/parties/${partyId}/legacy/customer/link`, {
      method: 'POST',
      body: JSON.stringify({ customerId }),
    });
  }

  unlinkLegacyCustomer(partyId: string) {
    return this.request(`/parties/${partyId}/legacy/customer/link`, { method: 'DELETE' });
  }

  linkLegacySupplier(partyId: string, supplierId: string) {
    return this.request(`/parties/${partyId}/legacy/supplier/link`, {
      method: 'POST',
      body: JSON.stringify({ supplierId }),
    });
  }

  unlinkLegacySupplier(partyId: string) {
    return this.request(`/parties/${partyId}/legacy/supplier/link`, { method: 'DELETE' });
  }

  createSalesInvoice(payload: {
    branchId: string;
    customerId?: string;
    warehouseId?: string;
    lines: Array<{ productId?: string; description: string; quantity: number; unitPrice: number }>;
  }) {
    return this.request<{ id: string; number: string; customerId?: string }>('/sales/invoices', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  createSalesInvoiceFromParty(payload: {
    partyId: string;
    branchId: string;
    warehouseId?: string;
    lines: Array<{ productId?: string; description: string; quantity: number; unitPrice: number }>;
  }) {
    return this.request<{ id: string; number: string; customerId?: string }>('/sales/invoices/from-party', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  postSalesInvoice(id: string, dimensions?: { projectId?: string; costCenterId?: string }) {
    return this.request(`/sales/invoices/${id}/post`, {
      method: 'POST',
      body: JSON.stringify(dimensions ? { dimensions } : {}),
    });
  }

  createPurchaseOrder(payload: {
    branchId: string;
    supplierId: string;
    warehouseId: string;
    lines: Array<{ productId: string; description: string; quantity: number; unitPrice: number }>;
  }) {
    return this.request<{ id: string; number: string; supplierId?: string }>('/purchasing/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  createPurchaseOrderFromParty(payload: {
    partyId: string;
    branchId: string;
    warehouseId: string;
    lines: Array<{ productId: string; description: string; quantity: number; unitPrice: number }>;
  }) {
    return this.request<{ id: string; number: string; supplierId?: string }>('/purchasing/orders/from-party', {
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

  getProjects(search?: string) {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    return this.request<ProjectRow[]>(`/projects${query}`);
  }

  createProject(payload: {
    name: string;
    code?: string;
    description?: string;
    branchId?: string;
    status?: string;
  }) {
    return this.request('/projects', { method: 'POST', body: JSON.stringify(payload) });
  }

  updateProject(id: string, payload: {
    name?: string;
    description?: string;
    status?: string;
  }) {
    return this.request(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
  }

  archiveProject(id: string) {
    return this.request(`/projects/${id}/archive`, { method: 'POST' });
  }

  getCostCenters(search?: string) {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    return this.request<CostCenterRow[]>(`/cost-centers${query}`);
  }

  createCostCenter(payload: {
    code: string;
    name: string;
    description?: string;
    parentId?: string;
    projectId?: string;
    branchId?: string;
  }) {
    return this.request('/cost-centers', { method: 'POST', body: JSON.stringify(payload) });
  }

  updateCostCenter(id: string, payload: {
    name?: string;
    description?: string;
    parentId?: string | null;
    projectId?: string | null;
    isActive?: boolean;
  }) {
    return this.request(`/cost-centers/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
  }

  archiveCostCenter(id: string) {
    return this.request(`/cost-centers/${id}/archive`, { method: 'POST' });
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

  getConstructionContracts(search?: string) {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    return this.request<ConstructionContractRow[]>(`/construction/contracts${query}`);
  }

  createConstructionContract(payload: {
    projectId: string;
    partyId: string;
    title: string;
    direction: 'customer' | 'subcontractor';
    pricingModel: string;
    description?: string;
    originalValue?: string;
  }) {
    return this.request('/construction/contracts', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  getConstructionBoqs(contractId: string) {
    return this.request<ConstructionBoqRow[]>(`/construction/contracts/${contractId}/boqs`);
  }

  createConstructionBoq(contractId: string, payload: { notes?: string; currency?: string }) {
    return this.request(`/construction/contracts/${contractId}/boqs`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  getConstructionBoq(id: string) {
    return this.request<ConstructionBoqDetail>(`/construction/boqs/${id}`);
  }

  createConstructionBoqItem(boqId: string, payload: {
    description: string;
    plannedQuantity: string;
    unitRate: string;
    sectionId?: string;
    productId?: string;
    costCenterId?: string;
  }) {
    return this.request(`/construction/boqs/${boqId}/items`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  approveConstructionBoq(id: string) {
    return this.request(`/construction/boqs/${id}/approve`, { method: 'POST' });
  }

  reviseConstructionBoq(id: string) {
    return this.request(`/construction/boqs/${id}/revise`, { method: 'POST' });
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
