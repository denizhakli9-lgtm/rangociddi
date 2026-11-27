import { useEffect, useState } from 'react';
import { Copy, Save } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';
import { shortTime, timeToMinutes } from '@/lib/format';
import { friendlyError } from '@/lib/errors';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { ErrorState, SkeletonList } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/layout/PageHeader';
import type { WorkingHours } from '@/lib/types';
import { useOwnerBusiness } from './OwnerContext';

const DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

interface Row {
  id?: string;
  weekday: number;
  is_closed: boolean;
  open_time: string;
  close_time: string;
  hasBreak: boolean;
  break_start: string;
  break_end: string;
}

function toRows(list: WorkingHours[]): Row[] {
  return DAYS.map((_, i) => {
    const h = list.find((x) => x.weekday === i + 1);
    return {
      id: h?.id,
      weekday: i + 1,
      is_closed: h ? h.is_closed : i === 6,
      open_time: shortTime(h?.open_time ?? '09:00'),
      close_time: shortTime(h?.close_time ?? '19:00'),
      hasBreak: !!(h?.break_start && h?.break_end),
      break_start: shortTime(h?.break_start ?? '13:00'),
      break_end: shortTime(h?.break_end ?? '14:00'),
    };
  });
}

function rowError(r: Row): string | null {
  if (r.is_closed) return null;
  const o = timeToMinutes(r.open_time);
  const c = timeToMinutes(r.close_time);
  if (!(c > o)) return 'Kapanış saati açılıştan sonra olmalı.';
  if (r.hasBreak) {
    const bs = timeToMinutes(r.break_start);
    const be = timeToMinutes(r.break_end);
    if (!(be > bs)) return 'Mola bitişi başlangıçtan sonra olmalı.';
    if (bs < o || be > c) return 'Mola çalışma saatleri içinde olmalı.';
  }
  return null;
}

const timeCls = 'h-10 w-[104px] rounded-lg border border-line bg-ink/60 px-2 text-sm text-white focus:border-gold-500/70 focus:outline-none disabled:opacity-40';

export default function Hours() {
  const { business } = useOwnerBusiness();
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);

  const { data, loading, error, reload } = useAsync(async () => {
    const { data: list, error: err } = await supabase.from('working_hours').select('*').eq('business_id', business.id);
    if (err) throw err;
    return (list ?? []) as WorkingHours[];
  }, [business.id]);

  useEffect(() => {
    if (data) setRows(toRows(data));
  }, [data]);

  const update = (i: number, patch: Partial<Row>) => {
    setTouched(true);
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };

  const copyMonday = () => {
    setTouched(true);
    setRows((rs) => rs.map((r, i) => (i === 0 || i === 6 ? r : { ...rs[0], id: r.id, weekday: r.weekday })));
  };

  const save = async () => {
    if (rows.some((r) => rowError(r))) {
      toast('Lütfen işaretli satırlardaki saatleri düzeltin.', 'error');
      return;
    }
    setSaving(true);
    try {
      for (const r of rows) {
        const payload = {
          is_closed: r.is_closed,
          open_time: r.open_time,
          close_time: r.close_time,
          break_start: r.hasBreak && !r.is_closed ? r.break_start : null,
          break_end: r.hasBreak && !r.is_closed ? r.break_end : null,
        };
        const { error: err } = r.id
          ? await supabase.from('working_hours').update(payload).eq('id', r.id)
          : await supabase.from('working_hours').insert({ ...payload, business_id: business.id, weekday: r.weekday });
        if (err) throw err;
      }
      toast('Çalışma saatleri kaydedildi. Müsait saatler buna göre güncellendi.', 'success');
      setTouched(false);
      reload();
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Çalışma saatleri"
        title="Haftalık program"
        text="Müşterilere sunulan saatler bu programa, molalara ve takvimdeki bloklara göre otomatik hesaplanır. Belirli bir günü kapatmak için takvimden zaman bloklayın."
        action={
          <>
            <Button variant="dark" size="sm" icon={<Copy className="h-3.5 w-3.5" />} onClick={copyMonday} disabled={!rows.length}>
              Pazartesiyi hafta içine uygula
            </Button>
            <Button size="sm" icon={<Save className="h-3.5 w-3.5" />} loading={saving} onClick={save} disabled={!touched}>
              Kaydet
            </Button>
          </>
        }
      />

      {loading && !data ? (
        <SkeletonList count={7} className="h-16" />
      ) : error ? (
        <ErrorState onRetry={reload} />
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => {
            const err = rowError(r);
            return (
              <div key={r.weekday} className={`card p-4 transition ${err ? 'border-error-500/50' : ''}`}>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                  <div className="flex w-40 items-center gap-3">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!r.is_closed}
                      aria-label={`${DAYS[i]} açık`}
                      onClick={() => update(i, { is_closed: !r.is_closed })}
                      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${!r.is_closed ? 'bg-primary' : 'bg-coal-3'}`}
                    >
                      <span className={`absolute top-0.5 h-5 w-5 rounded-full shadow transition-all ${!r.is_closed ? 'left-[22px] bg-primary-fg' : 'left-0.5 bg-[#fff]'}`} />
                    </button>
                    <span className={`text-sm font-medium ${r.is_closed ? 'text-mist-2' : 'text-white'}`}>{DAYS[i]}</span>
                  </div>
                  {r.is_closed ? (
                    <span className="text-sm text-mist-2">Kapalı</span>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <input type="time" step={900} aria-label="Açılış" className={timeCls} value={r.open_time} onChange={(e) => update(i, { open_time: e.target.value })} />
                        <span className="text-mist-3">–</span>
                        <input type="time" step={900} aria-label="Kapanış" className={timeCls} value={r.close_time} onChange={(e) => update(i, { close_time: e.target.value })} />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="flex cursor-pointer items-center gap-2 text-xs text-mist">
                          <input type="checkbox" checked={r.hasBreak} onChange={(e) => update(i, { hasBreak: e.target.checked })} className="h-4 w-4 accent-[#D4AF37]" />
                          Mola
                        </label>
                        <input type="time" step={900} aria-label="Mola başlangıcı" className={timeCls} disabled={!r.hasBreak} value={r.break_start} onChange={(e) => update(i, { break_start: e.target.value })} />
                        <span className="text-mist-3">–</span>
                        <input type="time" step={900} aria-label="Mola bitişi" className={timeCls} disabled={!r.hasBreak} value={r.break_end} onChange={(e) => update(i, { break_end: e.target.value })} />
                      </div>
                    </>
                  )}
                </div>
                {err && <p className="mt-2 text-xs text-error-300">{err}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
