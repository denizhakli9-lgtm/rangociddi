import { supabase } from '@/lib/supabase';
import type { Appointment } from '@/lib/types';

const OWNER_APPT_COLUMNS = '*, payments(id, status, amount, card_last4)';

type CustomerContact = {
  customer_id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  gender: string | null;
};

export async function fetchOwnerAppointments(businessId: string, range?: { from?: string; to?: string }): Promise<Appointment[]> {
  let q = supabase.from('appointments').select(OWNER_APPT_COLUMNS).eq('business_id', businessId);
  if (range?.from) q = q.gte('starts_at', range.from);
  if (range?.to) q = q.lt('starts_at', range.to);
  const [{ data, error }, { data: contacts, error: contactError }] = await Promise.all([
    q.order('starts_at', { ascending: true }),
    supabase.rpc('business_customer_contacts', { p_business: businessId }),
  ]);
  if (error) throw error;
  if (contactError) throw contactError;

  const byId = new Map<string, CustomerContact>();
  for (const c of (contacts ?? []) as CustomerContact[]) byId.set(c.customer_id, c);

  return ((data ?? []) as Appointment[]).map((a) => {
    const c = a.customer_id ? byId.get(a.customer_id) : undefined;
    return {
      ...a,
      profiles: c ? { full_name: c.full_name, phone: c.phone, email: c.email, gender: c.gender } : null,
    } as Appointment;
  });
}

export function istanbulDayStart(key: string): string {
  return new Date(`${key}T00:00:00+03:00`).toISOString();
}

export type OwnerAction = 'approve' | 'reject' | 'complete' | 'no_show';

export async function runOwnerAction(appointmentId: string, action: OwnerAction): Promise<void> {
  const { error } = await supabase.rpc('business_update_appointment', { p_appointment: appointmentId, p_action: action });
  if (error) throw error;
}

export async function ownerCancel(appointmentId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_appointment', { p_appointment: appointmentId, p_reason: reason });
  if (error) throw error;
}
