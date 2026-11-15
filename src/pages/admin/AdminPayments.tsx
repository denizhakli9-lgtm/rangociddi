import { useMemo, useState } from 'react';
import { CreditCard } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';
import { formatDateTime, formatTRY } from '@/lib/format';
import { tr } from '@/i18n/tr';
import { Select } from '@/components/ui/Field';
import { PaymentStatusBadge, TestBadge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/Brand';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/layout/PageHeader';
import type { Payment, PaymentStatus } from '@/lib/types';
import { isTestPayment } from '@/pages/owner/ownerApi';

const CAPTURED: PaymentStatus[] = ['paid', 'refund_pending', 'refunded'];

type Row = Payment & { businesses: { name: string } | null; profiles: { full_name: string } | null; appointments: { booking_code: string } | null };

export default function AdminPayments() {
  const [status, setStatus] = useState('');
  const { data, loading, error, reload } = useAsync(async () => {
    const [{ data: rows, error: err }, settings] = await Promise.all([
      supabase
        .from('payments')
        .select('*, businesses(name), profiles(full_name), appointments(booking_code)')
        .order('created_at', { ascending: false })
        .limit(500),
      // Only used to label test payments; the page still works if it cannot be read.
      supabase.from('platform_settings').select('payment_mode').eq('id', 1).maybeSingle(),
    ]);
    if (err) throw err;
    const paymentMode = settings.error ? null : ((settings.data as { payment_mode?: string } | null)?.payment_mode ?? null);
    return { rows: (rows ?? []) as Row[], paymentMode };
  }, []);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const isTest = (p: Row) => isTestPayment(p, data?.paymentMode);
  // A "captured" test payment looks paid (or refunded) in the records although no card was charged.
  // Zero-deposit bookings also get a ₺0 'paid' row; those never involved a card, so they are not counted.
  const isTestCapture = (p: Row) => isTest(p) && CAPTURED.includes(p.status) && Number(p.amount) > 0;
  const list = useMemo(() => rows.filter((p) => !status || p.status === status), [rows, status]);
  // Test payments never moved money, so they are kept out of the money totals and counted separately.
  const sum = (s: PaymentStatus[]) => rows.filter((p) => s.includes(p.status) && !isTestCapture(p)).reduce((t, p) => t + Number(p.amount), 0);
  const testRows = rows.filter(isTestCapture);
  const testSub = testRows.length ? 'Test ödemeleri hariç' : undefined;

  return (
    <div>
      <PageHeader eyebrow="Ödemeler" title="Ödeme izleme" text="Kart bilgileri Rango'da saklanmaz; yalnızca kart markası ve son 4 hane kayıt altındadır." />
      {loading && !data ? (
        <SkeletonList count={5} className="h-16" />
      ) : error ? (
        <ErrorState onRetry={reload} />
      ) : (
        <>
          {testRows.length > 0 && (
            <div className="mb-6 flex flex-wrap items-center gap-2 rounded-2xl border border-warning-500/30 bg-warning-900/40 p-4 text-sm text-warning-300">
              <TestBadge />
              <span>
                {testRows.length} test ödemesi ({formatTRY(testRows.reduce((t, p) => t + Number(p.amount), 0))}) listede “Test” olarak işaretli. Bunlar için kartlardan tahsilat veya iade yapılmadı; aşağıdaki toplamlara dahil edilmez.
              </span>
            </div>
          )}
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Tahsil edilen" value={formatTRY(sum(['paid']))} sub={testSub} icon={<CreditCard className="h-4 w-4" />} />
            <StatCard label="İade sürecinde" value={formatTRY(sum(['refund_pending']))} sub={testSub} icon={<CreditCard className="h-4 w-4" />} />
            <StatCard label="İade edilen" value={formatTRY(sum(['refunded']))} sub={testSub} icon={<CreditCard className="h-4 w-4" />} />
            <StatCard label="Bekleyen" value={formatTRY(sum(['pending']))} icon={<CreditCard className="h-4 w-4" />} />
          </div>
          <div className="mb-4 max-w-xs">
            <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Duruma göre filtrele">
              <option value="">Tüm durumlar</option>
              {(Object.keys(tr.paymentStatus) as PaymentStatus[]).map((s) => (
                <option key={s} value={s}>
                  {tr.paymentStatus[s]}
                </option>
              ))}
            </Select>
          </div>
          {!list.length ? (
            <EmptyState icon={<CreditCard className="h-6 w-6" />} title="Ödeme kaydı yok" />
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-mist-2">
                    <th className="px-4 py-3 font-medium">Tarih</th>
                    <th className="px-4 py-3 font-medium">Randevu</th>
                    <th className="px-4 py-3 font-medium">İşletme</th>
                    <th className="px-4 py-3 font-medium">Müşteri</th>
                    <th className="px-4 py-3 font-medium">Kart</th>
                    <th className="px-4 py-3 font-medium">Tutar</th>
                    <th className="px-4 py-3 font-medium">Durum</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {list.map((p) => (
                    <tr key={p.id} className="transition hover:bg-white/[0.02]">
                      <td className="whitespace-nowrap px-4 py-3 text-mist">{formatDateTime(p.created_at)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gold-300">{p.appointments?.booking_code ?? '—'}</td>
                      <td className="px-4 py-3 text-white">{p.businesses?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-mist">{p.profiles?.full_name ?? '—'}</td>
                      <td className="px-4 py-3 text-mist">{p.card_last4 ? `${p.card_brand ?? ''} •••• ${p.card_last4}` : '—'}</td>
                      <td className="px-4 py-3">
                        <p className={isTestCapture(p) ? 'text-mist-2 line-through decoration-mist-3' : 'text-white'}>{formatTRY(p.amount)}</p>
                        {isTestCapture(p) ? (
                          <p className="text-xs text-warning-300">Tahsilat yok</p>
                        ) : (
                          Number(p.refunded_amount) > 0 && <p className="text-xs text-mist-2">İade {formatTRY(p.refunded_amount)}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          <PaymentStatusBadge status={p.status} />
                          {isTest(p) && <TestBadge />}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
