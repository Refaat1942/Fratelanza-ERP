import i18n from 'i18next';
import type { Locale } from '@fratelanza/types';
import { en } from './locales/en';
import { ar } from './locales/ar';

export const SUPPORTED_LOCALES: Locale[] = ['en', 'ar'];

export const LOCALE_DIRECTION: Record<Locale, 'ltr' | 'rtl'> = {
  en: 'ltr',
  ar: 'rtl',
};

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  ar: 'العربية',
};

const resources = {
  en: { translation: en },
  ar: { translation: ar },
};

export function createI18nInstance(defaultLocale: Locale = 'en') {
  const instance = i18n.createInstance();
  void instance.init({
    resources,
    lng: defaultLocale,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });
  return instance;
}

export { en, ar };
export type { TranslationKeys } from './locales/en';
