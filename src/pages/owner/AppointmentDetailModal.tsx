import { useEffect, useState } from 'react';
import { Ban, CalendarClock, Check, CheckCircle2, Mail, Phone, UserX, X } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Field';
import { AppointmentStatusBadge, PaymentStatusBadge, TestBadge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Brand';
import { formatDate, formatDuration, formatTime, formatTRY } from '@/lib/format';
import { friendlyError } from '@/lib/errors';
import { useToast } from '@/contexts/ToastContext';
import type { Appointment } from '@/lib/types';
import { isTestPayment, ownerCancel, runOwnerAction, type OwnerAction } from './ownerApi';
import { depositPayment } from '@/lib/demo';

const ACTION_DONE: Record<OwnerAction, string> = {
  approve: 'Randevu onaylandı.',
  reject: 'Randevu reddedildi, kapora iadesi başlatıldı.',
  complete: 'Randevu tamamlandı olarak işaretlendi.',
  no_show: 'Müşteri gelmedi olarak işaretlendi.',
};

export function AppointmentDetailModal({ appt, onClose, onDone }: { appt: Appointment | null; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [cancelMode, setCancelMode] = useState(false);
  const [reason, setReason] = useState('');

  useEffect(() => {
    setCancelMode(false);
    setReason('');
  }, [appt?.id]);

  if (!appt) return null;
  const started = new Date(appt.starts_at).getTime() <= Date.now();
  const payment = depositPayment(appt.payments);
  const testPayment = isTestPayment(payment);

  const act = async (action: OwnerAction) => {
    setBusy(action);
    try {
      await runOwnerAction(appt.id, action);
      toast(action === 'reject' && testPayment ? 'Randevu reddedildi. Kapora test ödemesi olduğu için müşterinin kartından tahsilat yapılmamıştı.' : ACTION_DONE[action], 'success');
      onDone();
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const cancel = async () => {
    if (reason.trim().length < 3) {
      toast('Müşteriye iletilecek bir iptal nedeni yazın.', 'error');
      return;
    }
    setBusy('cancel');
    try {
      await ownerCancel(appt.id, reason.trim());
      toast('Randevu iptal edildi. Müşteriye bildirim gönderildi.', 'success');
      onDone();
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  // Once the start time has passed, a confirmed visit is closed with "Tamamlandı"/"Gelmedi" and a
  // pending request with "Reddet" (which refunds); the server refuses cancel/approve after the start.
  const canCancel = ['pending_payment', 'pending_approval', 'confirmed'].includes(appt.status) && !started;

  const footer = cancelMode ? (
    <>
      <Button variant="ghost" onClick={() => setCancelMode(false)}>
        Vazgeç
      </Button>
      <Button variant="danger" loading={busy === 'cancel'} onClick={cancel} icon={<Ban className="h-4 w-4" />}>
        İptal et
      </Button>
    </>
  ) : (
    <div className="flex w-full flex-wrap justify-end gap-2">
      {canCancel && (
        <Button variant="ghost" onClick={() => setCancelMode(true)} icon={<Ban className="h-4 w-4" />}>
          İptal
        </Button>
      )}
      {appt.status === 'pending_approval' && (
        <>
          <Button variant="danger" loading={busy === 'reject'} onClick={() => act('reject')} icon={<X className="h-4 w-4" />}>
            Reddet
          </Button>
          {!started && (
            <Button loading={busy === 'approve'} onClick={() => act('approve')} icon={<Check className="h-4 w-4" />}>
              Onayla
            </Button>
          )}
        </>
      )}
      {appt.status === 'confirmed' && started && (
        <>
          <Button variant="danger" loading={busy === 'no_show'} onClick={() => act('no_show')} icon={<UserX className="h-4 w-4" />}>
            Gelmedi
          </Button>
          <Button loading={busy === 'complete'} onClick={() => act('complete')} icon={<CheckCircle2 className="h-4 w-4" />}>
            Tamamlandı
          </Button>
        </>
      )}
    </div>
  );

  return (
    <Modal open={!!appt} onClose={onClose} title={appt.service_name} subtitle={`Rezervasyon kodu ${appt.booking_code}`} footer={footer}>
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <AppointmentStatusBadge status={appt.status} />
          {payment && (
            <span className="flex items-center gap-1.5">
              {testPayment && <TestBadge />}
              <PaymentStatusBadge status={payment.status} />
            </span>
          )}
        </div>
        {appt.status === 'pending_approval' && started && (
          <p className="text-xs text-warning-300">
            Başlangıç saati geçtiği için bu talep onaylanamaz;{' '}
            {!testPayment && Number(appt.deposit_amount) > 0 ? 'reddederek kaporayı iade edebilirsiniz.' : 'talebi reddedebilirsiniz.'}
          </p>
        )}

        <div className="card flex items-center gap-4 p-4">
          <Avatar name={appt.profiles?.full_name ?? 'Müşteri'} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-white">{appt.profiles?.full_name ?? 'Müşteri'}</p>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-mist-2">
              {appt.profiles?.phone && (
                <a href={`tel:${appt.profiles.phone}`} className="inline-flex items-center gap-1 hover:text-gold-300">
                  <Phone className="h-3 w-3" /> {appt.profiles.phone}
                </a>
              )}
              {appt.profiles?.email && (
                <a href={`mailto:${appt.profiles.email}`} className="inline-flex items-center gap-1 truncate hover:text-gold-300">
                  <Mail className="h-3 w-3" /> {appt.profiles.email}
                </a>
              )}
            </div>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-4 text-sm">
          <Item label="Tarih" value={formatDate(appt.starts_at, { day: 'numeric', month: 'long', weekday: 'long' })} />
          <Item label="Saat" value={`${formatTime(appt.starts_at)} – ${formatTime(appt.ends_at)}`} />
          <Item label="Uzman" value={appt.employee_name} />
          <Item label="Süre" value={formatDuration(appt.duration_minutes)} />
          <Item label="Hizmet bedeli" value={formatTRY(appt.total_price)} />
          <Item label={testPayment ? 'Kapora (test ödemesi)' : 'Ödenen kapora'} value={formatTRY(payment?.status === 'paid' ? appt.deposit_amount : 0)} />
          <Item label="İşletmede tahsil" value={formatTRY(appt.remaining_amount)} strong />
          {appt.reschedule_count > 0 && <Item label="Erteleme" value={`${appt.reschedule_count} kez`} />}
        </dl>

        {testPayment && (
          <p className="rounded-xl border border-warning-500/30 bg-warning-900/40 p-3 text-xs leading-relaxed text-warning-300">
            Bu kapora test modunda kaydedildi; müşterinin kartından gerçek bir tahsilat yapılmadı ve tutar hesabınıza aktarılmaz.
          </p>
        )}

        {appt.customer_note && (
          <div className="rounded-xl border border-line bg-ink/40 p-4">
            <p className="mb-1 text-xs text-mist-2">Müşteri notu</p>
            <p className="text-sm leading-relaxed text-mist">{appt.customer_note}</p>
          </div>
        )}
        {appt.cancellation_reason && (
          <div className="rounded-xl border border-error-500/20 bg-error-900/30 p-4 text-sm text-error-300">İptal nedeni: {appt.cancellation_reason}</div>
        )}
        {appt.status === 'confirmed' && !started && (
          <p className="flex items-center gap-2 text-xs text-mist-2">
            <CalendarClock className="h-3.5 w-3.5 text-gold-400" /> Randevu saati geldiğinde tamamlandı veya gelmedi olarak işaretleyebilirsiniz.
          </p>
        )}
        {cancelMode && (
          <div className="animate-fade-in space-y-2">
            <Textarea label="İptal nedeni" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="Müşteriye iletilecek kısa açıklama" />
            <p className="text-xs text-mist-2">
              {testPayment ? 'Kapora test ödemesi olduğu için karta iade yapılmaz; iade yalnızca kayıtta tamamlanır.' : 'İşletme kaynaklı iptallerde ödenen kapora müşteriye tam olarak iade edilir.'}
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Item({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-mist-2">{label}</dt>
      <dd className={`mt-0.5 ${strong ? 'font-semibold text-gold-300' : 'text-white'}`}>{value}</dd>
    </div>
  );
}
