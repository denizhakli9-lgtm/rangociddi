import { useMemo, useState } from 'react';
import { CalendarRange, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';
import { formatDateTime, formatTRY } from '@/lib/format';
import { friendlyError } from '@/lib/errors';
import { tr } from '@/i18n/tr';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { AppointmentStatusBadge, PaymentStatusBadge, TestBadge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/layout/PageHeader';
import type { Appointment, AppointmentStatus } from '@/lib/types';
import { isTestPayment } from '@/pages/owner/ownerApi';

const STATUSES = Object.keys(tr.appointmentStatus) as AppointmentStatus[];
const ACTIVE = ['pending_payment', 'pending_approval', 'confirmed'];

export default function AdminAppointments() {
  const { toast } = useToast();
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [cancelling, setCancelling] = useState<Appointment | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const { data, loading, error, reload } = useAsync(async () => {
    const { data: rows, error: err } = await supabase
      .from('appointments')
      .select('*, businesses(id, name, slug, cover_url, address, district, city, latitude, longitude, cancellation_hours, phone), profiles(full_name, phone, email), payments(id, status, amount, card_last4, provider_payment_id)')
      .order('starts_at', { ascending: false })
      .limit(500);
    if (err) throw err;
    return (rows ?? []) as Appointment[];
  }, []);

  const list = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR');
    return (data ?? []).filter(
      (a) =>
        (!status || a.status === status) &&
        (!q ||
          a.booking_code.toLowerCase().includes(q) ||
          (a.businesses?.name ?? '').toLocaleLowerCase('tr-TR').includes(q) ||
          (a.profiles?.full_name ?? '').toLocaleLowerCase('tr-TR').includes(q)),
    );
  }, [data, status, query]);

  const closeCancel = () => {
    setCancelling(null);
    setReason('');
  };

  const cancel = async () => {
    if (!cancelling) return;
    if (reason.trim().length < 3) return toast('Bir iptal nedeni yazın.', 'error');
    setBusy(true);
    const { error: err } = await supabase.rpc('cancel_appointment', { p_appointment: cancelling.id, p_reason: reason.trim() });
    setBusy(false);
    if (err) return toast(friendlyError(err), 'error');
    toast('Randevu iptal edildi, varsa kapora iadesi başlatıldı.', 'success');
    setCancelling(null);
    setReason('');
    reload();
  };

  return (
    <div>
      <PageHeader eyebrow="Randevular" title="Randevu izleme" text="Son 500 randevu. Gerektiğinde müşteri lehine iptal edebilirsiniz; ödenen kapora iade sürecine alınır." />
      <div className="mb-6 grid gap-3 sm:grid-cols-[1fr_240px]">
        <Input aria-label="Randevu ara" placeholder="Kod, işletme veya müşteri" value={query} onChange={(e) => setQuery(e.target.value)} icon={<Search className="h-4 w-4" />} />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Duruma göre filtrele">
          <option value="">Tüm durumlar</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {tr.appointmentStatus[s]}
            </option>
          ))}
        </Select>
      </div>
      {loading && !data ? (
        <SkeletonList count={6} className="h-16" />
      ) : error ? (
        <ErrorState onRetry={reload} />
      ) : !list.length ? (
        <EmptyState icon={<CalendarRange className="h-6 w-6" />} title="Randevu bulunamadı" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-mist-2">
                <th className="px-4 py-3 font-medium">Kod</th>
                <th className="px-4 py-3 font-medium">Tarih</th>
                <th className="px-4 py-3 font-medium">İşletme / Hizmet</th>
                <th className="px-4 py-3 font-medium">Müşteri</th>
                <th className="px-4 py-3 font-medium">Tutar</th>
                <th className="px-4 py-3 font-medium">Durum</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {list.map((a) => (
                <tr key={a.id} className="transition hover:bg-white/[0.02]">
                  <td className="px-4 py-3 font-mono text-xs text-gold-300">{a.booking_code}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-mist">{formatDateTime(a.starts_at)}</td>
                  <td className="px-4 py-3">
                    <p className="text-white">{a.businesses?.name}</p>
                    <p className="text-xs text-mist-2">
                      {a.service_name} · {a.employee_name}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-mist">{a.profiles?.full_name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <p className="text-white">{formatTRY(a.total_price)}</p>
                    <p className="text-xs text-mist-2">Kapora {formatTRY(a.deposit_amount)}</p>
                  </td>
                  <td className="space-y-1 px-4 py-3">
                    <AppointmentStatusBadge status={a.status} />
                    {a.payments?.[0] && (
                      <div className="flex flex-wrap gap-1">
                        <PaymentStatusBadge status={a.payments[0].status} />
                        {isTestPayment(a.payments[0]) && <TestBadge />}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {ACTIVE.includes(a.status) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-error-300"
                        onClick={() => {
                          setReason('');
                          setCancelling(a);
                        }}
                      >
                        İptal
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={!!cancelling}
        onClose={closeCancel}
        title="Randevuyu iptal et"
        subtitle={cancelling ? `${cancelling.booking_code} · ${cancelling.businesses?.name ?? ''}` : ''}
        footer={
          <>
            <Button variant="ghost" onClick={closeCancel}>
              Vazgeç
            </Button>
            <Button variant="danger" loading={busy} onClick={cancel}>
              İptal et
            </Button>
          </>
        }
      >
        <Textarea label="İptal nedeni" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} hint="Müşteriye bildirilir." />
      </Modal>
    </div>
  );
}
