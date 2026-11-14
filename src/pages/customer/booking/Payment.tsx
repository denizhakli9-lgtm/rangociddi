import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { CalendarClock, CreditCard, Lock, ShieldCheck, Timer } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchSettings } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { friendlyError } from '@/lib/errors';
import { cardBrand, luhn, validExpiry } from '@/lib/validation';
import { formatDateTime, formatTRY } from '@/lib/format';
import { useToast } from '@/contexts/ToastContext';
import { useT } from '@/i18n/I18nProvider';
import { Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/Feedback';
import type { Appointment } from '@/lib/types';

const formatCard = (v: string) => v.replace(/\D/g, '').slice(0, 19).replace(/(.{4})/g, '$1 ').trim();
const formatExpiry = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
};

export default function Payment() {
  const t = useT();
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data, loading, error, reload } = useAsync(async () => {
    const [{ data: appt, error: err }, settings] = await Promise.all([
      supabase.from('appointments').select('*, businesses(id, name, slug, cover_url, address, district, city, latitude, longitude, cancellation_hours, phone)').eq('id', id).maybeSingle(),
      fetchSettings(),
    ]);
    if (err) throw err;
    return { appt: appt as Appointment | null, settings };
  }, [id]);

  const [form, setForm] = useState({ name: '', number: '', expiry: '', cvc: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof typeof form, string>>>({});
  const [paying, setPaying] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!data?.appt) return;
    const deadline = new Date(data.appt.created_at).getTime() + data.settings.pending_payment_minutes * 60000;
    const tick = () => setRemaining(Math.max(0, Math.floor((deadline - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [data]);

  if (loading) return <PageLoader />;
  if (error) return <ErrorState onRetry={reload} />;
  if (!data?.appt) return <EmptyState icon={<CalendarClock className="h-6 w-6" />} title="Randevu bulunamadı" />;
  const { appt, settings } = data;
  if (appt.status !== 'pending_payment') return <Navigate to={`/onay/${appt.id}`} replace />;

  const expired = remaining === 0;
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (form.name.trim().length < 3) next.name = t.validation.cardName;
    if (!luhn(form.number)) next.number = t.validation.cardNumber;
    if (!validExpiry(form.expiry)) next.expiry = t.validation.cardExpiry;
    if (!/^\d{3,4}$/.test(form.cvc)) next.cvc = t.validation.cardCvc;
    setErrors(next);
    if (Object.keys(next).length) return;

    setPaying(true);
    const digits = form.number.replace(/\D/g, '');
    const { error: err } = await supabase.rpc('pay_deposit', {
      p_appointment: appt.id,
      p_card_last4: digits.slice(-4),
      p_card_brand: cardBrand(digits),
    });
    setPaying(false);
    if (err) {
      toast(friendlyError(err), 'error');
      if (err.message?.includes('VEYRA_PAYMENT_EXPIRED') || err.message?.includes('VEYRA_INVALID_STATE')) reload();
      return;
    }
    setForm({ name: '', number: '', expiry: '', cvc: '' });
    navigate(`/onay/${appt.id}`, { replace: true });
  };

  const mm = remaining != null ? String(Math.floor(remaining / 60)).padStart(2, '0') : '--';
  const ss = remaining != null ? String(remaining % 60).padStart(2, '0') : '--';

  return (
    <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1fr_380px]">
      <div className="animate-fade-up">
        <p className="eyebrow mb-2">Güvenli ödeme</p>
        <h1 className="font-display text-4xl text-white">Kapora ödemesi</h1>
        <p className="mt-2 text-sm text-mist">Randevunuzu kesinleştirmek için kaporayı ödeyin. Kalan tutarı işletmede ödersiniz.</p>

        <div className={`mt-6 flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm ${expired ? 'border-error-500/40 bg-error-900/30 text-error-300' : 'border-gold-500/30 bg-gold-500/5 text-gold-200'}`}>
          <Timer className="h-4 w-4 shrink-0" />
          {expired ? 'Ödeme süresi doldu. Saat başka müşterilere açıldı.' : <>Saatiniz <span className="font-semibold">{mm}:{ss}</span> boyunca sizin için ayrıldı.</>}
        </div>

        {settings.payment_mode === 'test' && (
          <p className="mt-3 rounded-xl border border-info-500/30 bg-info-900/40 px-4 py-3 text-xs text-info-300">
            Test modu: gerçek ödeme alınmaz. Deneme için 4111 1111 1111 1111 numaralı kartı ve ileri tarihli herhangi bir son kullanma tarihini kullanabilirsiniz.
          </p>
        )}

        {expired ? (
          <Button full size="lg" variant="outline" className="mt-8" onClick={() => navigate(`/i/${appt.businesses?.slug ?? ''}/randevu`)}>Yeni saat seç</Button>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-4" noValidate autoComplete="off">
            <Input label="Kart üzerindeki isim" name="cc-name" autoComplete="cc-name" value={form.name} onChange={(e) => set('name', e.target.value)} error={errors.name} />
            <Input label="Kart numarası" name="cc-number" inputMode="numeric" autoComplete="cc-number" placeholder="0000 0000 0000 0000" value={form.number} onChange={(e) => set('number', formatCard(e.target.value))} error={errors.number} icon={<CreditCard className="h-4 w-4" />} hint={form.number.length > 4 ? cardBrand(form.number) : undefined} />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Son kullanma (AA/YY)" name="cc-exp" inputMode="numeric" autoComplete="cc-exp" placeholder="AA/YY" value={form.expiry} onChange={(e) => set('expiry', formatExpiry(e.target.value))} error={errors.expiry} />
              <Input label="CVC" name="cc-csc" type="password" inputMode="numeric" autoComplete="cc-csc" placeholder="•••" value={form.cvc} onChange={(e) => set('cvc', e.target.value.replace(/\D/g, '').slice(0, 4))} error={errors.cvc} />
            </div>
            <Button type="submit" full size="lg" loading={paying} icon={<Lock className="h-4 w-4" />}>
              {formatTRY(appt.deposit_amount)} Öde
            </Button>
            <p className="flex items-center justify-center gap-2 text-xs text-mist-2">
              <ShieldCheck className="h-3.5 w-3.5 text-gold-500" />
              Kart bilgileriniz Rango sunucularında saklanmaz. Ödemeler {settings.payment_provider === 'iyzico' ? 'iyzico' : settings.payment_provider} altyapısı ile işlenir.
            </p>
          </form>
        )}
      </div>

      <aside className="card-gold h-fit overflow-hidden lg:sticky lg:top-24">
        {appt.businesses?.cover_url && <img src={appt.businesses.cover_url} alt="" className="h-36 w-full object-cover" />}
        <div className="space-y-4 p-6">
          <div>
            <p className="font-display text-2xl text-white">{appt.businesses?.name}</p>
            <p className="text-xs text-mist-2">{appt.businesses?.district}</p>
          </div>
          <div className="space-y-2 border-t border-line pt-4 text-sm">
            <div className="flex justify-between text-mist"><span>Hizmet</span><span className="text-white">{appt.service_name}</span></div>
            <div className="flex justify-between text-mist"><span>Uzman</span><span className="text-white">{appt.employee_name}</span></div>
            <div className="flex justify-between text-mist"><span>Tarih</span><span className="text-white">{formatDateTime(appt.starts_at)}</span></div>
          </div>
          <div className="space-y-2 border-t border-line pt-4 text-sm">
            <div className="flex justify-between text-mist"><span>Toplam</span><span className="text-white">{formatTRY(appt.total_price)}</span></div>
            <div className="flex justify-between text-mist"><span>Kapora</span><span className="font-semibold text-gold-400">{formatTRY(appt.deposit_amount)}</span></div>
            <div className="flex justify-between text-mist"><span>İşletmede</span><span className="text-white">{formatTRY(appt.remaining_amount)}</span></div>
          </div>
        </div>
      </aside>
    </div>
  );
}
