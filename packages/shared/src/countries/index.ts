export type CountryCode = 'EG' | 'SA';

export type TaxAuthority = 'ETA' | 'ZATCA';

export type GovernmentIntegrationStatus =
  | 'configuration_required'
  | 'pending'
  | 'processing'
  | 'submitted'
  | 'accepted'
  | 'rejected'
  | 'failed'
  | 'retrying';

export interface CountryProfile {
  code: CountryCode;
  name: string;
  nameAr: string;
  flag: string;
  currency: string;
  timezone: string;
  defaultLanguage: 'ar' | 'en';
  taxAuthority: TaxAuthority;
  eInvoicingProvider: string;
  eReceiptProvider?: string;
  rtl: boolean;
  companyFieldKeys: string[];
}

export interface TaxCategoryDefinition {
  id: string;
  label: string;
  labelAr: string;
  rate: number;
  kind: 'standard' | 'zero_rated' | 'exempt' | 'out_of_scope';
}

export interface CountryTaxProfile {
  countryCode: CountryCode;
  defaultTaxMode: 'exclusive' | 'inclusive';
  roundingMode: 'line' | 'document';
  categories: TaxCategoryDefinition[];
}

export interface TaxLineInput {
  quantity: number;
  unitPrice: number;
  discount?: number;
  taxCategoryId?: string;
  taxRateOverride?: number;
  taxMode?: 'exclusive' | 'inclusive';
}

export interface TaxLineResult {
  gross: number;
  taxAmount: number;
  lineTotal: number;
  taxRate: number;
  taxCategoryId: string;
  countryCode: CountryCode;
}

export const COUNTRY_PROFILES: Record<CountryCode, CountryProfile> = {
  EG: {
    code: 'EG',
    name: 'Egypt',
    nameAr: 'مصر',
    flag: '🇪🇬',
    currency: 'EGP',
    timezone: 'Africa/Cairo',
    defaultLanguage: 'ar',
    taxAuthority: 'ETA',
    eInvoicingProvider: 'ETA eInvoicing',
    eReceiptProvider: 'ETA eReceipt',
    rtl: true,
    companyFieldKeys: [
      'legalName',
      'taxRegistrationNumber',
      'commercialRegistration',
      'governorate',
      'city',
      'postalCode',
      'address',
      'phone',
      'email',
    ],
  },
  SA: {
    code: 'SA',
    name: 'Saudi Arabia',
    nameAr: 'المملكة العربية السعودية',
    flag: '🇸🇦',
    currency: 'SAR',
    timezone: 'Asia/Riyadh',
    defaultLanguage: 'ar',
    taxAuthority: 'ZATCA',
    eInvoicingProvider: 'FATOORA',
    rtl: true,
    companyFieldKeys: [
      'legalName',
      'commercialRegistrationNumber',
      'vatRegistrationNumber',
      'buildingNumber',
      'street',
      'district',
      'city',
      'postalCode',
      'additionalNumber',
      'phone',
      'email',
    ],
  },
};

export const DEFAULT_TAX_PROFILES: Record<CountryCode, CountryTaxProfile> = {
  EG: {
    countryCode: 'EG',
    defaultTaxMode: 'exclusive',
    roundingMode: 'line',
    categories: [
      { id: 'standard', label: 'Standard VAT', labelAr: 'ضريبة القيمة المضافة', rate: 14, kind: 'standard' },
      { id: 'zero_rated', label: 'Zero Rated', labelAr: 'نسبة صفر', rate: 0, kind: 'zero_rated' },
      { id: 'exempt', label: 'Exempt', labelAr: 'معفى', rate: 0, kind: 'exempt' },
      { id: 'out_of_scope', label: 'Out of Scope', labelAr: ' خارج النطاق', rate: 0, kind: 'out_of_scope' },
    ],
  },
  SA: {
    countryCode: 'SA',
    defaultTaxMode: 'exclusive',
    roundingMode: 'line',
    categories: [
      { id: 'standard', label: 'Standard VAT', labelAr: 'ضريبة القيمة المضافة', rate: 15, kind: 'standard' },
      { id: 'zero_rated', label: 'Zero Rated', labelAr: 'نسبة صفر', rate: 0, kind: 'zero_rated' },
      { id: 'exempt', label: 'Exempt', labelAr: 'معفى', rate: 0, kind: 'exempt' },
      { id: 'out_of_scope', label: 'Out of Scope', labelAr: 'خارج النطاق', rate: 0, kind: 'out_of_scope' },
    ],
  },
};

export function normalizeCountryCode(value?: string | null): CountryCode | null {
  if (!value) return null;
  const v = value.trim().toUpperCase();
  if (v === 'EG' || v === 'EGY' || v === 'EGYPT') return 'EG';
  if (v === 'SA' || v === 'SAU' || v === 'SAUDI' || v === 'SAUDI ARABIA' || v === 'KSA') return 'SA';
  return null;
}

export function getCountryProfile(code: CountryCode): CountryProfile {
  return COUNTRY_PROFILES[code];
}

export function assertCountryAuthority(country: CountryCode, authority: TaxAuthority): void {
  const profile = COUNTRY_PROFILES[country];
  if (profile.taxAuthority !== authority) {
    throw new Error(`Authority ${authority} is not valid for country ${country}`);
  }
}
