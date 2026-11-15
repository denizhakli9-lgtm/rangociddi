import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, CalendarClock, CreditCard, Lock, MapPin, Timer } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchSettings } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { friendlyError } from '@/lib/errors';
import { formatDateTime, formatDuration, formatTRY } from '@/lib/format';
import { fullAddress } from '@/lib/maps';
import { safeImageUrl } from '@/lib/safeUrl';
import { COMPANY, legalPath } from '@/lib/legal';
import { useToast } from '@/contexts/ToastContext';
import { Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/Feedback';
import type { Appointment } from '@/lib/types';

/**
 * Test card shown read-only in test mode. No real card data is ever typed into this page:
 * no payment provider is integrated yet, and pay_deposit only accepts the test path.
 */
const TEST_CARD = { name: 'TEST KULLANICI', number: '4242 4242 4242 4242', expiry: '12/30', cvc: '123' };

/**
 * No licensed provider (iyzico/PayTR) is integrated yet, so the live-mode pay button stays
 * disabled even after the pre-contract confirmation. Set this only together with the
 * provider-hosted checkout and a server-side payment callback.
 */
const LIVE_CHECKOUT_READY = false;

const linkCls = 'text-gold-400 underline-offset-2 hover:underline';

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[170px_1fr] sm:gap-4">
      <dt className="text-xs text-mist-2">{label}</dt>
      <dd className="text-white">{children}</dd>
    </div>
  );
}

/**
 * Minimal pre-contract information (ön bilgilendirme) shown before the deposit step: who provides
 * the service, who the intermediary platform is, what is booked, the amounts and the free
 * cancellation window, with links to the full terms.
 */
function PreContractInfo({ appt, address, testMode, policyHours }: { appt: Appointment; address: string; testMode: boolean; policyHours: number }) {
  const b = appt.businesses;
  return (
    <section aria-labelledby="on-bilgilendirme" className="mt-6 rounded-2xl border border-line bg-coal p-5 text-sm">
      <h2 id="on-bilgilendirme" className="font-display text-xl text-white">Ön bilgilendirme</h2>
      <p className="mt-1 text-xs leading-relaxed text-mist-2">Ödeme adımına geçmeden önce randevunuza ilişkin temel bilgileri inceleyin.</p>
      <dl className="mt-4 space-y-3">
        <InfoRow label="Hizmet sağlayıcı">
          {b?.name ?? '—'}
          {address && <span className="block text-xs text-mist">{address}</span>}
        </InfoRow>
        <InfoRow label="Aracı hizmet sağlayıcı">
          {COMPANY.legalName}
          <span className="block text-xs"><Link to={legalPath('kunye')} className={linkCls}>Künye ve iletişim bilgileri</Link></span>
        </InfoRow>
        <InfoRow label="Hizmet">{appt.service_name} · {formatDuration(appt.duration_minutes)} · {appt.employee_name}</InfoRow>
        <InfoRow label="Tarih ve saat">{formatDateTime(appt.starts_at)}</InfoRow>
        <InfoRow label="Toplam hizmet bedeli">{formatTRY(appt.total_price)}</InfoRow>
        <InfoRow label="Kapora">{testMode ? `${formatTRY(appt.deposit_amount)} (test modu, tahsil edilmez)` : formatTRY(appt.deposit_amount)}</InfoRow>
        <InfoRow label="İşletmede ödenecek">{formatTRY(testMode ? appt.total_price : appt.remaining_amount)}</InfoRow>
        <InfoRow label="Ücretsiz iptal">
          Randevudan {policyHours} saat öncesine kadar ücretsiz iptal edebilirsiniz.
          {!testMode && ' Bu süreden sonra yapılan iptallerde kapora iade edilmez.'}
        </InfoRow>
      </dl>
      <p className="mt-4 text-xs text-mist">
        Ayrıntılı bilgi: <Link to={legalPath('iptal-iade')} className={linkCls}>İptal ve İade Koşulları</Link> ·{' '}
        <Link to={legalPath('kullanim-kosullari')} className={linkCls}>Kullanım Koşulları</Link>
      </p>
    </section>
  );
}

export default function Payment() {
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

  const [paying, setPaying] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [preInfoAccepted, setPreInfoAccepted] = useState(false);
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

  const testMode = settings.payment_mode === 'test';
  const expired = remaining === 0;
  const b = appt.businesses;
  const cover = safeImageUrl(b?.cover_url);
  const address = b ? fullAddress(b) : '';
  // The window snapshotted on the booking (after the hardening migration) is what the server applies.
  const policyHours = appt.cancellation_hours ?? b?.cancellation_hours ?? 24;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!testMode || paying) return;
    setPaying(true);
    const { error: err } = await supabase.rpc('pay_deposit', {
      p_appointment: appt.id,
      p_card_last4: TEST_CARD.number.replace(/\D/g, '').slice(-4),
      p_card_brand: 'Test',
    });
    setPaying(false);
    if (err) {
      toast(friendlyError(err), 'error');
      if (/VEYRA_(PAYMENT_EXPIRED|INVALID_STATE|PROVIDER_REQUIRED)/.test(err.message ?? '')) reload();
      return;
    }
    navigate(`/onay/${appt.id}`, { replace: true });
  };

  // Live mode has no provider integration yet: let the customer release the held slot instead of dead-ending.
  const releaseHold = async () => {
    setReleasing(true);
    const { error: err } = await supabase.rpc('cancel_appointment', { p_appointment: appt.id, p_reason: '' });
    setReleasing(false);
    if (err) {
      toast(friendlyError(err), 'error');
      return;
    }
    toast('Ayrılan saat serbest bırakıldı.', 'success');
    navigate('/randevularim', { replace: true });
  };

  const mm = remaining != null ? String(Math.floor(remaining / 60)).padStart(2, '0') : '--';
  const ss = remaining != null ? String(remaining % 60).padStart(2, '0') : '--';

  return (
    <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1fr_380px]">
      <div className="animate-fade-up">
        <p className="eyebrow mb-2">{testMode ? 'Test ödemesi' : 'Kapora'}</p>
        <h1 className="font-display text-4xl text-white">Kapora ödemesi</h1>
        <p className="mt-2 text-sm text-mist">
          {testMode
            ? 'Randevunuzu kesinleştirmek için test ödemesini tamamlayın. Hizmet bedelinin tamamını işletmede ödersiniz.'
            : 'Randevunuzu kesinleştirmek için kaporayı ödeyin. Kalan tutarı işletmede ödersiniz.'}
        </p>

        {testMode && (
          <div role="alert" className="mt-6 rounded-2xl border-2 border-warning-500/70 bg-warning-900/60 p-5 text-warning-300">
            <p className="flex items-center gap-2 text-xl font-bold uppercase tracking-[0.18em]">
              <AlertTriangle className="h-6 w-6 shrink-0" /> TEST MODU
            </p>
            <p className="mt-3 text-sm font-semibold leading-relaxed">
              Bu bir test ödemesidir. Kartınızdan hiçbir tutar çekilmez. Gerçek kart bilgilerinizi girmeyin.
            </p>
            <p className="mt-2 text-sm leading-relaxed">
              Test modunda kapora tahsil edilmediği için hizmet bedelinin tamamı işletmede ödenir.
            </p>
          </div>
        )}

        <div className={`mt-6 flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm ${expired ? 'border-error-500/40 bg-error-900/30 text-error-300' : 'border-gold-500/30 bg-gold-500/5 text-gold-200'}`}>
          <Timer className="h-4 w-4 shrink-0" />
          {expired ? 'Ödeme süresi doldu. Saat başka müşterilere açıldı.' : <>Saatiniz <span className="font-semibold">{mm}:{ss}</span> boyunca sizin için ayrıldı.</>}
        </div>

        {!expired && <PreContractInfo appt={appt} address={address} testMode={testMode} policyHours={policyHours} />}

        {expired ? (
          <Button full size="lg" variant="outline" className="mt-8" onClick={() => navigate(`/i/${b?.slug ?? ''}/randevu`)}>Yeni saat seç</Button>
        ) : testMode ? (
          <form onSubmit={submit} className="mt-8 space-y-4" noValidate autoComplete="off">
            <p className="text-xs text-mist-2">Test kartı bilgileri otomatik olarak doldurulmuştur ve değiştirilemez.</p>
            <Input label="Kart üzerindeki isim (test)" id="test-odeme-isim" autoComplete="off" readOnly value={TEST_CARD.name} />
            <Input label="Kart numarası (test)" id="test-odeme-kart" autoComplete="off" inputMode="numeric" readOnly value={TEST_CARD.number} icon={<CreditCard className="h-4 w-4" />} />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Son kullanma (test)" id="test-odeme-tarih" autoComplete="off" readOnly value={TEST_CARD.expiry} />
              <Input label="CVC (test)" id="test-odeme-kod" autoComplete="off" readOnly value={TEST_CARD.cvc} />
            </div>
            <Button type="submit" full size="lg" loading={paying} icon={<Lock className="h-4 w-4" />}>
              Test ödemesini tamamla
            </Button>
            <p className="text-center text-xs text-mist-2">Kartınızdan ücret çekilmez ve hiçbir ödeme kuruluşuna kart bilgisi gönderilmez.</p>
          </form>
        ) : (
          <div className="mt-8 space-y-4">
            <p className="rounded-xl border border-info-500/30 bg-info-900/40 px-4 py-3 text-sm leading-relaxed text-info-300">
              Online kapora ödemesi henüz aktif değil. Ödeme altyapısı devreye alındığında bu adımda lisanslı ödeme kuruluşunun güvenli ödeme sayfasına yönlendirileceksiniz. Şimdilik ayrılan saati serbest bırakıp daha sonra yeniden randevu oluşturabilirsiniz.
            </p>
            <label className="flex cursor-pointer items-start gap-3 text-xs text-mist">
              <input
                type="checkbox"
                checked={preInfoAccepted}
                onChange={(e) => setPreInfoAccepted(e.target.checked)}
                aria-describedby="on-bilgilendirme"
                className="mt-0.5 h-4 w-4 shrink-0 accent-[#D4AF37]"
              />
              <span>Ön bilgilendirme bilgilerini okudum, onaylıyorum.</span>
            </label>
            <Button type="button" full size="lg" disabled={!preInfoAccepted || !LIVE_CHECKOUT_READY} icon={<Lock className="h-4 w-4" />}>
              Kaporayı öde
            </Button>
            <Button full size="lg" variant="outline" loading={releasing} onClick={releaseHold}>Ayrılan saati serbest bırak</Button>
          </div>
        )}
      </div>

      <aside className="card-gold h-fit overflow-hidden lg:sticky lg:top-24">
        {cover && <img src={cover} alt="" className="h-36 w-full object-cover" />}
        <div className="space-y-4 p-6">
          <div>
            <p className="font-display text-2xl text-white">{b?.name}</p>
            {address && (
              <p className="mt-1 flex items-start gap-1.5 text-xs text-mist-2">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {address}
              </p>
            )}
          </div>
          <div className="space-y-2 border-t border-line pt-4 text-sm">
            <div className="flex justify-between gap-4 text-mist"><span>Hizmet</span><span className="text-right text-white">{appt.service_name} · {formatDuration(appt.duration_minutes)}</span></div>
            <div className="flex justify-between gap-4 text-mist"><span>Uzman</span><span className="text-right text-white">{appt.employee_name}</span></div>
            <div className="flex justify-between gap-4 text-mist"><span>Tarih</span><span className="text-right text-white">{formatDateTime(appt.starts_at)}</span></div>
          </div>
          <div className="space-y-2 border-t border-line pt-4 text-sm">
            <div className="flex justify-between gap-4 text-mist"><span>Toplam</span><span className="text-white">{formatTRY(appt.total_price)}</span></div>
            {testMode ? (
              <div className="flex justify-between gap-4 text-mist"><span>Kapora (test, tahsil edilmez)</span><span className="font-semibold text-gold-400">{formatTRY(appt.deposit_amount)}</span></div>
            ) : (
              <div className="flex justify-between gap-4 text-mist"><span>Kapora</span><span className="font-semibold text-gold-400">{formatTRY(appt.deposit_amount)}</span></div>
            )}
            <div className="flex justify-between gap-4 text-mist"><span>İşletmede ödenecek</span><span className="text-white">{formatTRY(testMode ? appt.total_price : appt.remaining_amount)}</span></div>
          </div>
          {b && (
            <p className="flex items-start gap-2 border-t border-line pt-4 text-xs leading-relaxed text-mist">
              <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-500" />
              <span>
                Randevudan {policyHours} saat öncesine kadar ücretsiz iptal.
                {!testMode && ' Bu süreden sonra yapılan iptallerde kapora iade edilmez.'}{' '}
                <Link to={legalPath('iptal-iade')} className={linkCls}>İptal ve İade Koşulları</Link>
              </span>
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
