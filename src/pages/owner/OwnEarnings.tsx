import { useMemo } from 'react';
import { CalendarClock, CalendarPlus, Info, UserX, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';
import { dateKey, formatDate, formatTRY, keyLabel } from '@/lib/format';
import { StatCard } from '@/components/ui/Brand';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/Feedback';
import type { BlockedSlot } from '@/lib/types';
import { useOwnerBusiness } from './OwnerContext';

type OwnStatus = 'done' | 'no_show' | 'upcoming';

/**
 * A booking the business added itself counts as income once its time has passed, unless it was
 * marked "Gelmedi" (deleted bookings are gone). Kept apart from Rango bookings: no commission, and
 * these amounts are never added to the "Rango'dan gelen" figures.
 */
function statusOf(b: BlockedSlot, now: number): OwnStatus {
  if (b.no_show) return 'no_show';
  return new Date(b.ends_at).getTime() <= now ? 'done' : 'upcoming';
}

const STATUS_LABEL: Record<OwnStatus, string> = { done: 'Gerçekleşti', no_show: 'Gelmedi', upcoming: 'Yaklaşan' };
const STATUS_TONE = { done: 'success', no_show: 'error', upcoming: 'info' } as const;

export function OwnEarnings() {
  const { business } = useOwnerBusiness();
  const { data, loading, error, reload } = useAsync(async () => {
    const { data: rows, error: err } = await supabase
      .from('time_slots')
      .select('*')
      .eq('business_id', business.id)
      .eq('kind', 'booking')
      .order('starts_at', { ascending: false })
      .limit(1000);
    if (err) throw err;
    return (rows ?? []) as BlockedSlot[];
  }, [business.id]);

  const summary = useMemo(() => {
    const now = Date.now();
    const rows = data ?? [];
    const amount = (b: BlockedSlot) => Number(b.price ?? 0) || 0;
    const done = rows.filter((b) => statusOf(b, now) === 'done');
    const income = done.reduce((s, b) => s + amount(b), 0);
    const noShow = rows.filter((b) => statusOf(b, now) === 'no_show');
    const upcoming = rows.filter((b) => statusOf(b, now) === 'upcoming');

    // Month buckets in İstanbul time, like the Rango tab.
    const [cy, cm] = dateKey().slice(0, 7).split('-').map(Number);
    const months: { key: string; label: string; income: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const idx = cy * 12 + (cm - 1) - i;
      const key = `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
      months.push({ key, label: keyLabel(`${key}-01`, { month: 'short' }), income: 0 });
    }
    done.forEach((b) => {
      const m = months.find((x) => x.key === dateKey(new Date(b.starts_at)).slice(0, 7));
      if (m) m.income += amount(b);
    });
    const thisMonth = months[months.length - 1].income;
    const max = Math.max(1, ...months.map((m) => m.income));
    return { rows, income, doneCount: done.length, noShowCount: noShow.length, upcomingCount: upcoming.length, upcomingIncome: upcoming.reduce((s, b) => s + amount(b), 0), months, max, thisMonth, now };
  }, [data]);

  if (loading && !data) return <SkeletonList count={3} className="h-28" />;
  if (error) return <ErrorState onRetry={reload} />;

  return (
    <div className="space-y-8">
      <div className="flex gap-3 rounded-2xl border border-line bg-coal-2 p-4 text-sm leading-relaxed text-mist">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-mist-2" />
        <p>
          Takvimden eklediğiniz randevular. Saati geçen randevu kazanca sayılır; müşteri gelmediyse takvimde randevuya dokunup <span className="font-medium text-white">“Gelmedi”</span> deyin.
        </p>
      </div>

      {!summary.rows.length ? (
        <EmptyState
          icon={<CalendarPlus className="h-6 w-6" />}
          title="Henüz kendi müşteriniz yok"
          text="Telefonla ya da kapıdan gelen müşterilerinizi takvimdeki “Randevu ekle” ile girin; kazancınız burada birikir."
          action={
            <Link to="/isletme/takvim" className="text-sm font-semibold text-white underline underline-offset-4">
              Takvime git
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Kazanç" value={formatTRY(summary.income)} sub={`Tüm zamanlar · ${summary.doneCount} randevu`} icon={<Wallet className="h-4 w-4" />} />
            <StatCard label="Bu ay" value={formatTRY(summary.thisMonth)} sub="Gerçekleşen randevular" icon={<Wallet className="h-4 w-4" />} />
            <StatCard label="Yaklaşan" value={String(summary.upcomingCount)} sub={`Beklenen ${formatTRY(summary.upcomingIncome)}`} icon={<CalendarClock className="h-4 w-4" />} />
            <StatCard label="Gelmeyen" value={String(summary.noShowCount)} sub="Kazanca sayılmadı" icon={<UserX className="h-4 w-4" />} />
          </div>

          <section className="card p-6">
            <h2 className="mb-6 text-base font-semibold text-white">Son 6 ay · kendi müşterilerim</h2>
            <div className="flex h-48 items-stretch gap-3 sm:gap-6">
              {summary.months.map((m) => (
                <div key={m.key} className="flex flex-1 flex-col items-center gap-2">
                  <span className="text-[10px] whitespace-nowrap text-mist-2">{formatTRY(m.income)}</span>
                  <div className="relative flex w-full max-w-[56px] flex-1 items-end">
                    <div className="w-full rounded-t-lg bg-white/60 transition-all duration-700" style={{ height: `${(m.income / summary.max) * 100}%`, minHeight: m.income ? 4 : 2 }} />
                  </div>
                  <span className="text-xs capitalize text-mist">{m.label}</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold text-white">Kayıtlar</h2>
            {/* A list, not a table: it fits a phone screen without sideways scrolling. */}
            <ul className="card divide-y divide-line-soft">
              {summary.rows.slice(0, 100).map((b) => {
                const status = statusOf(b, summary.now);
                return (
                  <li key={b.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">{b.customer_name || 'İsimsiz müşteri'}</p>
                      <p className="mt-0.5 truncate text-xs text-mist-2">
                        {b.service_name || 'Hizmet'} · {formatDate(b.starts_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className={`text-sm font-semibold tabular-nums ${status === 'no_show' ? 'text-mist-3 line-through' : 'text-white'}`}>
                        {b.price === null || b.price === undefined ? '—' : formatTRY(b.price)}
                      </span>
                      <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
