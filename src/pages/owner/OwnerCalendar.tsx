import { useMemo, useState, type FormEvent } from 'react';
import { ChevronLeft, ChevronRight, Lock, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';
import { addDays, dateKey, formatTime, isoWeekday, keyLabel, timeToMinutes } from '@/lib/format';
import { friendlyError } from '@/lib/errors';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { ErrorState, SkeletonList } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/layout/PageHeader';
import type { Appointment, BlockedSlot, Employee, WorkingHours } from '@/lib/types';
import { useOwnerBusiness } from './OwnerContext';
import { fetchOwnerAppointments, istanbulDayStart } from './ownerApi';
import { AppointmentDetailModal } from './AppointmentDetailModal';

const PX = 1.1;
const HIDDEN = ['cancelled', 'rejected'];
const BLOCK_TONE: Record<string, string> = {
  pending_payment: 'border-warning-500/40 bg-warning-500/10 text-warning-300',
  pending_approval: 'border-info-500/50 bg-info-500/10 text-info-300',
  confirmed: 'border-gold-500/60 bg-gold-500/15 text-gold-300',
  completed: 'border-success-500/40 bg-success-500/10 text-success-300',
  no_show: 'border-error-500/40 bg-error-500/10 text-error-300',
};

interface CalendarColumn {
  key: string;
  employee: Employee | null;
  title: string;
  subtitle: string;
  inactive: boolean;
}

function minutesOf(iso: string): number {
  return timeToMinutes(formatTime(iso));
}

export default function OwnerCalendar() {
  const { business } = useOwnerBusiness();
  const [day, setDay] = useState(dateKey());
  const [open, setOpen] = useState<Appointment | null>(null);
  const [blockOpen, setBlockOpen] = useState(false);

  const { data, loading, error, reload } = useAsync(async () => {
    const [appts, employees, hours, blocks] = await Promise.all([
      fetchOwnerAppointments(business.id, { from: istanbulDayStart(day), to: istanbulDayStart(addDays(day, 1)) }),
      // Inactive employees are loaded too, so their remaining appointments stay visible (see `columns`).
      supabase.from('employees').select('*').eq('business_id', business.id).order('sort_order'),
      supabase.from('working_hours').select('*').eq('business_id', business.id),
      supabase.from('time_slots').select('*').eq('business_id', business.id).lt('starts_at', istanbulDayStart(addDays(day, 1))).gt('ends_at', istanbulDayStart(day)),
    ]);
    if (employees.error) throw employees.error;
    if (hours.error) throw hours.error;
    if (blocks.error) throw blocks.error;
    return {
      appts: appts.filter((a) => !HIDDEN.includes(a.status)),
      employees: (employees.data ?? []) as Employee[],
      hours: (hours.data ?? []) as WorkingHours[],
      blocks: (blocks.data ?? []) as BlockedSlot[],
    };
  }, [business.id, day]);

  const todayHours = data?.hours.find((h) => h.weekday === isoWeekday(day));
  const range = useMemo(() => {
    if (todayHours && !todayHours.is_closed) {
      return { start: Math.floor(timeToMinutes(todayHours.open_time) / 60) * 60, end: Math.ceil(timeToMinutes(todayHours.close_time) / 60) * 60 };
    }
    return { start: 9 * 60, end: 20 * 60 };
  }, [todayHours]);

  const activeEmployees = useMemo(() => (data?.employees ?? []).filter((e) => e.is_active), [data]);
  const columns = useMemo<CalendarColumn[]>(() => {
    if (!data) return [];
    const known = new Set(data.employees.map((e) => e.id));
    const cols: CalendarColumn[] = data.employees
      .filter((e) => e.is_active || data.appts.some((a) => a.employee_id === e.id))
      .map((e) => ({ key: e.id, employee: e, title: e.full_name, subtitle: e.is_active ? e.title || 'Uzman' : 'Pasif çalışan', inactive: !e.is_active }));
    // Appointments whose employee is not in the list at all still need a place on the board.
    if (data.appts.some((a) => !known.has(a.employee_id))) {
      cols.push({ key: '__other', employee: null, title: 'Diğer', subtitle: 'Listede olmayan uzman', inactive: true });
    }
    return cols;
  }, [data]);
  const apptsFor = (col: CalendarColumn) => {
    if (!data) return [];
    const emp = col.employee;
    if (emp) return data.appts.filter((a) => a.employee_id === emp.id);
    const known = new Set(data.employees.map((e) => e.id));
    return data.appts.filter((a) => !known.has(a.employee_id));
  };

  const clampTop = (iso: string, dayStartIso: string) => (iso < dayStartIso ? range.start : minutesOf(iso));
  const hoursList = Array.from({ length: (range.end - range.start) / 60 }, (_, i) => range.start + i * 60);
  const dayStartIso = istanbulDayStart(day);

  const removeBlock = async (b: BlockedSlot) => {
    const { error: err } = await supabase.from('time_slots').delete().eq('id', b.id);
    if (err) return friendlyError(err);
    reload();
    return null;
  };

  return (
    <div>
      <PageHeader
        eyebrow="Takvim"
        title={keyLabel(day, { weekday: 'long', day: 'numeric', month: 'long' })}
        text={todayHours?.is_closed ? 'Bu gün kapalı olarak ayarlı.' : 'Uzman bazında günlük doluluk. Randevuya dokunarak detayları açın.'}
        action={
          <>
            <Button variant="dark" size="sm" onClick={() => setDay(dateKey())}>
              Bugün
            </Button>
            <Button variant="outline" size="sm" icon={<Lock className="h-3.5 w-3.5" />} onClick={() => setBlockOpen(true)}>
              Zaman blokla
            </Button>
          </>
        }
      />

      <div className="mb-6 flex items-center gap-2">
        <button type="button" onClick={() => setDay(addDays(day, -1))} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line text-mist transition hover:border-white/30 hover:text-white" aria-label="Önceki gün">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="no-scrollbar flex flex-1 gap-2 overflow-x-auto">
          {Array.from({ length: 7 }, (_, i) => addDays(day, i - 3)).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setDay(k)}
              className={`flex min-w-[64px] flex-1 flex-col items-center rounded-xl border py-2 transition ${k === day ? 'border-gold-500 bg-gold-500/10 text-gold-300' : 'border-line text-mist hover:border-white/30'}`}
            >
              <span className="text-[10px] uppercase tracking-wider">{keyLabel(k, { weekday: 'short' })}</span>
              <span className="text-lg font-semibold">{keyLabel(k, { day: 'numeric' })}</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setDay(addDays(day, 1))} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line text-mist transition hover:border-white/30 hover:text-white" aria-label="Sonraki gün">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {loading && !data ? (
        <SkeletonList count={1} className="h-96" />
      ) : error ? (
        <ErrorState onRetry={reload} />
      ) : !data || !columns.length ? (
        <p className="card p-6 text-sm text-mist-2">Takvimi görmek için önce bir çalışan ekleyin.</p>
      ) : (
        <div className="card overflow-x-auto">
          <div className="flex min-w-max">
            <div className="sticky left-0 z-10 w-14 shrink-0 border-r border-line bg-coal">
              <div className="h-14 border-b border-line" />
              {hoursList.map((m) => (
                <div key={m} style={{ height: 60 * PX }} className="relative border-b border-line-soft">
                  <span className="absolute -top-2 right-2 text-[10px] text-mist-3">{String(m / 60).padStart(2, '0')}:00</span>
                </div>
              ))}
            </div>
            {columns.map((col) => (
              <div key={col.key} className={`w-48 shrink-0 border-r border-line-soft last:border-r-0 ${col.inactive ? 'bg-coal-3/30' : ''}`}>
                <div className="flex h-14 flex-col justify-center border-b border-line px-3">
                  <p className={`truncate text-sm font-medium ${col.inactive ? 'text-mist' : 'text-white'}`}>{col.title}</p>
                  <p className={`truncate text-[11px] ${col.inactive ? 'text-warning-300' : 'text-mist-2'}`}>{col.subtitle}</p>
                </div>
                <div className="relative" style={{ height: (range.end - range.start) * PX }}>
                  {hoursList.map((m) => (
                    <div key={m} style={{ top: (m - range.start) * PX, height: 60 * PX }} className="absolute inset-x-0 border-b border-line-soft" />
                  ))}
                  {todayHours?.break_start && todayHours.break_end && (
                    <div
                      className="absolute inset-x-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,rgba(255,255,255,0.03)_6px,rgba(255,255,255,0.03)_12px)]"
                      style={{ top: (timeToMinutes(todayHours.break_start) - range.start) * PX, height: (timeToMinutes(todayHours.break_end) - timeToMinutes(todayHours.break_start)) * PX }}
                    />
                  )}
                  {data.blocks
                    .filter((b) => !b.employee_id || b.employee_id === col.employee?.id)
                    .map((b) => {
                      const top = clampTop(b.starts_at, dayStartIso);
                      const end = b.ends_at >= istanbulDayStart(addDays(day, 1)) ? range.end : minutesOf(b.ends_at);
                      return (
                        <BlockChip key={b.id} block={b} top={(top - range.start) * PX} height={Math.max(20, (end - top) * PX)} onRemove={removeBlock} />
                      );
                    })}
                  {apptsFor(col)
                    .map((a) => {
                      const top = minutesOf(a.starts_at);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => setOpen(a)}
                          style={{ top: (top - range.start) * PX + 1, height: Math.max(24, a.duration_minutes * PX - 2) }}
                          className={`absolute inset-x-1 overflow-hidden rounded-lg border px-2 py-1 text-left text-[11px] leading-tight transition hover:z-10 hover:scale-[1.02] ${BLOCK_TONE[a.status] ?? BLOCK_TONE.confirmed}`}
                        >
                          <p className="font-semibold">
                            {formatTime(a.starts_at)} {a.profiles?.full_name ?? 'Müşteri'}
                          </p>
                          <p className="truncate opacity-80">{a.service_name}</p>
                        </button>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <AppointmentDetailModal
        appt={open}
        onClose={() => setOpen(null)}
        onDone={() => {
          setOpen(null);
          reload();
        }}
      />
      <BlockModal key={`${day}-${blockOpen}`} open={blockOpen} day={day} employees={activeEmployees} onClose={() => setBlockOpen(false)} onSaved={() => { setBlockOpen(false); reload(); }} />
    </div>
  );
}

function BlockChip({ block, top, height, onRemove }: { block: BlockedSlot; top: number; height: number; onRemove: (b: BlockedSlot) => Promise<string | null> }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <div style={{ top, height }} className="group absolute inset-x-1 flex items-start justify-between gap-1 overflow-hidden rounded-lg border border-line bg-coal-3/90 px-2 py-1 text-[11px] text-mist-2">
      <span className="flex items-center gap-1 truncate">
        <Lock className="h-3 w-3 shrink-0" /> {block.reason || 'Bloklu'}
      </span>
      <button
        type="button"
        disabled={busy}
        aria-label="Bloğu kaldır"
        onClick={async () => {
          setBusy(true);
          const err = await onRemove(block);
          setBusy(false);
          if (err) toast(err, 'error');
          else toast('Blok kaldırıldı.', 'success');
        }}
        className="shrink-0 rounded p-0.5 text-mist-3 transition hover:text-error-300"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

function BlockModal({ open, day, employees, onClose, onSaved }: { open: boolean; day: string; employees: Employee[]; onClose: () => void; onSaved: () => void }) {
  const { business } = useOwnerBusiness();
  const { toast } = useToast();
  const [form, setForm] = useState({ employee_id: '', date: day, start: '12:00', end: '13:00', reason: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const date = form.date || day;
    if (timeToMinutes(form.end) <= timeToMinutes(form.start)) {
      setErr('Bitiş saati başlangıçtan sonra olmalıdır.');
      return;
    }
    setErr('');
    setSaving(true);
    const { error } = await supabase.from('time_slots').insert({
      business_id: business.id,
      employee_id: form.employee_id || null,
      starts_at: new Date(`${date}T${form.start}:00+03:00`).toISOString(),
      ends_at: new Date(`${date}T${form.end}:00+03:00`).toISOString(),
      reason: form.reason.trim().slice(0, 200),
    });
    setSaving(false);
    if (error) {
      toast(friendlyError(error), 'error');
      return;
    }
    toast('Zaman aralığı bloklandı. Bu saatlerde randevu alınamaz.', 'success');
    onSaved();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Zaman blokla"
      subtitle="İzin, toplantı veya özel durumlar için bu aralıkta yeni randevu alınmasını engelleyin."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button type="submit" form="block-form" loading={saving} icon={<Plus className="h-4 w-4" />}>
            Blokla
          </Button>
        </>
      }
    >
      <form id="block-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Select label="Kimin için" value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
            <option value="">Tüm işletme</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.full_name}
              </option>
            ))}
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Input label="Tarih" type="date" value={form.date} min={dateKey()} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </div>
        <Input label="Başlangıç" type="time" step={900} value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
        <Input label="Bitiş" type="time" step={900} value={form.end} error={err} onChange={(e) => setForm({ ...form, end: e.target.value })} />
        <div className="sm:col-span-2">
          <Input label="Not (isteğe bağlı)" value={form.reason} maxLength={200} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="ör. Eğitim, izin" />
        </div>
      </form>
    </Modal>
  );
}
