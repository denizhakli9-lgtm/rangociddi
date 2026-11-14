import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';
import { formatDateTime, formatTRY } from '@/lib/format';
import { useToast } from '@/contexts/ToastContext';
import { SlotPicker } from '@/components/SlotPicker';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Select, Textarea } from '@/components/ui/Field';
import { Stars } from '@/components/ui/Brand';
import { Spinner } from '@/components/ui/Feedback';
import type { Appointment, Employee, Slot, WorkingHours } from '@/lib/types';

interface ModalProps {
  appt: Appointment | null;
  onClose: () => void;
  onDone: () => void;
}

export function CancelModal({ appt, onClose, onDone }: ModalProps) {
  const { toast } = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setReason(''), [appt?.id]);
  if (!appt) return null;

  const hoursLeft = (new Date(appt.starts_at).getTime() - Date.now()) / 3600000;
  const policy = appt.businesses?.cancellation_hours ?? 24;
  const paid = appt.payments?.some((p) => p.status === 'paid');
  const refundable = appt.status === 'pending_approval' || hoursLeft >= policy;

  const submit = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('cancel_appointment', { p_appointment: appt.id, p_reason: reason.trim() });
    setBusy(false);
    if (error) return toast(friendlyError(error), 'error');
    toast(data === 'refund' ? 'Randevu iptal edildi. Kapora iadeniz başlatıldı.' : 'Randevu iptal edildi.', 'success');
    onDone();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Randevuyu iptal et"
      subtitle={`${appt.service_name} · ${formatDateTime(appt.starts_at)}`}
      footer={
        <div className="flex gap-3">
          <Button variant="ghost" full onClick={onClose}>Vazgeç</Button>
          <Button variant="danger" full loading={busy} onClick={submit}>İptal Et</Button>
        </div>
      }
    >
      <div className="space-y-4">
        {paid && (
          <div className={`rounded-xl border px-4 py-3 text-sm ${refundable ? 'border-success-500/30 bg-success-900/40 text-success-300' : 'border-warning-500/30 bg-warning-900/40 text-warning-300'}`}>
            {refundable
              ? `${formatTRY(appt.deposit_amount)} kaporanız iade edilecektir.`
              : `Randevuya ${policy} saatten az kaldığı için işletme politikası gereği ${formatTRY(appt.deposit_amount)} kapora iade edilmez.`}
          </div>
        )}
        <Textarea label="İptal nedeni" hint="İsteğe bağlı" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
    </Modal>
  );
}

export function RescheduleModal({ appt, onClose, onDone }: ModalProps) {
  const { toast } = useToast();
  const [ctx, setCtx] = useState<{ hours: WorkingHours[]; staff: Employee[] } | null>(null);
  const [employeeId, setEmployeeId] = useState('');
  const [slot, setSlot] = useState<Slot | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!appt?.service_id) return;
    setCtx(null);
    setSlot(null);
    setEmployeeId(appt.employee_id);
    Promise.all([
      supabase.from('working_hours').select('*').eq('business_id', appt.business_id),
      supabase.from('employees').select('*, employee_services!inner(service_id)').eq('business_id', appt.business_id).eq('is_active', true).eq('employee_services.service_id', appt.service_id),
    ]).then(([h, e]) => {
      if (h.error || e.error) {
        toast(friendlyError(h.error ?? e.error), 'error');
        return;
      }
      setCtx({ hours: (h.data ?? []) as WorkingHours[], staff: (e.data ?? []) as Employee[] });
    });
  }, [appt, toast]);

  if (!appt || !appt.service_id) return null;

  const submit = async () => {
    if (!slot) return;
    setBusy(true);
    const { error } = await supabase.rpc('reschedule_appointment', { p_appointment: appt.id, p_employee: slot.slot_employee_id, p_starts_at: slot.slot_start });
    setBusy(false);
    if (error) return toast(friendlyError(error), 'error');
    toast('Randevunuz yeni saate taşındı.', 'success');
    onDone();
  };

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Randevuyu ertele"
      subtitle={`Mevcut: ${formatDateTime(appt.starts_at)}`}
      footer={<Button full size="lg" disabled={!slot} loading={busy} onClick={submit}>Yeni saati onayla</Button>}
    >
      {!ctx ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : (
        <div className="space-y-5">
          {ctx.staff.length > 1 && (
            <Select label="Uzman" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              {ctx.staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </Select>
          )}
          <SlotPicker serviceId={appt.service_id} employeeId={employeeId || null} hours={ctx.hours} excludeAppointment={appt.id} value={slot} onChange={setSlot} />
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
    toast('Değerlendirmeniz için teşekkürler!', 'success');
    onDone();
  };

  const labels = ['', 'Kötü', 'Vasat', 'İyi', 'Çok iyi', 'Mükemmel'];

  return (
    <Modal
      open
      onClose={onClose}
      title="Deneyiminizi değerlendirin"
      subtitle={`${appt.businesses?.name} · ${appt.service_name}`}
      footer={<Button full size="lg" loading={busy} onClick={submit}>Gönder</Button>}
    >
      <div className="space-y-5">
        <div className="flex flex-col items-center gap-2 py-2">
          <Stars value={rating} size="h-8 w-8" onChange={setRating} />
          <p className="text-sm text-gold-300">{labels[rating]}</p>
        </div>
        <Textarea label="Yorumunuz" hint={`${comment.length}/1000 · Adınız kısaltılarak gösterilir`} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Deneyiminizi diğer müşterilerle paylaşın" />
      </div>
    </Modal>
  );
}
