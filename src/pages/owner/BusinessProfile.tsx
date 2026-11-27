import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, ImagePlus, Save, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';
import { fetchCategories } from '@/lib/api';
import { depositFor, formatTRY } from '@/lib/format';
import { friendlyError } from '@/lib/errors';
import { safeImageUrl } from '@/lib/safeUrl';
import { placeholderCover, sectorChoiceSrc } from '@/lib/placeholderImages';
import { PlaceholderTag } from '@/components/ui/PlaceholderTag';
import { tr } from '@/i18n/tr';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { Input, Toggle } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Brand';
import { Spinner } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/layout/PageHeader';
import { useOwnerBusiness } from './OwnerContext';
import { useImageUpload } from './useImageUpload';
import { hasExactPin, type Coords } from '@/lib/maps';
import { BasicsFields, districtCoords, validateBasics, type BasicsErrors, type BasicsForm } from './BusinessFields';
import { LocationField } from './LocationField';
import { SectorCoverPicker } from './SectorCoverPicker';
import { PayoutAccountCard } from './PayoutAccountCard';
import { parseTrNumber } from './number';
import { newTabClick } from '@/lib/platform';

const MAX_GALLERY = 8;

export default function BusinessProfile() {
  const { business, reload } = useOwnerBusiness();
  const { toast } = useToast();
  const { upload, uploading } = useImageUpload(business.id);
  const { data: categories } = useAsync(() => fetchCategories(), []);

  const [basics, setBasics] = useState<BasicsForm>({
    name: business.name,
    category_id: business.category_id,
    district: business.district,
    address: business.address,
    phone: business.phone ?? '',
    email: business.email ?? '',
    description: business.description,
    gender_focus: business.gender_focus,
  });
  const [pin, setPin] = useState<Coords | null>(() =>
    hasExactPin(business) ? { latitude: business.latitude, longitude: business.longitude } : null,
  );
  const [errors, setErrors] = useState<BasicsErrors>({});
  const [media, setMedia] = useState({ logo_url: business.logo_url, cover_url: business.cover_url, gallery: business.gallery ?? [] });
  const [policy, setPolicy] = useState({
    deposit_type: business.deposit_type,
    deposit_value: String(business.deposit_value),
    cancellation_hours: String(business.cancellation_hours),
    auto_confirm: business.auto_confirm,
  });
  const [policyErr, setPolicyErr] = useState<{ deposit?: string; hours?: string }>({});
  const [saving, setSaving] = useState(false);

  const setBasic = <K extends keyof BasicsForm>(key: K, value: BasicsForm[K]) => {
    setBasics((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const save = async () => {
    const v = validateBasics(basics);
    const depositValue = parseTrNumber(policy.deposit_value || '0') ?? NaN;
    const hours = Number(policy.cancellation_hours);
    const p: typeof policyErr = {};
    if (!(depositValue >= 0) || (policy.deposit_type === 'percentage' && depositValue > 100)) p.deposit = policy.deposit_type === 'percentage' ? tr.validation.percentage : 'Geçerli bir tutar girin.';
    if (!(Number.isInteger(hours) && hours >= 0 && hours <= 168)) p.hours = '0 ile 168 saat arasında bir değer girin.';
    setErrors(v);
    setPolicyErr(p);
    if (Object.keys(v).length || Object.keys(p).length) {
      toast('Lütfen işaretli alanları kontrol edin.', 'error');
      return;
    }
    setSaving(true);
    const coords = pin ?? districtCoords(basics.district);
    const { error } = await supabase
      .from('businesses')
      .update({
        name: basics.name.trim(),
        category_id: basics.category_id,
        district: basics.district,
        address: basics.address.trim(),
        phone: basics.phone.trim(),
        email: basics.email.trim() || null,
        description: basics.description.trim(),
        gender_focus: basics.gender_focus,
        ...(coords ?? {}),
        logo_url: media.logo_url,
        cover_url: media.cover_url,
        gallery: media.gallery,
        deposit_type: policy.deposit_type,
        deposit_value: depositValue,
        cancellation_hours: hours,
        auto_confirm: policy.auto_confirm,
      })
      .eq('id', business.id);
    setSaving(false);
    if (error) return toast(friendlyError(error), 'error');
    toast('İşletme profili kaydedildi.', 'success');
    reload();
  };

  // Media URLs are writable through the REST API; only trusted storage/seed hosts are rendered.
  const coverSrc = safeImageUrl(media.cover_url);
  // Until the owner uploads a cover, customers see a labelled photo from the business's sector.
  const category = categories?.find((c) => c.id === basics.category_id);
  const sectorCover = sectorChoiceSrc(media.cover_url) ?? placeholderCover(business.id, category);
  const logoSrc = safeImageUrl(media.logo_url);

  const sample = 1000;
  const parsedDeposit = parseTrNumber(policy.deposit_value);
  const sampleDeposit = depositFor(sample, policy.deposit_type, parsedDeposit ?? 0);
  const depositHint = `${parsedDeposit != null ? `Kaydedilecek: ${policy.deposit_type === 'percentage' ? `%${String(parsedDeposit).replace('.', ',')}` : formatTRY(parsedDeposit)} · ` : ''}Örnek: ${formatTRY(sample)} hizmette kapora ${formatTRY(sampleDeposit)}`;

  return (
    <div className="pb-24">
      <PageHeader
        eyebrow="İşletme profili"
        title="Vitrininiz"
        text="Müşterilerin gördüğü bilgiler, görseller ve randevu politikanız."
        action={
          business.status === 'approved' ? (
            <Link to={`/i/${business.slug}`} target="_blank" onClick={newTabClick(`/i/${business.slug}`)} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line px-4 text-xs text-mist transition hover:border-white/30 hover:text-white">
              Profili görüntüle <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          ) : undefined
        }
      />

      <div className="space-y-6">
        <section className="card p-6">
          <h2 className="mb-1 text-base font-semibold text-white">Görseller</h2>
          <p className="mb-5 text-xs text-mist-2">JPG, PNG veya WebP · en fazla 5 MB</p>
          <div className="relative mb-6 overflow-hidden rounded-2xl border border-line bg-ink/60">
            <div className="relative aspect-[16/6] w-full">
              {coverSrc ? (
                <img src={coverSrc} alt="Kapak" className="h-full w-full object-cover" />
              ) : (
                <>
                  <img src={sectorCover} alt="" className="h-full w-full object-cover" />
                  <PlaceholderTag className="left-auto right-3 top-3" />
                </>
              )}
            </div>
            <label className="absolute bottom-3 right-3 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-ink/80 px-3 py-2 text-xs text-white backdrop-blur transition hover:bg-ink">
              {uploading === 'cover' ? <Spinner className="h-3.5 w-3.5" /> : <ImagePlus className="h-3.5 w-3.5" />} Kapak değiştir
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={async (e) => { const url = await upload(e.target.files?.[0], 'cover'); if (url) setMedia((m) => ({ ...m, cover_url: url })); e.target.value = ''; }} />
            </label>
            <label className="absolute -bottom-0 left-4 mb-3 grid h-20 w-20 cursor-pointer place-items-center overflow-hidden rounded-2xl border-2 border-gold-500/50 bg-coal shadow-xl">
              {uploading === 'logo' ? <Spinner className="h-5 w-5" /> : logoSrc ? <img src={logoSrc} alt="Logo" className="h-full w-full object-cover" /> : <span className="text-center text-[10px] text-mist-2">Logo ekle</span>}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={async (e) => { const url = await upload(e.target.files?.[0], 'logo'); if (url) setMedia((m) => ({ ...m, logo_url: url })); e.target.value = ''; }} />
            </label>
          </div>
          {!coverSrc && (
            <div className="-mt-2 mb-5 rounded-xl border border-line bg-gold-500/5 p-4">
              <p className="mb-3 text-xs leading-relaxed text-mist">
                Kendi kapak fotoğrafınızı yükleyene kadar sektörünüze özel hazır görsellerden biri gösterilir. Beğendiğinizi seçip kaydedin; “Kapak değiştir” ile dilediğiniz zaman işletmenizin kendi fotoğrafını yükleyebilirsiniz.
              </p>
              <SectorCoverPicker category={category} value={media.cover_url} onChange={(v) => setMedia((m) => ({ ...m, cover_url: v }))} />
            </div>
          )}
          <p className="mb-3 text-xs font-medium tracking-wide text-mist">Galeri ({media.gallery.length}/{MAX_GALLERY})</p>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {media.gallery.map((url) => {
              const src = safeImageUrl(url);
              return (
                <div key={url} className="group relative aspect-square overflow-hidden rounded-xl border border-line">
                  {src ? (
                    <img src={src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full place-items-center bg-coal-3 p-2 text-center text-[10px] text-mist-3">Görsel gösterilemiyor</div>
                  )}
                  <button type="button" aria-label="Görseli kaldır" onClick={() => setMedia((m) => ({ ...m, gallery: m.gallery.filter((g) => g !== url) }))} className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-ink/80 text-white opacity-100 transition focus-visible:opacity-100 can-hover:opacity-0 group-hover:opacity-100">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
            {media.gallery.length < MAX_GALLERY && (
              <label className="grid aspect-square cursor-pointer place-items-center rounded-xl border border-dashed border-line text-mist-2 transition hover:border-white/30 hover:text-gold-300">
                {uploading === 'gallery' ? <Spinner className="h-5 w-5" /> : <ImagePlus className="h-5 w-5" />}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={async (e) => { const url = await upload(e.target.files?.[0], 'gallery'); if (url) setMedia((m) => ({ ...m, gallery: [...m.gallery, url].slice(0, MAX_GALLERY) })); e.target.value = ''; }} />
              </label>
            )}
          </div>
        </section>

        <section className="card p-6">
          <h2 className="mb-5 text-base font-semibold text-white">Temel bilgiler</h2>
          <BasicsFields form={basics} errors={errors} categories={categories ?? []} onChange={setBasic} />
        </section>

        <section className="card p-6">
          <h2 className="mb-1 text-base font-semibold text-white">Mağaza konumu</h2>
          <p className="mb-5 text-xs text-mist-2">Müşteriler profilinizdeki “Yol tarifi al” butonuyla doğrudan bu noktaya yönlendirilir.</p>
          <LocationField value={pin} district={basics.district} onChange={setPin} />
        </section>

        <section className="card p-6">
          <h2 className="mb-1 text-base font-semibold text-white">Randevu politikası</h2>
          <p className="mb-5 text-xs text-mist-2">Kapora randevu sırasında online alınır, kalan tutar işletmede ödenir.</p>
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-xs font-medium tracking-wide text-mist">Kapora türü</p>
              <Segmented<'percentage' | 'fixed'>
                value={policy.deposit_type}
                onChange={(v) => setPolicy({ ...policy, deposit_type: v })}
                options={[
                  { value: 'percentage', label: 'Yüzde (%)' },
                  { value: 'fixed', label: 'Sabit tutar (₺)' },
                ]}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label={policy.deposit_type === 'percentage' ? 'Kapora oranı (%)' : 'Kapora tutarı (₺)'}
                inputMode="decimal"
                value={policy.deposit_value}
                error={policyErr.deposit}
                hint={depositHint}
                onChange={(e) => setPolicy({ ...policy, deposit_value: e.target.value })}
              />
              <Input
                label="Ücretsiz iptal süresi (saat)"
                inputMode="numeric"
                value={policy.cancellation_hours}
                error={policyErr.hours}
                hint="Bu süreden daha geç yapılan müşteri iptallerinde kapora iade edilmez."
                onChange={(e) => setPolicy({ ...policy, cancellation_hours: e.target.value.replace(/\D/g, '') })}
              />
            </div>
            <Toggle
              checked={policy.auto_confirm}
              onChange={(v) => setPolicy({ ...policy, auto_confirm: v })}
              label="Randevuları otomatik onayla"
              description="Kapalıyken her yeni randevu sizin onayınızı bekler; reddedilen randevularda kapora iade edilir."
            />
          </div>
        </section>

        <PayoutAccountCard businessId={business.id} />
      </div>

      <div data-save-bar className="fixed inset-x-0 bottom-[calc(60px+env(safe-area-inset-bottom))] z-30 border-t border-line bg-ink/90 p-4 backdrop-blur lg:bottom-0 lg:left-64 lg:pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-5xl items-center justify-end gap-3">
          <span className="hidden text-xs text-mist-2 sm:block">Değişiklikler kaydedildiğinde müşteri sayfanız güncellenir.</span>
          <Button loading={saving} onClick={save} icon={<Save className="h-4 w-4" />} disabled={!!uploading}>
            Kaydet
          </Button>
        </div>
      </div>
    </div>
  );
}
