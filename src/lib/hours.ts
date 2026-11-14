import type { WorkingHours } from '@/lib/types';
import { dateKey, isoWeekday, nowMinutesIstanbul, timeToMinutes } from '@/lib/format';

export function todayHours(hours: WorkingHours[], businessId: string): WorkingHours | undefined {
  const wd = isoWeekday(dateKey());
  return hours.find((h) => h.business_id === businessId && h.weekday === wd);
}

export function isOpenNow(h: WorkingHours | undefined): boolean {
  if (!h || h.is_closed) return false;
  const now = nowMinutesIstanbul();
  if (now < timeToMinutes(h.open_time) || now >= timeToMinutes(h.close_time)) return false;
  if (h.break_start && h.break_end && now >= timeToMinutes(h.break_start) && now < timeToMinutes(h.break_end)) return false;
  return true;
}

/** True if the business still has bookable working time left today. */
export function hasTimeLeftToday(h: WorkingHours | undefined, leadMinutes = 60): boolean {
  if (!h || h.is_closed) return false;
  return nowMinutesIstanbul() + leadMinutes < timeToMinutes(h.close_time);
}
