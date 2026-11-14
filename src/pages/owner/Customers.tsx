import { useMemo, useState } from 'react';
import { Mail, Phone, Search, UserSquare2 } from 'lucide-react';
import { useAsync } from '@/lib/useAsync';
import { formatDate, formatTRY } from '@/lib/format';
import { Input } from '@/components/ui/Field';
import { Avatar } from '@/components/ui/Brand';
import { Modal } from '@/components/ui/Modal';
import { AppointmentStatusBadge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/layout/PageHeader';
import type { Appointment } from '@/lib/types';
import { useOwnerBusiness } from './OwnerContext';
import { fetchOwnerAppointments } from './ownerApi';

interface CustomerSummary {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  visits: number;
  spent: number;
  noShows: number;
  last: string | null;
  next: string | null;
  history: Appointment[];
}

export default function Customers() {
  const { business } = useOwnerBusiness();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<CustomerSummary | null>(null);
  const { data, loading, error, reload } = useAsync(() => fetchOwnerAppointments(business.id), [business.id]);

  const customers = useMemo(() => {
    const map = new Map<string, CustomerSummary>();
    const now = new Date().toISOString();
    (data ?? [])
      .filter((a) => a.status !== 'pending_payment')
      .forEach((a) => {
        const c = map.get(a.customer_id) ?? {
          id: a.customer_id,
          name: a.profiles?.full_name || 'Müşteri',
          phone: a.profiles?.phone ?? null,
          email: a.profiles?.email ?? null,
          visits: 0,
          spent: 0,
          noShows: 0,
          last: null,
          next: null,
          history: [],
        };
        c.history.push(a);
        if (a.status === 'completed') {
          c.visits += 1;
          c.spent += Number(a.total_price);
          if (!c.last || a.starts_at > c.last) c.last = a.starts_at;
        }
        if (a.status === 'no_show') c.noShows += 1;
        if (['confirmed', 'pending_approval'].includes(a.status) && a.starts_at > now && (!c.next || a.starts_at < c.next)) c.next = a.starts_at;
        map.set(a.customer_id, c);
      });
    return Array.from(map.values()).sort((a, b) => b.spent - a.spent || b.history.length - a.history.length);
  }, [data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR');
    if (!q) return customers;
    return customers.filter((c) => c.name.toLocaleLowerCase('tr-TR').includes(q) || (c.phone ?? '').replace(/\s/g, '').includes(q.replace(/\s/g, '')) || (c.email ?? '').toLowerCase().includes(q));
  }, [customers, query]);

  return (
    <div>
      <PageHeader eyebrow="Müşteriler" title="Müşteri defteri" text="Size randevu almış müşterilerin iletişim bilgileri ve ziyaret geçmişi. Yalnızca işletmenizle paylaşılan bilgiler gösterilir." />
      <div className="mb-6 max-w-md">
        <Input placeholder="İsim, telefon veya e-posta ara" value={query} onChange={(e) => setQuery(e.target.value)} icon={<Search className="h-4 w-4" />} />
      </div>

      {loading && !data ? (
        <SkeletonList count={5} className="h-20" />
      ) : error ? (
        <ErrorState onRetry={reload} />
      ) : !filtered.length ? (
        <EmptyState icon={<UserSquare2 className="h-6 w-6" />} title={query ? 'Sonuç bulunamadı' : 'Henüz müşteriniz yok'} text={query ? undefined : 'İlk randevunuz geldiğinde müşterileriniz burada listelenir.'} />
      ) : (
        <div className="card divide-y divide-line-soft overflow-hidden">
          {filtered.map((c) => (
            <button key={c.id} type="button" onClick={() => setOpen(c)} className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-white/[0.03]">
              <Avatar name={c.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-white">{c.name}</p>
                <p className="truncate text-xs text-mist-2">{c.phone || c.email || '—'}</p>
              </div>
              <div className="hidden w-28 text-right sm:block">
                <p className="text-sm text-white">{c.visits} ziyaret</p>
                <p className="text-[11px] text-mist-2">{c.last ? formatDate(c.last, { day: 'numeric', month: 'short' }) : 'Henüz yok'}</p>
              </div>
              <p className="w-24 text-right font-medium text-gold-300">{formatTRY(c.spent)}</p>
            </button>
          ))}
        </div>
      )}

      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.name ?? ''} subtitle={open ? `${open.visits} ziyaret · ${formatTRY(open.spent)} harcama` : ''} wide>
        {open && (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-3">
              {open.phone && (
                <a href={`tel:${open.phone}`} className="inline-flex items-center gap-2 rounded-xl border border-line px-4 py-2 text-sm text-mist transition hover:border-gold-500/40 hover:text-white">
                  <Phone className="h-4 w-4" /> {open.phone}
                </a>
              )}
              {open.email && (
                <a href={`mailto:${open.email}`} className="inline-flex items-center gap-2 rounded-xl border border-line px-4 py-2 text-sm text-mist transition hover:border-gold-500/40 hover:text-white">
                  <Mail className="h-4 w-4" /> {open.email}
                </a>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <Mini label="Ziyaret" value={String(open.visits)} />
              <Mini label="Gelmedi" value={String(open.noShows)} />
              <Mini label="Sonraki" value={open.next ? formatDate(open.next, { day: 'numeric', month: 'short' }) : '—'} />
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-mist-2">Geçmiş</p>
              <div className="space-y-2">
                {[...open.history].reverse().map((a) => (
                  <div key={a.id} className="flex items-center gap-3 rounded-xl border border-line-soft px-4 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-white">{a.service_name}</p>
                      <p className="text-xs text-mist-2">
                        {formatDate(a.starts_at, { day: 'numeric', month: 'short', year: 'numeric' })} · {a.employee_name}
                      </p>
                    </div>
                    <span className="text-xs text-mist">{formatTRY(a.total_price)}</span>
                    <AppointmentStatusBadge status={a.status} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-ink/40 py-3">
      <p className="font-display text-xl text-white">{value}</p>
      <p className="text-[11px] text-mist-2">{label}</p>
    </div>
  );
}
