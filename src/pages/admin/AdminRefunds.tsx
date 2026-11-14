import { useState } from 'react';
import { Undo2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';
import { formatDateTime, formatTRY } from '@/lib/format';
import { friendlyError } from '@/lib/errors';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Segmented } from '@/components/ui/Brand';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/layout/PageHeader';
import type { RefundRequest, RefundStatus } from '@/lib/types';

type Row = RefundRequest & { businesses: { name: string } | null; profiles: { full_name: string; email: string | null } | null; appointments: { booking_code: string; service_name: string; starts_at: string } | null };

const TONE = { pending: 'warning', approved: 'success', rejected: 'error' } as const;
const LABEL: Record<RefundStatus, string> = { pending: 'Bekliyor', approved: 'İade edildi', rejected: 'Reddedildi' };

export default function AdminRefunds() {
  const { toast } = useToast();
  const [tab, setTab] = useState<RefundStatus>('pending');
  const [open, setOpen] = useState<{ row: Row; approve: boolean } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const { data, loading, error, reload } = useAsync(async () => {
    const { data: rows, error: err } = await supabase
      .from('refund_requests')
      .select('*, businesses(name), profiles!refund_requests_customer_id_fkey(full_name, email), appointments(booking_code, service_name, starts_at)')
      .order('created_at', { ascending: false });
    if (err) throw err;
    return (rows ?? []) as Row[];
  }, []);

  const list = (data ?? []).filter((r) => r.status === tab);
  const count = (s: RefundStatus) => (data ?? []).filter((r) => r.status === s).length;

  const resolve = async () => {
    if (!open) return;
    setBusy(true);
    const { error: err } = await supabase.rpc('admin_resolve_refund', { p_request: open.row.id, p_approve: open.approve, p_note: note.trim() });
    setBusy(false);
    if (err) return toast(friendlyError(err), 'error');
    toast(open.approve ? 'İade onaylandı ve müşteriye bildirildi.' : 'İade talebi reddedildi.', 'success');
    setOpen(null);
    setNote('');
    reload();
  };

  return (
    <div>
      <PageHeader eyebrow="İadeler" title="İade talepleri" text="Politika kapsamındaki iptaller ve işletme kaynaklı iptaller otomatik olarak iade talebi oluşturur. Onaylanan iadeler test modunda anında tamamlanır." />
      <div className="mb-6">
        <Segmented<RefundStatus>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'pending', label: 'Bekleyen', count: count('pending') },
            { value: 'approved', label: 'Onaylanan', count: count('approved') },
            { value: 'rejected', label: 'Reddedilen', count: count('rejected') },
          ]}
        />
      </div>
      {loading && !data ? (
        <SkeletonList count={4} className="h-24" />
      ) : error ? (
        <ErrorState onRetry={reload} />
      ) : !list.length ? (
        <EmptyState icon={<Undo2 className="h-6 w-6" />} title="Bu listede talep yok" />
      ) : (
        <div className="space-y-3">
          {list.map((r) => (
            <div key={r.id} className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-white">{r.profiles?.full_name ?? 'Müşteri'}</p>
                  <Badge tone={TONE[r.status]}>{LABEL[r.status]}</Badge>
                </div>
                <p className="mt-1 text-xs text-mist-2">
                  {r.businesses?.name} · {r.appointments?.service_name} · <span className="font-mono text-gold-300">{r.appointments?.booking_code}</span>
                </p>
                <p className="mt-2 text-sm text-mist">{r.reason}</p>
                {r.admin_note && <p className="mt-1 text-xs text-mist-2">Not: {r.admin_note}</p>}
                <p className="mt-1 text-[11px] text-mist-3">{formatDateTime(r.created_at)}</p>
              </div>
              <div className="flex items-center gap-3 sm:flex-col sm:items-end">
                <p className="font-display text-2xl text-gold-300">{formatTRY(r.amount)}</p>
                {r.status === 'pending' && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="danger" onClick={() => setOpen({ row: r, approve: false })}>
                      Reddet
                    </Button>
                    <Button size="sm" onClick={() => setOpen({ row: r, approve: true })}>
                      İade et
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={!!open}
        onClose={() => setOpen(null)}
        title={open?.approve ? 'İadeyi onayla' : 'İade talebini reddet'}
        subtitle={open ? `${formatTRY(open.row.amount)} · ${open.row.profiles?.full_name ?? ''}` : ''}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(null)}>
              Vazgeç
            </Button>
            <Button variant={open?.approve ? 'gold' : 'danger'} loading={busy} onClick={resolve}>
              {open?.approve ? 'İadeyi onayla' : 'Reddet'}
            </Button>
          </>
        }
      >
        <Textarea label="Not (isteğe bağlı)" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} hint="Müşteriye iletilen bildirimde yer alır." />
      </Modal>
    </div>
  );
}
