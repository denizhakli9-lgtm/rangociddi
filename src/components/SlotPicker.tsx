import { useEffect, useMemo, useState } from 'react';
import { CalendarX2 } from 'lucide-react';
import { fetchSlots } from '@/lib/api';
import { addDays, dateKey, formatTime, isoWeekday, keyLabel } from '@/lib/format';
import { friendlyError } from '@/lib/errors';
import { Spinner } from '@/components/ui/Feedback';
import type { Slot, WorkingHours } from '@/lib/types';
import { tx } from '@/i18n/locale';

interface Props {
  serviceId: string;
  employeeId: string | null;
  hours: WorkingHours[];
  days?: number;
  excludeAppointment?: string;
  value: Slot | null;
  onChange: (slot: Slot | null) => void;
}

export function SlotPicker({ serviceId, employeeId, hours, days = 30, excludeAppointment, value, onChange }: Props) {
  const today = dateKey();
  const dates = useMemo(() => Array.from({ length: days }, (_, i) => addDays(today, i)), [today, days]);
  const isClosed = (key: string) => {
    const h = hours.find((x) => x.weekday === isoWeekday(key));
    return !h || h.is_closed;
  };
  const [date, setDate] = useState(() => dates.find((d) => !isClosed(d)) ?? today);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    onChange(null);
    fetchSlots(serviceId, employeeId, date, excludeAppointment)
      .then((rows) => {
        if (!active) return;
        const seen = new Set<string>();
        setSlots(rows.filter((r) => (seen.has(r.slot_start) ? false : (seen.add(r.slot_start), true))));
      })
      .catch((err) => active && setError(friendlyError(err)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId, employeeId, date, excludeAppointment]);

  const groups = useMemo(() => {
    const morning: Slot[] = [];
    const afternoon: Slot[] = [];
    const evening: Slot[] = [];
    slots.forEach((s) => {
      const hour = Number(formatTime(s.slot_start).slice(0, 2));
      (hour < 12 ? morning : hour < 17 ? afternoon : evening).push(s);
    });
    return ([[tx('Sabah', 'Morning'), morning], [tx('Öğleden sonra', 'Afternoon'), afternoon], [tx('Akşam', 'Evening'), evening]] as [string, Slot[]][]).filter(([, list]) => list.length);
  }, [slots]);

  return (
    <div>
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
        {dates.map((d) => {
          const closed = isClosed(d);
          const active = d === date;
          return (
            <button
              key={d}
              type="button"
              disabled={closed}
              aria-pressed={active}
              onClick={() => setDate(d)}
              className={`flex w-16 shrink-0 flex-col items-center rounded-2xl border py-3 transition ${
                active ? 'border-gold-500 bg-primary text-primary-fg' : closed ? 'cursor-not-allowed border-line-soft text-mist-3' : 'border-line bg-coal text-white hover:border-white/30'
              }`}
            >
              <span className={`text-[10px] uppercase tracking-wider ${active ? 'text-ink/70' : 'text-mist-2'}`}>{d === today ? tx('Bugün', 'Today') : keyLabel(d, { weekday: 'short' })}</span>
              <span className="mt-1 font-display text-2xl leading-none">{keyLabel(d, { day: 'numeric' })}</span>
              <span className={`mt-1 text-[10px] ${active ? 'text-ink/70' : 'text-mist-2'}`}>{closed ? tx('Kapalı', 'Closed') : keyLabel(d, { month: 'short' })}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-6 min-h-[160px]">
        {loading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : error ? (
          <p className="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-300">{error}</p>
        ) : !slots.length ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-line py-10 text-center">
            <CalendarX2 className="mb-3 h-7 w-7 text-mist-2" />
            <p className="text-sm text-white">{tx('Bu gün için boş saat kalmadı', 'No free times left on this day')}</p>
            <p className="mt-1 text-xs text-mist-2">{tx('Lütfen başka bir gün veya uzman seçin.', 'Please choose another day or specialist.')}</p>
          </div>
        ) : (
          <div className="space-y-5">
            {groups.map(([label, list]) => (
              <div key={label}>
                <p className="mb-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-mist">{label}</p>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {list.map((s) => {
                    const active = value?.slot_start === s.slot_start;
                    return (
                      <button
                        key={s.slot_start}
                        type="button"
                        aria-pressed={active}
                        onClick={() => onChange(s)}
                        className={`h-11 rounded-xl border text-sm font-medium transition ${active ? 'border-gold-500 bg-primary text-primary-fg' : 'border-line bg-coal text-white hover:border-white/30'}`}
                      >
                        {formatTime(s.slot_start)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
