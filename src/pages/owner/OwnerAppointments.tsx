import { useMemo, useState } from 'react';
import { CalendarDays, Search } from 'lucide-react';
import { useAsync } from '@/lib/useAsync';
import { addDays, dateKey, formatDate } from '@/lib/format';
import { Input, Select } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Brand';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/layout/PageHeader';
import type { Appointment } from '@/lib/types';
import { useOwnerBusiness } from './OwnerContext';
import { fetchOwnerAppointments, istanbulDayStart } from './ownerApi';
import { OwnerApptRow } from './OwnerApptRow';
import { AppointmentDetailModal } from './AppointmentDetailModal';

type Tab = 'pending' | 'upcoming' | 'past' | 'cancelled';
const CLOSED = ['cancelled', 'rejected', 'no_show'];

export default function OwnerAppointments() {
  const { business } = useOwnerBusiness();
  const [tab, setTab] = useState<Tab>('upcoming');
  const [query, setQuery] = useState('');
  const [employee, setEmployee] = useState('');
  const [open, setOpen] = useState<Appointment | null>(null);

  const { data, loading, error, reload } = useAsync(
    () => fetchOwnerAppointments(business.id, { from: istanbulDayStart(addDays(dateKey(), -120)), to: istanbulDayStart(addDays(dateKey(), 120)) }),
    [business.id],
  );

  const groups = useMemo(() => {
    const now = Date.now();
    const list = (data ?? []).filter((a) => a.status !== 'pending_payment');
    return {
      pending: list.filter((a) => a.status === 'pending_approval'),
      upcoming: list.filter((a) => a.status === 'confirmed' && new Date(a.ends_at).getTime() > now - 6 * 3600_000),
      past: list.filter((a) => a.status === 'completed' || (a.status === 'confirmed' && new Date(a.ends_at).getTime() <= now - 6 * 3600_000)).reverse(),
      cancelled: list.filter((a) => CLOSED.includes(a.status)).reverse(),
    };
  }, [data]);

  const employees = useMemo(() => Array.from(new Set((data ?? []).map((a) => a.employee_name))).sort((a, b) => a.localeCompare(b, 'tr')), [data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR');
    return groups[tab].filter(
      (a) =>
        (!employee || a.employee_name === employee) &&
        (!q || (a.profiles?.full_name ?? '').toLocaleLowerCase('tr-TR').includes(q) || a.booking_code.toLowerCase().includes(q) || a.service_name.toLocaleLowerCase('tr-TR').includes(q)),
    );
  }, [groups, tab, query, employee]);

  const byDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    filtered.forEach((a) => {
      const k = dateKey(new Date(a.starts_at));
      map.set(k, [...(map.get(k) ?? []), a]);
    });
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div>
      <PageHeader eyebrow="Randevular" title="Randevu yönetimi" text="Talepleri onaylayın, gelen müşterileri tamamlandı olarak işaretleyin, gerektiğinde iptal edin." />

      <div className="mb-4 overflow-x-auto no-scrollbar">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'pending', label: 'Onay bekleyen', count: groups.pending.length },
            { value: 'upcoming', label: 'Yaklaşan', count: groups.upcoming.length },
            { value: 'past', label: 'Geçmiş', count: groups.past.length },
            { value: 'cancelled', label: 'İptal / Gelmedi', count: groups.cancelled.length },
          ]}
        />
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-[1fr_220px]">
        <Input placeholder="Müşteri, hizmet veya rezervasyon kodu" value={query} onChange={(e) => setQuery(e.target.value)} icon={<Search className="h-4 w-4" />} />
        <Select value={employee} onChange={(e) => setEmployee(e.target.value)} aria-label="Uzman">
          <option value="">Tüm uzmanlar</option>
          {employees.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </Select>
      </div>

      {loading && !data ? (
        <SkeletonList count={5} className="h-20" />
      ) : error ? (
        <ErrorState onRetry={reload} />
      ) : byDay.length === 0 ? (
        <EmptyState icon={<CalendarDays className="h-6 w-6" />} title="Bu listede randevu yok" text={query || employee ? 'Filtreleri değiştirerek tekrar deneyin.' : 'Yeni randevular geldiğinde burada görünecek.'} />
      ) : (
        <div className="space-y-6">
          {byDay.map(([day, list]) => (
            <section key={day} className="animate-fade-up">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-mist-2">
                {formatDate(list[0].starts_at, { weekday: 'long', day: 'numeric', month: 'long' })}
              </h3>
              <div className="space-y-2">
                {list.map((a) => (
                  <OwnerApptRow key={a.id} appt={a} onOpen={setOpen} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <AppointmentDetailModal
        appt={open}
        onClose={() => setOpen(null)}
        onDone={() => {
          setOpen(null);
          reload();
        }}
      />
    </div>
  );
}
