import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, Clock, LogOut, Scissors, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';
import { BUSINESS_LIST_COLUMNS, fetchCategories } from '@/lib/api';
import { claimBusinessReferral, clearStoredReferralCode, normalizeReferralCode, REFERRAL_CODE_PATTERN, storedReferralCode } from '@/lib/fieldAgent';
import { slugify } from '@/lib/format';
import { friendlyError } from '@/lib/errors';
import { acceptsBusinesses, areaAt, cityByName, cityOrDefault, findCityDistrict } from '@/lib/cities';
import { formatTrPhone, isPhone } from '@/lib/validation';
import { isReservedEmail } from '@/lib/phoneLogin';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { AuthShell } from '@/pages/auth/AuthShell';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Field';
import type { Business, GenderFocus } from '@/lib/types';
import { isInCity, type Coords } from '@/lib/maps';
import { CitySelect, districtCoords } from './BusinessFields';
import { ExtraCategoriesField } from './ExtraCategoriesField';
import { LocationField } from './LocationField';
import { SectorCoverPicker } from './SectorCoverPicker';

const DEFAULT_HOURS = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
  weekday,
  is_closed: weekday === 7,
  open_time: weekday === 6 ? '10:00' : '09:00',
  close_time: weekday === 6 ? '18:00' : '20:00',
  break_start: weekday < 6 ? '13:00' : null,
  break_end: weekday < 6 ? '14:00' : null,
}));

interface SetupForm {
  name: string;
  category_id: string;
  gender_focus: GenderFocus;
  phone: string;
  city: string;
  district: string;
  address: string;
  description: string;
}

type SetupErrors = Partial<Record<keyof SetupForm, string>>;

interface Draft {
  step: number;
  form: SetupForm;
  /** Extra categories besides form.category_id (older drafts have none). */
  extras?: string[];
  cover: string | null;
  pin: Coords | null;
}

const STEPS = [
  {
    label: 'İşletme',
    title: 'İşletmenizi tanıyalım',
    text: 'Müşterilerin sizi bulabilmesi için adınızı ve ne iş yaptığınızı yazın. Hepsini sonradan değiştirebilirsiniz.',
  },
  {
    label: 'Konum',
    title: 'Neredesiniz?',
    text: 'İlçenizi seçin. Şu an mağazadaysanız tek dokunuşla tam konumunuzu da ekleyebilirsiniz.',
  },
  {
    label: 'Görünüm',
    title: 'Sayfanızı güzelleştirin',
    text: 'Bu adım isteğe bağlı. Bir kapak görseli ve kısa bir tanıtım, müşterilerin sizi seçmesini kolaylaştırır.',
  },
];

const NEXT_STEPS = [
  { icon: Scissors, title: 'Hizmetlerinizi ekleyin', text: 'Fiyat ve süreleriyle birlikte, ör. Saç kesimi · 45 dk.' },
  { icon: Users, title: 'Ekibinizi tanımlayın', text: 'Tek başınıza çalışıyorsanız yalnızca kendinizi ekleyin.' },
  { icon: Clock, title: 'Çalışma saatlerinizi kontrol edin', text: 'Standart saatleri sizin için doldurduk, gerekirse düzeltin.' },
];

const draftKey = (userId: string) => `rango.businessDraft.${userId}`;

function loadDraft(userId: string | undefined): Draft | null {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(draftKey(userId));
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    if (!d || typeof d.form !== 'object' || typeof d.step !== 'number') return null;
    return d;
  } catch {
    return null;
  }
}

function validateStep(step: number, f: SetupForm): SetupErrors {
  const e: SetupErrors = {};
  if (step === 0) {
    if (f.name.trim().length < 2) e.name = 'İşletme adı en az 2 karakter olmalıdır.';
    if (!f.category_id) e.category_id = 'Bir kategori seçin.';
    if (!isPhone(f.phone)) e.phone = 'Geçerli bir telefon numarası girin (ör. 0532 123 45 67).';
  }
  if (step === 1) {
    if (!acceptsBusinesses(cityByName(f.city))) e.city = 'Listeden bir şehir seçin.';
    if (!f.district || !findCityDistrict(f.city, f.district)) e.district = 'Bir ilçe seçin.';
  }
  if (step === 2) {
    if (f.description.length > 1000) e.description = 'Açıklama en fazla 1000 karakter olabilir.';
  }
  return e;
}


export default function CreateBusiness({ onCreated }: { onCreated: (b: Business) => void }) {
  const { profile, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { data: categories } = useAsync(() => fetchCategories(), []);
  const [draft] = useState(() => loadDraft(profile?.id));
  const [step, setStep] = useState(() => Math.min(Math.max(draft?.step ?? 0, 0), STEPS.length - 1));
  const [form, setForm] = useState<SetupForm>(() => ({
    name: '',
    category_id: '',
    gender_focus: 'unisex',
    phone: formatTrPhone(profile?.phone ?? ''),
    // Not taken from profile.city: that column defaults to İzmir for every account. A draft saved
    // before cities existed already has an İzmir district, so it stays in İzmir.
    city: (draft?.form as Partial<SetupForm> | undefined)?.city === undefined && draft?.form?.district ? 'İzmir' : '',
    district: '',
    address: '',
    description: '',
    ...draft?.form,
  }));
  const [errors, setErrors] = useState<SetupErrors>({});
  const [cover, setCover] = useState<string | null>(draft?.cover ?? null);
  const [pin, setPin] = useState<Coords | null>(draft?.pin ?? null);
  const [extras, setExtras] = useState<string[]>(() => (Array.isArray(draft?.extras) ? draft.extras : []));
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<Business | null>(null);
  // Code of the Rango field agent who visited the business, carried over from their link.
  const [referral, setReferral] = useState(() => storedReferralCode());

  // Keep a draft on this device so a refresh or a closed app does not lose the answers.
  useEffect(() => {
    if (!profile?.id || created) return;
    try {
      localStorage.setItem(draftKey(profile.id), JSON.stringify({ step, form, extras, cover, pin } satisfies Draft));
    } catch {
      /* storage unavailable: the form still works, just without a draft */
    }
  }, [profile?.id, created, step, form, extras, cover, pin]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step, created]);

  const set = <K extends keyof SetupForm>(key: K, value: SetupForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    // Ready-made covers are per sector; a new category gets a fresh choice.
    if (key === 'category_id') {
      setCover(null);
      // The primary category is never also an extra one.
      setExtras((ids) => ids.filter((id) => id !== value));
    }
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const blur = (key: keyof SetupForm) => () => {
    if (!form[key].trim()) return;
    setErrors((e) => ({ ...e, [key]: validateStep(step, form)[key] }));
  };

  const changePin = (c: Coords | null) => {
    setPin(c);
    // A pinned location tells us the city and district; fill them in if the district is still empty.
    if (c && !form.district) {
      const area = areaAt(c.latitude, c.longitude);
      if (area && acceptsBusinesses(area.city)) {
        set('city', area.city.name);
        set('district', area.district.name);
      }
    }
  };

  const create = async () => {
    // Re-check every step: a restored draft could be on step 3 with an earlier field missing.
    for (let i = 0; i < STEPS.length; i++) {
      const v = validateStep(i, form);
      if (Object.keys(v).length) {
        setErrors(v);
        setStep(i);
        return;
      }
    }
    setSaving(true);
    try {
      const slug = `${slugify(form.name) || 'isletme'}-${Math.random().toString(36).slice(2, 6)}`;
      const { data, error } = await supabase
        .from('businesses')
        .insert({
          name: form.name.trim(),
          slug,
          category_id: form.category_id,
          extra_category_ids: extras,
          district: form.district,
          city: form.city,
          address: form.address.trim(),
          phone: form.phone.trim(),
          // Never publish a phone account's technical login address as the salon's e-mail.
          email: profile?.email && !isReservedEmail(profile.email) ? profile.email.trim() || null : null,
          description: form.description.trim(),
          gender_focus: form.gender_focus,
          cover_url: cover,
          ...(pin ?? districtCoords(form.city, form.district)),
        })
        .select(BUSINESS_LIST_COLUMNS)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('insert returned nothing');
      const business = data as unknown as Business;
      const code = normalizeReferralCode(referral);
      if (REFERRAL_CODE_PATTERN.test(code)) {
        // The business is created either way; a wrong code only means no agent is credited.
        try {
          await claimBusinessReferral(business.id, code);
          clearStoredReferralCode();
        } catch (refErr) {
          // A code the server does not know will not start working later: forget it.
          if (/VEYRA_INVALID_CODE/.test(String((refErr as { message?: unknown })?.message ?? ''))) clearStoredReferralCode();
          toast(`Referans kodu eklenemedi: ${friendlyError(refErr)}`, 'error');
        }
      }
      const { error: hoursErr } = await supabase.from('working_hours').insert(DEFAULT_HOURS.map((h) => ({ ...h, business_id: business.id })));
      if (hoursErr) console.error(hoursErr);
      try {
        if (profile?.id) localStorage.removeItem(draftKey(profile.id));
      } catch {
        /* nothing to clear */
      }
      setCreated(business);
    } catch (err) {
      toast(friendlyError(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const v = validateStep(step, form);
    setErrors(v);
    if (Object.keys(v).length) return;
    if (step < STEPS.length - 1) setStep(step + 1);
    else void create();
  };

  if (created) {
    const enter = (to: string) => {
      onCreated(created);
      navigate(to);
    };
    return (
      <AuthShell eyebrow="Başvurunuz alındı" title="Tebrikler, ilk adım tamam" subtitle={`${created.name} başvurusu ekibimize ulaştı. Onaylandığında size bildirim göndeririz ve müşteriler sizi görmeye başlar.`}>
        <p className="mb-3 text-sm font-medium text-white">Onayı beklerken yapabilecekleriniz</p>
        <ol className="space-y-3">
          {NEXT_STEPS.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="flex items-start gap-3 rounded-2xl border border-line bg-coal p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold-500/10 text-gold-400">
                <Icon className="h-4 w-4" strokeWidth={1.6} />
              </span>
              <span>
                <span className="block text-sm font-medium text-white">
                  {i + 1}. {title}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-mist-2">{text}</span>
              </span>
            </li>
          ))}
        </ol>
        <div className="mt-6 space-y-3">
          <Button size="lg" full onClick={() => enter('/isletme/hizmetler')} icon={<Scissors className="h-4 w-4" />}>
            İlk hizmetimi ekle
          </Button>
          <Button variant="ghost" full onClick={() => enter('/isletme')}>
            Panele git
          </Button>
        </div>
      </AuthShell>
    );
  }

  const current = STEPS[step];
  const last = step === STEPS.length - 1;
  const lastUntouched = last && !cover && !form.description.trim();

  return (
    <AuthShell eyebrow={`İşletme kurulumu · Adım ${step + 1}/${STEPS.length}`} title={current.title} subtitle={current.text}>
      <ol className="mb-8 grid grid-cols-3 gap-2" aria-label="Kurulum adımları">
        {STEPS.map((s, i) => (
          <li key={s.label} aria-current={i === step ? 'step' : undefined}>
            <button type="button" disabled={i >= step} onClick={() => setStep(i)} className="block w-full text-left disabled:cursor-default">
              <span className={`block h-1 rounded-full ${i <= step ? 'bg-gold-500' : 'bg-line'}`} />
              <span className={`mt-2 flex items-center gap-1 text-xs ${i === step ? 'font-semibold text-white' : i < step ? 'text-gold-400' : 'text-mist-2'}`}>
                {i < step && <Check className="h-3 w-3" strokeWidth={3} />}
                {s.label}
              </span>
            </button>
          </li>
        ))}
      </ol>

      <form onSubmit={submit} className="space-y-6" noValidate>
        {step === 0 && (
          <div className="space-y-4">
            <Input
              label="İşletme adı"
              name="name"
              value={form.name}
              error={errors.name}
              hint="Tabelanızda yazan ad. Müşteriler sizi bu adla arayacak."
              maxLength={80}
              onChange={(e) => set('name', e.target.value)}
              onBlur={blur('name')}
              placeholder="ör. Atelier Nova Kuaför"
            />
            <Select label="Ana kategori" name="category_id" value={form.category_id} error={errors.category_id} hint="Yaptığınız işe en yakın olanı seçin." onChange={(e) => set('category_id', e.target.value)}>
              <option value="">Seçin</option>
              {(categories ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            {form.category_id && <ExtraCategoriesField categories={categories ?? []} primaryId={form.category_id} value={extras} onChange={setExtras} />}
            <Select label="Hizmet verilen müşteri" name="gender_focus" value={form.gender_focus} onChange={(e) => set('gender_focus', e.target.value as GenderFocus)}>
              <option value="unisex">Kadın & Erkek</option>
              <option value="female">Kadın</option>
              <option value="male">Erkek</option>
            </Select>
            <Input
              label="İşletme telefonu"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={form.phone}
              error={errors.phone}
              hint="Randevularla ilgili size bu numaradan ulaşırız. Müşterilere gösterilmez."
              onChange={(e) => set('phone', formatTrPhone(e.target.value))}
              onBlur={blur('phone')}
              placeholder="05XX XXX XX XX"
            />
            <Input
              label="Referans kodu (isteğe bağlı)"
              name="referral"
              value={referral}
              autoCapitalize="characters"
              autoComplete="off"
              maxLength={6}
              hint="Sizi ziyaret eden Rango saha temsilcisinin 6 haneli kodu."
              onChange={(e) => setReferral(normalizeReferralCode(e.target.value))}
              placeholder="ör. K7M2PX"
            />
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6">
            <LocationField value={pin} city={form.city} district={form.district} onChange={changePin} />
            <div className="space-y-4 border-t border-line pt-6">
              <CitySelect
                value={form.city}
                error={errors.city}
                onChange={(city) => {
                  set('city', city);
                  set('district', '');
                  // A pin from another city would leave the saved city and coordinates disagreeing.
                  if (pin && !isInCity(pin, city)) setPin(null);
                }}
              />
              <Select label={`İlçe / semt (${form.city || 'önce şehir seçin'})`} name="district" value={form.district} error={errors.district} disabled={!form.city} hint="Konumunuzu eklediyseniz şehri ve ilçeyi sizin için seçtik; yanlışsa değiştirin." onChange={(e) => set('district', e.target.value)}>
                <option value="">Seçin</option>
                {cityOrDefault(form.city).districts.map((d) => (
                  <option key={d.name} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </Select>
              <Input
                label="Açık adres (isteğe bağlı)"
                name="address"
                autoComplete="street-address"
                value={form.address}
                maxLength={200}
                hint="Şimdi yazmak zorunda değilsiniz, işletme profilinden ekleyebilirsiniz."
                onChange={(e) => set('address', e.target.value)}
                placeholder="Mahalle, cadde, no"
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div>
              <p className="mb-1 text-sm font-medium text-white">Kapak görseli</p>
              <p className="mb-4 text-xs text-mist-2">Sektörünüze özel hazır görsellerden birini seçin. Dilediğiniz zaman kendi fotoğrafınızla değiştirebilirsiniz.</p>
              <SectorCoverPicker category={categories?.find((c) => c.id === form.category_id)} value={cover} onChange={setCover} />
            </div>
            <Textarea
              label="Kısa tanıtım"
              name="description"
              value={form.description}
              error={errors.description}
              hint={`${form.description.length}/1000`}
              maxLength={1000}
              onChange={(e) => set('description', e.target.value)}
              placeholder="İşletmenizi, deneyiminizi ve sizi farklı kılan detayları bir iki cümleyle anlatın."
            />
          </div>
        )}

        <div className="flex gap-3">
          {step > 0 && (
            <Button type="button" variant="dark" size="lg" disabled={saving} onClick={() => setStep(step - 1)} icon={<ArrowLeft className="h-4 w-4" />} aria-label="Önceki adım">
              Geri
            </Button>
          )}
          <Button type="submit" size="lg" full loading={saving}>
            {last ? (lastUntouched ? 'Şimdilik geç ve oluştur' : 'İşletmeyi oluştur') : 'Devam et'}
            {!last && <ArrowRight className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-center text-xs text-mist-2">Yazdıklarınız bu cihazda saklanır; yarıda bırakırsanız kaldığınız yerden devam edersiniz.</p>
        <button
          type="button"
          onClick={async () => {
            await signOut();
            navigate('/giris');
          }}
          className="mx-auto flex items-center gap-2 text-xs text-mist-2 transition hover:text-white"
        >
          <LogOut className="h-3.5 w-3.5" /> Çıkış yap
        </button>
      </form>
    </AuthShell>
  );
}
