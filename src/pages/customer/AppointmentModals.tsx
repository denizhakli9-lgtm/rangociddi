import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';
import { dateKey, formatDateTime, formatTRY } from '@/lib/format';
import { isTestPayment } from '@/lib/demo';
import { useToast } from '@/contexts/ToastContext';
import { SlotPicker } from '@/components/SlotPicker';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Select, Textarea } from '@/components/ui/Field';
import { Stars } from '@/components/ui/Brand';
import { ErrorState, Spinner } from '@/components/ui/Feedback';
import type { Appointment, Employee, PlatformSettings, Slot, WorkingHours } from '@/lib/types';
import { tx } from '@/i18n/locale';

interface ModalProps {
  appt: Appointment | null;
  onClose: () => void;
  onDone: () => void;
}

export function CancelModal({ appt, onClose, onDone, settings }: ModalProps & { settings?: Pick<PlatformSettings, 'payment_mode'> | null }) {
  const { toast } = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setReason(''), [appt?.id]);
  if (!appt) return null;

  const hoursLeft = (new Date(appt.starts_at).getTime() - Date.now()) / 3600000;
  // After the hardening migration the server applies the window snapshotted on the booking;
  // before it the column is absent and the business's current value is used.
  const policy = appt.cancellation_hours ?? appt.businesses?.cancellation_hours ?? 24;
  // A zero-deposit booking also has a 0 ₺ "paid" row; only a real deposit matters here.
  const payment = appt.payments?.find((p) => p.status === 'paid' && Number(p.amount) > 0);
  const paid = !!payment;
  // Test-mode deposits were never charged, so nothing is refunded to a card.
  const testPayment = paid && isTestPayment(payment, settings);
  // Mirrors private.cancel_appointment: an unanswered request is refunded unless the customer moved it
  // (moving a booking into today makes it pending_approval again), and one whose start has passed expires with a refund.
  const unanswered = appt.status === 'pending_approval';
  const refundable = (unanswered && (appt.reschedule_count === 0 || hoursLeft <= 0)) || hoursLeft >= policy;

  const submit = async () => {
    setBusy(true);
    // An unpaid hold is released with release_pending_hold, which never cancels a booking PayTR confirmed meanwhile.
    const { data, error } = appt.status === 'pending_payment'
      ? await supabase.rpc('release_pending_hold', { p_appointment: appt.id })
      : await supabase.rpc('cancel_appointment', { p_appointment: appt.id, p_reason: reason.trim() });
    setBusy(false);
    if (error) {
      toast(/VEYRA_ALREADY_PAID/.test(error.message ?? '') ? tx('Ödemeniz alınmış ve randevunuz kesinleşmiş; sayfayı yenileyip yeniden deneyin.', 'Your payment went through and the booking is confirmed; refresh and try again.') : friendlyError(error), 'error');
      onDone();
      return;
    }
    toast(data === 'refund' && !testPayment ? tx('Randevu iptal edildi. Kapora iadeniz başlatıldı.', 'Booking cancelled. Your deposit refund has started.') : tx('Randevu iptal edildi.', 'Booking cancelled.'), 'success');
    onDone();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={tx('Randevuyu iptal et', 'Cancel booking')}
      subtitle={`${appt.service_name} · ${formatDateTime(appt.starts_at)}`}
      footer={
        <div className="flex gap-3">
          <Button variant="ghost" full onClick={onClose}>{tx('Vazgeç', 'Keep booking')}</Button>
          <Button variant="danger" full loading={busy} onClick={submit}>{tx('İptal Et', 'Cancel booking')}</Button>
        </div>
      }
    >
      <div className="space-y-4">
        {paid && testPayment && (
          <div className="rounded-xl border border-info-500/30 bg-info-900/40 px-4 py-3 text-sm text-info-300">
            {tx('Bu randevunun kaporası yalnızca test modunda kaydedildi; kartınızdan ücret çekilmediği için iade gerekmez.', 'This booking’s deposit was only recorded in test mode; nothing was charged, so no refund is needed.')}
          </div>
        )}
        {paid && !testPayment && (
          <div className={`rounded-xl border px-4 py-3 text-sm ${refundable ? 'border-success-500/30 bg-success-900/40 text-success-300' : 'border-warning-500/30 bg-warning-900/40 text-warning-300'}`}>
            {refundable
              ? tx(`${formatTRY(appt.deposit_amount)} kaporanız iade edilecektir.`, `Your ${formatTRY(appt.deposit_amount)} deposit will be refunded.`)
              : tx(`Randevuya ${policy} saatten az kaldığı için işletme politikası gereği ${formatTRY(appt.deposit_amount)} kapora iade edilmez.`, `As the appointment is less than ${policy} hours away, the ${formatTRY(appt.deposit_amount)} deposit is not refunded under the business’s policy.`)}
          </div>
        )}
        <Textarea id="cancel-reason" label={tx('İptal nedeni', 'Reason for cancelling')} hint={tx('İsteğe bağlı · Sağlık durumunuz gibi özel nitelikli bilgileri yazmayın.', 'Optional · Do not write sensitive information such as health details.')} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
    </Modal>
  );
}

export function RescheduleModal({ appt, onClose, onDone }: ModalProps) {
  const { toast } = useToast();
  const [ctx, setCtx] = useState<{ hours: WorkingHours[]; staff: Employee[] } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [employeeId, setEmployeeId] = useState('');
  const [slot, setSlot] = useState<Slot | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!appt?.service_id) return;
    // Ignore late responses after the modal closed or switched to another appointment.
    let active = true;
    setCtx(null);
    setLoadError(false);
    setSlot(null);
    setEmployeeId(appt.employee_id);
    Promise.all([
      supabase.from('working_hours').select('*').eq('business_id', appt.business_id),
      supabase.from('employees').select('*, employee_services!inner(service_id)').eq('business_id', appt.business_id).eq('is_active', true).eq('employee_services.service_id', appt.service_id),
    ])
      .then(([h, e]) => {
        if (!active) return;
        if (h.error || e.error) {
          console.error(h.error ?? e.error);
          setLoadError(true);
          return;
        }
        setCtx({ hours: (h.data ?? []) as WorkingHours[], staff: (e.data ?? []) as Employee[] });
      })
      .catch((err) => {
        console.error(err);
        if (active) setLoadError(true);
      });
    return () => {
      active = false;
    };
  }, [appt, attempt]);

  if (!appt || !appt.service_id) return null;

  const submit = async () => {
    if (!slot) return;
    setBusy(true);
    const { error } = await supabase.rpc('reschedule_appointment', { p_appointment: appt.id, p_employee: slot.slot_employee_id, p_starts_at: slot.slot_start });
    setBusy(false);
    if (error) return toast(friendlyError(error), 'error');
    toast(tx('Randevunuz yeni saate taşındı.', 'Your booking has been moved to the new time.'), 'success');
    onDone();
  };

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={tx('Randevuyu ertele', 'Reschedule booking')}
      subtitle={`${tx('Mevcut:', 'Current:')} ${formatDateTime(appt.starts_at)}`}
      footer={<Button full size="lg" disabled={!slot} loading={busy} onClick={submit}>{tx('Yeni saati onayla', 'Confirm new time')}</Button>}
    >
      {loadError ? (
        <ErrorState message={tx('Uygun saatler şu anda yüklenemedi.', 'Available times could not be loaded right now.')} onRetry={() => setAttempt((n) => n + 1)} />
      ) : !ctx ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : (
        <div className="space-y-5">
          {ctx.staff.length > 1 && (
            <Select id="reschedule-employee" label={tx('Uzman', 'Specialist')} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              {ctx.staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </Select>
          )}
          <SlotPicker serviceId={appt.service_id} employeeId={employeeId || null} hours={ctx.hours} excludeAppointment={appt.id} value={slot} onChange={setSlot} />
          {slot && dateKey(new Date(slot.slot_start)) === dateKey() && (
            <p role="status" className="rounded-xl border border-warning-500/30 bg-warning-900/40 px-4 py-3 text-xs text-warning-300">{tx('Aynı gün randevuları işletme onayına tabidir.', 'Same-day bookings need the business’s approval.')}</p>
          )}
        </div>
      )}
    </Modal>
  );
}

export function ReviewModal({ appt, onClose, onDone }: ModalProps) {
  const { toast } = useToast();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setRating(5);
    setComment('');
  }, [appt?.id]);
  if (!appt) return null;

  const submit = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('submit_review', { p_appointment: appt.id, p_rating: rating, p_comment: comment.trim() });
    setBusy(false);
    if (error) return toast(friendlyError(error), 'error');
    toast(tx('Değerlendirmeniz için teşekkürler!', 'Thank you for your review!'), 'success');
    onDone();
  };

  const labels = ['', tx('Kötü', 'Poor'), tx('Vasat', 'Fair'), tx('İyi', 'Good'), tx('Çok iyi', 'Very good'), tx('Mükemmel', 'Excellent')];

  return (
    <Modal
      open
      onClose={onClose}
      title={tx('Deneyiminizi değerlendirin', 'Review your experience')}
      subtitle={`${appt.businesses?.name} · ${appt.service_name}`}
      footer={<Button full size="lg" loading={busy} onClick={submit}>{tx('Gönder', 'Submit')}</Button>}
    >
      <div className="space-y-5">
        <div className="flex flex-col items-center gap-2 py-2">
          <Stars value={rating} size="h-8 w-8" onChange={setRating} />
          <p className="text-sm text-gold-300">{labels[rating]}</p>
        </div>
        <Textarea id="review-comment" label={tx('Yorumunuz', 'Your review')} hint={`${comment.length}/1000 · ${tx('Adınız kısaltılarak gösterilir. Yorumunuz herkese açıktır; sağlık bilgisi paylaşmayın.', 'Your name is shown shortened. Reviews are public; do not share health information.')}`} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={tx('Deneyiminizi diğer müşterilerle paylaşın', 'Share your experience with other customers')} />
      </div>
    </Modal>
  );
}
