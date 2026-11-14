import { useMemo, useState } from 'react';
import { CreditCard } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';
import { formatDateTime, formatTRY } from '@/lib/format';
import { tr } from '@/i18n/tr';
import { Select } from '@/components/ui/Field';
import { PaymentStatusBadge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/Brand';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/layout/PageHeader';
import type { Payment, PaymentStatus } from '@/lib/types';

type Row = Payment & { businesses: { name: string } | null; profiles: { full_name: string } | null; appointments: { booking_code: string } | null };

export default function AdminPayments() {
  const [status, setStatus] = useState('');
  const { data, loading, error, reload } = useAsync(async () => {
    const { data: rows, error: err } = await supabase
      .from('payments')
      .select('*, businesses(name), profiles(full_name), appointments(booking_code)')
      .order('created_at', { ascending: false })
      .limit(500);
    if (err) throw err;
    return (rows ?? []) as Row[];
  }, []);

  const list = useMemo(() => (data ?? []).filter((p) => !status || p.status === status), [data, status]);
  const sum = (s: PaymentStatus[]) => (data ?? []).filter((p) => s.includes(p.status)).reduce((t, p) => t + Number(p.amount), 0);

  return (
    <div>
      <PageHeader eyebrow="Ödemeler" title="Ödeme izleme" text="Kart bilgileri Rango'da saklanmaz; yalnızca kart markası ve son 4 hane kayıt altındadır." />
      {loading && !data ? (
        <SkeletonList count={5} className="h-16" />
      ) : error ? (
        <ErrorState onRetry={reload} />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Tahsil edilen" value={formatTRY(sum(['paid']))} icon={<CreditCard className="h-4 w-4" />} />
            <StatCard label="İade sürecinde" value={formatTRY(sum(['refund_pending']))} icon={<CreditCard className="h-4 w-4" />} />
            <StatCard label="İade edilen" value={formatTRY(sum(['refunded']))} icon={<CreditCard className="h-4 w-4" />} />
            <StatCard label="Bekleyen" value={formatTRY(sum(['pending']))} icon={<CreditCard className="h-4 w-4" />} />
          </div>
          <div className="mb-4 max-w-xs">
            <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Durum">
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
                        <p className="text-white">{formatTRY(p.amount)}</p>
                        {Number(p.refunded_amount) > 0 && <p className="text-xs text-mist-2">İade {formatTRY(p.refunded_amount)}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <PaymentStatusBadge status={p.status} />
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
