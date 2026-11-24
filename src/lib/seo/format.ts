import type { SeoLang } from './meta';

/** ₺250 for whole lira amounts, ₺249,50 when there are kuruş: the same output as the app's `formatTRY`. */
export function formatPrice(value: number | string, lang: SeoLang = 'tr'): string {
  const amount = Number(value);
  const kurus = Number.isFinite(amount) ? Math.round(amount * 100) : 0;
  const digits = kurus % 100 === 0 ? 0 : 2;
  return new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'tr-TR', {
    style: 'currency',
    currency: 'TRY',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(kurus / 100);
}
