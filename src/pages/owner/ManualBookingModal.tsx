import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';
import { dateKey, formatDuration, formatTime, formatTRY, keyLabel } from '@/lib/format';
import { friendlyError } from '@/lib/errors';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { SlotPicker } from '@/components/SlotPicker';
import type { Employee, Service, Slot, WorkingHours } from '@/lib/types';
import { useOwnerBusiness } from './OwnerContext';

interface Props {
  open: boolean;
  employees: Employee[];
  hours: WorkingHours[];
  onClose: () => void;
  onSaved: () => void;
}

/**
 * "Randevu ekle": a booking the business takes by phone or at the door. Three choices only
 * (service, a free time, the customer's name); the rest stays behind "Telefon ve not ekle".
 * It closes the time for online bookings like a blocked slot; no deposit, no commission.
 */
export function ManualBookingModal({ open, employees, hours, onClose, onSaved }: Props) {
  const { business } = useOwnerBusiness();
  const { toast } = useToast();
  const { data: services } = useAsync(async () => {
    const { data, error } = await supabase.from('services').select('*').eq('business_id', business.id).eq('is_active', true).order('sort_order');
    if (error) throw error;
    return (data ?? []) as Service[];
  }, [business.id]);
  const [serviceId, setServiceId] = useState('');
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [name, setName] = useState('');
  const [more, setMore] = useState(false);
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const service = services?.find((s) => s.id === serviceId);
  const assigned = employees.find((e) => e.id === slot?.slot_employee_id);
  const chooseService = (id: string) => {
    setServiceId(id);
    setSlot(null);
  };

  const save = async () => {
    if (!service || !slot) return;
    setSaving(true);
    const startsAt = new Date(slot.slot_start);
    const customer = name.trim();
    const { error } = await supabase.from('time_slots').insert({
      business_id: business.id,
      employee_id: slot.slot_employee_id,
      starts_at: startsAt.toISOString(),
      ends_at: new Date(startsAt.getTime() + service.duration_minutes * 60000).toISOString(),
      kind: 'booking',
      service_id: service.id,
      customer_name: customer.slice(0, 80) || null,
      customer_phone: phone.trim().slice(0, 30) || null,
      // Shown by older app versions, which only know blocked slots.
      reason: [customer || 'Randevu', service.name, note.trim()].filter(Boolean).join(' · ').slice(0, 200),
    });
    setSaving(false);
    if (error) {
      toast(friendlyError(error), 'error');
      return;
    }
    toast('Randevu eklendi. Bu saat online randevuya kapandı.', 'success');
    onSaved();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Randevu ekle"
      subtitle="Telefonla ya da kapıdan gelen müşteriniz için. Kapora ve komisyon yok."
      footer={
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] text-mist">
            {service && slot ? (
              <>
                <span className="font-medium text-white">{service.name}</span> · {keyLabel(dateKey(new Date(slot.slot_start)), { weekday: 'short', day: 'numeric', month: 'short' })} {formatTime(slot.slot_start)}
                {assigned ? ` · ${assigned.full_name}` : ''}
              </>
            ) : (
              'Hizmet ve saat seçin.'
            )}
          </p>
          <Button onClick={save} loading={saving} disabled={!service || !slot} icon={<Check className="h-4 w-4" />}>
            Kaydet
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <section>
          <h3 className="mb-2 text-[13px] font-medium text-mist">1. Hizmet</h3>
          {service ? (
            // Chosen: the list folds away so the times are right below.
            <div className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-gold-500 bg-primary px-4 py-2.5 text-primary-fg">
              <span className="text-sm font-medium">
                {service.name} <span className="font-normal opacity-80">· {formatDuration(service.duration_minutes)} · {formatTRY(Number(service.price))}</span>
              </span>
              <button type="button" onClick={() => chooseService('')} className="min-h-11 shrink-0 text-[13px] font-semibold underline underline-offset-4">
                Değiştir
              </button>
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {(services ?? []).map((s) => {
                const on = s.id === serviceId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => chooseService(s.id)}
                    className={`flex min-h-12 items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-left transition-colors ${on ? 'border-gold-500 bg-primary text-primary-fg' : 'border-line bg-coal text-white hover:border-white/40'}`}
                  >
                    <span className="text-sm font-medium">{s.name}</span>
                    <span className={`shrink-0 text-xs ${on ? 'opacity-80' : 'text-mist-2'}`}>
                      {formatDuration(s.duration_minutes)} · {formatTRY(Number(s.price))}
                    </span>
                  </button>
                );
              })}
              {services && !services.length && <p className="text-sm text-mist-2">Önce Hizmetler sayfasından bir hizmet ekleyin.</p>}
            </div>
          )}
        </section>

        {service && (
          <section>
            <h3 className="mb-2 text-[13px] font-medium text-mist">2. Gün ve saat</h3>
            {employees.length > 1 && (
              <div className="no-scrollbar -mx-1 mb-3 flex gap-2 overflow-x-auto px-1">
                {[{ id: null as string | null, full_name: 'Fark etmez' }, ...employees].map((e) => (
                  <button
                    key={e.id ?? 'any'}
                    type="button"
                    aria-pressed={employeeId === e.id}
                    onClick={() => {
                      setEmployeeId(e.id);
                      setSlot(null);
                    }}
                    className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${employeeId === e.id ? 'border-gold-500 bg-primary text-primary-fg' : 'border-line bg-coal text-mist hover:text-white'}`}
                  >
                    {e.full_name}
                  </button>
                ))}
              </div>
            )}
            <SlotPicker key={`${service.id}-${employeeId ?? 'any'}`} serviceId={service.id} employeeId={employeeId} hours={hours} days={14} value={slot} onChange={setSlot} />
          </section>
        )}

        {service && slot && (
          <section>
            <h3 className="mb-2 text-[13px] font-medium text-mist">3. Müşteri</h3>
            <Input label="Müşteri adı (isteğe bağlı)" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="ör. Ayşe Yılmaz" autoComplete="off" />
            {more ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Input label="Telefon (isteğe bağlı)" type="tel" inputMode="tel" value={phone} maxLength={30} onChange={(e) => setPhone(e.target.value)} placeholder="05xx xxx xx xx" autoComplete="off" />
                <Input label="Not (isteğe bağlı)" value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} placeholder="ör. Uzun saç" />
              </div>
            ) : (
              <button type="button" onClick={() => setMore(true)} className="mt-2 flex min-h-11 items-center gap-1 text-[13px] font-medium text-mist hover:text-white">
                <ChevronDown className="h-4 w-4" /> Telefon ve not ekle
              </button>
            )}
          </section>
        )}
      </div>
    </Modal>
  );
}

