import { Link, useParams } from 'react-router-dom';
import { CalendarCheck, CalendarPlus, Clock, Hourglass, MapPin, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';
import { formatDate, formatTime, formatTRY } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/Feedback';
import type { Appointment } from '@/lib/types';
import { DirectionsButton } from '@/components/DirectionsSheet';

function icsDate(iso: string) {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function downloadIcs(a: Appointment) {
  const clean = (s: string) => s.replace(/[\\;,\n]/g, ' ');
  const body = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Rango//TR',
    'BEGIN:VEVENT',
    `UID:${a.id}@hizmetburada`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(a.starts_at)}`,
    `DTEND:${icsDate(a.ends_at)}`,
    `SUMMARY:${clean(`${a.service_name} - ${a.businesses?.name ?? ''}`)}`,
    `LOCATION:${clean(a.businesses?.address ?? '')}`,
    `DESCRIPTION:${clean(`Rezervasyon kodu ${a.booking_code}`)}`,
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
  const { data: appt, loading, error, reload } = useAsync(async () => {
    const { data, error: err } = await supabase
      .from('appointments')
      .select('*, businesses(id, name, slug, cover_url, address, district, city, latitude, longitude, cancellation_hours, phone)')
      .eq('id', id)
      .maybeSingle();
    if (err) throw err;
    return data as Appointment | null;
  }, [id]);

  if (loading) return <PageLoader />;
  if (error) return <ErrorState onRetry={reload} />;
  if (!appt) return <EmptyState icon={<CalendarCheck className="h-6 w-6" />} title="Randevu bulunamadı" />;

  const view = {
    confirmed: { icon: CalendarCheck, title: 'Randevunuz onaylandı', text: 'Sizi görmek için sabırsızlanıyoruz. Randevunuzdan önce size hatırlatma göndereceğiz.', tone: 'text-gold-400 border-gold-500/50 bg-gold-500/10' },
    pending_approval: { icon: Hourglass, title: 'Onay bekleniyor', text: 'Kaporanız alındı. İşletme randevunuzu onayladığında size bildirim göndereceğiz.', tone: 'text-warning-300 border-warning-500/40 bg-warning-900/40' },
  }[appt.status as 'confirmed' | 'pending_approval'] ?? {
    icon: XCircle,
    title: 'Randevu aktif değil',
    text: appt.cancellation_reason ?? 'Bu randevu iptal edilmiş veya süresi dolmuş.',
    tone: 'text-error-300 border-error-500/40 bg-error-900/30',
  };
  const active = appt.status === 'confirmed' || appt.status === 'pending_approval';

  return (
    <div className="mx-auto max-w-lg text-center">
      <div className={`mx-auto flex h-20 w-20 animate-scale-in items-center justify-center rounded-full border ${view.tone}`}>
        <view.icon className="h-9 w-9" strokeWidth={1.4} />
      </div>
      <h1 className="mt-6 animate-fade-up font-display text-4xl text-white">{view.title}</h1>
      <p className="mx-auto mt-3 max-w-sm animate-fade-up text-sm text-mist">{view.text}</p>

      <div className="card-gold mt-8 animate-fade-up overflow-hidden text-left [animation-delay:120ms]">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <span className="text-xs uppercase tracking-[0.18em] text-mist-2">Rezervasyon kodu</span>
          <span className="font-mono text-sm font-semibold tracking-widest text-gold-300">{appt.booking_code}</span>
        </div>
        <div className="space-y-4 px-6 py-5">
          <div>
            <p className="font-display text-2xl text-white">{appt.businesses?.name}</p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-mist-2"><MapPin className="h-3.5 w-3.5" />{appt.businesses?.address}</p>
            {active && appt.businesses && <DirectionsButton target={appt.businesses} className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-gold-400 transition hover:text-gold-300" />}
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><p className="text-xs text-mist-2">Hizmet</p><p className="text-white">{appt.service_name}</p></div>
            <div><p className="text-xs text-mist-2">Uzman</p><p className="text-white">{appt.employee_name}</p></div>
            <div><p className="text-xs text-mist-2">Tarih</p><p className="text-white">{formatDate(appt.starts_at, { day: 'numeric', month: 'long', weekday: 'short' })}</p></div>
            <div><p className="text-xs text-mist-2">Saat</p><p className="flex items-center gap-1 text-white"><Clock className="h-3.5 w-3.5 text-gold-500" />{formatTime(appt.starts_at)}</p></div>
          </div>
          <div className="space-y-1.5 border-t border-line pt-4 text-sm">
            <div className="flex justify-between text-mist"><span>Ödenen kapora</span><span className="text-gold-400">{formatTRY(appt.deposit_amount)}</span></div>
            <div className="flex justify-between text-mist"><span>İşletmede ödenecek</span><span className="text-white">{formatTRY(appt.remaining_amount)}</span></div>
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        {active && (
          <Button variant="outline" full icon={<CalendarPlus className="h-4 w-4" />} onClick={() => downloadIcs(appt)}>Takvime ekle</Button>
        )}
        <Link to="/randevularim" className="flex-1">
          <Button full>Randevularım</Button>
        </Link>
      </div>
      <Link to="/kesfet" className="mt-5 inline-block text-xs text-mist-2 hover:text-white">Keşfetmeye devam et</Link>
    </div>
  );
}
