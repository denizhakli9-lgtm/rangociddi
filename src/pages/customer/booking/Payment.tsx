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
import { tx } from '@/i18n/locale';

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
      <h2 id="on-bilgilendirme" className="font-display text-xl text-white">{tx('Ön bilgilendirme', 'Pre-contract information')}</h2>
      <p className="mt-1 text-xs leading-relaxed text-mist-2">{tx('Ödeme adımına geçmeden önce randevunuza ilişkin temel bilgileri inceleyin.', 'Review the key details of your booking before the payment step.')}</p>
      <dl className="mt-4 space-y-3">
        <InfoRow label={tx('Hizmet sağlayıcı', 'Service provider')}>
          {b?.name ?? '—'}
          {address && <span className="block text-xs text-mist">{address}</span>}
        </InfoRow>
        <InfoRow label={tx('Aracı hizmet sağlayıcı', 'Intermediary platform')}>
          {COMPANY.legalName}
          <span className="block text-xs"><Link to={legalPath('kunye')} className={linkCls}>{tx('Künye ve iletişim bilgileri', 'Company and contact details')}</Link></span>
        </InfoRow>
        <InfoRow label={tx('Hizmet', 'Service')}>{appt.service_name} · {formatDuration(appt.duration_minutes)} · {appt.employee_name}</InfoRow>
        <InfoRow label={tx('Tarih ve saat', 'Date and time')}>{formatDateTime(appt.starts_at)}</InfoRow>
        <InfoRow label={tx('Toplam hizmet bedeli', 'Total service price')}>{formatTRY(appt.total_price)}</InfoRow>
        <InfoRow label={tx('Kapora', 'Deposit')}>{testMode ? `${formatTRY(appt.deposit_amount)} ${tx('(test modu, tahsil edilmez)', '(test mode, not charged)')}` : formatTRY(appt.deposit_amount)}</InfoRow>
        <InfoRow label={tx('İşletmede ödenecek', 'To pay at the business')}>{formatTRY(testMode ? appt.total_price : appt.remaining_amount)}</InfoRow>
        <InfoRow label={tx('Ücretsiz iptal', 'Free cancellation')}>
          {tx(`Randevudan ${policyHours} saat öncesine kadar ücretsiz iptal edebilirsiniz.`, `You can cancel free of charge up to ${policyHours} hours before the appointment.`)}
          {!testMode && tx(' Bu süreden sonra yapılan iptallerde kapora iade edilmez.', ' The deposit is not refunded for later cancellations.')}
        </InfoRow>
      </dl>
      <p className="mt-4 text-xs text-mist">
        {tx('Ayrıntılı bilgi:', 'Details:')} <Link to={legalPath('iptal-iade')} className={linkCls}>{tx('İptal ve İade Koşulları', 'Cancellation & Refund Policy')}</Link> ·{' '}
        <Link to={legalPath('kullanim-kosullari')} className={linkCls}>{tx('Kullanım Koşulları', 'Terms of Use')}</Link>
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
  if (!data?.appt) return <EmptyState icon={<CalendarClock className="h-6 w-6" />} title={tx('Randevu bulunamadı', 'Booking not found')} />;
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
    toast(tx('Ayrılan saat serbest bırakıldı.', 'The held time has been released.'), 'success');
    navigate('/randevularim', { replace: true });
  };

  const mm = remaining != null ? String(Math.floor(remaining / 60)).padStart(2, '0') : '--';
  const ss = remaining != null ? String(remaining % 60).padStart(2, '0') : '--';

  return (
    <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1fr_380px]">
      <div className="animate-fade-up">
        <p className="eyebrow mb-2">{testMode ? tx('Test ödemesi', 'Test payment') : tx('Kapora', 'Deposit')}</p>
        <h1 className="font-display text-4xl text-white">{tx('Kapora ödemesi', 'Deposit payment')}</h1>
        <p className="mt-2 text-sm text-mist">
          {testMode
            ? tx('Randevunuzu kesinleştirmek için test ödemesini tamamlayın. Hizmet bedelinin tamamını işletmede ödersiniz.', 'Complete the test payment to confirm your booking. You pay the full price at the business.')
            : tx('Randevunuzu kesinleştirmek için kaporayı ödeyin. Kalan tutarı işletmede ödersiniz.', 'Pay the deposit to confirm your booking. You pay the rest at the business.')}
        </p>

        {testMode && (
          <div role="alert" className="mt-6 rounded-2xl border-2 border-warning-500/70 bg-warning-900/60 p-5 text-warning-300">
            <p className="flex items-center gap-2 text-xl font-bold uppercase tracking-[0.18em]">
              <AlertTriangle className="h-6 w-6 shrink-0" /> {tx('TEST MODU', 'TEST MODE')}
            </p>
            <p className="mt-3 text-sm font-semibold leading-relaxed">
              {tx('Bu bir test ödemesidir. Kartınızdan hiçbir tutar çekilmez. Gerçek kart bilgilerinizi girmeyin.', 'This is a test payment. Nothing is charged to your card. Do not enter real card details.')}
            </p>
            <p className="mt-2 text-sm leading-relaxed">
              {tx('Test modunda kapora tahsil edilmediği için hizmet bedelinin tamamı işletmede ödenir.', 'No deposit is collected in test mode, so the full price is paid at the business.')}
            </p>
          </div>
        )}

        <div className={`mt-6 flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm ${expired ? 'border-error-500/40 bg-error-900/30 text-error-300' : 'border-gold-500/30 bg-gold-500/5 text-gold-200'}`}>
          <Timer className="h-4 w-4 shrink-0" />
          {expired ? tx('Ödeme süresi doldu. Saat başka müşterilere açıldı.', 'The payment time ran out. The slot is open to other customers again.') : <>{tx('Saatiniz ', 'Your time is held for you for ')}<span className="font-semibold">{mm}:{ss}</span>{tx(' boyunca sizin için ayrıldı.', '.')}</>}
        </div>

        {!expired && <PreContractInfo appt={appt} address={address} testMode={testMode} policyHours={policyHours} />}

        {expired ? (
          <Button full size="lg" variant="outline" className="mt-8" onClick={() => navigate(`/i/${b?.slug ?? ''}/randevu`)}>{tx('Yeni saat seç', 'Choose a new time')}</Button>
        ) : testMode ? (
          <form onSubmit={submit} className="mt-8 space-y-4" noValidate autoComplete="off">
            <p className="text-xs text-mist-2">{tx('Test kartı bilgileri otomatik olarak doldurulmuştur ve değiştirilemez.', 'The test card details are filled in automatically and cannot be changed.')}</p>
            <Input label={tx('Kart üzerindeki isim (test)', 'Name on card (test)')} id="test-odeme-isim" autoComplete="off" readOnly value={TEST_CARD.name} />
            <Input label={tx('Kart numarası (test)', 'Card number (test)')} id="test-odeme-kart" autoComplete="off" inputMode="numeric" readOnly value={TEST_CARD.number} icon={<CreditCard className="h-4 w-4" />} />
            <div className="grid grid-cols-2 gap-4">
              <Input label={tx('Son kullanma (test)', 'Expiry (test)')} id="test-odeme-tarih" autoComplete="off" readOnly value={TEST_CARD.expiry} />
              <Input label="CVC (test)" id="test-odeme-kod" autoComplete="off" readOnly value={TEST_CARD.cvc} />
            </div>
            <Button type="submit" full size="lg" loading={paying} icon={<Lock className="h-4 w-4" />}>
              {tx('Test ödemesini tamamla', 'Complete test payment')}
            </Button>
            <p className="text-center text-xs text-mist-2">{tx('Kartınızdan ücret çekilmez ve hiçbir ödeme kuruluşuna kart bilgisi gönderilmez.', 'Nothing is charged and no card details are sent to any payment provider.')}</p>
          </form>
        ) : (
          <div className="mt-8 space-y-4">
            <p className="rounded-xl border border-info-500/30 bg-info-900/40 px-4 py-3 text-sm leading-relaxed text-info-300">
              {tx('Online kapora ödemesi henüz aktif değil. Ödeme altyapısı devreye alındığında bu adımda lisanslı ödeme kuruluşunun güvenli ödeme sayfasına yönlendirileceksiniz. Şimdilik ayrılan saati serbest bırakıp daha sonra yeniden randevu oluşturabilirsiniz.', 'Online deposit payment is not active yet. Once it is, this step will take you to the secure page of a licensed payment provider. For now you can release the held time and book again later.')}
            </p>
            <label className="flex cursor-pointer items-start gap-3 text-xs text-mist">
              <input
                type="checkbox"
                checked={preInfoAccepted}
                onChange={(e) => setPreInfoAccepted(e.target.checked)}
                aria-describedby="on-bilgilendirme"
                className="mt-0.5 h-4 w-4 shrink-0 accent-[#D4AF37]"
              />
              <span>{tx('Ön bilgilendirme bilgilerini okudum, onaylıyorum.', 'I have read and accept the pre-contract information.')}</span>
            </label>
            <Button type="button" full size="lg" disabled={!preInfoAccepted || !LIVE_CHECKOUT_READY} icon={<Lock className="h-4 w-4" />}>
              {tx('Kaporayı öde', 'Pay deposit')}
            </Button>
            <Button full size="lg" variant="outline" loading={releasing} onClick={releaseHold}>{tx('Ayrılan saati serbest bırak', 'Release the held time')}</Button>
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
            <div className="flex justify-between gap-4 text-mist"><span>{tx('Hizmet', 'Service')}</span><span className="text-right text-white">{appt.service_name} · {formatDuration(appt.duration_minutes)}</span></div>
            <div className="flex justify-between gap-4 text-mist"><span>{tx('Uzman', 'Specialist')}</span><span className="text-right text-white">{appt.employee_name}</span></div>
            <div className="flex justify-between gap-4 text-mist"><span>{tx('Tarih', 'Date')}</span><span className="text-right text-white">{formatDateTime(appt.starts_at)}</span></div>
          </div>
          <div className="space-y-2 border-t border-line pt-4 text-sm">
            <div className="flex justify-between gap-4 text-mist"><span>{tx('Toplam', 'Total')}</span><span className="text-white">{formatTRY(appt.total_price)}</span></div>
            {testMode ? (
              <div className="flex justify-between gap-4 text-mist"><span>{tx('Kapora (test, tahsil edilmez)', 'Deposit (test, not charged)')}</span><span className="font-semibold text-gold-400">{formatTRY(appt.deposit_amount)}</span></div>
            ) : (
              <div className="flex justify-between gap-4 text-mist"><span>{tx('Kapora', 'Deposit')}</span><span className="font-semibold text-gold-400">{formatTRY(appt.deposit_amount)}</span></div>
            )}
            <div className="flex justify-between gap-4 text-mist"><span>{tx('İşletmede ödenecek', 'To pay at the business')}</span><span className="text-white">{formatTRY(testMode ? appt.total_price : appt.remaining_amount)}</span></div>
          </div>
          {b && (
            <p className="flex items-start gap-2 border-t border-line pt-4 text-xs leading-relaxed text-mist">
              <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-500" />
              <span>
                {tx(`Randevudan ${policyHours} saat öncesine kadar ücretsiz iptal.`, `Free cancellation up to ${policyHours} hours before.`)}
                {!testMode && tx(' Bu süreden sonra yapılan iptallerde kapora iade edilmez.', ' The deposit is not refunded for later cancellations.')}{' '}
                <Link to={legalPath('iptal-iade')} className={linkCls}>{tx('İptal ve İade Koşulları', 'Cancellation & Refund Policy')}</Link>
              </span>
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
