import { useState, type FormEvent } from 'react';
import { LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';
import { BUSINESS_LIST_COLUMNS, fetchCategories } from '@/lib/api';
import { slugify } from '@/lib/format';
import { friendlyError } from '@/lib/errors';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { AuthShell } from '@/pages/auth/AuthShell';
import { Button } from '@/components/ui/Button';
import type { Business } from '@/lib/types';
import type { Coords } from '@/lib/maps';
import { BasicsFields, districtCoords, validateBasics, type BasicsErrors, type BasicsForm } from './BusinessFields';
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

export default function CreateBusiness({ onCreated }: { onCreated: (b: Business) => void }) {
  const { profile, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { data: categories } = useAsync(() => fetchCategories(), []);
  const [form, setForm] = useState<BasicsForm>({
    name: '',
    category_id: '',
    district: '',
    address: '',
    phone: profile?.phone ?? '',
    email: profile?.email ?? '',
    description: '',
    gender_focus: 'unisex',
  });
  const [errors, setErrors] = useState<BasicsErrors>({});
  const [cover, setCover] = useState<string | null>(null);
  const [pin, setPin] = useState<Coords | null>(null);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof BasicsForm>(key: K, value: BasicsForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    // Ready-made covers are per sector; a new category gets a fresh choice.
    if (key === 'category_id') setCover(null);
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = validateBasics(form);
    setErrors(v);
    if (Object.keys(v).length) return;
    setSaving(true);
    try {
      const slug = `${slugify(form.name) || 'isletme'}-${Math.random().toString(36).slice(2, 6)}`;
      const { data, error } = await supabase
        .from('businesses')
        .insert({
          name: form.name.trim(),
          slug,
          category_id: form.category_id,
          district: form.district,
          city: 'İzmir',
          address: form.address.trim(),
          phone: form.phone.trim(),
          email: form.email.trim() || null,
          description: form.description.trim(),
          gender_focus: form.gender_focus,
          cover_url: cover,
          ...(pin ?? districtCoords(form.district)),
        })
        .select(BUSINESS_LIST_COLUMNS)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('insert returned nothing');
      const business = data as unknown as Business;
      const { error: hoursErr } = await supabase.from('working_hours').insert(DEFAULT_HOURS.map((h) => ({ ...h, business_id: business.id })));
      if (hoursErr) console.error(hoursErr);
      toast('İşletmeniz oluşturuldu. Onay sürecindeyken hizmet ve ekibinizi ekleyebilirsiniz.', 'success');
      onCreated(business);
    } catch (err) {
      toast(friendlyError(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthShell eyebrow="İşletme kurulumu" title="İşletmenizi tanıtın" subtitle="Birkaç temel bilgiyle başlayın. Yönetim ekibimiz başvurunuzu inceledikten sonra işletmeniz Rango'da yayına alınır.">
      <form onSubmit={submit} className="space-y-6" noValidate>
        <BasicsFields form={form} errors={errors} categories={categories ?? []} onChange={set} />
        {form.category_id && (
          <div className="border-t border-line pt-6">
            <p className="mb-1 text-sm font-medium text-white">Kapak görseli <span className="font-normal text-mist-2">(isteğe bağlı)</span></p>
            <p className="mb-4 text-xs text-mist-2">Sektörünüze özel hazır görsellerden birini seçin. Dilediğiniz zaman işletme profilinden kendi fotoğrafınızla değiştirebilirsiniz.</p>
            <SectorCoverPicker category={categories?.find((c) => c.id === form.category_id)} value={cover} onChange={setCover} />
          </div>
        )}
        <div className="border-t border-line pt-6">
          <p className="mb-1 text-sm font-medium text-white">Mağaza konumu <span className="font-normal text-mist-2">(isteğe bağlı)</span></p>
          <p className="mb-4 text-xs text-mist-2">Müşterileriniz yol tarifiyle kapınıza kadar gelsin. Sonradan işletme profilinden de ekleyebilirsiniz.</p>
          <LocationField value={pin} district={form.district} onChange={setPin} />
        </div>
        <Button type="submit" size="lg" full loading={saving}>
          İşletmeyi oluştur
        </Button>
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
