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

/** Turkish ablative suffix for a whole number as it is read aloud: 350 → "den", 40 → "tan", 6 → "dan". */
export function ablativeSuffixTr(n: number): string {
  const ones = ['', 'den', 'den', 'ten', 'ten', 'ten', 'dan', 'den', 'den', 'dan'];
  const tens = ['', 'dan', 'den', 'dan', 'tan', 'den', 'tan', 'ten', 'den', 'dan'];
  if (n % 10) return ones[n % 10];
  if (n % 100) return tens[(n % 100) / 10];
  if (n === 0 || n % 1_000_000 === 0) return 'dan'; // sıfır, milyon
  return 'den'; // yüz, bin
}

/** "Starting from" price: ₺350’den (English: from ₺350). Amounts with kuruş fall back to ₺349,90+. */
export function fromPriceLabel(value: number | string, lang: SeoLang = 'tr'): string {
  const amount = Number(value);
  const kurus = Number.isFinite(amount) ? Math.round(amount * 100) : 0;
  const price = formatPrice(value, lang);
  if (lang === 'en') return `from ${price}`;
  return kurus % 100 === 0 ? `${price}’${ablativeSuffixTr(Math.abs(kurus / 100))}` : `${price}+`;
}
