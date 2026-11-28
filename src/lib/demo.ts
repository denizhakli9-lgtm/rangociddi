import { isNative } from '@/lib/platform';
import type { PlatformSettings } from '@/lib/types';

/**
 * Seeded sample businesses have no owner (owner_id IS NULL). They stay visible so the
 * catalogue is not empty, but they cannot be booked and their contact details are hidden.
 * An undefined owner_id (a query that did not select the column) is NOT treated as demo,
 * so a missing column never blocks real businesses.
 */
export function isDemoBusiness(b: { owner_id?: string | null } | null | undefined): boolean {
  return !!b && b.owner_id === null;
}

/**
 * Sample businesses are shown on the website only (labelled "Örnek profil", never bookable). The
 * Android / iOS app leaves them out of its lists and search: app review treats unbookable sample
 * listings as placeholder content.
 */
export function withoutAppSamples<T>(rows: T[], businessOf: (row: T) => { owner_id?: string | null } | null | undefined): T[] {
  return isNative ? rows.filter((row) => !isDemoBusiness(businessOf(row))) : rows;
}

/**
 * True when a deposit was (or will be) settled through the test path: platform in test mode,
 * or a payment row created by the test stub (provider_payment_id 'TEST-...'). No money moves
 * in either case, so the UI must never say that a card was charged or refunded.
 */
/** The booking's deposit payment row; a refunded second (over)payment is never shown as the deposit. */
export function depositPayment<T extends { amount: number | string; payment_type?: string | null }>(payments: T[] | null | undefined): T | undefined {
  const list = (payments ?? []).filter((p) => p.payment_type !== 'overpayment');
  return list.find((p) => Number(p.amount) > 0) ?? list[0];
}

export function isTestPayment(payment: object | null | undefined, settings?: Pick<PlatformSettings, 'payment_mode'> | null): boolean {
  const ref = payment && 'provider_payment_id' in payment ? (payment as { provider_payment_id?: unknown }).provider_payment_id : null;
  // A real PayTR capture stays real even if the platform is switched back to test mode later.
  if (typeof ref === 'string' && ref.startsWith('PAYTR-')) return false;
  if (settings?.payment_mode === 'test') return true;
  return typeof ref === 'string' && ref.startsWith('TEST-');
}
