import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Dictionary } from '@/i18n/tr';
import { chosenLocale, dict, locale as currentLocale, storeLocale, type Locale } from '@/i18n/locale';
import { sloganFor } from '@/lib/brand';

export type { Locale } from '@/i18n/locale';

interface I18nValue {
  /** The language the visitor chose (the business and admin panels still render Turkish). */
  locale: Locale;
  setLocale: (l: Locale) => void;
  slogan: string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children, sloganIndex }: { children: ReactNode; sloganIndex: number }) {
  const [locale, setState] = useState<Locale>(chosenLocale);

  const setLocale = useCallback((l: Locale) => {
    storeLocale(l);
    setState(l);
  }, []);

  useEffect(() => {
    // Titles and descriptions follow the language too: RouteSeo re-runs when the app remounts.
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale, slogan: sloganFor(sloganIndex, locale) }), [locale, setLocale, sloganIndex]);

  // Keyed by language: switching remounts the app so every text (including plain helper
  // functions that read the language, such as date formatting) is rendered again.
  return (
    <I18nContext.Provider value={value}>
      <Fragment key={locale}>{children}</Fragment>
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}

/** The dictionary for the language being rendered (Turkish inside the business/admin panels). */
export function useT(): Dictionary {
  const { locale, slogan } = useI18n();
  const d = dict();
  // The rotating slogan belongs to the chosen language; the Turkish-only panels keep the default one.
  return currentLocale() === locale ? { ...d, brand: { ...d.brand, tagline: slogan } } : d;
}
