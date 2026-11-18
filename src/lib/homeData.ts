import { supabase } from '@/lib/supabase';
import { fetchSettings, fetchSlots } from '@/lib/api';
import { dateKey } from '@/lib/format';
import { isDemoBusiness } from '@/lib/demo';
import type { Appointment, PlatformSettings, Service } from '@/lib/types';
import type { DiscoveryItem } from '@/lib/useDiscovery';

/** Default of platform_settings.pending_payment_minutes, used if the settings row cannot be read. */
const DEFAULT_PENDING_PAYMENT_MINUTES = 15;

/**
 * A pending_payment hold whose payment window has passed. The server only releases such holds
 * lazily (on the next booking for the same employee), so the client must not treat them as active.
 */
export function isExpiredHold(a: Pick<Appointment, 'status' | 'created_at'>, settings?: Pick<PlatformSettings, 'pending_payment_minutes'> | null, now = Date.now()): boolean {
  if (a.status !== 'pending_payment') return false;
  const minutes = settings?.pending_payment_minutes ?? DEFAULT_PENDING_PAYMENT_MINUTES;
  const created = Date.parse(a.created_at);
  return Number.isFinite(created) && now > created + minutes * 60000;
}

/** Upper bound of platform_settings.pending_payment_minutes (CHECK BETWEEN 5 AND 120). */
const MAX_PENDING_PAYMENT_MINUTES = 120;

export async function fetchUpcomingAppointment(customerId?: string) {
  if (!customerId) return null;
  // Holds older than the largest allowed payment window are dead whatever the setting is, so drop
  // them on the server; otherwise a pile of stale holds that start earlier could push the real
  // upcoming booking out of the page. isExpiredHold() below applies the exact configured window.
  const staleBefore = new Date(Date.now() - MAX_PENDING_PAYMENT_MINUTES * 60000).toISOString();
  const [{ data, error }, settings] = await Promise.all([
    supabase.from('appointments')
      .select('*, businesses(id, name, slug, cover_url, address, district, city, latitude, longitude, cancellation_hours)')
      .eq('customer_id', customerId)
      .in('status', ['confirmed', 'pending_approval', 'pending_payment'])
      // Quoted: PostgREST treats ',', '.', ':' as reserved inside logic-tree values.
      .or(`status.neq.pending_payment,created_at.gt."${staleBefore}"`)
      .gt('ends_at', new Date().toISOString())
      .order('starts_at')
      .limit(20),
    fetchSettings().catch(() => null),
  ]);
  if (error) throw error;
  const rows = (data ?? []) as Appointment[];
  return rows.find((a) => !isExpiredHold(a, settings)) ?? null;
}

/** Services checked per business: the shortest ones are the likeliest to fit a free gap. */
const SERVICES_CHECKED_PER_BUSINESS = 2;

export async function checkTodayAvailability(items: DiscoveryItem[]) {
  const available = new Map<string, string>();
  // Sample (demo) businesses cannot be booked, so they never show a "free slot today".
  const bookable = items.filter((i) => !isDemoBusiness(i.business));
  if (!bookable.length) return available;
  const { data, error } = await supabase.from('services').select('id, business_id, duration_minutes').in('business_id', bookable.map((i) => i.business.id)).eq('is_active', true).order('sort_order');
  if (error) throw error;
  const services = (data ?? []) as Pick<Service, 'id' | 'business_id' | 'duration_minutes'>[];
  const today = dateKey();
  await Promise.all(bookable.map(async ({ business }) => {
    const candidates = services
      .filter((s) => s.business_id === business.id)
      .sort((a, b) => Number(a.duration_minutes) - Number(b.duration_minutes))
      .slice(0, SERVICES_CHECKED_PER_BUSINESS);
    for (const service of candidates) {
      const slots = await fetchSlots(service.id, null, today);
      const next = slots.filter((s) => Number.isFinite(Date.parse(s.slot_start)) && Date.parse(s.slot_start) > Date.now()).sort((a, b) => Date.parse(a.slot_start) - Date.parse(b.slot_start))[0];
      if (next) {
        available.set(business.id, next.slot_start);
        break;
      }
    }
  }));
  return available;
}
