import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Browser } from '@capacitor/browser';
import { AlertTriangle, CalendarClock, CreditCard, Loader2, Lock, MapPin, Timer, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchSettings } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { friendlyError } from '@/lib/errors';
import { dateKey, formatDateTime, formatDuration, formatTRY } from '@/lib/format';
import { fullAddress } from '@/lib/maps';
import { businessCover } from '@/lib/placeholderImages';
import { PlaceholderTag } from '@/components/ui/PlaceholderTag';
import {
  COMPANY,
  LEGAL_VERSIONS,
  PAYMENT_PROVIDER,
  SALE_CONSENT_TEXT,
  SALE_CONSENT_TEXT_EN,
  SALE_CONSENT_TEXT_TEST,
  SALE_CONSENT_TEXT_TEST_EN,
  legalPath,
} from '@/lib/legal';
import { useToast } from '@/contexts/ToastContext';
import { Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/Feedback';
import type { Appointment } from '@/lib/types';
import { isEnglish, tx } from '@/i18n/locale';
import { isNative, newTabClick } from '@/lib/platform';
import { invokeEdge } from '@/lib/functions';

/**
 * Test card shown read-only in the platform's test mode (no payment institution involved). No real
 * card data is ever typed into this page: real payments happen only on PayTR's own page.
 */
const TEST_CARD = { name: 'TEST KULLANICI', number: '4242 4242 4242 4242', expiry: '12/30', cvc: '123' };

/** How often the page re-checks the booking while the customer is on PayTR's payment page. */
const PAYMENT_POLL_MS = 3000;
/** Every this many polls the server also asks PayTR directly (paytr-status), in case PayTR's notification is late. */
const RECONCILE_EVERY = 7;

/**
 * Asks the paytr-token Edge Function for PayTR's hosted payment page. The deposit is confirmed only on the
 * server: by PayTR's notification (paytr-callback) or PayTR's status service (paytr-status), never by this
 * page or by PayTR's return URL.
 */
async function startPaytrCheckout(appointmentId: string): Promise<{ url: string; test: boolean }> {
  const data = await invokeEdge<{ url?: unknown; test?: unknown }>('paytr-token', {
    appointment: appointmentId,
    platform: isNative ? 'app' : 'web',
  });
  if (!data || typeof data.url !== 'string' || !data.url.startsWith('https://www.paytr.com/')) throw new Error('VEYRA_PAYMENT_PROVIDER');
  return { url: data.url, test: data.test === true };
}

/** Lets the server ask PayTR about this booking's unfinished payments; errors are ignored (polling continues). */
async function reconcilePaytr(appointmentId: string): Promise<void> {
  try {
    await invokeEdge('paytr-status', { appointment: appointmentId });
  } catch {
    /* PayTR's notification and the status polling still apply */
  }
}

/** Message of a thrown Error or of a Supabase error object (PostgrestError is not an Error instance). */
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : '';
}

const linkCls = 'text-gold-400 underline-offset-2 hover:underline';
/** Links inside running text are always underlined, so they can be told apart without hover (touch screens). */
const inlineLinkCls = 'text-gold-400 underline underline-offset-2 hover:text-gold-300';

/** A legal page opened "in a new tab"; inside the app it opens in the in-app browser so the payment page stays. */
function LegalTabLink({ slug, children }: { slug: Parameters<typeof legalPath>[0]; children: ReactNode }) {
  return (
    <Link to={legalPath(slug)} target="_blank" rel="noopener noreferrer" onClick={newTabClick(legalPath(slug))} className={inlineLinkCls}>
      {children}
    </Link>
  );
}

/**
 * Satış onayı (PAYTR Çerçeve Ödeme Hizmeti Sözleşmesi md. 7.2): the customer confirms the purchase
 * before paying, and the confirmation is recorded server-side (record_sale_consent) with the terms
 * version, the language and the booking's amounts. Without that record the server starts no payment
 * (pay_deposit and PayTR orders refuse it). In the platform's test mode nothing is charged, so the
 * customer confirms the test wording instead of authorising a card charge.
 */
function SaleConsent({ checked, onChange, testMode, disabled = false }: { checked: boolean; onChange: (v: boolean) => void; testMode: boolean; disabled?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-coal px-4 py-3">
      <label className={`flex items-start gap-3 text-base leading-relaxed text-mist ${disabled ? 'cursor-default' : 'cursor-pointer'}`}>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          aria-describedby="on-bilgilendirme satis-onayi-belgeler"
          className="mt-1 h-5 w-5 shrink-0 accent-[#D4AF37]"
        />
        <span>
          <span className="font-semibold text-white">{tx('Satış onayı: ', 'Purchase confirmation: ')}</span>
          {testMode ? tx(SALE_CONSENT_TEXT_TEST, SALE_CONSENT_TEXT_TEST_EN) : tx(SALE_CONSENT_TEXT, SALE_CONSENT_TEXT_EN)}
        </span>
      </label>
      <p id="satis-onayi-belgeler" className="mt-2 pl-8 text-sm text-mist-2">
        <LegalTabLink slug="satis-sozlesmesi">{tx('Mesafeli Hizmet Satış Sözleşmesi', 'Distance Service Sales Agreement')}</LegalTabLink> ·{' '}
        <LegalTabLink slug="iptal-iade">{tx('İptal ve İade Koşulları', 'Cancellation & Refund Policy')}</LegalTabLink> ·{' '}
        <LegalTabLink slug="aydinlatma-metni">{tx('KVKK Aydınlatma Metni', 'Privacy Notice')}</LegalTabLink>
      </p>
    </div>
  );
}

/** PAYTR sözleşmesi md. 10.3: the provider sentence (always the binding Turkish wording) and a link to its website. */
function ProviderNotice() {
  return (
    <p lang="tr" className="text-center text-xs leading-relaxed text-mist-2">
      {PAYMENT_PROVIDER.disclosure}{' '}
      <a href={PAYMENT_PROVIDER.website} target="_blank" rel="noopener noreferrer" onClick={newTabClick(PAYMENT_PROVIDER.website)} className={inlineLinkCls}>
        {PAYMENT_PROVIDER.website.replace('https://', '')}
      </a>
    </p>
  );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[170px_1fr] sm:gap-4">
      <dt className="text-sm text-mist-2">{label}</dt>
      <dd className="text-white">{children}</dd>
    </div>
  );
}

/**
 * Pre-contract information (ön bilgilendirme, Mesafeli Sözleşmeler Yönetmeliği md. 5) shown before the
 * deposit step: who provides the service and who acts for it, what is booked, the price with taxes, the
 * deposit, approval, cancellation and withdrawal (cayma) rules, and where to send requests and complaints.
 * It is part of the sales agreement the customer confirms, so it is set at a readable size (16px).
 */
function PreContractInfo({ appt, address, testMode, policyHours, needsApproval }: { appt: Appointment; address: string; testMode: boolean; policyHours: number; needsApproval: boolean }) {
  const b = appt.businesses;
  return (
    <section aria-labelledby="on-bilgilendirme" className="mt-6 rounded-2xl border border-line bg-coal p-5 text-base">
      <h2 id="on-bilgilendirme" className="font-display text-xl text-white">{tx('Ön bilgilendirme', 'Pre-contract information')}</h2>
      <p className="mt-1 text-sm leading-relaxed text-mist-2">{tx('Ödeme adımına geçmeden önce randevunuza ilişkin temel bilgileri inceleyin.', 'Review the key details of your booking before the payment step.')}</p>
      <dl className="mt-4 space-y-3">
        <InfoRow label={tx('Hizmet sağlayıcı', 'Service provider')}>
          {b?.name ?? '—'}
          {address && <span className="block text-sm text-mist">{address}</span>}
        </InfoRow>
        <InfoRow label={tx('Aracı hizmet sağlayıcı', 'Intermediary platform')}>
          {COMPANY.legalName}
          <span className="block text-sm text-mist">{COMPANY.address} · {COMPANY.email}</span>
          <span className="block text-sm"><Link to={legalPath('kunye')} className={linkCls}>{tx('Künye ve iletişim bilgileri', 'Company and contact details')}</Link></span>
        </InfoRow>
        <InfoRow label={tx('Ödeme kuruluşu', 'Payment institution')}>
          {testMode ? tx('Test modu: ödeme kuruluşuna işlem gönderilmez.', 'Test mode: nothing is sent to the payment institution.') : PAYMENT_PROVIDER.name}
        </InfoRow>
        <InfoRow label={tx('Hizmet', 'Service')}>{appt.service_name} · {formatDuration(appt.duration_minutes)} · {appt.employee_name}</InfoRow>
        <InfoRow label={tx('Tarih ve saat', 'Date and time')}>{formatDateTime(appt.starts_at)}</InfoRow>
        <InfoRow label={tx('Toplam hizmet bedeli (tüm vergiler dahil)', 'Total service price (all taxes included)')}>{formatTRY(appt.total_price)}</InfoRow>
        <InfoRow label={tx('Kapora', 'Deposit')}>{testMode ? `${formatTRY(appt.deposit_amount)} ${tx('(test modu, tahsil edilmez)', '(test mode, not charged)')}` : formatTRY(appt.deposit_amount)}</InfoRow>
        <InfoRow label={tx('İşletmede ödenecek', 'To pay at the business')}>{formatTRY(testMode ? appt.total_price : appt.remaining_amount)}</InfoRow>
        {needsApproval && (
          <InfoRow label={tx('İşletme onayı', 'Business approval')}>
            {tx('Bu randevu işletmenin onayıyla kesinleşir. İşletme talebi reddederse veya randevu saatine kadar onaylamazsa randevu iptal olur', 'This booking becomes final once the business approves it. If the business declines or does not approve it before the start time, the booking is cancelled')}
            {testMode ? '.' : tx(' ve kapora tamamen iade edilir.', ' and the deposit is refunded in full.')}
          </InfoRow>
        )}
        <InfoRow label={tx('Ücretsiz iptal', 'Free cancellation')}>
          {tx(`Randevudan ${policyHours} saat öncesine kadar ücretsiz iptal edebilirsiniz.`, `You can cancel free of charge up to ${policyHours} hours before the appointment.`)}
          {!testMode && tx(' Cayma süresi sona erdikten sonra, bu süreden geç yapılan iptallerde ve randevuya gelinmediğinde kapora iade edilmez.', ' Once the withdrawal period has ended, the deposit is not refunded for later cancellations or if you do not attend.')}
        </InfoRow>
        <InfoRow label={tx('Cayma hakkı', 'Right of withdrawal')}>
          {tx('Randevuyu aldığınız günden itibaren 14 gün içinde ve hizmete başlanmadan önce, gerekçe göstermeden ve cezai şart ödemeden cayabilirsiniz.', 'You can withdraw within 14 days of booking and before the service starts, without giving a reason and without a penalty.')}
          {!testMode && tx(' Ödediğiniz kapora, cayma bildiriminizin ulaştığı tarihten itibaren en geç 14 gün içinde kartınıza iade edilir.', ' The deposit you paid is refunded to your card within 14 days of receiving your notice.')}
          {tx(` Cayma bildirimini Randevularım sayfasındaki “İptal et” seçeneğiyle veya ${COMPANY.email} adresine e-posta göndererek yapabilirsiniz. Hizmete başlandığında cayma hakkı sona erer.`, ` You can give notice with “Cancel” on the My bookings page or by e-mail to ${COMPANY.email}. The right ends once the service has started.`)}
        </InfoRow>
        <InfoRow label={tx('Talep ve şikâyet', 'Requests and complaints')}>
          {tx(`Hizmet Sağlayıcı’ya veya ${COMPANY.brand} destek merkezine (Destek sayfası) ve ${COMPANY.email} adresine iletebilirsiniz.`, `Contact the service provider, or ${COMPANY.brand} through the Support page or at ${COMPANY.email}.`)}
        </InfoRow>
      </dl>
      <p className="mt-4 text-sm text-mist">
        {tx('Ayrıntılı bilgi:', 'Details:')} <Link to={legalPath('satis-sozlesmesi')} className={linkCls}>{tx('Mesafeli Hizmet Satış Sözleşmesi', 'Distance Service Sales Agreement')}</Link> ·{' '}
        <Link to={legalPath('iptal-iade')} className={linkCls}>{tx('İptal ve İade Koşulları', 'Cancellation & Refund Policy')}</Link> ·{' '}
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
      supabase.from('appointments').select('*, businesses(id, name, slug, cover_url, address, district, city, latitude, longitude, cancellation_hours, auto_confirm, categories(name, slug))').eq('id', id).maybeSingle(),
      fetchSettings(),
    ]);
    if (err) throw err;
    return { appt: appt as Appointment | null, settings };
  }, [id]);

  const [paying, setPaying] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [saleAccepted, setSaleAccepted] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const paytrReturn = searchParams.get('paytr');
  const [startingCheckout, setStartingCheckout] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [awaitingPayment, setAwaitingPayment] = useState(false);
  const failureShown = useRef(false);

  // Coming back from PayTR: "ok" waits for the callback; "hata" tells the customer and lets them retry.
  useEffect(() => {
    if (paytrReturn === 'ok') {
      setAwaitingPayment(true);
      void reconcilePaytr(id);
    }
    if (paytrReturn === 'hata' && !failureShown.current) {
      failureShown.current = true;
      setAwaitingPayment(false);
      setCheckoutUrl(null);
      toast(tx('Ödeme tamamlanamadı. Kartınızdan tahsilat yapılmadı; tekrar deneyebilirsiniz.', 'The payment was not completed. Nothing was charged; you can try again.'), 'error');
      setSearchParams({}, { replace: true });
    }
  }, [paytrReturn, setSearchParams, toast, id]);

  // While the customer is paying, follow the booking: PayTR's callback moves it out of pending_payment.
  const checkPaid = useCallback(async () => {
    const { data: row } = await supabase.from('appointments').select('status').eq('id', id).maybeSingle();
    if (row && row.status !== 'pending_payment') {
      if (isNative) void Browser.close().catch(() => undefined);
      navigate(`/onay/${id}`, { replace: true });
    }
  }, [id, navigate]);

  useEffect(() => {
    if (!awaitingPayment) return;
    let ticks = 0;
    void checkPaid();
    const timer = setInterval(() => {
      ticks += 1;
      if (ticks % RECONCILE_EVERY === 0) void reconcilePaytr(id).then(checkPaid);
      else void checkPaid();
    }, PAYMENT_POLL_MS);
    return () => clearInterval(timer);
  }, [awaitingPayment, checkPaid, id]);

  // In the app PayTR opens in an in-app browser sheet; check right away when the customer closes it.
  useEffect(() => {
    if (!isNative || !awaitingPayment) return;
    const listener = Browser.addListener('browserFinished', () => void reconcilePaytr(id).then(checkPaid));
    return () => void listener.then((l) => l.remove());
  }, [awaitingPayment, checkPaid, id]);

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
  const paytrReady = settings.payment_provider === 'paytr';
  const paytrTest = paytrReady && settings.paytr_test_mode !== false;
  const expired = remaining === 0;
  const b = appt.businesses;
  const cover = b ? businessCover(b) : null;
  const address = b ? fullAddress(b) : '';
  // The window snapshotted on the booking (after the hardening migration) is what the server applies.
  const policyHours = appt.cancellation_hours ?? b?.cancellation_hours ?? 24;
  // Same rule as the server: only next-day-or-later bookings at auto-confirm businesses skip the approval step.
  const needsApproval = b?.auto_confirm !== true || dateKey(new Date(appt.starts_at)) <= dateKey();

  /** Records the satış onayı on the server (PayTR md. 7.2). Throws the server error so callers show it. */
  const recordSaleConsent = async () => {
    const { error: consentErr } = await supabase.rpc('record_sale_consent', {
      p_appointment: appt.id,
      p_version: LEGAL_VERSIONS.sale,
      p_locale: isEnglish() ? 'en' : 'tr',
    });
    if (consentErr) throw consentErr;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!testMode || paying) return;
    if (!saleAccepted) {
      toast(tx('Ödemeye geçmeden önce satış onayını işaretleyin.', 'Please tick the purchase confirmation before paying.'), 'error');
      return;
    }
    setPaying(true);
    try {
      await recordSaleConsent();
    } catch (consentErr) {
      setPaying(false);
      toast(friendlyError(consentErr), 'error');
      if (/VEYRA_(INVALID_STATE|NOT_FOUND)/.test(errorMessage(consentErr))) reload();
      return;
    }
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

  const payWithPaytr = async () => {
    if (startingCheckout) return;
    if (!saleAccepted) {
      toast(tx('Ödemeye geçmeden önce satış onayını işaretleyin.', 'Please tick the purchase confirmation before paying.'), 'error');
      return;
    }
    setStartingCheckout(true);
    try {
      // The satış onayı is recorded first; the server refuses to start a PayTR order without it.
      await recordSaleConsent();
      const { url } = await startPaytrCheckout(appt.id);
      if (isNative) {
        await Browser.open({ url, presentationStyle: 'fullscreen' });
      } else {
        setCheckoutUrl(url);
      }
      setAwaitingPayment(true);
    } catch (err) {
      toast(friendlyError(err), 'error');
      if (/VEYRA_(PAYMENT_EXPIRED|INVALID_STATE|NOT_FOUND)/.test(errorMessage(err))) reload();
    } finally {
      setStartingCheckout(false);
    }
  };

  const closeCheckout = () => {
    setCheckoutUrl(null);
    setAwaitingPayment(false);
  };

  // Lets the customer give the held slot back (and correct a wrong choice by booking again) instead of dead-ending.
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

        {!expired && <PreContractInfo appt={appt} address={address} testMode={testMode} policyHours={policyHours} needsApproval={needsApproval} />}

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
            <SaleConsent checked={saleAccepted} onChange={setSaleAccepted} testMode disabled={paying} />
            <Button type="submit" full size="lg" loading={paying} disabled={!saleAccepted} icon={<Lock className="h-4 w-4" />}>
              {tx('Test ödemesini tamamla', 'Complete test payment')}
            </Button>
            <p className="text-center text-xs text-mist-2">{tx('Kartınızdan ücret çekilmez ve hiçbir ödeme kuruluşuna kart bilgisi gönderilmez.', 'Nothing is charged and no card details are sent to any payment provider.')}</p>
            <Button type="button" full size="lg" variant="outline" loading={releasing} disabled={paying} onClick={releaseHold}>{tx('Ayrılan saati serbest bırak', 'Release the held time')}</Button>
          </form>
        ) : checkoutUrl ? (
          <div className="mt-8 space-y-3">
            <p className="flex items-center gap-2 text-xs text-mist-2">
              <Lock className="h-3.5 w-3.5 shrink-0 text-gold-500" />
              {tx('Kart bilgileriniz PayTR güvenli ödeme sayfasında işlenir, Rango kart bilgilerinizi görmez ve saklamaz.', 'Your card is processed on PayTR’s secure page; Rango never sees or stores your card details.')}
            </p>
            <div className="overflow-hidden rounded-2xl border border-line bg-white">
              <iframe
                src={checkoutUrl}
                title={tx('PayTR güvenli ödeme', 'PayTR secure payment')}
                className="block h-[max(560px,80vh)] w-full sm:h-[680px]"
              />
            </div>
            <p className="flex items-center gap-2 text-xs text-mist">
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
              {tx('Ödeme onaylandığında otomatik olarak onay sayfasına geçeceksiniz.', 'Once the payment is confirmed you will be taken to the confirmation page automatically.')}
            </p>
            <Button full variant="outline" icon={<X className="h-4 w-4" />} onClick={closeCheckout}>{tx('Ödeme sayfasını kapat', 'Close the payment page')}</Button>
          </div>
        ) : awaitingPayment ? (
          <div className="mt-8 space-y-4">
            <p className="flex items-center gap-3 rounded-xl border border-gold-500/30 bg-gold-500/5 px-4 py-3 text-sm text-gold-200">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              {tx('Ödemeniz doğrulanıyor. Bu birkaç saniye sürebilir, lütfen sayfayı kapatmayın.', 'Verifying your payment. This can take a few seconds, please keep this page open.')}
            </p>
            {isNative && paytrReturn !== 'ok' && (
              <Button full size="lg" variant="outline" loading={startingCheckout} onClick={payWithPaytr}>{tx('Ödeme sayfasını yeniden aç', 'Open the payment page again')}</Button>
            )}
            <Button full variant="ghost" onClick={closeCheckout}>{tx('Ödemeyi tamamlamadım, geri dön', 'I did not finish the payment, go back')}</Button>
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            {!paytrReady ? (
              <p className="rounded-xl border border-info-500/30 bg-info-900/40 px-4 py-3 text-sm leading-relaxed text-info-300">
                {tx('Online kapora ödemesi henüz aktif değil. Ödeme altyapısı devreye alındığında bu adımda lisanslı ödeme kuruluşunun güvenli ödeme sayfasına yönlendirileceksiniz. Şimdilik ayrılan saati serbest bırakıp daha sonra yeniden randevu oluşturabilirsiniz.', 'Online deposit payment is not active yet. Once it is, this step will take you to the secure page of a licensed payment provider. For now you can release the held time and book again later.')}
              </p>
            ) : paytrTest ? (
              <p className="rounded-xl border border-warning-500/40 bg-warning-900/40 px-4 py-3 text-sm leading-relaxed text-warning-300">
                {tx('PayTR test modu: test kartı PayTR ödeme sayfasında hazır gelir. "Ödeme Yap"a, ardından 3D Secure test sayfasında "Gönder"e basın. Kartınızdan gerçek tahsilat yapılmaz.', 'PayTR test mode: the test card is prefilled on PayTR’s page. Press “Ödeme Yap”, then “Gönder” on the 3D Secure test page. Nothing is actually charged.')}
              </p>
            ) : (
              <p className="flex items-center gap-2 text-xs text-mist-2">
                <Lock className="h-3.5 w-3.5 shrink-0 text-gold-500" />
                {tx('Ödemeniz PayTR güvenli ödeme sayfasında, 3D Secure ile alınır.', 'You pay on PayTR’s secure page with 3D Secure.')}
              </p>
            )}
            <SaleConsent checked={saleAccepted} onChange={setSaleAccepted} testMode={false} disabled={startingCheckout} />
            <Button type="button" full size="lg" disabled={!saleAccepted || !paytrReady} loading={startingCheckout} icon={<Lock className="h-4 w-4" />} onClick={payWithPaytr}>
              {tx('Kaporayı öde', 'Pay deposit')}
            </Button>
            <ProviderNotice />
            <Button full size="lg" variant="outline" loading={releasing} onClick={releaseHold}>{tx('Ayrılan saati serbest bırak', 'Release the held time')}</Button>
          </div>
        )}
      </div>

      <aside className="card-gold h-fit overflow-hidden lg:sticky lg:top-24">
        {cover && (
          <div className="relative">
            <img src={cover.src} alt="" className="h-36 w-full object-cover" />
            {cover.placeholder && <PlaceholderTag className="bottom-2.5 left-2.5" />}
          </div>
        )}
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
                {!testMode && tx(' Cayma süresi sona erdikten sonra, bu süreden geç yapılan iptallerde kapora iade edilmez.', ' Once the withdrawal period has ended, the deposit is not refunded for later cancellations.')}{' '}
                <Link to={legalPath('iptal-iade')} className={linkCls}>{tx('İptal ve İade Koşulları', 'Cancellation & Refund Policy')}</Link>
              </span>
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
