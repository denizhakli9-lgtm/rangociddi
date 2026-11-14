import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Banknote, CalendarCheck, Clock, Percent, Store, Undo2, Users, Wallet } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';
import { formatTRY } from '@/lib/format';
import { StatCard } from '@/components/ui/Brand';
import { ErrorState, SkeletonList } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/layout/PageHeader';

interface Stats {
  customers: number;
  business_owners: number;
  businesses: number;
  businesses_pending: number;
  appointments: number;
  appointments_completed: number;
  appointments_upcoming: number;
  deposits_collected: number;
  refunded_total: number;
  commission_total: number;
  commission_pending: number;
  gross_volume: number;
  refunds_pending: number;
  monthly: { month: string; appointments: number; commission: number }[];
}

export default function AdminOverview() {
  const { data, loading, error, reload } = useAsync(async () => {
    const { data: s, error: err } = await supabase.rpc('admin_stats');
    if (err) throw err;
    if (!s || typeof s !== 'object') throw new Error('invalid stats');
    return s as Stats;
  }, []);

  const monthly = data?.monthly ?? [];
  const max = Math.max(1, ...monthly.map((m) => Number(m.appointments)));

  return (
    <div>
      <PageHeader eyebrow="Rango Yönetim" title="Platform genel bakış" text="İzmir pilot bölgesindeki tüm işletme, randevu ve ödeme hareketleri." />
      {loading && !data ? (
        <SkeletonList count={3} className="h-28" />
      ) : error || !data ? (
        <ErrorState onRetry={reload} />
      ) : (
        <div className="space-y-8">
          {(data.businesses_pending > 0 || data.refunds_pending > 0) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {data.businesses_pending > 0 && <Alert to="/yonetim/isletmeler" icon={<Store className="h-4 w-4" />} text={`${data.businesses_pending} işletme onay bekliyor`} />}
              {data.refunds_pending > 0 && <Alert to="/yonetim/iadeler" icon={<Undo2 className="h-4 w-4" />} text={`${data.refunds_pending} iade talebi bekliyor`} />}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Müşteriler" value={String(data.customers)} sub={`${data.business_owners} işletme sahibi`} icon={<Users className="h-4 w-4" />} />
            <StatCard label="İşletmeler" value={String(data.businesses)} sub={`${data.businesses_pending} onay bekliyor`} icon={<Store className="h-4 w-4" />} />
            <StatCard label="Randevular" value={String(data.appointments)} sub={`${data.appointments_upcoming} yaklaşan · ${data.appointments_completed} tamamlanan`} icon={<CalendarCheck className="h-4 w-4" />} />
            <StatCard label="İşlem hacmi" value={formatTRY(data.gross_volume)} sub="Tamamlanan randevular" icon={<Wallet className="h-4 w-4" />} />
            <StatCard label="Toplanan kapora" value={formatTRY(data.deposits_collected)} icon={<Banknote className="h-4 w-4" />} />
            <StatCard label="İade edilen" value={formatTRY(data.refunded_total)} sub={`${data.refunds_pending} bekleyen talep`} icon={<Undo2 className="h-4 w-4" />} />
            <StatCard label="Komisyon geliri" value={formatTRY(data.commission_total)} icon={<Percent className="h-4 w-4" />} />
            <StatCard label="Tahsil edilecek komisyon" value={formatTRY(data.commission_pending)} icon={<Clock className="h-4 w-4" />} />
          </div>

          <section className="card p-6">
            <h2 className="mb-6 font-display text-xl text-white">Aylık randevu & komisyon</h2>
            {monthly.length ? (
              <div className="flex h-52 items-end gap-3 sm:gap-6">
                {monthly.map((m) => (
                  <div key={m.month} className="group flex flex-1 flex-col items-center gap-2">
                    <span className="text-center text-[10px] leading-tight text-mist-2">
                      {m.appointments}
                      <br />
                      <span className="text-gold-400">{formatTRY(m.commission)}</span>
                    </span>
                    <div className="flex w-full max-w-[56px] flex-1 items-end">
                      <div className="w-full rounded-t-lg bg-gradient-to-t from-gold-700 to-gold-400 transition-all duration-700 group-hover:from-gold-600 group-hover:to-gold-300" style={{ height: `${(Number(m.appointments) / max) * 100}%`, minHeight: 2 }} />
                    </div>
                    <span className="text-xs text-mist">{m.month}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-mist-2">Henüz veri yok.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Alert({ to, icon, text }: { to: string; icon: ReactNode; text: string }) {
  return (
    <Link to={to} className="group flex items-center gap-3 rounded-2xl border border-warning-500/30 bg-warning-900/40 p-4 text-sm text-warning-300 transition hover:border-warning-500/60">
      {icon}
      <span className="flex-1">{text}</span>
      <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
    </Link>
  );
}
