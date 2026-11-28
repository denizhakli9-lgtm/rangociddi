import { Input, Select, Textarea } from '@/components/ui/Field';
import { CITY_LIST, cityOrDefault, findCityDistrict } from '@/lib/cities';
import { isEmail, isPhone } from '@/lib/validation';
import type { Category, GenderFocus } from '@/lib/types';

export interface BasicsForm {
  name: string;
  category_id: string;
  city: string;
  district: string;
  address: string;
  phone: string;
  email: string;
  description: string;
  gender_focus: GenderFocus;
}

export type BasicsErrors = Partial<Record<keyof BasicsForm, string>>;

export function validateBasics(f: BasicsForm): BasicsErrors {
  const e: BasicsErrors = {};
  if (f.name.trim().length < 2) e.name = 'İşletme adı en az 2 karakter olmalıdır.';
  if (!f.category_id) e.category_id = 'Bir kategori seçin.';
  if (!f.city) e.city = 'Bir şehir seçin.';
  if (!f.district || !findCityDistrict(f.city, f.district)) e.district = 'Bir ilçe seçin.';
  if (f.address.trim().length < 5) e.address = 'Açık adres girin.';
  if (!isPhone(f.phone)) e.phone = 'Geçerli bir telefon numarası girin.';
  if (f.email && !isEmail(f.email)) e.email = 'Geçerli bir e-posta adresi girin.';
  if (f.description.length > 1000) e.description = 'Açıklama en fazla 1000 karakter olabilir.';
  return e;
}

export function districtCoords(city: string, name: string): { latitude: number; longitude: number } | null {
  const d = findCityDistrict(city, name);
  return d ? { latitude: d.lat, longitude: d.lng } : null;
}

interface Props {
  form: BasicsForm;
  errors: BasicsErrors;
  categories: Category[];
  onChange: <K extends keyof BasicsForm>(key: K, value: BasicsForm[K]) => void;
}

export function BasicsFields({ form, errors, categories, onChange }: Props) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Input label="İşletme adı" name="name" value={form.name} error={errors.name} maxLength={80} onChange={(e) => onChange('name', e.target.value)} placeholder="ör. Atelier Nova Kuaför" />
      </div>
      <Select label="Kategori" name="category_id" value={form.category_id} error={errors.category_id} onChange={(e) => onChange('category_id', e.target.value)}>
        <option value="">Seçin</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      <Select label="Hizmet verilen müşteri" name="gender_focus" value={form.gender_focus} onChange={(e) => onChange('gender_focus', e.target.value as GenderFocus)}>
        <option value="unisex">Kadın & Erkek</option>
        <option value="female">Kadın</option>
        <option value="male">Erkek</option>
      </Select>
      <CitySelect value={form.city} error={errors.city} onChange={(city) => { onChange('city', city); onChange('district', ''); }} />
      <Select label={`İlçe / semt (${form.city || 'önce şehir seçin'})`} name="district" value={form.district} error={errors.district} disabled={!form.city} onChange={(e) => onChange('district', e.target.value)}>
        <option value="">Seçin</option>
        {cityOrDefault(form.city).districts.map((d) => (
          <option key={d.name} value={d.name}>
            {d.name}
          </option>
        ))}
      </Select>
      <Input label="Telefon" name="phone" type="tel" value={form.phone} error={errors.phone} onChange={(e) => onChange('phone', e.target.value)} placeholder="0232 123 45 67" />
      <div className="sm:col-span-2">
        <Input label="Açık adres" name="address" value={form.address} error={errors.address} maxLength={200} onChange={(e) => onChange('address', e.target.value)} placeholder="Mahalle, cadde, no" />
      </div>
      <div className="sm:col-span-2">
        <Input label="E-posta (isteğe bağlı)" name="email" type="email" value={form.email} error={errors.email} onChange={(e) => onChange('email', e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <Textarea
          label="Açıklama"
          name="description"
          value={form.description}
          error={errors.description}
          hint={`${form.description.length}/1000`}
          maxLength={1000}
          onChange={(e) => onChange('description', e.target.value)}
          placeholder="İşletmenizi, deneyiminizi ve sizi farklı kılan detayları anlatın."
        />
      </div>
    </div>
  );
}

/** The cities Rango serves, most populous first. */
export function CitySelect({ value, error, onChange }: { value: string; error?: string; onChange: (city: string) => void }) {
  return (
    <Select label="Şehir" name="city" value={value} error={error} onChange={(e) => onChange(e.target.value)}>
      <option value="">Seçin</option>
      {CITY_LIST.map((c) => (
        <option key={c.name} value={c.name}>
          {c.name}
        </option>
      ))}
    </Select>
  );
}
