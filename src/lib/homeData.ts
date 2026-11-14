import { supabase } from '@/lib/supabase';
import { fetchSlots } from '@/lib/api';
import { dateKey } from '@/lib/format';
import type { Appointment, Service } from '@/lib/types';
import type { DiscoveryItem } from '@/lib/useDiscovery';

export async function fetchUpcomingAppointment(customerId?: string) {
  if (!customerId) return null;
  const { data, error } = await supabase.from('appointments')
    .select('*, businesses(id, name, slug, cover_url, address, district, city, latitude, longitude, cancellation_hours, phone)')
    .eq('customer_id', customerId)
    .in('status', ['confirmed', 'pending_approval', 'pending_payment'])
    .gt('ends_at', new Date().toISOString())
    .order('starts_at')
    .limit(1).maybeSingle();
  if (error) throw error;
  return data as Appointment | null;
}

export async function checkTodayAvailability(items: DiscoveryItem[]) {
  const available = new Map<string, string>();
  if (!items.length) return available;
  const { data, error } = await supabase.from('services').select('id, business_id').in('business_id', items.map((i) => i.business.id)).eq('is_active', true).order('sort_order');
  if (error) throw error;
  const services = (data ?? []) as Pick<Service, 'id' | 'business_id'>[];
  await Promise.all(items.map(async ({ business }) => {
    for (const service of services.filter((s) => s.business_id === business.id)) {
      const slots = await fetchSlots(service.id, null, dateKey());
      const next = slots.filter((s) => Number.isFinite(Date.parse(s.slot_start)) && Date.parse(s.slot_start) > Date.now()).sort((a, b) => Date.parse(a.slot_start) - Date.parse(b.slot_start))[0];
      if (next) {
        available.set(business.id, next.slot_start);
        break;
      }
    }
  }));
  return available;
}
