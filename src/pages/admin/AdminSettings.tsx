import { useState } from 'react';
import { Copy, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';
import { fetchSettings } from '@/lib/api';
import { friendlyError } from '@/lib/errors';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { ErrorState, SkeletonList } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/layout/PageHeader';
import type { PlatformSettings } from '@/lib/types';

type Key = 'commission_rate' | 'pending_payment_minutes' | 'slot_interval_minutes' | 'min_lead_minutes' | 'max_booking_days' | 'max_reschedules';

/** platform_settings CHECK: slot_interval_minutes IN (10,15,20,30,45,60). */
const SLOT_INTERVALS = [10, 15, 20, 30, 45, 60] as const;

// Every range below stays inside both the platform_settings table CHECKs and the limits of
// private.admin_update_settings, so the UI never sends a value the database rejects.
const FIELDS: { key: Key; label: string; hint: string; min: number; max: number; step?: number; options?: readonly number[] }[] = [
  { key: 'commission_rate', label: 'Komisyon oranı (%)', hint: 'Tamamlanan her randevunun toplam tutarı üzerinden alınır.', min: 0, max: 50, step: 0.1 },
  { key: 'pending_payment_minutes', label: 'Ödeme bekleme süresi (dk)', hint: 'Kapora ödenmezse randevu bu sürenin sonunda serbest bırakılır.', min: 5, max: 60 },
  { key: 'slot_interval_minutes', label: 'Saat aralığı (dk)', hint: 'Müşterilere gösterilen başlangıç saatlerinin sıklığı.', min: 10, max: 60, options: SLOT_INTERVALS },
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
      if (f.options) {
        if (!f.options.includes(v)) e[f.key] = `Şu değerlerden birini seçin: ${f.options.join(', ')} dk.`;
      } else if (values[f.key].trim() === '' || !Number.isFinite(v) || v < f.min || v > f.max || (!f.step && !Number.isInteger(v))) {
        e[f.key] = `${f.min}-${f.max} arası ${f.step ? 'bir değer' : 'tam sayı'} girin.`;
      }
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
        {FIELDS.map((f) =>
          f.options ? (
            <Select
              key={f.key}
              id={`setting-${f.key}`}
              label={f.label}
              value={values[f.key]}
              error={errors[f.key]}
              hint={f.hint}
              onChange={(ev) => setValues((s) => ({ ...s, [f.key]: ev.target.value }))}
            >
              {f.options.map((o) => (
                <option key={o} value={String(o)}>
                  {o} dk
                </option>
              ))}
            </Select>
          ) : (
            <Input
              key={f.key}
              id={`setting-${f.key}`}
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
          ),
        )}
      </div>
      <div className="mt-6 flex justify-end border-t border-line-soft pt-5">
        <Button loading={saving} onClick={save}>
          Ayarları kaydet
        </Button>
      </div>
    </div>
  );
}

type PaymentModeKey = 'test' | 'paytr_test' | 'paytr_live';

const PAYMENT_MODES: { key: PaymentModeKey; label: string; text: string }[] = [
  {
    key: 'test',
    label: 'Test (kartsız)',
    text: 'Ödeme sayfasında sabit bir test kartı görünür, hiçbir ödeme kuruluşuna bağlanılmaz. Karttan tahsilat yapılmaz.',
  },
  {
    key: 'paytr_test',
    label: 'PayTR test',
    text: 'Müşteri PayTR güvenli ödeme sayfasına gider, PayTR test modunda çalışır ve karttan tahsilat yapılmaz. Mağazanız canlıya alınmadan önceki entegrasyon testi için.',
  },
  {
    key: 'paytr_live',
    label: 'PayTR canlı',
    text: 'Kaporalar PayTR üzerinden gerçek kartlardan tahsil edilir, iadeler PayTR üzerinden karta gönderilir. Yalnızca PayTR mağazanız canlı moda alındıktan sonra açın.',
  },
];

function currentPaymentMode(s: PlatformSettings): PaymentModeKey | null {
  if (s.payment_mode === 'test') return 'test';
  if (s.payment_provider !== 'paytr') return null;
  return s.paytr_test_mode === false ? 'paytr_live' : 'paytr_test';
}

/** PayTR posts payment results here; it is entered once in the PayTR merchant panel. */
const PAYTR_CALLBACK_URL = `${String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '')}/functions/v1/paytr-callback`;

function PaymentModeCard({ settings, onChanged }: { settings: PlatformSettings; onChanged: (s: PlatformSettings) => void }) {
  const { toast } = useToast();
  const mode = currentPaymentMode(settings);
  const [pending, setPending] = useState<PaymentModeKey | null>(null);
  const [saving, setSaving] = useState(false);
  const target = PAYMENT_MODES.find((m) => m.key === pending);

  const apply = async () => {
    if (!pending) return;
    setSaving(true);
    const { error } = await supabase.rpc('admin_set_payment_mode', { p_mode: pending });
    setSaving(false);
    if (error) return toast(friendlyError(error), 'error');
    onChanged(
      pending === 'test'
        ? { ...settings, payment_mode: 'test' }
        : { ...settings, payment_mode: 'live', payment_provider: 'paytr', paytr_test_mode: pending === 'paytr_test' },
    );
    setPending(null);
    toast('Ödeme modu güncellendi.', 'success');
  };

  const copyCallbackUrl = async () => {
    try {
      await navigator.clipboard.writeText(PAYTR_CALLBACK_URL);
      toast('Bildirim URL kopyalandı.', 'success');
    } catch {
      toast(PAYTR_CALLBACK_URL, 'info');
    }
  };

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center gap-4">
        <div className="grid h-11 w-11 place-items-center rounded-xl border border-gold-400/30 bg-gold-400/5 text-gold-300">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <p className="font-medium text-white">Ödeme altyapısı</p>
          <p className="text-xs text-mist-2">Kart bilgileri ödeme kuruluşunda işlenir, Rango'da saklanmaz. Değişiklik yeni ödemelere hemen uygulanır.</p>
        </div>
        <Badge tone={mode === 'paytr_live' ? 'success' : 'warning'}>
          {mode === 'paytr_live' ? 'Canlı mod' : mode === 'paytr_test' ? 'PayTR test' : mode === 'test' ? 'Test modu' : 'Sağlayıcı yok'}
        </Badge>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Ödeme modu">
        {PAYMENT_MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            role="radio"
            aria-checked={m.key === mode}
            onClick={() => m.key !== mode && setPending(m.key)}
            className={`rounded-xl border p-4 text-left transition-colors ${m.key === mode ? 'border-gold-400 bg-gold-400/10' : 'border-line hover:border-gold-500/50'}`}
          >
            <p className="font-medium text-white">{m.label}</p>
            <p className="mt-1 text-xs leading-relaxed text-mist-2">{m.text}</p>
          </button>
        ))}
      </div>
      <div className="mt-4 rounded-xl border border-line-soft p-3 text-xs text-mist-2">
        <p>PayTR Bildirim URL (PayTR Mağaza Paneli → Destek &amp; Kurulum → Ayarlar):</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <code className="break-all text-gold-300">{PAYTR_CALLBACK_URL}</code>
          <Button size="sm" variant="ghost" icon={<Copy className="h-3.5 w-3.5" />} onClick={copyCallbackUrl}>
            Kopyala
          </Button>
        </div>
      </div>
      <Modal
        open={!!pending}
        onClose={() => setPending(null)}
        title="Ödeme modunu değiştir"
        subtitle={target ? `Yeni mod: ${target.label}` : ''}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Vazgeç
            </Button>
            <Button variant={pending === 'paytr_live' ? 'danger' : 'gold'} loading={saving} onClick={apply}>
              Değiştir
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-mist">
          <p>{target?.text}</p>
          {pending === 'paytr_live' && (
            <p className="rounded-xl border border-warning-500/40 bg-warning-900/40 p-3 text-xs leading-relaxed text-warning-300">
              Gerçek para çekilir. PayTR'den mağazanızın canlı moda alındığına dair SMS/e-posta almadıysanız bu modu açmayın: PayTR o zamana kadar ödemeleri test işlemi olarak alır ve Rango bu ödemelerle randevu onaylamaz.
            </p>
          )}
          {pending !== 'test' && (
            <p className="text-xs text-mist-2">Bildirim URL'nin PayTR panelinde yukarıdaki adresle kayıtlı olduğundan emin olun; aksi halde ödemeler randevulara bağlanmayabilir.</p>
          )}
        </div>
      </Modal>
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
          <PaymentModeCard settings={data} onChanged={(next) => setData(next)} />
          <SettingsForm key={JSON.stringify(data)} initial={data} onSaved={(s) => setData(s)} />
        </div>
      )}
    </div>
  );
}
