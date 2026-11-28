/**
 * Şehir ve semt sayfalarının adresleri (`/izmir`, `/izmir/karsiyaka`, `/izmir/karsiyaka/berber`).
 *
 * Semt listesi uygulamanın kendi listesidir (`src/lib/cities.ts`); işletme sahipleri ilçeyi bu
 * listeden seçtiği için işletmelerin `district` alanı buradaki adlarla birebir aynıdır.
 * Saf veri/işlev dosyasıdır: hem tarayıcıda hem derleme eklentisinde kullanılır.
 */
import { cityOrDefault } from '../cities';

export interface PlaceDistrict {
  name: string;
  slug: string;
  lat: number;
  lng: number;
}

export interface PlaceCity {
  name: string;
  slug: string;
  districts: PlaceDistrict[];
}

const FOLD: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };

/** "Karşıyaka" → "karsiyaka", "Güzelbahçe" → "guzelbahce". */
export function slugifyTr(text: string): string {
  return text
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşüâîû]/g, (c) => FOLD[c] ?? c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const BACK_VOWELS = 'aıou';
const FRONT_VOWELS = 'eiöü';
const VOICELESS = 'fstkçşhp';

/**
 * Turkish locative for a place name: "Karşıyaka’da", "Konak’ta", "Narlıdere’de", "İzmir’de".
 * Add "ki" for "the ones in": `${locativeTr('Konak')}ki` → "Konak’taki".
 */
export function locativeTr(name: string): string {
  const lower = name.toLocaleLowerCase('tr-TR');
  let vowel = 'a';
  for (let i = lower.length - 1; i >= 0; i--) {
    if (BACK_VOWELS.includes(lower[i])) {
      vowel = 'a';
      break;
    }
    if (FRONT_VOWELS.includes(lower[i])) {
      vowel = 'e';
      break;
    }
  }
  const consonant = VOICELESS.includes(lower[lower.length - 1]) ? 't' : 'd';
  return `${name}’${consonant}${vowel}`;
}

/**
 * Cities that have their own landing pages. The app serves every city in `src/lib/cities.ts`;
 * a city gets pages here (and in the static build, seo/prerender.ts) once it has businesses.
 */
export const CITIES: PlaceCity[] = ['İzmir'].map((name) => {
  const city = cityOrDefault(name);
  return { name: city.name, slug: slugifyTr(city.name), districts: city.districts.map((d) => ({ name: d.name, slug: slugifyTr(d.name), lat: d.lat, lng: d.lng })) };
});

/** Rango's pilot city; every landing address currently starts with it. */
export const DEFAULT_CITY = CITIES[0];

export function findCity(slug: string | undefined): PlaceCity | undefined {
  return CITIES.find((c) => c.slug === slug);
}

export function findDistrict(city: PlaceCity, slug: string | undefined): PlaceDistrict | undefined {
  return city.districts.find((d) => d.slug === slug);
}

/** Matches a business's stored district name ("Karşıyaka") to its place entry. */
export function districtByName(city: PlaceCity, name: string | null | undefined): PlaceDistrict | undefined {
  if (!name) return undefined;
  const slug = slugifyTr(name);
  return city.districts.find((d) => d.slug === slug);
}

export function cityPath(city: PlaceCity): string {
  return `/${city.slug}`;
}

/** `/izmir/kuafor` */
export function cityCategoryPath(city: PlaceCity, categorySlug: string): string {
  return `/${city.slug}/${categorySlug}`;
}

/** `/izmir/karsiyaka` */
export function districtPath(city: PlaceCity, district: PlaceDistrict): string {
  return `/${city.slug}/${district.slug}`;
}

/** `/izmir/karsiyaka/berber` */
export function districtCategoryPath(city: PlaceCity, district: PlaceDistrict, categorySlug: string): string {
  return `/${city.slug}/${district.slug}/${categorySlug}`;
}
