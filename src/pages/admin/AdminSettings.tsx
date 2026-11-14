import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';
import { fetchSettings } from '@/lib/api';
import { friendlyError } from '@/lib/errors';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { ErrorState, SkeletonList } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/layout/PageHeader';
import type { PlatformSettings } from '@/lib/types';

type Key = 'commission_rate' | 'pending_payment_minutes' | 'slot_interval_minutes' | 'min_lead_minutes' | 'max_booking_days' | 'max_reschedules';

const FIELDS: { key: Key; label: string; hint: string; min: number; max: number; step?: number }[] = [
  { key: 'commission_rate', label: 'Komisyon oranı (%)', hint: 'Tamamlanan her randevunun toplam tutarı üzerinden alınır.', min: 0, max: 50, step: 0.1 },
  { key: 'pending_payment_minutes', label: 'Ödeme bekleme süresi (dk)', hint: 'Kapora ödenmezse randevu bu sürenin sonunda serbest bırakılır.', min: 5, max: 60 },
  { key: 'slot_interval_minutes', label: 'Saat aralığı (dk)', hint: 'Müşterilere gösterilen başlangıç saatlerinin sıklığı.', min: 5, max: 60 },
  { key: 'min_lead_minutes', label: 'En erken rezervasyon (dk)', hint: 'Şu andan itibaren en az bu kadar sonrası seçilebilir.', min: 0, max: 1440 },
  { key: 'max_booking_days', label: 'En ileri rezervasyon (gün)', hint: 'Takvimin kaç gün ileriye açık olacağı.', min: 1, max: 180 },
  { key: 'max_reschedules', label: 'Erteleme hakkı', hint: 'Bir randevunun en fazla kaç kez ertelenebileceği.', min: 0, max: 5 },
];

function SettingsForm({ initial, onSaved }: { initial: PlatformSettings; onSaved: (s: PlatformSettings) => void }) {
  const { toast } = useToast();
  const [values, setValues] = useState<Record<Key, string>>(() => Object.fromEntries(FIELDS.map((f) => [f.key, String(initial[f.key])])) as Record<Key, string>);
  const [errors, setErrors] = useState<Partial<Record<Key, string>>>({});
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const e: Partial<Record<Key, string>> = {};
    const n = {} as Record<Key, number>;
    for (const f of FIELDS) {
      const v = Number(values[f.key]);
      if (values[f.key].trim() === '' || !Number.isFinite(v) || v < f.min || v > f.max || (!f.step && !Number.isInteger(v))) e[f.key] = `${f.min}-${f.max} arası ${f.step ? 'bir değer' : 'tam sayı'} girin.`;
      n[f.key] = v;
    }
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    const { error } = await supabase.rpc('admin_update_settings', {
      p_commission_rate: n.commission_rate,
      p_pending_minutes: n.pending_payment_minutes,
      p_slot_interval: n.slot_interval_minutes,
      p_min_lead: n.min_lead_minutes,
      p_max_days: n.max_booking_days,
      p_max_reschedules: n.max_reschedules,
    });
    setSaving(false);
    if (error) return toast(friendlyError(error), 'error');
    toast('Platform ayarları kaydedildi.', 'success');
    onSaved({ ...initial, ...n });
  };

  return (
    <div className="card p-6">
      <div className="grid gap-5 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <Input
            key={f.key}
            label={f.label}
            type="number"
            min={f.min}
            max={f.max}
            step={f.step ?? 1}
            value={values[f.key]}
            error={errors[f.key]}
            hint={f.hint}
            onChange={(ev) => setValues((s) => ({ ...s, [f.key]: ev.target.value }))}
          />
        ))}
      </div>
      <div className="mt-6 flex justify-end border-t border-line-soft pt-5">
        <Button loading={saving} onClick={save}>
          Ayarları kaydet
        </Button>
      </div>
    </div>
  );
}

export default function AdminSettings() {
  const { data, loading, error, reload, setData } = useAsync(fetchSettings, []);

  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="Ayarlar" title="Platform ayarları" text="Değişiklikler yeni randevulara anında uygulanır. Mevcut komisyon kayıtları değişmez." />
      {loading && !data ? (
        <SkeletonList count={2} className="h-40" />
      ) : error || !data ? (
        <ErrorState onRetry={reload} />
      ) : (
        <div className="space-y-6">
          <div className="card flex flex-wrap items-center gap-4 p-5">
            <div className="grid h-11 w-11 place-items-center rounded-xl border border-gold-400/30 bg-gold-400/5 text-gold-300">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-white">Ödeme altyapısı: {data.payment_provider}</p>
              <p className="text-xs text-mist-2">Kart bilgileri sağlayıcıda işlenir, Rango'da saklanmaz.</p>
            </div>
            <Badge tone={data.payment_mode === 'live' ? 'success' : 'warning'}>{data.payment_mode === 'live' ? 'Canlı mod' : 'Test modu'}</Badge>
          </div>
          <SettingsForm key={JSON.stringify(data)} initial={data} onSaved={(s) => setData(s)} />
        </div>
      )}
    </div>
  );
}
