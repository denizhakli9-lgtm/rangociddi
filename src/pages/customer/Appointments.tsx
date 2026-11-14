import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarDays, CalendarX2, Clock, CreditCard, MapPin, RefreshCw, Repeat, Star, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';
import { useAuth } from '@/contexts/AuthContext';
import { formatDate, formatTime, formatTRY } from '@/lib/format';
import { AppointmentStatusBadge, PaymentStatusBadge } from '@/components/ui/Badge';
import { Segmented } from '@/components/ui/Brand';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/Feedback';
import type { Appointment } from '@/lib/types';
import { DirectionsButton } from '@/components/DirectionsSheet';
import { CancelModal, RescheduleModal, ReviewModal } from './AppointmentModals';

type Tab = 'upcoming' | 'past';
const ACTIVE = ['pending_payment', 'pending_approval', 'confirmed'];

export default function Appointments() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('upcoming');
  const [cancelling, setCancelling] = useState<Appointment | null>(null);
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null);
  const [reviewing, setReviewing] = useState<Appointment | null>(null);

  const { data, loading, error, reload } = useAsync(async () => {
    const { data: rows, error: err } = await supabase
      .from('appointments')
      .select('*, businesses(id, name, slug, cover_url, address, district, city, latitude, longitude, cancellation_hours, phone), payments(id, status, amount, card_last4), reviews(id)')
      .eq('customer_id', profile!.id)
      .order('starts_at', { ascending: false });
    if (err) throw err;
    return (rows ?? []) as Appointment[];
  }, [profile?.id]);

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const list = data ?? [];
    return {
      upcoming: list.filter((a) => ACTIVE.includes(a.status) && new Date(a.ends_at).getTime() > now).reverse(),
      past: list.filter((a) => !(ACTIVE.includes(a.status) && new Date(a.ends_at).getTime() > now)),
    };
  }, [data]);

  const list = tab === 'upcoming' ? upcoming : past;
  const done = () => {
    setCancelling(null);
    setRescheduling(null);
    setReviewing(null);
    reload();
  };

  return (
    <div className="mx-auto max-w-3xl">
      <p className="eyebrow mb-2">Randevularım</p>
      <h1 className="mb-6 font-display text-4xl text-white">Ayrılmış anlarınız</h1>
      <Segmented<Tab> value={tab} onChange={setTab} options={[{ value: 'upcoming', label: 'Yaklaşan', count: upcoming.length }, { value: 'past', label: 'Geçmiş', count: past.length }]} />

      <div className="mt-6">
        {loading ? (
          <SkeletonList count={3} className="h-44" />
        ) : error ? (
          <ErrorState onRetry={reload} />
        ) : !list.length ? (
          <EmptyState
            icon={tab === 'upcoming' ? <CalendarDays className="h-6 w-6" /> : <CalendarX2 className="h-6 w-6" />}
            title={tab === 'upcoming' ? 'Yaklaşan randevunuz yok' : 'Geçmiş randevunuz yok'}
            text="Size iyi gelecek bir hizmet keşfedin ve ilk randevunuzu oluşturun."
            action={<Button onClick={() => navigate('/kesfet')}>Keşfet</Button>}
          />
        ) : (
          <div className="space-y-4">
            {list.map((a, i) => {
              const payment = a.payments?.[0];
              const reviewed = (a.reviews?.length ?? 0) > 0;
              const canChange = a.status === 'confirmed' || a.status === 'pending_approval';
              return (
                <article key={a.id} style={{ animationDelay: `${i * 40}ms` }} className="card animate-fade-up overflow-hidden transition hover:border-gold-500/30">
                  <div className="flex gap-4 p-4 sm:p-5">
                    <div className="flex w-16 shrink-0 flex-col items-center justify-center rounded-xl border border-gold-500/30 bg-gold-500/5 py-2 text-center">
                      <span className="text-[10px] uppercase tracking-wider text-gold-500">{formatDate(a.starts_at, { month: 'short' })}</span>
                      <span className="font-display text-3xl leading-none text-white">{formatDate(a.starts_at, { day: 'numeric' })}</span>
                      <span className="mt-0.5 text-[10px] text-mist-2">{formatDate(a.starts_at, { weekday: 'short' })}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <Link to={`/i/${a.businesses?.slug ?? ''}`} className="font-display text-xl text-white hover:text-gold-300">{a.businesses?.name}</Link>
                        <AppointmentStatusBadge status={a.status} />
                      </div>
                      <p className="mt-1 text-sm text-mist">{a.service_name} · {a.employee_name}</p>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-mist-2">
                        <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{formatTime(a.starts_at)}</span>
                        <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{a.businesses?.district}</span>
                        <span className="font-mono tracking-wider">{a.booking_code}</span>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-mist">
                        <span>Toplam {formatTRY(a.total_price)}</span>
                        {payment && (
                          <>
                            <span className="text-mist-3">·</span>
                            <span>Kapora {formatTRY(payment.amount)}</span>
                            <PaymentStatusBadge status={payment.status} />
                          </>
                        )}
                      </div>
                      {a.cancellation_reason && a.status === 'cancelled' && <p className="mt-2 text-xs text-mist-2">Not: {a.cancellation_reason}</p>}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 border-t border-line bg-ink/30 px-4 py-3 sm:px-5">
                    {a.status === 'pending_payment' && (
                      <Button size="sm" icon={<CreditCard className="h-3.5 w-3.5" />} onClick={() => navigate(`/odeme/${a.id}`)}>Ödemeyi tamamla</Button>
                    )}
                    {canChange && a.businesses && (
                      <DirectionsButton target={a.businesses} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line px-3 text-xs text-white transition hover:border-gold-500/40">
                        <MapPin className="h-3.5 w-3.5 text-gold-400" /> Yol tarifi
                      </DirectionsButton>
                    )}
                    {canChange && (
                      <Button size="sm" variant="dark" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => setRescheduling(a)}>Ertele</Button>
                    )}
                    {ACTIVE.includes(a.status) && tab === 'upcoming' && (
                      <Button size="sm" variant="ghost" icon={<XCircle className="h-3.5 w-3.5" />} onClick={() => setCancelling(a)}>İptal et</Button>
                    )}
                    {a.status === 'completed' && !reviewed && (
                      <Button size="sm" variant="outline" icon={<Star className="h-3.5 w-3.5" />} onClick={() => setReviewing(a)}>Değerlendir</Button>
                    )}
                    {tab === 'past' && a.businesses?.slug && (
                      <Button size="sm" variant="ghost" icon={<Repeat className="h-3.5 w-3.5" />} onClick={() => navigate(`/i/${a.businesses!.slug}/randevu${a.service_id ? `?hizmet=${a.service_id}` : ''}`)}>Tekrar randevu al</Button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <CancelModal appt={cancelling} onClose={() => setCancelling(null)} onDone={done} />
      <RescheduleModal appt={rescheduling} onClose={() => setRescheduling(null)} onDone={done} />
      <ReviewModal appt={reviewing} onClose={() => setReviewing(null)} onDone={done} />
    </div>
  );
}
