import { intlLocale, tx } from '@/i18n/locale';
import { ablativeSuffixTr } from '@/lib/seo/format';

export const TZ = 'Europe/Istanbul';

const currencyCache = new Map<string, Intl.NumberFormat>();
function currency(digits: 0 | 2): Intl.NumberFormat {
  const loc = intlLocale();
  const key = `${loc}:${digits}`;
  let f = currencyCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(loc, { style: 'currency', currency: 'TRY', currencyDisplay: 'narrowSymbol', minimumFractionDigits: digits, maximumFractionDigits: digits });
    currencyCache.set(key, f);
  }
  return f;
}

/** ₺150 for whole lira amounts, ₺150,50 (English: ₺150.50) when there are kuruş (never ₺150,5). */
export function formatTRY(value: number | string | null | undefined): string {
  const kurus = toKurus(value);
  return currency(kurus % 100 === 0 ? 0 : 2).format(kurus / 100 || 0);
}

/** "Starting from" price: ₺350’den (English: from ₺350). Amounts with kuruş fall back to ₺349,90+. */
export function fromPrice(value: number | string | null | undefined): string {
  const kurus = toKurus(value);
  const amount = formatTRY(value);
  if (kurus % 100 !== 0) return tx(`${amount}+`, `from ${amount}`);
  return tx(`${amount}’${ablativeSuffixTr(Math.abs(kurus / 100))}`, `from ${amount}`);
}

/** Converts a lira amount to integer kuruş (avoids floating-point drift in money maths). */
export function toKurus(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }): string {
  return new Intl.DateTimeFormat(intlLocale(), { ...opts, timeZone: TZ }).format(new Date(iso));
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat(intlLocale(), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: TZ }).format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return `${formatDate(iso, { day: 'numeric', month: 'short', weekday: 'short' })} · ${formatTime(iso)}`;
}

export function formatRelative(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return tx('Az önce', 'Just now');
  if (diff < 3600) return tx(`${Math.floor(diff / 60)} dk önce`, `${Math.floor(diff / 60)} min ago`);
  if (diff < 86400) return tx(`${Math.floor(diff / 3600)} sa önce`, `${Math.floor(diff / 3600)} h ago`);
  if (diff < 604800) {
    const days = Math.floor(diff / 86400);
    return tx(`${days} gün önce`, days === 1 ? '1 day ago' : `${days} days ago`);
  }
  return formatDate(iso, { day: 'numeric', month: 'short' });
}

export function formatDuration(minutes: number): string {
  const min = tx('dk', 'min');
  const hr = tx('sa', 'h');
  if (minutes < 60) return `${minutes} ${min}`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} ${hr} ${m} ${min}` : `${h} ${hr}`;
}

/** YYYY-MM-DD for the given instant in İstanbul time. */
export function dateKey(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12));
  return dt.toISOString().slice(0, 10);
}

export function isoWeekday(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  return day === 0 ? 7 : day;
}

export function keyLabel(key: string, opts: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Intl.DateTimeFormat(intlLocale(), { ...opts, timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/** Current İstanbul wall-clock time as minutes since midnight. */
export function nowMinutesIstanbul(): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
  const [h, m] = parts.split(':').map(Number);
  return h * 60 + m;
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function shortTime(t: string | null): string {
  return t ? t.slice(0, 5) : '';
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toLocaleUpperCase('tr-TR'))
    .join('');
}

export function slugify(text: string): string {
  const map: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', İ: 'i' };
  return text
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşüİ]/g, (c) => map[c] ?? c)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * Deposit preview with the same result as the server (create_appointment):
 * percentage → round(price * value / 100, 2), fixed → least(value, price).
 * Integer kuruş and basis points keep half-up rounding identical to Postgres numeric.
 */
export function depositFor(price: number, type: 'percentage' | 'fixed', value: number): number {
  const cents = toKurus(price);
  if (type === 'percentage') {
    const bp = Math.round(Number(value) * 100);
    return Math.round((cents * bp) / 10000) / 100;
  }
  return Math.min(toKurus(value), cents) / 100;
}
