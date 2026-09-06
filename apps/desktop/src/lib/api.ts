import type { Locale } from '@fratelanza/types';

const API_BASE = '/api/v1';

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
    const json = await response.json();

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
