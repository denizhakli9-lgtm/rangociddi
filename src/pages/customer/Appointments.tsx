import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarDays, CalendarX2, Clock, CreditCard, MapPin, RefreshCw, Repeat, Star, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchSettings } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { depositPayment, isDemoBusiness, isTestPayment } from '@/lib/demo';
import { isExpiredHold } from '@/lib/homeData';
import { useAuth } from '@/contexts/AuthContext';
import { formatDate, formatTime, formatTRY } from '@/lib/format';
import { AppointmentStatusBadge, Badge, PaymentStatusBadge } from '@/components/ui/Badge';
import { Segmented } from '@/components/ui/Brand';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/Feedback';
import type { Appointment } from '@/lib/types';
import { DirectionsButton } from '@/components/DirectionsSheet';
import { CancelModal, RescheduleModal, ReviewModal } from './AppointmentModals';
import { tx } from '@/i18n/locale';

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
    const [{ data: rows, error: err }, settings] = await Promise.all([
      supabase
        .from('appointments')
        // owner_id marks seeded demo businesses (isDemoBusiness), which must not be re-booked or rescheduled.
        .select('*, businesses(id, owner_id, name, slug, cover_url, address, district, city, latitude, longitude, cancellation_hours), payments(id, status, amount, card_last4, provider_payment_id, payment_type), reviews(id)')
        .eq('customer_id', profile!.id)
        .order('starts_at', { ascending: false }),
      fetchSettings().catch(() => null),
    ]);
    if (err) throw err;
    return { rows: (rows ?? []) as Appointment[], settings };
  }, [profile?.id]);
  const settings = data?.settings ?? null;

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const list = data?.rows ?? [];
    // Unpaid holds past their payment window are dead even if the server has not released them yet.
    const isUpcoming = (a: Appointment) => ACTIVE.includes(a.status) && new Date(a.ends_at).getTime() > now && !isExpiredHold(a, data?.settings, now);
    return {
      upcoming: list.filter(isUpcoming).reverse(),
      past: list.filter((a) => !isUpcoming(a)),
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
      <p className="eyebrow mb-2">{tx('Randevularım', 'My bookings')}</p>
      <h1 className="mb-6 font-display text-4xl text-white">{tx('Ayrılmış anlarınız', 'Your booked moments')}</h1>
      <Segmented<Tab> value={tab} onChange={setTab} options={[{ value: 'upcoming', label: tx('Yaklaşan', 'Upcoming'), count: upcoming.length }, { value: 'past', label: tx('Geçmiş', 'Past'), count: past.length }]} />

      <div className="mt-6">
        {loading ? (
          <SkeletonList count={3} className="h-44" />
        ) : error ? (
          <ErrorState onRetry={reload} />
        ) : !list.length ? (
          <EmptyState
            icon={tab === 'upcoming' ? <CalendarDays className="h-6 w-6" /> : <CalendarX2 className="h-6 w-6" />}
            title={tab === 'upcoming' ? tx('Yaklaşan randevunuz yok', 'No upcoming bookings') : tx('Geçmiş randevunuz yok', 'No past bookings')}
            text={tx('Size iyi gelecek bir hizmet keşfedin ve ilk randevunuzu oluşturun.', 'Discover a service you will enjoy and make your first booking.')}
            action={<Button onClick={() => navigate('/kesfet')}>{tx('Keşfet', 'Discover')}</Button>}
          />
        ) : (
          <div className="space-y-4">
            {list.map((a, i) => {
              // Zero-deposit bookings also carry a 0 ₺ "paid" row: only real deposits are shown.
              const payment = depositPayment(a.payments?.filter((p) => Number(p.amount) > 0));
              const testPayment = !!payment && isTestPayment(payment, settings);
              const reviewed = (a.reviews?.length ?? 0) > 0;
              const expiredHold = isExpiredHold(a, settings);
              const live = a.status === 'confirmed' || a.status === 'pending_approval';
              // Sample businesses stay visible but cannot be booked: no rescheduling or re-booking there.
              const demo = isDemoBusiness(a.businesses);
              const canChange = live && !!a.service_id && !demo;
              const hoursLeft = (new Date(a.starts_at).getTime() - Date.now()) / 3600000;
              // Prefer the window snapshotted on the booking (what the server applies after the migration).
              const policyHours = a.cancellation_hours ?? a.businesses?.cancellation_hours ?? 24;
              const canReschedule = canChange
                && hoursLeft >= policyHours
                && (settings ? a.reschedule_count < settings.max_reschedules : true);
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
                        {expiredHold ? <Badge tone="neutral">{tx('Ödeme süresi doldu', 'Payment time ran out')}</Badge> : <AppointmentStatusBadge status={a.status} />}
                      </div>
                      <p className="mt-1 text-sm text-mist">{a.service_name} · {a.employee_name}</p>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-mist-2">
                        <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{formatTime(a.starts_at)}</span>
                        <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{a.businesses?.district}</span>
                        <span className="font-mono tracking-wider">{a.booking_code}</span>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-mist">
                        <span>{tx('Toplam', 'Total')} {formatTRY(a.total_price)}</span>
                        {payment && !expiredHold && (
                          <>
                            <span className="text-mist-3">·</span>
                            <span>{tx('Kapora', 'Deposit')} {formatTRY(payment.amount)}</span>
                            {testPayment && payment.status !== 'pending' && payment.status !== 'cancelled'
                              ? <Badge tone="info">{tx('Test ödemesi · tahsil edilmedi', 'Test payment · not charged')}</Badge>
                              : <PaymentStatusBadge status={payment.status} />}
                          </>
                        )}
                      </div>
                      {a.cancellation_reason && a.status === 'cancelled' && <p className="mt-2 text-xs text-mist-2">{tx('Not:', 'Note:')} {a.cancellation_reason}</p>}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 border-t border-line bg-ink/30 px-4 py-3 sm:px-5">
                    {a.status === 'pending_payment' && !expiredHold && (
                      <Button size="sm" icon={<CreditCard className="h-3.5 w-3.5" />} onClick={() => navigate(`/odeme/${a.id}`)}>{tx('Ödemeyi tamamla', 'Complete payment')}</Button>
                    )}
                    {live && a.businesses && (
                      <DirectionsButton target={a.businesses} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line px-3 text-xs text-white transition hover:border-gold-500/40">
                        <MapPin className="h-3.5 w-3.5 text-gold-400" /> {tx('Yol tarifi', 'Directions')}
                      </DirectionsButton>
                    )}
                    {canReschedule && (
                      <Button size="sm" variant="dark" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => setRescheduling(a)}>{tx('Ertele', 'Reschedule')}</Button>
                    )}
                    {ACTIVE.includes(a.status) && !expiredHold && tab === 'upcoming' && (
                      <Button size="sm" variant="ghost" icon={<XCircle className="h-3.5 w-3.5" />} onClick={() => setCancelling(a)}>{tx('İptal et', 'Cancel')}</Button>
                    )}
                    {a.status === 'completed' && !reviewed && (
                      <Button size="sm" variant="outline" icon={<Star className="h-3.5 w-3.5" />} onClick={() => setReviewing(a)}>{tx('Değerlendir', 'Review')}</Button>
                    )}
                    {tab === 'past' && a.businesses?.slug && !demo && (
                      <Button size="sm" variant="ghost" icon={<Repeat className="h-3.5 w-3.5" />} onClick={() => navigate(`/i/${a.businesses!.slug}/randevu${a.service_id ? `?hizmet=${a.service_id}` : ''}`)}>{tx('Tekrar randevu al', 'Book again')}</Button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <CancelModal appt={cancelling} settings={settings} onClose={() => setCancelling(null)} onDone={done} />
      <RescheduleModal appt={rescheduling} onClose={() => setRescheduling(null)} onDone={done} />
      <ReviewModal appt={reviewing} onClose={() => setReviewing(null)} onDone={done} />
    </div>
  );
}
