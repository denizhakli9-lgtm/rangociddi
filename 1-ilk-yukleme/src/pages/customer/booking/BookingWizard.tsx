import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, Clock, Hourglass, Shuffle, Store } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchBusinessDetail, fetchSettings } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { friendlyError } from '@/lib/errors';
import { dateKey, depositFor, formatDate, formatDuration, formatTime, formatTRY, toKurus } from '@/lib/format';
import { fullAddress } from '@/lib/maps';
import { isDemoBusiness } from '@/lib/demo';
import { safeImageUrl } from '@/lib/safeUrl';
import { legalPath } from '@/lib/legal';
import { useT } from '@/i18n/I18nProvider';
import { useToast } from '@/contexts/ToastContext';
import { SlotPicker } from '@/components/SlotPicker';
import { Avatar } from '@/components/ui/Brand';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Field';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/Feedback';
import type { Slot } from '@/lib/types';

const STEPS = ['Hizmet', 'Uzman', 'Tarih & Saat', 'Özet'];

export default function BookingWizard() {
  const t = useT();
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data, loading, error, reload } = useAsync(async () => {
    const [detail, settings] = await Promise.all([fetchBusinessDetail(slug), fetchSettings()]);
    return detail ? { ...detail, settings } : null;
  }, [slug]);

  const preselected = params.get('hizmet');
  const [step, setStep] = useState(preselected ? 1 : 0);
  const [serviceId, setServiceId] = useState<string | null>(preselected);
  const [employeeId, setEmployeeId] = useState<string | null | undefined>(undefined);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const service = data?.services.find((s) => s.id === serviceId) ?? null;
  const staff = useMemo(
    () => (data && serviceId ? data.employees.filter((e) => e.employee_services?.some((es) => es.service_id === serviceId)) : []),
    [data, serviceId],
  );

  if (loading) return <PageLoader />;
  if (error) return <ErrorState onRetry={reload} />;
  if (!data) return <EmptyState icon={<Store className="h-6 w-6" />} title="İşletme bulunamadı" action={<Button onClick={() => navigate('/ara')}>Keşfet</Button>} />;

  const { business: b, services, hours, settings } = data;
  if (isDemoBusiness(b)) {
    return (
      <EmptyState
        icon={<Store className="h-6 w-6" />}
        title={t.demo.notBookable}
        text={t.demo.explanation}
        action={<Button onClick={() => navigate(`/i/${b.slug}`, { replace: true })}>İşletme sayfasına dön</Button>}
      />
    );
  }

  // A preselected service that is no longer active leaves service null: fall back to the service step.
  const activeStep = !service && step > 0 ? 0 : step;
  const chosenEmployee = staff.find((e) => e.id === (employeeId ?? slot?.slot_employee_id));
  const deposit = service ? depositFor(Number(service.price), b.deposit_type, Number(b.deposit_value)) : 0;
  const testMode = settings.payment_mode === 'test';
  // In test mode no deposit is collected, so the full price is paid at the business.
  const atBusiness = service ? (testMode && deposit > 0 ? Number(service.price) : (toKurus(service.price) - toKurus(deposit)) / 100) : 0;
  const sameDay = !!slot && dateKey(new Date(slot.slot_start)) === dateKey();

  const goBack = () => (activeStep === 0 ? navigate(`/i/${b.slug}`) : setStep(activeStep - 1));

  const submit = async () => {
    if (!service || !slot) return;
    setSubmitting(true);
    const { data: id, error: err } = await supabase.rpc('create_appointment', {
      p_service: service.id,
      p_employee: slot.slot_employee_id,
      p_starts_at: slot.slot_start,
      p_note: note.trim(),
    });
    setSubmitting(false);
    if (err || !id) {
      toast(friendlyError(err), 'error');
      if (err?.message?.includes('VEYRA_SLOT_TAKEN')) {
        setSlot(null);
        setStep(2);
      }
      return;
    }
    navigate(deposit > 0 ? `/odeme/${id}` : `/onay/${id}`, { replace: true });
  };

  return (
    <div className="mx-auto max-w-3xl">
      <button onClick={goBack} className="mb-6 flex items-center gap-2 text-sm text-mist transition hover:text-white">
        <ArrowLeft className="h-4 w-4" /> {activeStep === 0 ? b.name : 'Geri'}
      </button>

      <p className="eyebrow mb-2">{b.name}</p>
      <h1 className="font-display text-4xl text-white">Randevu oluştur</h1>

      <ol className="mb-8 mt-6 grid grid-cols-4 gap-2">
        {STEPS.map((label, i) => (
          <li key={label}>
            <div className={`h-1 rounded-full transition-all duration-500 ${i <= activeStep ? 'bg-gold-500' : 'bg-line'}`} />
            <p className={`mt-2 hidden text-xs sm:block ${i === activeStep ? 'text-gold-400' : i < activeStep ? 'text-white' : 'text-mist-3'}`}>{label}</p>
          </li>
        ))}
      </ol>

      <div key={activeStep} className="animate-fade-up">
        {activeStep === 0 && (
          <div className="space-y-2">
            {services.map((s) => {
              const active = s.id === serviceId;
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    setServiceId(s.id);
                    setEmployeeId(undefined);
                    setSlot(null);
                    setStep(1);
                  }}
                  className={`flex w-full items-center gap-4 rounded-2xl border px-5 py-4 text-left transition ${active ? 'border-gold-500/70 bg-gold-500/10' : 'border-line bg-coal hover:border-gold-500/40'}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-white">{s.name}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-mist-2"><Clock className="h-3 w-3" />{formatDuration(s.duration_minutes)}</p>
                  </div>
                  <p className="font-semibold text-white">{formatTRY(s.price)}</p>
                </button>
              );
            })}
          </div>
        )}

        {activeStep === 1 && service && (
          <div className="grid gap-3 sm:grid-cols-2">
            <StaffOption
              active={employeeId === null}
              onClick={() => { setEmployeeId(null); setSlot(null); setStep(2); }}
              avatar={<span className="flex h-12 w-12 items-center justify-center rounded-full border border-gold-500/40 bg-gold-500/10 text-gold-400"><Shuffle className="h-5 w-5" /></span>}
              title="Fark etmez"
              text="En erken uygun uzman"
            />
            {staff.map((e) => (
              <StaffOption
                key={e.id}
                active={employeeId === e.id}
                onClick={() => { setEmployeeId(e.id); setSlot(null); setStep(2); }}
                avatar={<Avatar name={e.full_name} src={safeImageUrl(e.avatar_url)} size="h-12 w-12 text-sm" />}
                title={e.full_name}
                text={e.title}
              />
            ))}
          </div>
        )}

        {activeStep === 2 && service && employeeId !== undefined && (
          <>
            <SlotPicker serviceId={service.id} employeeId={employeeId} hours={hours} days={settings.max_booking_days} value={slot} onChange={setSlot} />
            <div className="mt-8 flex justify-end">
              <Button size="lg" disabled={!slot} onClick={() => setStep(3)}>Devam Et</Button>
            </div>
          </>
        )}

        {activeStep === 3 && service && slot && (
          <div className="space-y-5">
            <div className="card-gold divide-y divide-line">
              <SummaryRow label="İşletme" value={b.name} sub={fullAddress(b)} />
              <SummaryRow label="Hizmet" value={service.name} sub={formatDuration(service.duration_minutes)} />
              <SummaryRow label="Uzman" value={chosenEmployee?.full_name ?? 'Atanacak'} sub={chosenEmployee?.title} />
              <SummaryRow label="Tarih" value={formatDate(slot.slot_start, { day: 'numeric', month: 'long', weekday: 'long' })} sub={formatTime(slot.slot_start)} />
            </div>
            {sameDay && (
              <p role="status" className="flex items-start gap-2 rounded-xl border border-warning-500/30 bg-warning-900/40 px-4 py-3 text-xs leading-relaxed text-warning-300">
                <Hourglass className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Aynı gün randevuları işletme onayına tabidir.
              </p>
            )}
            <div className="card space-y-3 p-5 text-sm">
              <div className="flex justify-between gap-4 text-mist"><span>Hizmet bedeli</span><span className="text-white">{formatTRY(service.price)}</span></div>
              {deposit > 0 && (
                <div className="flex justify-between gap-4 text-mist">
                  <span>{testMode ? 'Kapora (test modu, tahsil edilmez)' : 'Şimdi ödenecek kapora'}</span>
                  <span className="font-semibold text-gold-400">{formatTRY(deposit)}</span>
                </div>
              )}
              <div className="flex justify-between gap-4 border-t border-line pt-3 text-mist"><span>İşletmede ödenecek</span><span className="text-white">{formatTRY(atBusiness)}</span></div>
            </div>
            <div className="space-y-1.5">
              <Textarea id="booking-note" label="İşletmeye not" hint={`${note.length}/300 · İsteğe bağlı`} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Örn. saç uzunluğum omuz hizasında" />
              <p className="text-xs leading-relaxed text-mist-2">
                Ad soyad, telefon ve e-posta bilgileriniz ile notunuz, randevunun yürütülmesi için {b.name} ile paylaşılır. Sağlık durumunuz gibi özel nitelikli bilgileri bu alana yazmayın.{' '}
                <Link to={legalPath('aydinlatma-metni')} className="text-gold-400 underline-offset-2 hover:underline">Aydınlatma Metni</Link>
              </p>
            </div>
            <p className="flex items-start gap-2 text-xs text-mist-2">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-500" />
              <span>
                Randevuya {b.cancellation_hours} saat kalaya kadar ücretsiz iptal edebilir veya erteleyebilirsiniz.
                {deposit > 0 && !testMode && ' Bu süreden sonra kapora iade edilmez.'}{' '}
                <Link to={legalPath('iptal-iade')} className="text-gold-400 underline-offset-2 hover:underline">İptal ve İade Koşulları</Link>
              </span>
            </p>
            <Button full size="lg" loading={submitting} onClick={submit}>
              {deposit > 0 ? (testMode ? 'Test ödemesine geç' : `Kaporayı Öde · ${formatTRY(deposit)}`) : 'Randevuyu Onayla'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function StaffOption({ active, onClick, avatar, title, text }: { active: boolean; onClick: () => void; avatar: ReactNode; title: string; text: string }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-4 rounded-2xl border p-4 text-left transition ${active ? 'border-gold-500/70 bg-gold-500/10' : 'border-line bg-coal hover:border-gold-500/40'}`}>
      {avatar}
      <div>
        <p className="font-medium text-white">{title}</p>
        <p className="text-xs text-mist-2">{text}</p>
      </div>
    </button>
  );
}

function SummaryRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-4">
      <span className="text-xs uppercase tracking-[0.18em] text-mist-2">{label}</span>
      <span className="text-right">
        <span className="block text-sm text-white">{value}</span>
        {sub && <span className="text-xs text-mist-2">{sub}</span>}
      </span>
    </div>
  );
}
