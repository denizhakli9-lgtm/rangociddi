import { supabase } from '@/lib/supabase';
import type { Appointment, AppointmentMessage } from '@/lib/types';

export type ChatRole = AppointmentMessage['sender_role'];

/** Days after the visit during which the conversation stays open (mirrors send_appointment_message). */
const AFTER_VISIT_DAYS = 7;

/**
 * Messaging opens once the deposit is settled (the booking left pending_payment) and stays
 * open for a week after the visit. The server applies the same rule.
 */
export function canMessage(appt: Pick<Appointment, 'status' | 'ends_at'>, now = Date.now()): boolean {
  if (appt.status === 'pending_approval' || appt.status === 'confirmed') return true;
  if (appt.status === 'completed' || appt.status === 'no_show') {
    return new Date(appt.ends_at).getTime() > now - AFTER_VISIT_DAYS * 86400_000;
  }
  return false;
}

/** Statuses for which a conversation may exist (the deposit was paid at some point). */
export function hasChat(appt: Pick<Appointment, 'status'>): boolean {
  return appt.status !== 'pending_payment';
}

/**
 * Unread message counts per appointment for the signed-in user. Row level security limits the
 * rows to the user's own bookings (customer) or business (owner).
 */
export async function fetchUnreadMessageCounts(role: ChatRole, appointmentIds?: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (appointmentIds && !appointmentIds.length) return counts;
  let q = supabase.from('appointment_messages').select('appointment_id').is('read_at', null).neq('sender_role', role).limit(1000);
  if (appointmentIds) q = q.in('appointment_id', appointmentIds.slice(0, 300));
  const { data, error } = await q;
  // Before the migration runs the table does not exist: show no badges rather than failing the page.
  if (error) return counts;
  for (const row of (data ?? []) as { appointment_id: string }[]) {
    counts.set(row.appointment_id, (counts.get(row.appointment_id) ?? 0) + 1);
  }
  return counts;
}
