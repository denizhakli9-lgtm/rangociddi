import { Link, Navigate, useParams } from 'react-router-dom';
import { CalendarCheck, CalendarPlus, CheckCircle2, Clock, Hourglass, Info, MapPin, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchSettings } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { isTestPayment } from '@/lib/demo';
import { formatDate, formatTime, formatTRY } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/Feedback';
import type { Appointment, PaymentStatus } from '@/lib/types';
import { DirectionsButton } from '@/components/DirectionsSheet';
import { isNative } from '@/lib/platform';
import { tx } from '@/i18n/locale';

type ConfirmationPayment = { id: string; status: PaymentStatus; amount: number; provider_payment_id: string | null };

function icsDate(iso: string) {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** RFC 5545 TEXT escaping: no raw CR/LF (property injection), and \ ; , escaped with a backslash. */
function icsText(s: string) {
  return s.replace(/[\r\n]+/g, ' ').replace(/([\\;,])/g, '\\$1').slice(0, 200);
}

type CalendarAppt = Pick<Appointment, 'id' | 'starts_at' | 'ends_at' | 'service_name' | 'booking_code' | 'businesses'>;

/**
 * The phone apps cannot save a downloaded .ics file, so there the booking opens in the
 * calendar through a Google Calendar "add event" link (the system hands it to the calendar app
 * or the browser). The website keeps the .ics download, which every calendar understands.
 */
function addToCalendar(a: CalendarAppt) {
  if (!isNative) return downloadIcs(a);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${a.service_name} - ${a.businesses?.name ?? ''}`,
    dates: `${icsDate(a.starts_at)}/${icsDate(a.ends_at)}`,
    location: a.businesses?.address ?? '',
    details: tx(`Rezervasyon kodu ${a.booking_code}`, `Booking code ${a.booking_code}`),
  });
  window.location.href = `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function downloadIcs(a: CalendarAppt) {
  const body = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Rango//TR',
    'BEGIN:VEVENT',
    `UID:${a.id}@rango.com.tr`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(a.starts_at)}`,
    `DTEND:${icsDate(a.ends_at)}`,
    `SUMMARY:${icsText(`${a.service_name} - ${a.businesses?.name ?? ''}`)}`,
    `LOCATION:${icsText(a.businesses?.address ?? '')}`,
    `DESCRIPTION:${icsText(tx(`Rezervasyon kodu ${a.booking_code}`, `Booking code ${a.booking_code}`))}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob([body], { type: 'text/calendar' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `rango-${a.booking_code}.ics`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function Confirmation() {
  const { id = '' } = useParams();
  const { data, loading, error, reload } = useAsync(async () => {
    const [{ data: row, error: err }, settings] = await Promise.all([
      supabase
        .from('appointments')
        .select('*, businesses(id, name, slug, cover_url, address, district, city, latitude, longitude, cancellation_hours), payments(id, status, amount, provider_payment_id)')
        .eq('id', id)
        .maybeSingle(),
      fetchSettings().catch(() => null),
    ]);
    if (err) throw err;
    return { appt: row as (Omit<Appointment, 'payments'> & { payments?: ConfirmationPayment[] }) | null, settings };
  }, [id]);

  if (loading) return <PageLoader />;
  if (error) return <ErrorState onRetry={reload} />;
  const appt = data?.appt;
  if (!appt) return <EmptyState icon={<CalendarCheck className="h-6 w-6" />} title={tx('Randevu bulunamadı', 'Booking not found')} />;
  if (appt.status === 'pending_payment') return <Navigate to={`/odeme/${appt.id}`} replace />;

  const deposit = Number(appt.deposit_amount);
  const payment = appt.payments?.find((p) => Number(p.amount) > 0) ?? null;
  const paid = !!payment && (payment.status === 'paid' || payment.status === 'refund_pending' || payment.status === 'refunded');
  const testPayment = deposit > 0 && isTestPayment(payment, data?.settings);
  const active = appt.status === 'confirmed' || appt.status === 'pending_approval';

  const pendingText = deposit > 0 && paid
    ? testPayment
      ? tx('Test ödemeniz tamamlandı. İşletme randevunuzu onayladığında size bildirim göndereceğiz.', 'Your test payment is complete. We will notify you when the business confirms your booking.')
      : tx('Kaporanız alındı. İşletme randevunuzu onayladığında size bildirim göndereceğiz.', 'Your deposit has been received. We will notify you when the business confirms your booking.')
    : tx('Talebiniz işletmeye iletildi. İşletme randevunuzu onayladığında size bildirim göndereceğiz.', 'Your request has been sent to the business. We will notify you when it confirms your booking.');

  const view =
    appt.status === 'confirmed'
      ? { icon: CalendarCheck, title: tx('Randevunuz onaylandı', 'Your booking is confirmed'), text: tx('Sizi görmek için sabırsızlanıyoruz. Randevunuzdan önce size hatırlatma göndereceğiz.', 'We look forward to seeing you. We will send you a reminder before your appointment.'), tone: 'text-gold-400 border-gold-500/50 bg-gold-500/10' }
      : appt.status === 'pending_approval'
        ? { icon: Hourglass, title: tx('Onay bekleniyor', 'Awaiting approval'), text: pendingText, tone: 'text-warning-300 border-warning-500/40 bg-warning-500/10' }
        : appt.status === 'completed'
          ? { icon: CheckCircle2, title: tx('Randevunuz tamamlandı', 'Your appointment is complete'), text: tx('Bizi tercih ettiğiniz için teşekkürler. Deneyiminizi Randevularım sayfasından değerlendirebilirsiniz.', 'Thank you for choosing us. You can review your experience on the My bookings page.'), tone: 'text-success-300 border-success-500/40 bg-success-500/10' }
          : appt.status === 'rejected'
            ? { icon: XCircle, title: tx('Randevu talebiniz onaylanmadı', 'Your booking request was declined'), text: appt.cancellation_reason ?? tx('İşletme bu saat için talebinizi onaylayamadı. Başka bir saat seçerek yeniden randevu oluşturabilirsiniz.', 'The business could not accept this time. You can book again by choosing another time.'), tone: 'text-error-300 border-error-500/40 bg-error-500/10' }
            : { icon: XCircle, title: tx('Randevu aktif değil', 'Booking not active'), text: appt.cancellation_reason ?? tx('Bu randevu iptal edilmiş veya süresi dolmuş.', 'This booking has been cancelled or has expired.'), tone: 'text-error-300 border-error-500/40 bg-error-500/10' };

  const depositLabel = testPayment
    ? tx('Kapora (test, tahsil edilmedi)', 'Deposit (test, not charged)')
    : paid && active
      ? tx('Ödenen kapora', 'Deposit paid')
      : tx('Kapora', 'Deposit');
  const atBusiness = testPayment ? appt.total_price : appt.remaining_amount;

  return (
    <div className="mx-auto max-w-lg text-center">
      <div className={`mx-auto flex h-20 w-20 animate-scale-in items-center justify-center rounded-full border ${view.tone}`}>
        <view.icon className="h-9 w-9" strokeWidth={1.4} />
      </div>
      <h1 className="mt-6 animate-fade-up font-display text-4xl text-white">{view.title}</h1>
      <p className="mx-auto mt-3 max-w-sm animate-fade-up text-sm text-mist">{view.text}</p>

      {testPayment && active && (
        <p className="mx-auto mt-5 flex max-w-md items-start gap-2 rounded-xl border border-warning-500/40 bg-warning-500/10 px-4 py-3 text-left text-xs leading-relaxed text-warning-300">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span><strong className="font-semibold">{tx('Test modu:', 'Test mode:')}</strong> {tx('kartınızdan herhangi bir tutar çekilmedi. Hizmet bedelinin tamamını işletmede ödersiniz.', 'nothing was charged to your card. You pay the full price at the business.')}</span>
        </p>
      )}

      <div className="card-gold mt-8 animate-fade-up overflow-hidden text-left [animation-delay:120ms]">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <span className="text-xs uppercase tracking-[0.18em] text-mist-2">{tx('Rezervasyon kodu', 'Booking code')}</span>
          <span className="font-mono text-sm font-semibold tracking-widest text-gold-300">{appt.booking_code}</span>
        </div>
        <div className="space-y-4 px-6 py-5">
          <div>
            <p className="font-display text-2xl text-white">{appt.businesses?.name}</p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-mist-2"><MapPin className="h-3.5 w-3.5" />{appt.businesses?.address}</p>
            {active && appt.businesses && <DirectionsButton target={appt.businesses} className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-gold-400 transition hover:text-gold-300" />}
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><p className="text-xs text-mist-2">{tx('Hizmet', 'Service')}</p><p className="text-white">{appt.service_name}</p></div>
            <div><p className="text-xs text-mist-2">{tx('Uzman', 'Specialist')}</p><p className="text-white">{appt.employee_name}</p></div>
            <div><p className="text-xs text-mist-2">{tx('Tarih', 'Date')}</p><p className="text-white">{formatDate(appt.starts_at, { day: 'numeric', month: 'long', weekday: 'short' })}</p></div>
            <div><p className="text-xs text-mist-2">{tx('Saat', 'Time')}</p><p className="flex items-center gap-1 text-white"><Clock className="h-3.5 w-3.5 text-gold-500" />{formatTime(appt.starts_at)}</p></div>
          </div>
          <div className="space-y-1.5 border-t border-line pt-4 text-sm">
            {deposit > 0 && (
              <div className="flex justify-between gap-4 text-mist"><span>{depositLabel}</span><span className="text-gold-400">{formatTRY(deposit)}</span></div>
            )}
            {/* Cancelled or rejected bookings owe nothing, so the amount is only shown for live or completed ones. */}
            {(active || appt.status === 'completed') && (
              <div className="flex justify-between gap-4 text-mist"><span>{active ? tx('İşletmede ödenecek', 'To pay at the business') : tx('İşletmede ödenen', 'Paid at the business')}</span><span className="text-white">{formatTRY(atBusiness)}</span></div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        {active && (
          <Button variant="outline" full icon={<CalendarPlus className="h-4 w-4" />} onClick={() => addToCalendar(appt)}>{tx('Takvime ekle', 'Add to calendar')}</Button>
        )}
        <Link to="/randevularim" className="flex-1">
          <Button full>{tx('Randevularım', 'My bookings')}</Button>
        </Link>
      </div>
      <Link to="/kesfet" className="mt-5 inline-block text-xs text-mist-2 hover:text-white">{tx('Keşfetmeye devam et', 'Keep exploring')}</Link>
    </div>
  );
}
