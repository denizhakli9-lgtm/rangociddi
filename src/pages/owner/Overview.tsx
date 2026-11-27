import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CalendarCheck, CheckCircle2, Circle, Clock, Hourglass, Star, Wallet } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';
import { addDays, dateKey, formatDate, formatTRY } from '@/lib/format';
import { StatCard } from '@/components/ui/Brand';
import { BusinessStatusBadge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/layout/PageHeader';
import type { Appointment } from '@/lib/types';
import { useOwnerBusiness } from './OwnerContext';
import { awaitsOwnerDecision, fetchOwnerAppointments, istanbulDayStart } from './ownerApi';
import { OwnerApptRow } from './OwnerApptRow';
import { AppointmentDetailModal } from './AppointmentDetailModal';

const STATUS_NOTE: Record<string, { tone: string; text: string }> = {
  pending: { tone: 'border-warning-500/30 bg-warning-500/10 text-warning-300', text: 'İşletmeniz yönetim onayı bekliyor. Bu sürede hizmetlerinizi, ekibinizi ve çalışma saatlerinizi hazırlayın; onaylandığında müşteriler sizi keşfedebilir.' },
  rejected: { tone: 'border-error-500/30 bg-error-500/10 text-error-300', text: 'Başvurunuz onaylanmadı. Bilgilerinizi güncelleyip destek ekibimizle iletişime geçebilirsiniz.' },
  suspended: { tone: 'border-error-500/30 bg-error-500/10 text-error-300', text: 'İşletmeniz geçici olarak askıya alındı ve yeni randevu alamıyor. Detaylar için destek ekibimizle iletişime geçin.' },
};

export default function Overview() {
  const { business } = useOwnerBusiness();
  const [open, setOpen] = useState<Appointment | null>(null);
  const today = dateKey();
  const monthStart = `${today.slice(0, 7)}-01`;

  const { data, loading, error, reload } = useAsync(async () => {
    const [appts, services, employees, hours, commissions] = await Promise.all([
      fetchOwnerAppointments(business.id, { from: istanbulDayStart(monthStart), to: istanbulDayStart(addDays(today, 60)) }, { includeAllPending: true }),
      supabase.from('services').select('id', { count: 'exact', head: true }).eq('business_id', business.id),
      supabase.from('employees').select('id', { count: 'exact', head: true }).eq('business_id', business.id),
      supabase.from('working_hours').select('id', { count: 'exact', head: true }).eq('business_id', business.id).eq('is_closed', false),
      supabase.from('commission_records').select('commission_amount').eq('business_id', business.id).gte('created_at', istanbulDayStart(monthStart)),
    ]);
    if (services.error) throw services.error;
    if (employees.error) throw employees.error;
    if (hours.error) throw hours.error;
    if (commissions.error) throw commissions.error;
    return {
      appts,
      services: services.count ?? 0,
      employees: employees.count ?? 0,
      openDays: hours.count ?? 0,
      commission: (commissions.data ?? []).reduce((s, r) => s + Number(r.commission_amount), 0),
    };
  }, [business.id]);

  const stats = useMemo(() => {
    const list = data?.appts ?? [];
    const now = Date.now();
    const todayList = list.filter((a) => dateKey(new Date(a.starts_at)) === today && !['cancelled', 'rejected', 'pending_payment'].includes(a.status));
    const pending = list.filter((a) => a.status === 'pending_approval' || awaitsOwnerDecision(a, now));
    const upcoming = list.filter((a) => a.status === 'confirmed' && new Date(a.starts_at).getTime() > now && dateKey(new Date(a.starts_at)) !== today).slice(0, 5);
    const completed = list.filter((a) => a.status === 'completed' && a.starts_at >= istanbulDayStart(monthStart));
    const revenue = completed.reduce((s, a) => s + Number(a.total_price), 0);
    return { todayList, pending, upcoming, completedCount: completed.length, revenue };
  }, [data, today, monthStart]);

  const checklist = data
    ? [
        { done: data.services > 0, label: 'Hizmetlerinizi ekleyin', to: '/isletme/hizmetler' },
        { done: data.employees > 0, label: 'Ekibinizi ve uzmanlıklarını tanımlayın', to: '/isletme/calisanlar' },
        { done: data.openDays > 0, label: 'Çalışma saatlerinizi belirleyin', to: '/isletme/saatler' },
        { done: !!business.cover_url, label: 'Kapak görseli ve galeri yükleyin', to: '/isletme/profil' },
        { done: business.address.trim().length >= 5, label: 'Açık adresinizi ekleyin', to: '/isletme/profil' },
        { done: !!business.description.trim(), label: 'İşletmenizi anlatan bir açıklama yazın', to: '/isletme/profil' },
      ]
    : [];
  const setupLeft = checklist.filter((c) => !c.done).length;
  const note = STATUS_NOTE[business.status];

  return (
    <div>
      <PageHeader
        text={formatDate(new Date().toISOString(), { weekday: 'long', day: 'numeric', month: 'long' })}
        title={`Hoş geldiniz, ${business.name}`}
        action={<BusinessStatusBadge status={business.status} />}
      />

      {note && (
        <div className={`mb-6 flex gap-3 rounded-2xl border p-4 text-sm leading-relaxed ${note.tone}`}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {note.text}
        </div>
      )}

      {loading && !data ? (
        <SkeletonList count={4} className="h-24" />
      ) : error ? (
        <ErrorState onRetry={reload} />
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Bugünkü randevular" value={String(stats.todayList.length)} icon={<CalendarCheck className="h-4 w-4" />} />
            <StatCard label="Onay bekleyen" value={String(stats.pending.length)} icon={<Hourglass className="h-4 w-4" />} />
            <StatCard label="Bu ay ciro" value={formatTRY(stats.revenue)} sub={`${stats.completedCount} tamamlanan`} icon={<Wallet className="h-4 w-4" />} />
            <StatCard label="Puan" value={Number(business.rating_avg).toFixed(1)} sub={`${business.review_count} yorum · komisyon ${formatTRY(data?.commission ?? 0)}`} icon={<Star className="h-4 w-4" />} />
          </div>

          {setupLeft > 0 && (
            <section className="card-gold p-6">
              <p className="eyebrow mb-2">Kurulum</p>
              <h2 className="mb-4 text-lg font-semibold tracking-tight text-white">Yayına hazır olmanıza {setupLeft} adım kaldı</h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {checklist.map((c) => (
                  <li key={c.label}>
                    <Link to={c.to} className="flex items-center gap-3 rounded-xl border border-line bg-ink/40 px-4 py-3 text-sm transition hover:border-white/30">
                      {c.done ? <CheckCircle2 className="h-4 w-4 text-success-500" /> : <Circle className="h-4 w-4 text-mist-3" />}
                      <span className={c.done ? 'text-mist-2 line-through' : 'text-white'}>{c.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {stats.pending.length > 0 && (
            <Section title="Onayınızı bekleyenler" to="/isletme/randevular">
              {stats.pending.map((a) => (
                <OwnerApptRow key={a.id} appt={a} onOpen={setOpen} showDate />
              ))}
            </Section>
          )}

          <Section title="Bugün" to="/isletme/takvim">
            {stats.todayList.length ? (
              stats.todayList.map((a) => <OwnerApptRow key={a.id} appt={a} onOpen={setOpen} />)
            ) : (
              <EmptyState icon={<Clock className="h-6 w-6" />} title="Bugün için randevu yok" text="Yeni randevular burada anında görünür." />
            )}
          </Section>

          {stats.upcoming.length > 0 && (
            <Section title="Yaklaşan" to="/isletme/randevular">
              {stats.upcoming.map((a) => (
                <OwnerApptRow key={a.id} appt={a} onOpen={setOpen} showDate />
              ))}
            </Section>
          )}
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

function Section({ title, to, children }: { title: string; to: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        <Link to={to} className="inline-flex items-center gap-1 text-xs text-gold-400 transition hover:text-gold-300">
          Tümü <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
