import { useMemo } from 'react';
import { Banknote, ChevronRight, FlaskConical, Landmark, Percent, Receipt, Undo2, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';
import { dateKey, formatDate, formatTRY, keyLabel } from '@/lib/format';
import { StatCard } from '@/components/ui/Brand';
import { Badge, PayoutStatusBadge, TestBadge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/layout/PageHeader';
import type { CommissionRecord, Payment, PayoutAccount } from '@/lib/types';
import { maskIban } from '@/lib/validation';
import { useOwnerBusiness } from './OwnerContext';
import { isTestPayment } from './ownerApi';

const COMMISSION_TONE = { pending: 'warning', invoiced: 'info', paid: 'success' } as const;
const COMMISSION_LABEL = { pending: 'Bekliyor', invoiced: 'Faturalandı', paid: 'Ödendi' } as const;

export default function Earnings() {
  const { business } = useOwnerBusiness();
  const { data, loading, error, reload } = useAsync(async () => {
    const [records, payments, payout, settings] = await Promise.all([
      supabase.from('commission_records').select('*').eq('business_id', business.id).order('created_at', { ascending: false }),
      // Card brand/last 4 are not needed here, so they are not read (KVKK data minimisation).
      supabase.from('payments').select('id, appointment_id, amount, status, refunded_amount, provider_payment_id, created_at').eq('business_id', business.id).order('created_at', { ascending: false }),
      supabase.from('business_payout_accounts').select('*').eq('business_id', business.id).maybeSingle(),
      // Only used to label test payments; the page still works if it cannot be read.
      supabase.from('platform_settings').select('payment_mode').eq('id', 1).maybeSingle(),
    ]);
    if (records.error) throw records.error;
    if (payments.error) throw payments.error;
    if (payout.error) throw payout.error;
    const paymentMode = settings.error ? null : ((settings.data as { payment_mode?: string } | null)?.payment_mode ?? null);
    return { records: (records.data ?? []) as CommissionRecord[], payments: (payments.data ?? []) as Payment[], payout: (payout.data as PayoutAccount | null) ?? null, paymentMode };
  }, [business.id]);

  const summary = useMemo(() => {
    const records = data?.records ?? [];
    const payments = data?.payments ?? [];
    const gross = records.reduce((s, r) => s + Number(r.total_amount), 0);
    const commission = records.reduce((s, r) => s + Number(r.commission_amount), 0);
    const owed = records.filter((r) => r.status !== 'paid').reduce((s, r) => s + Number(r.commission_amount), 0);
    // Zero-deposit bookings get a ₺0 'paid' row; no deposit existed, so they are not counted as test deposits.
    const captured = payments.filter((p) => ['paid', 'refund_pending', 'refunded'].includes(p.status) && Number(p.amount) > 0);
    // Test payments never charged a card, so they are kept out of the collected totals.
    const realPayments = captured.filter((p) => !isTestPayment(p, data?.paymentMode));
    const testPayments = captured.filter((p) => isTestPayment(p, data?.paymentMode));
    const deposits = realPayments.reduce((s, p) => s + Number(p.amount), 0);
    const refunded = payments.filter((p) => !isTestPayment(p, data?.paymentMode)).reduce((s, p) => s + Number(p.refunded_amount ?? 0), 0);
    const testTotal = testPayments.reduce((s, p) => s + Number(p.amount), 0);

    // Month buckets follow İstanbul time, matching invoices and the rest of the app.
    const [cy, cm] = dateKey().slice(0, 7).split('-').map(Number);
    const months: { key: string; label: string; gross: number; commission: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const idx = cy * 12 + (cm - 1) - i;
      const key = `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
      months.push({ key, label: keyLabel(`${key}-01`, { month: 'short' }), gross: 0, commission: 0 });
    }
    records.forEach((r) => {
      const recordMonth = dateKey(new Date(r.created_at)).slice(0, 7);
      const m = months.find((x) => x.key === recordMonth);
      if (m) {
        m.gross += Number(r.total_amount);
        m.commission += Number(r.commission_amount);
      }
    });
    const max = Math.max(1, ...months.map((m) => m.gross));
    return { gross, commission, owed, net: gross - commission, deposits, refunded, testCount: testPayments.length, testTotal, months, max };
  }, [data]);

  return (
    <div>
      <PageHeader eyebrow="Kazanç & Komisyon" title="Finansal özet" text="Komisyon, tamamlanan randevuların toplam hizmet bedeli üzerinden hesaplanır. Kalan tutarlar işletmede tahsil edilir." />

      {loading && !data ? (
        <SkeletonList count={3} className="h-28" />
      ) : error ? (
        <ErrorState onRetry={reload} />
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Brüt ciro" value={formatTRY(summary.gross)} sub={`${data?.records.length ?? 0} tamamlanan randevu`} icon={<Wallet className="h-4 w-4" />} />
            <StatCard label="Net kazanç" value={formatTRY(summary.net)} sub="Komisyon sonrası" icon={<Banknote className="h-4 w-4" />} />
            <StatCard label="Platform komisyonu" value={formatTRY(summary.commission)} sub={`Ödenmemiş ${formatTRY(summary.owed)}`} icon={<Percent className="h-4 w-4" />} />
            <StatCard
              label="Online kapora"
              value={formatTRY(summary.deposits)}
              sub={summary.testCount ? `Test ödemeleri hariç · İade edilen ${formatTRY(summary.refunded)}` : `İade edilen ${formatTRY(summary.refunded)}`}
              icon={<Undo2 className="h-4 w-4" />}
            />
          </div>

          {summary.testCount > 0 && (
            <div className="flex gap-3 rounded-2xl border border-warning-500/30 bg-warning-900/40 p-4 text-sm leading-relaxed text-warning-300">
              <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  <TestBadge /> {summary.testCount} kapora test ödemesi ({formatTRY(summary.testTotal)})
                </p>
                <p className="mt-1 text-xs text-warning-300/90">
                  {data?.paymentMode === 'test' ? 'Ödeme sistemi şu anda test modunda. ' : ''}
                  Bu kaporalar için müşterilerin kartından tahsilat yapılmadı ve hesabınıza aktarılmaz; bu nedenle online kapora toplamına eklenmez.
                </p>
              </div>
            </div>
          )}

          <Link to="/isletme/profil" className="card group flex items-center gap-4 p-5 transition hover:border-gold/40">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gold/10 text-gold"><Landmark className="h-5 w-5" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white">Ödeme hesabı</p>
              <p className="truncate font-mono text-xs text-mist-2">{data?.payout ? maskIban(data.payout.iban) : 'Kazancınızı alabilmek için IBAN ekleyin'}</p>
            </div>
            <PayoutStatusBadge status={data?.payout?.status ?? null} />
            <ChevronRight className="h-4 w-4 text-mist-3 transition group-hover:translate-x-0.5 group-hover:text-gold" />
          </Link>

          <section className="card p-6">
            <h2 className="mb-6 font-display text-xl text-white">Son 6 ay</h2>
            <div className="flex h-48 items-end gap-3 sm:gap-6">
              {summary.months.map((m) => (
                <div key={m.key} className="group flex flex-1 flex-col items-center gap-2">
                  <span className="text-[10px] text-mist-2 opacity-0 transition group-hover:opacity-100">{formatTRY(m.gross)}</span>
                  <div className="relative flex w-full max-w-[56px] flex-1 items-end">
                    <div className="w-full rounded-t-lg bg-gradient-to-t from-gold-700 to-gold-400 transition-all duration-700" style={{ height: `${(m.gross / summary.max) * 100}%`, minHeight: m.gross ? 4 : 2 }} />
                  </div>
                  <span className="text-xs capitalize text-mist">{m.label}</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-3 font-display text-xl text-white">Komisyon kayıtları</h2>
            {!data?.records.length ? (
              <EmptyState icon={<Receipt className="h-6 w-6" />} title="Henüz kayıt yok" text="Randevuları tamamlandı olarak işaretlediğinizde komisyon kayıtları burada oluşur." />
            ) : (
              <div className="card overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-mist-2">
                      <th className="px-5 py-3 font-medium">Tarih</th>
                      <th className="px-5 py-3 font-medium">Hizmet bedeli</th>
                      <th className="px-5 py-3 font-medium">Oran</th>
                      <th className="px-5 py-3 font-medium">Komisyon</th>
                      <th className="px-5 py-3 font-medium">Durum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft">
                    {data.records.map((r) => (
                      <tr key={r.id} className="transition hover:bg-white/[0.02]">
                        <td className="px-5 py-3 text-mist">{formatDate(r.created_at, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                        <td className="px-5 py-3 text-white">{formatTRY(r.total_amount)}</td>
                        <td className="px-5 py-3 text-mist">%{Number(r.commission_rate)}</td>
                        <td className="px-5 py-3 text-gold-300">{formatTRY(r.commission_amount)}</td>
                        <td className="px-5 py-3">
                          <Badge tone={COMMISSION_TONE[r.status]}>{COMMISSION_LABEL[r.status]}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
