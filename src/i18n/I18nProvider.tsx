import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { tr, type Dictionary } from '@/i18n/tr';

export type Locale = 'tr';

const dictionaries: Record<Locale, Dictionary> = { tr };

interface I18nValue {
  locale: Locale;
  t: Dictionary;
  setLocale: (l: Locale) => void;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children, slogan }: { children: ReactNode; slogan: string }) {
  const [locale, setLocale] = useState<Locale>('tr');
  const value = useMemo(() => ({
    locale,
    t: { ...dictionaries[locale], brand: { ...dictionaries[locale].brand, tagline: slogan } },
    setLocale,
  }), [locale, slogan]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}

export function useT(): Dictionary {
  return useI18n().t;
}
