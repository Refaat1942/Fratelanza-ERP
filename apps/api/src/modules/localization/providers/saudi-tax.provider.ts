import { Injectable } from '@nestjs/common';
import type { CountryCode, CountryTaxProfile, TaxLineInput, TaxLineResult } from '@fratelanza/shared';
import {
  calculateExclusiveTax,
  calculateInclusiveTax,
  type CountryTaxProvider,
} from './country-tax.provider';

@Injectable()
export class SaudiTaxProvider implements CountryTaxProvider {
  readonly countryCode: CountryCode = 'SA';

  calculateLineTax(profile: CountryTaxProfile, input: TaxLineInput): TaxLineResult {
    const mode = input.taxMode ?? profile.defaultTaxMode;
    return mode === 'inclusive'
      ? calculateInclusiveTax(this.countryCode, profile, input)
      : calculateExclusiveTax(this.countryCode, profile, input);
  }
}
