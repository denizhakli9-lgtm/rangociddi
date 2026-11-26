import { formatTrPhone } from '@/lib/validation';

/**
 * Phone sign-up for business owners, without an SMS provider.
 *
 * Supabase only has e-mail/password sign-in enabled (no phone provider, no SMS). A business owner
 * who registers with a mobile number gets a technical login address derived from the number:
 *
 *   0532 123 45 67  ->  tel-905321234567@rango.com.tr
 *
 * It is only the login identifier: it is never shown, never receives mail (the app never asks
 * Supabase to e-mail it) and never goes to payment providers. The database stores NULL in
 * profiles.email for these accounts and keeps the number in profiles.phone (see the migration
 * 20261126100000_phone_signup_for_businesses.sql, which also reserves the address pattern for
 * business sign-ups whose metadata carries the same number).
 *
 * The domain is the site's own (it has mail records), so Supabase's address validation accepts it;
 * a separate subdomain without MX could be rejected. Keep PATTERN in sync with
 * private.is_phone_login_email() in the database.
 */
const PREFIX = 'tel-90';
const DOMAIN = 'rango.com.tr';
const PATTERN = /^tel-905\d{9}@rango\.com\.tr$/i;
/** Any address in the reserved range, valid or not; nobody may register these by hand. */
const RESERVED = /^tel-.*@rango\.com\.tr$/i;

/** "0532 123 45 67", "+90 532…", "5321234567" -> "5321234567"; null unless it is a Turkish mobile (5XX). */
export function normalizeTrMobile(v: string): string | null {
  let d = v.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('90')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^5\d{9}$/.test(d) ? d : null;
}

export const isTrMobile = (v: string) => normalizeTrMobile(v) !== null;

/** The technical login address for a mobile number. Throws on an invalid number (check isTrMobile first). */
export function phoneLoginEmail(v: string): string {
  const n = normalizeTrMobile(v);
  if (!n) throw new Error('not a Turkish mobile number');
  return `${PREFIX}${n}@${DOMAIN}`;
}

/** True for a phone account's technical login address (never show or mail it). */
export const isPhoneLoginEmail = (e: string | null | undefined): boolean => !!e && PATTERN.test(e.trim());

/** Addresses nobody may type in an e-mail field (the phone-login range). */
export const isReservedEmail = (e: string | null | undefined): boolean => !!e && RESERVED.test(e.trim());

/** "tel-905321234567@rango.com.tr" -> "0532 123 45 67"; null for any other address. */
export function phoneFromLoginEmail(e: string | null | undefined): string | null {
  if (!isPhoneLoginEmail(e)) return null;
  return formatTrPhone(`0${e!.trim().slice(PREFIX.length, PREFIX.length + 10)}`);
}

/** A login field holds a phone number when it has no "@" and at least one digit. */
export const looksLikePhone = (v: string) => !v.includes('@') && /\d/.test(v);
