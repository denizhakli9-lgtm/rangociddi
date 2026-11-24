import { supabase } from '@/lib/supabase';
import type { Appointment } from '@/lib/types';

// Card details are not selected: no owner screen shows them (KVKK data minimisation).
const OWNER_APPT_COLUMNS = '*, payments(id, status, amount, provider_payment_id, payment_type)';

type CustomerContact = {
  customer_id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
};

/**
 * Loads the business's appointments with the customer contact the business is allowed to see.
 * With `includeAllPending`, pending_approval requests are always included, whatever their date,
 * so the owner can never miss a request that falls outside the date range.
 */
export async function fetchOwnerAppointments(
  businessId: string,
  range?: { from?: string; to?: string },
  opts?: { includeAllPending?: boolean },
): Promise<Appointment[]> {
  let q = supabase.from('appointments').select(OWNER_APPT_COLUMNS).eq('business_id', businessId);
  if (range?.from) q = q.gte('starts_at', range.from);
  if (range?.to) q = q.lt('starts_at', range.to);
  const bounded = !!(range?.from || range?.to);
  const pendingQ =
    opts?.includeAllPending && bounded
      ? supabase.from('appointments').select(OWNER_APPT_COLUMNS).eq('business_id', businessId).eq('status', 'pending_approval').order('starts_at', { ascending: true })
      : null;
  const [{ data, error }, { data: contacts, error: contactError }, pending] = await Promise.all([
    q.order('starts_at', { ascending: true }),
    supabase.rpc('business_customer_contacts', { p_business: businessId }),
    pendingQ ?? Promise.resolve({ data: [] as unknown[], error: null }),
  ]);
  if (error) throw error;
  if (contactError) throw contactError;
  if (pending.error) throw pending.error;

  const byId = new Map<string, CustomerContact>();
  for (const c of (contacts ?? []) as CustomerContact[]) byId.set(c.customer_id, c);

  let rows = (data ?? []) as Appointment[];
  const seen = new Set(rows.map((r) => r.id));
  const extra = ((pending.data ?? []) as Appointment[]).filter((p) => !seen.has(p.id));
  if (extra.length) rows = [...rows, ...extra].sort((a, b) => (a.starts_at < b.starts_at ? -1 : a.starts_at > b.starts_at ? 1 : 0));

  // Only name, phone and e-mail are kept: owners have no use for other profile fields (KVKK data minimisation).
  return rows.map((a) => {
    const c = a.customer_id ? byId.get(a.customer_id) : undefined;
    return {
      ...a,
      profiles: c ? { full_name: c.full_name, phone: c.phone, email: c.email } : null,
    } as Appointment;
  });
}

export function istanbulDayStart(key: string): string {
  return new Date(`${key}T00:00:00+03:00`).toISOString();
}

/**
 * A payment is a test payment when it was created by the test checkout (provider id 'TEST-…')
 * or while the platform runs in test mode. No money was taken from a card for these.
 */
export function isTestPayment(p: { provider_payment_id?: string | null; status?: string } | null | undefined, paymentMode?: string | null): boolean {
  if (!p) return false;
  // A real PayTR capture stays real even if the platform is switched back to test mode later.
  if (typeof p.provider_payment_id === 'string' && p.provider_payment_id.startsWith('PAYTR-')) return false;
  if (paymentMode === 'test') return true;
  return typeof p.provider_payment_id === 'string' && p.provider_payment_id.startsWith('TEST-');
}

/**
 * A paid booking that was confirmed automatically and not yet answered by the business: the
 * business can still approve it (locks it in) or decline it (full deposit refund) until it starts.
 * approved_at is undefined before the migration that adds it; such rows are treated as answered.
 */
export function awaitsOwnerDecision(a: Pick<Appointment, 'status' | 'approved_at' | 'starts_at'>, now = Date.now()): boolean {
  return a.status === 'confirmed' && a.approved_at === null && new Date(a.starts_at).getTime() > now;
}

export type OwnerAction = 'approve' | 'reject' | 'complete' | 'no_show';

export async function runOwnerAction(appointmentId: string, action: OwnerAction, reason = ''): Promise<void> {
  // p_reason is only sent when there is one, so the call also works against the older two-argument function.
  const args: Record<string, string> = { p_appointment: appointmentId, p_action: action };
  if (reason) args.p_reason = reason;
  const { error } = await supabase.rpc('business_update_appointment', args);
  if (error) throw error;
}

export async function ownerCancel(appointmentId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_appointment', { p_appointment: appointmentId, p_reason: reason });
  if (error) throw error;
}
