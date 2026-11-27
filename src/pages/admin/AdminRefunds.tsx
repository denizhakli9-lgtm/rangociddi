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
import { Badge, TestBadge } from '@/components/ui/Badge';
import { Segmented } from '@/components/ui/Brand';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/layout/PageHeader';
import type { RefundRequest, RefundStatus } from '@/lib/types';
import { isTestPayment } from '@/pages/owner/ownerApi';
import { EdgeFunctionError, invokeEdge } from '@/lib/functions';

type Row = RefundRequest & {
  businesses: { name: string } | null;
  profiles: { full_name: string; email: string | null } | null;
  appointments: { booking_code: string; service_name: string; starts_at: string } | null;
  payment?: { provider_payment_id: string | null; status: string } | null;
};

const TONE = { pending: 'warning', approved: 'success', rejected: 'error' } as const;

/** Payments taken through PayTR are refunded through PayTR's İade API (paytr-refund), not only in our records. */
const isPaytrPayment = (r: Row) => /^(TEST-)?PAYTR-/.test(r.payment?.provider_payment_id ?? '');
const LABEL: Record<RefundStatus, string> = { pending: 'Bekliyor', approved: 'Onaylandı', rejected: 'Reddedildi' };

export default function AdminRefunds() {
  const { toast } = useToast();
  const [tab, setTab] = useState<RefundStatus>('pending');
  const [open, setOpen] = useState<{ row: Row; approve: boolean } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const { data, loading, error, reload } = useAsync(async () => {
    const [{ data: rows, error: err }, settings] = await Promise.all([
      supabase
        .from('refund_requests')
        .select(
          '*, businesses(name), profiles!refund_requests_customer_id_fkey(full_name, email), appointments(booking_code, service_name, starts_at), payment:payments(provider_payment_id, status)',
        )
        .order('created_at', { ascending: false }),
      // Only used to label test payments; the page still works if it cannot be read.
      supabase.from('platform_settings').select('payment_mode').eq('id', 1).maybeSingle(),
    ]);
    if (err) throw err;
    const paymentMode = settings.error ? null : ((settings.data as { payment_mode?: string } | null)?.payment_mode ?? null);
    return { rows: (rows ?? []) as Row[], paymentMode };
  }, []);

  const rows = data?.rows ?? [];
  const list = rows.filter((r) => r.status === tab);
  const count = (s: RefundStatus) => rows.filter((r) => r.status === s).length;
  const isTest = (r: Row) => isTestPayment(r.payment, data?.paymentMode);

  const closeModal = () => {
    setOpen(null);
    setNote('');
  };

  const resolve = async () => {
    if (!open) return;
    setBusy(true);
    if (open.approve && isPaytrPayment(open.row)) {
      try {
        await invokeEdge<{ ok: boolean; test: boolean }>('paytr-refund', { request: open.row.id, note: note.trim() });
      } catch (err) {
        setBusy(false);
        const detail = err instanceof EdgeFunctionError && err.detail ? ` (PayTR: ${err.detail})` : '';
        toast(friendlyError(err) + detail, 'error');
        reload();
        return;
      }
      setBusy(false);
      toast(
        isTest(open.row)
          ? 'PayTR test iadesi gönderildi. Test ödemesi olduğu için karttan tahsilat yapılmamıştı.'
          : 'İade PayTR üzerinden müşterinin kartına gönderildi.',
        'success',
      );
      closeModal();
      reload();
      return;
    }
    const { error: err } = await supabase.rpc('admin_resolve_refund', { p_request: open.row.id, p_approve: open.approve, p_note: note.trim() });
    setBusy(false);
    if (err) return toast(friendlyError(err), 'error');
    toast(
      !open.approve
        ? 'İade talebi reddedildi.'
        : isTest(open.row)
          ? 'İade kaydı tamamlandı. Test ödemesi olduğu için karta para gönderilmedi.'
          : 'İade onaylandı; ödeme kuruluşu onayı bekleniyor.',
      'success',
    );
    closeModal();
    reload();
  };

  return (
    <div>
      <PageHeader
        eyebrow="İadeler"
        title="İade talepleri"
        text="Politika kapsamındaki iptaller ve işletme kaynaklı iptaller otomatik olarak iade talebi oluşturur. PayTR ile alınan ödemelerde onayladığınız iade PayTR üzerinden karta gönderilir. Test ödemelerinde karttan tahsilat yapılmadığı için karta para gönderilmez."
      />
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
                  {isTest(r) && <TestBadge />}
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
        onClose={closeModal}
        title={open?.approve ? 'İadeyi onayla' : 'İade talebini reddet'}
        subtitle={open ? `${formatTRY(open.row.amount)} · ${open.row.profiles?.full_name ?? ''}` : ''}
        footer={
          <>
            <Button variant="ghost" onClick={closeModal}>
              Vazgeç
            </Button>
            <Button variant={open?.approve ? 'gold' : 'danger'} loading={busy} onClick={resolve}>
              {open?.approve ? 'İadeyi onayla' : 'Reddet'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {open?.approve && isPaytrPayment(open.row) && !isTest(open.row) && (
            <div className="rounded-xl border border-info-500/30 bg-info-500/10 p-3 text-xs leading-relaxed text-info-300">
              Onayladığınızda {formatTRY(open.row.amount)} PayTR üzerinden müşterinin kartına iade edilir. Bu işlem geri alınamaz.
            </div>
          )}
          {open?.approve && isTest(open.row) && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-warning-500/30 bg-warning-500/10 p-3 text-xs leading-relaxed text-warning-300">
              <TestBadge />
              <span>Bu bir test ödemesi. Müşterinin kartından tahsilat yapılmadığı için karta para gönderilmez; iade yalnızca kayıtta tamamlanır.</span>
            </div>
          )}
          <Textarea id="refund-note" label="Not (isteğe bağlı)" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} hint="Müşteriye iletilen bildirimde yer alır." />
        </div>
      </Modal>
    </div>
  );
}
