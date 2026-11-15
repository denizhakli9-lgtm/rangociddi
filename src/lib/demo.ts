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
 * True when a deposit was (or will be) settled through the test path: platform in test mode,
 * or a payment row created by the test stub (provider_payment_id 'TEST-...'). No money moves
 * in either case, so the UI must never say that a card was charged or refunded.
 */
export function isTestPayment(payment: object | null | undefined, settings?: Pick<PlatformSettings, 'payment_mode'> | null): boolean {
  if (settings?.payment_mode === 'test') return true;
  const ref = payment && 'provider_payment_id' in payment ? (payment as { provider_payment_id?: unknown }).provider_payment_id : null;
  return typeof ref === 'string' && ref.startsWith('TEST-');
}
