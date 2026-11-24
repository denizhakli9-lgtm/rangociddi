import { tr, type Dictionary } from '@/i18n/tr';
import { en } from '@/i18n/en';

/**
 * Rango speaks Turkish and English.
 *
 * - The customer side (discover, booking, profile, support, sign-in) follows the visitor's
 *   language: their own choice if they made one, otherwise the phone / browser language
 *   (Turkish devices → Turkish, everything else → English).
 * - The business panel (/isletme) and the admin panel (/yonetim) are Turkish only, so a
 *   salon owner whose phone is set to English never sees a half-translated panel.
 * - Legal texts stay Turkish: the Turkish version is the binding one.
 *
 * Usage inside components and helpers: `tx('Kaydet', 'Save')`, or the dictionary via
 * `dict()` / `useT()`. Changing the language remounts the app (see I18nProvider), so every
 * `tx` call is evaluated again; never call `tx` at module level.
 */
export type Locale = 'tr' | 'en';

const STORAGE_KEY = 'rango-lang';
const CRAWLER = /bot\b|crawler|spider|slurp|facebookexternalhit|Google-InspectionTool|GoogleOther|Storebot/i;
const TURKISH_ONLY = /^\/(isletme|yonetim)(\/|$)/;

function detect(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'tr' || saved === 'en') return saved;
  } catch {
    /* storage blocked */
  }
  if (typeof navigator === 'undefined') return 'tr';
  // Search engine crawlers report English (Googlebot: en-US) and send no language preference.
  // Rango's content is Turkish first, so they get the Turkish pages; otherwise Google would
  // index the English texts for a site whose visitors search in Turkish.
  if (CRAWLER.test(navigator.userAgent)) return 'tr';
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
  const first = langs.find(Boolean);
  if (!first) return 'tr';
  return langs.some((l) => /^tr\b/i.test(l)) ? 'tr' : 'en';
}

let chosen: Locale = detect();

/** The language the visitor picked (or that their device implies). */
export function chosenLocale(): Locale {
  return chosen;
}

/** Stores the visitor's choice. Call through I18nProvider's setLocale so the app re-renders. */
export function storeLocale(l: Locale): void {
  chosen = l;
  try {
    localStorage.setItem(STORAGE_KEY, l);
  } catch {
    /* storage blocked: applies to this visit only */
  }
}

/** The language to render right now: the business and admin panels are always Turkish. */
export function locale(): Locale {
  if (chosen === 'en' && typeof window !== 'undefined' && TURKISH_ONLY.test(window.location.pathname)) return 'tr';
  return chosen;
}

export const isEnglish = () => locale() === 'en';

/** Picks the text for the current language. */
export function tx(trText: string, enText: string): string {
  return locale() === 'en' ? enText : trText;
}

const dictionaries: Record<Locale, Dictionary> = { tr, en };

/** The current dictionary (statuses, errors, navigation labels...). */
export function dict(): Dictionary {
  return dictionaries[locale()];
}

/** BCP 47 tag for Intl date and number formatting. */
export function intlLocale(): string {
  return locale() === 'en' ? 'en-GB' : 'tr-TR';
}
