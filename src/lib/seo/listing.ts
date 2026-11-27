/**
 * Şehir / semt / kategori sayfalarının ortak veri işlevleri: hangi işletme listelenir, hangi
 * sayfa dizine girer, hizmet fiyatları nasıl özetlenir. Saf işlevlerdir; hem uygulama hem
 * derleme eklentisi aynı sonucu üretir.
 */
import type { BusinessSummary } from './blocks';
import { businessPath, clip, type SeoBusiness, type SeoHours, type SeoLang, type SeoService } from './meta';
import { districtByName, type PlaceCity, type PlaceDistrict } from './places';
import { coverChoice } from '../sectorCovers';
import { isTestBusiness } from './config';
import { formatPrice, fromPriceLabel } from './format';

export { formatPrice };

export interface ListingBusiness extends SeoBusiness {
  id?: string;
  /** Active services only. */
  services: SeoService[];
  working_hours?: SeoHours[];
  booking_count?: number | null;
}

/** Seeded sample businesses have no owner; they are shown as examples and cannot be booked. */
export function isSampleBusiness(b: Pick<SeoBusiness, 'owner_id'>): boolean {
  return b.owner_id === null;
}

/**
 * A real business that already lists at least one service: the only kind a landing page lists
 * and counts. Test businesses (config.ts) are left out entirely.
 */
export function isBookable(b: ListingBusiness): boolean {
  return !isSampleBusiness(b) && !isTestBusiness(b.slug) && b.services.length > 0;
}

function popularity(b: ListingBusiness): number {
  return Number(b.booking_count ?? 0) + Number(b.review_count ?? 0) * 3;
}

/** Most booked and reviewed first, then best rated, then by name (stable across builds). */
export function sortForListing<T extends ListingBusiness>(list: T[]): T[] {
  return [...list].sort(
    (a, z) => popularity(z) - popularity(a) || Number(z.rating_avg ?? 0) - Number(a.rating_avg ?? 0) || a.name.localeCompare(z.name, 'tr'),
  );
}

export interface LandingScope {
  district?: PlaceDistrict;
  categorySlug?: string;
}

/** The businesses of a city that belong to a district and/or category. */
export function filterByScope<T extends ListingBusiness>(city: PlaceCity, businesses: T[], scope: LandingScope): T[] {
  return businesses.filter((b) => {
    if (scope.categorySlug && b.categories?.slug !== scope.categorySlug) return false;
    if (scope.district && districtByName(city, b.district)?.slug !== scope.district.slug) return false;
    return true;
  });
}

export type LandingKind = 'city' | 'cityCategory' | 'district' | 'districtCategory';

export function landingKind(scope: LandingScope): LandingKind {
  if (scope.district) return scope.categorySlug ? 'districtCategory' : 'district';
  return scope.categorySlug ? 'cityCategory' : 'city';
}

/**
 * How many bookable businesses a landing page needs before search engines may index it.
 * A list page with a single business only repeats that business's own page, so district
 * pages wait for a second one; until then they stay usable but carry "noindex".
 */
export const INDEX_THRESHOLDS: Record<LandingKind, number> = {
  city: 1,
  cityCategory: 1,
  district: 2,
  districtCategory: 2,
};

export function isLandingIndexable(kind: LandingKind, bookableCount: number): boolean {
  return bookableCount >= INDEX_THRESHOLDS[kind];
}

export interface Facets {
  total: number;
  /** category slug → bookable businesses */
  byCategory: Map<string, number>;
  /** district slug → bookable businesses */
  byDistrict: Map<string, number>;
  /** `${districtSlug}/${categorySlug}` → bookable businesses */
  byDistrictCategory: Map<string, number>;
}

/** Counts of bookable businesses per category, district and district+category in a city. */
export function buildFacets(city: PlaceCity, businesses: ListingBusiness[]): Facets {
  const facets: Facets = { total: 0, byCategory: new Map(), byDistrict: new Map(), byDistrictCategory: new Map() };
  const bump = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);
  for (const b of businesses) {
    if (!isBookable(b)) continue;
    facets.total += 1;
    const category = b.categories?.slug ?? '';
    const district = districtByName(city, b.district)?.slug ?? '';
    if (category) bump(facets.byCategory, category);
    if (district) bump(facets.byDistrict, district);
    if (category && district) bump(facets.byDistrictCategory, `${district}/${category}`);
  }
  return facets;
}

/** Card photos are shown about 400px wide; the Pexels seed images can be asked for that size. */
export function cardImageSrc(src: string, width = 640): string {
  try {
    const url = new URL(src);
    if (url.host !== 'images.pexels.com') return src;
    url.searchParams.set('w', String(width));
    url.searchParams.delete('h');
    return url.href;
  } catch {
    return src;
  }
}

export interface SummaryOptions {
  /** The category name in the page's language (the database stores the Turkish one). */
  categoryLabel?: string;
  /** The project's Supabase URL: own photos are only shown from its storage bucket (see sectorCovers.ts). */
  supabaseUrl?: string;
}

/** The card data for a business, in the page's language. */
export function toSummary(b: ListingBusiness, lang: SeoLang, options: SummaryOptions = {}): BusinessSummary {
  const reviews = Number(b.review_count ?? 0);
  const rating = Number(b.rating_avg ?? 0);
  const prices = b.services.map((s) => Number(s.price)).filter((p) => Number.isFinite(p) && p > 0);
  const category = options.categoryLabel ?? b.categories?.name ?? undefined;
  const cover = coverChoice(b, options.supabaseUrl);
  return {
    slug: b.slug,
    name: b.name,
    path: businessPath(b.slug),
    category,
    district: b.district ?? undefined,
    priceFrom: prices.length ? fromPriceLabel(Math.min(...prices), lang) : undefined,
    rating: reviews > 0 && rating > 0 ? rating.toFixed(1) : undefined,
    reviewCount: reviews > 0 ? reviews : undefined,
    // Sample businesses carry invented marketing texts; their cards show facts only.
    description: !isSampleBusiness(b) && b.description?.trim() ? clip(b.description, 140) : undefined,
    image: {
      src: cover.placeholder ? `/${cover.src}` : cardImageSrc(cover.src),
      alt: [b.name, [b.district, category].filter(Boolean).join(' ')].filter(Boolean).join(' – '),
      note: cover.placeholder ? (lang === 'en' ? 'Illustrative image' : 'Temsili görsel') : undefined,
    },
    badge: isSampleBusiness(b) ? (lang === 'en' ? 'Sample business' : 'Örnek işletme') : undefined,
  };
}

export interface ServicePriceRow {
  name: string;
  min: number;
  max: number;
  /** How many of the listed businesses offer it. */
  businesses: number;
}

/**
 * Real prices of the listed businesses, grouped by service name ("Saç Kesimi": ₺450 – ₺600,
 * 2 businesses). Services offered by more businesses come first.
 */
export function aggregateServicePrices(businesses: ListingBusiness[], limit = 12): ServicePriceRow[] {
  const rows = new Map<string, ServicePriceRow & { owners: Set<string> }>();
  for (const b of businesses) {
    for (const s of b.services) {
      const price = Number(s.price);
      const name = s.name.replace(/\s+/g, ' ').trim();
      if (!name || !Number.isFinite(price) || price <= 0) continue;
      const key = name.toLocaleLowerCase('tr-TR');
      const row = rows.get(key);
      if (row) {
        row.min = Math.min(row.min, price);
        row.max = Math.max(row.max, price);
        row.owners.add(b.slug);
      } else {
        rows.set(key, { name, min: price, max: price, businesses: 0, owners: new Set([b.slug]) });
      }
    }
  }
  return [...rows.values()]
    .map(({ owners, ...row }) => ({ ...row, businesses: owners.size }))
    .sort((a, z) => z.businesses - a.businesses || a.min - z.min || a.name.localeCompare(z.name, 'tr'))
    .slice(0, limit);
}

/** "₺450" or "₺450 – ₺600". */
export function formatPriceRange(min: number, max: number, lang: SeoLang = 'tr'): string {
  return min === max ? formatPrice(min, lang) : `${formatPrice(min, lang)} – ${formatPrice(max, lang)}`;
}

/** Lowest service price among the listed businesses, or null when none has a priced service. */
export function lowestPrice(businesses: ListingBusiness[]): number | null {
  const prices = businesses.flatMap((b) => b.services.map((s) => Number(s.price))).filter((p) => Number.isFinite(p) && p > 0);
  return prices.length ? Math.min(...prices) : null;
}

/** Businesses open on an ISO weekday (1 = Monday … 7 = Sunday), according to their working hours. */
export function openOnWeekday<T extends ListingBusiness>(businesses: T[], weekday: number): T[] {
  return businesses.filter((b) => (b.working_hours ?? []).some((h) => h.weekday === weekday && !h.is_closed));
}
