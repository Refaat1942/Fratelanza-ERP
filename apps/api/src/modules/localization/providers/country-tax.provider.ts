import type {
  CountryCode,
  CountryTaxProfile,
  TaxLineInput,
  TaxLineResult,
} from '@fratelanza/shared';

export interface CountryTaxProvider {
  readonly countryCode: CountryCode;
  calculateLineTax(profile: CountryTaxProfile, input: TaxLineInput): TaxLineResult;
}

export function roundMoney(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function resolveTaxRate(
  profile: CountryTaxProfile,
  categoryId?: string,
  override?: number,
): { rate: number; categoryId: string } {
  if (override !== undefined && override !== null) {
    return { rate: override, categoryId: categoryId ?? 'standard' };
  }
  const category = profile.categories.find((c) => c.id === (categoryId ?? 'standard'))
    ?? profile.categories.find((c) => c.id === 'standard')
    ?? profile.categories[0];
  return { rate: category.rate, categoryId: category.id };
}

export function calculateExclusiveTax(
  countryCode: CountryCode,
  profile: CountryTaxProfile,
  input: TaxLineInput,
): TaxLineResult {
  const qty = input.quantity;
  const discount = input.discount ?? 0;
  const gross = roundMoney(qty * input.unitPrice - discount);
  const { rate, categoryId } = resolveTaxRate(profile, input.taxCategoryId, input.taxRateOverride);
  const taxAmount = roundMoney(gross * rate / 100);
  const lineTotal = roundMoney(gross + taxAmount);
  return { gross, taxAmount, lineTotal, taxRate: rate, taxCategoryId: categoryId, countryCode };
}

export function calculateInclusiveTax(
  countryCode: CountryCode,
  profile: CountryTaxProfile,
  input: TaxLineInput,
): TaxLineResult {
  const qty = input.quantity;
  const discount = input.discount ?? 0;
  const lineTotal = roundMoney(qty * input.unitPrice - discount);
  const { rate, categoryId } = resolveTaxRate(profile, input.taxCategoryId, input.taxRateOverride);
  const gross = rate > 0 ? roundMoney(lineTotal / (1 + rate / 100)) : lineTotal;
  const taxAmount = roundMoney(lineTotal - gross);
  return { gross, taxAmount, lineTotal, taxRate: rate, taxCategoryId: categoryId, countryCode };
}
