/**
 * Centralized ERP data formatting helpers.
 */

export function formatCurrency(
  value: number,
  currency = 'EGP',
  locale?: string,
): string {
  const resolvedLocale = locale ?? document.documentElement.lang ?? 'en';
  return new Intl.NumberFormat(resolvedLocale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(value: number, locale?: string, decimals = 2): string {
  const resolvedLocale = locale ?? document.documentElement.lang ?? 'en';
  return new Intl.NumberFormat(resolvedLocale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatQuantity(value: number, locale?: string): string {
  const resolvedLocale = locale ?? document.documentElement.lang ?? 'en';
  return new Intl.NumberFormat(resolvedLocale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(value);
}

export function formatDate(value: string | Date, locale?: string): string {
  const resolvedLocale = locale ?? document.documentElement.lang ?? 'en';
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat(resolvedLocale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function formatDateTime(value: string | Date, locale?: string): string {
  const resolvedLocale = locale ?? document.documentElement.lang ?? 'en';
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat(resolvedLocale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatPercent(value: number, locale?: string): string {
  const resolvedLocale = locale ?? document.documentElement.lang ?? 'en';
  return new Intl.NumberFormat(resolvedLocale, {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value / 100);
}
