import { useMemo, useState } from 'react';
import { Percent, Receipt } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';
import { formatDate, formatTRY } from '@/lib/format';
import { friendlyError } from '@/lib/errors';
import { useToast } from '@/contexts/ToastContext';
import { Select } from '@/components/ui/Field';
import { Segmented, StatCard } from '@/components/ui/Brand';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/layout/PageHeader';
import type { CommissionRecord, CommissionStatus, PayoutAccountStatus } from '@/lib/types';
import { Badge } from '@/components/ui/Badge';

type Row = CommissionRecord & { businesses: { name: string } | null };
type Tab = 'all' | CommissionStatus;
const LABEL: Record<CommissionStatus, string> = { pending: 'Bekliyor', invoiced: 'Faturalandı', paid: 'Tahsil edildi' };

export default function AdminCommissions() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const { data, loading, error, reload, setData } = useAsync(async () => {
    const { data: rows, error: err } = await supabase.from('commission_records').select('*, businesses(name)').order('created_at', { ascending: false }).limit(1000);
    if (err) throw err;
    return (rows ?? []) as Row[];
  }, []);
  const { data: payoutStatus } = useAsync(async () => {
    const { data: rows, error: err } = await supabase.from('business_payout_accounts').select('business_id, status');
    if (err) throw err;
    return new Map((rows ?? []).map((p) => [p.business_id as string, p.status as PayoutAccountStatus]));
  }, []);

  const payoutBadge = (businessId: string) => {
    if (!payoutStatus) return null;
    const s = payoutStatus.get(businessId);
    if (s === 'verified') return null;
    if (!s) return <Badge tone="error">IBAN yok</Badge>;
    return s === 'pending' ? <Badge tone="warning">IBAN onay bekliyor</Badge> : <Badge tone="error">IBAN reddedildi</Badge>;
  };

  const list = useMemo(() => (data ?? []).filter((r) => tab === 'all' || r.status === tab), [data, tab]);
  const total = (s?: CommissionStatus) => (data ?? []).filter((r) => !s || r.status === s).reduce((t, r) => t + Number(r.commission_amount), 0);
  const count = (s: Tab) => (data ?? []).filter((r) => s === 'all' || r.status === s).length;

  const change = async (r: Row, status: CommissionStatus) => {
    setBusy(r.id);
    const { error: err } = await supabase.rpc('admin_set_commission_status', { p_record: r.id, p_status: status });
    setBusy(null);
    if (err) return toast(friendlyError(err), 'error');
    toast('Komisyon durumu güncellendi.', 'success');
    setData((d) => (d ?? []).map((x) => (x.id === r.id ? { ...x, status } : x)));
  };

  return (
    <div>
      <PageHeader eyebrow="Komisyon" title="Komisyon kayıtları" text="Her tamamlanan randevu, o anki komisyon oranıyla bir kayıt oluşturur." />
      {loading && !data ? (
        <SkeletonList count={5} className="h-16" />
      ) : error ? (
        <ErrorState onRetry={reload} />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Toplam komisyon" value={formatTRY(total())} icon={<Percent className="h-4 w-4" />} />
            <StatCard label="Bekleyen" value={formatTRY(total('pending'))} icon={<Receipt className="h-4 w-4" />} />
            <StatCard label="Faturalanan" value={formatTRY(total('invoiced'))} icon={<Receipt className="h-4 w-4" />} />
            <StatCard label="Tahsil edilen" value={formatTRY(total('paid'))} icon={<Receipt className="h-4 w-4" />} />
          </div>
          <div className="mb-4 overflow-x-auto no-scrollbar">
            <Segmented<Tab>
              value={tab}
              onChange={setTab}
              options={[
                { value: 'all', label: 'Tümü', count: count('all') },
                { value: 'pending', label: 'Bekleyen', count: count('pending') },
                { value: 'invoiced', label: 'Faturalanan', count: count('invoiced') },
                { value: 'paid', label: 'Tahsil edilen', count: count('paid') },
              ]}
            />
          </div>
          {!list.length ? (
            <EmptyState icon={<Receipt className="h-6 w-6" />} title="Komisyon kaydı yok" text="Randevular tamamlandıkça burada görünür." />
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-mist-2">
                    <th className="px-4 py-3 font-medium">Tarih</th>
                    <th className="px-4 py-3 font-medium">İşletme</th>
                    <th className="px-4 py-3 font-medium">Hizmet tutarı</th>
                    <th className="px-4 py-3 font-medium">Oran</th>
                    <th className="px-4 py-3 font-medium">Komisyon</th>
                    <th className="px-4 py-3 font-medium">Durum</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {list.map((r) => (
                    <tr key={r.id} className="transition hover:bg-white/[0.02]">
                      <td className="whitespace-nowrap px-4 py-3 text-mist">{formatDate(r.created_at, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                      <td className="px-4 py-3 text-white">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{r.businesses?.name ?? '—'}</span>
                          {payoutBadge(r.business_id)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-mist">{formatTRY(r.total_amount)}</td>
                      <td className="px-4 py-3 text-mist">%{Number(r.commission_rate)}</td>
                      <td className="px-4 py-3 font-medium text-gold-300">{formatTRY(r.commission_amount)}</td>
                      <td className="px-4 py-3">
                        <Select value={r.status} disabled={busy === r.id} onChange={(e) => change(r, e.target.value as CommissionStatus)} aria-label="Durum" className="!py-1.5 text-xs">
                          {(Object.keys(LABEL) as CommissionStatus[]).map((s) => (
                            <option key={s} value={s}>
                              {LABEL[s]}
                            </option>
                          ))}
                        </Select>
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
