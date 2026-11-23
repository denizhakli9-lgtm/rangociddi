/**
 * Şehir, semt ve kategori sayfaları: `/izmir`, `/izmir/kuafor`, `/izmir/karsiyaka`,
 * `/izmir/karsiyaka/berber`.
 *
 * Sayfanın tamamı (başlık, açıklama, metin, işletme listesi, fiyat tablosu, sık sorulan
 * sorular, iç bağlantılar, yapısal veri) işletme verisinden üretilir; elle yazılmış, yere
 * özgü bir iddia yoktur. Aynı işlev uygulamada (`pages/customer/Landing.tsx`) ve derleme
 * sırasında (`seo/prerender.ts`) çalışır, bu yüzden statik sayfa ile uygulama aynıdır.
 *
 * Dizin kuralı: sayfa yalnızca yeterli sayıda gerçek ve randevu alınabilir işletme
 * listeliyorsa dizine girer (`INDEX_THRESHOLDS`). Örnek işletmeler sayılmaz; yalnızca hiç
 * gerçek işletme yokken, sayfa boş kalmasın diye "örnek" olarak gösterilir (noindex).
 */
import type { Block, BlockLink, FaqItem, PageModel } from '../blocks';
import { SITE_NAME, breadcrumbSchema, clip, faqSchema, itemListSchema, type PageMeta, type SeoCategory, type SeoLang } from '../meta';
import { cityCategoryPath, cityPath, districtCategoryPath, districtPath, locativeTr, type PlaceCity, type PlaceDistrict } from '../places';
import {
  aggregateServicePrices,
  buildFacets,
  filterByScope,
  formatPrice,
  formatPriceRange,
  isBookable,
  isLandingIndexable,
  isSampleBusiness,
  landingKind,
  lowestPrice,
  openOnWeekday,
  sortForListing,
  toSummary,
  type Facets,
  type LandingKind,
  type ListingBusiness,
} from '../listing';
import { bookingFaqItems, howItWorksBlock, ownerCtaBlock } from './common';

export interface LandingInput {
  lang: SeoLang;
  city: PlaceCity;
  district?: PlaceDistrict;
  /** The page's category, with name and description in the page's language. */
  category?: SeoCategory;
  /** Every active category in display order, in the page's language. */
  categories: SeoCategory[];
  /** Every approved business of the city (real and sample) with its active services. */
  businesses: ListingBusiness[];
  /** The project's Supabase URL, needed to show a business's own photo (see sectorCovers.ts). */
  supabaseUrl?: string;
}

export interface LandingModel extends PageModel {
  kind: LandingKind;
  path: string;
  /** Bookable businesses listed on the page. */
  count: number;
  indexable: boolean;
}

/** How many businesses a page lists; the rest stay reachable through search. */
const MAX_LISTED = 60;
const MAX_SAMPLES = 6;

const pick = (lang: SeoLang, tr: string, en: string) => (lang === 'en' ? en : tr);
const lowerTr = (text: string) => text.toLocaleLowerCase('tr-TR');

export function landingPath(city: PlaceCity, district?: PlaceDistrict, categorySlug?: string): string {
  if (district) return categorySlug ? districtCategoryPath(city, district, categorySlug) : districtPath(city, district);
  return categorySlug ? cityCategoryPath(city, categorySlug) : cityPath(city);
}

function countLabel(lang: SeoLang, count: number): string {
  return pick(lang, `${count} işletme`, count === 1 ? '1 business' : `${count} businesses`);
}

/** "Berber (2), Kuaför (1)": what the listed businesses offer, most common first. */
function categoryMix(input: LandingInput, listed: ListingBusiness[]): { slug: string; name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const b of listed) {
    const slug = b.categories?.slug;
    if (slug) counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }
  return input.categories
    .filter((c) => counts.has(c.slug))
    .map((c) => ({ slug: c.slug, name: c.name, count: counts.get(c.slug)! }))
    .sort((a, z) => z.count - a.count);
}

function joinList(lang: SeoLang, parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} ${pick(lang, 've', 'and')} ${parts[parts.length - 1]}`;
}

interface Copy {
  eyebrow: string;
  h1: string;
  title: string;
  lead: string;
  description: string;
  listTitle: string;
}

function copyFor(input: LandingInput, kind: LandingKind, listed: ListingBusiness[]): Copy {
  const { lang, city, district, category } = input;
  const place = district?.name ?? city.name;
  const placeLoc = locativeTr(place);
  const placeEn = district ? `${district.name}, ${city.name}` : city.name;
  const n = listed.length;
  const min = lowestPrice(listed);
  const minText = min !== null ? formatPrice(min, lang) : '';
  const eyebrow = district ? `${city.name} · ${district.name}` : city.name;

  if (category) {
    const name = category.name;
    const nameLower = lang === 'en' ? name.toLowerCase() : lowerTr(name);
    const lead = n
      ? pick(
          lang,
          `${placeLoc} online randevu alabileceğiniz ${n} ${nameLower} işletmesi var.${minText ? ` En düşük hizmet fiyatı ${minText}.` : ''} Hizmeti ve saati seçin, randevunuzu online oluşturun.`,
          `${n === 1 ? 'There is 1 business' : `There are ${n} businesses`} for ${nameLower} in ${placeEn} that you can book online.${minText ? ` Prices start at ${minText}.` : ''} Pick a service and a time, and book online.`,
        )
      : pick(
          lang,
          `${placeLoc} ${nameLower} için Rango’da henüz online randevu alınabilen bir işletme yok. Yeni işletmeler eklendikçe burada listelenir.`,
          `There is no business for ${nameLower} in ${placeEn} that can be booked on Rango yet. New businesses appear here as they join.`,
        );
    return {
      eyebrow,
      h1: pick(lang, `${placeLoc} ${name}`, `${name} in ${placeEn}`),
      title: pick(lang, `${place} ${name}: Online Randevu ve Fiyatlar | ${SITE_NAME}`, `${name} in ${placeEn}: Book Online | ${SITE_NAME}`),
      lead,
      description: clip(
        n
          ? pick(
              lang,
              `${placeLoc} ${n} ${nameLower} işletmesinden online randevu alın.${minText ? ` En düşük hizmet fiyatı ${minText}.` : ''} Hizmetleri ve fiyatları karşılaştırın, saati seçin, yerinizi ${SITE_NAME} ile ayırtın.`,
              `Book ${nameLower} in ${placeEn} online: ${countLabel(lang, n)}${minText ? `, prices from ${minText}` : ''}. Compare services and prices, pick a time and secure your spot with ${SITE_NAME}.`,
            )
          : lead,
      ),
      listTitle: pick(lang, `${placeLoc}ki ${nameLower} işletmeleri`, `${name} businesses in ${placeEn}`),
    };
  }

  const mix = categoryMix(input, listed);
  const mixText = joinList(
    lang,
    mix.slice(0, 4).map((m) => (lang === 'en' ? m.name.toLowerCase() : lowerTr(m.name))),
  );
  const lead = n
    ? pick(
        lang,
        `${placeLoc} online randevu alabileceğiniz ${n} işletme var${mixText ? `: ${mixText}` : ''}. Hizmetleri ve fiyatları karşılaştırın, size uyan saati seçin.`,
        `${n === 1 ? 'There is 1 business' : `There are ${n} businesses`} in ${placeEn} that you can book online${mixText ? `: ${mixText}` : ''}. Compare services and prices and pick a time that suits you.`,
      )
    : pick(
        lang,
        `${placeLoc} Rango’da henüz online randevu alınabilen bir işletme yok. Yeni işletmeler eklendikçe burada listelenir.`,
        `There is no business in ${placeEn} that can be booked on Rango yet. New businesses appear here as they join.`,
      );
  return {
    eyebrow: kind === 'city' ? pick(lang, 'Şehir', 'City') : city.name,
    h1: pick(lang, `${placeLoc} online randevu`, `Book online in ${placeEn}`),
    title: pick(lang, `${place} Kuaför, Berber ve Güzellik Randevusu | ${SITE_NAME}`, `Hair, Barber & Beauty Bookings in ${placeEn} | ${SITE_NAME}`),
    lead,
    description: clip(
      n
        ? pick(
            lang,
            `${placeLoc} ${n} işletmeden online randevu alın${mixText ? `: ${mixText}` : ''}. Hizmetleri ve fiyatları karşılaştırın, saati seçin, yerinizi ${SITE_NAME} ile ayırtın.`,
            `Book ${countLabel(lang, n)} in ${placeEn} online${mixText ? `: ${mixText}` : ''}. Compare services and prices, pick a time and secure your spot with ${SITE_NAME}.`,
          )
        : lead,
    ),
    listTitle: pick(lang, `${placeLoc}ki işletmeler`, `Businesses in ${placeEn}`),
  };
}

function breadcrumb(input: LandingInput): { name: string; path: string }[] {
  const { city, district, category } = input;
  const items = [
    { name: SITE_NAME, path: '/' },
    { name: city.name, path: cityPath(city) },
  ];
  if (district) items.push({ name: district.name, path: districtPath(city, district) });
  if (category) items.push({ name: category.name, path: landingPath(city, district, category.slug) });
  return items;
}

/** Links to the other landing pages that have enough businesses to be worth a visit. */
function siblingBlocks(input: LandingInput, facets: Facets): Block[] {
  const { lang, city, district, category, categories } = input;
  const blocks: Block[] = [];
  const place = district?.name ?? city.name;
  const placeLoc = locativeTr(place);

  if (category) {
    // The same service in the districts that list it.
    const districts: BlockLink[] = city.districts
      .filter((d) => d.slug !== district?.slug)
      .map((d) => ({ d, count: facets.byDistrictCategory.get(`${d.slug}/${category.slug}`) ?? 0 }))
      .filter(({ count }) => isLandingIndexable('districtCategory', count))
      .map(({ d, count }) => ({ label: `${d.name} ${category.name}`, path: districtCategoryPath(city, d, category.slug), detail: countLabel(lang, count) }));
    if (district && isLandingIndexable('cityCategory', facets.byCategory.get(category.slug) ?? 0)) {
      districts.unshift({ label: pick(lang, `Tüm ${city.name}`, `All of ${city.name}`), path: cityCategoryPath(city, category.slug), detail: countLabel(lang, facets.byCategory.get(category.slug) ?? 0) });
    }
    if (districts.length) {
      blocks.push({ kind: 'links', title: pick(lang, `Semte göre ${lowerTr(category.name)}`, `${category.name} by area`), items: districts });
    }
  }

  // Other services in the same place.
  const services: BlockLink[] = categories
    .filter((c) => c.slug !== category?.slug)
    .map((c) => ({ c, count: district ? (facets.byDistrictCategory.get(`${district.slug}/${c.slug}`) ?? 0) : (facets.byCategory.get(c.slug) ?? 0) }))
    .filter(({ count }) => isLandingIndexable(district ? 'districtCategory' : 'cityCategory', count))
    .map(({ c, count }) => ({ label: district ? `${district.name} ${c.name}` : `${city.name} ${c.name}`, path: landingPath(city, district, c.slug), detail: countLabel(lang, count) }));
  if (services.length) {
    blocks.push({
      kind: 'links',
      title: category ? pick(lang, `${placeLoc} diğer hizmetler`, `Other services in ${place}`) : pick(lang, `${placeLoc} hizmetler`, `Services in ${place}`),
      items: services,
    });
  }

  if (!category) {
    // Other districts of the city.
    const districts: BlockLink[] = city.districts
      .filter((d) => d.slug !== district?.slug)
      .map((d) => ({ d, count: facets.byDistrict.get(d.slug) ?? 0 }))
      .filter(({ count }) => isLandingIndexable('district', count))
      .map(({ d, count }) => ({ label: d.name, path: districtPath(city, d), detail: countLabel(lang, count) }));
    if (districts.length) {
      blocks.push({ kind: 'links', title: district ? pick(lang, 'Diğer semtler', 'Other areas') : pick(lang, 'Semte göre keşfet', 'Browse by area'), items: districts });
    }
  }
  return blocks;
}

function priceTable(input: LandingInput, listed: ListingBusiness[]): Block | null {
  const { lang, district, city, category } = input;
  const rows = aggregateServicePrices(listed);
  if (!rows.length) return null;
  const place = district?.name ?? city.name;
  const several = listed.length > 1;
  return {
    kind: 'table',
    title: category ? pick(lang, `${place} ${lowerTr(category.name)} fiyatları`, `${category.name} prices in ${place}`) : pick(lang, `${locativeTr(place)} hizmetler ve fiyatlar`, `Services and prices in ${place}`),
    head: several ? [pick(lang, 'Hizmet', 'Service'), pick(lang, 'Fiyat', 'Price'), pick(lang, 'İşletme', 'Businesses')] : [pick(lang, 'Hizmet', 'Service'), pick(lang, 'Fiyat', 'Price')],
    rows: rows.map((row) => (several ? [row.name, formatPriceRange(row.min, row.max, lang), String(row.businesses)] : [row.name, formatPriceRange(row.min, row.max, lang)])),
    note: pick(
      lang,
      'Fiyatlar, bu sayfada listelenen işletmelerin Rango’daki güncel hizmet listelerinden alınır; kesin fiyat işletmenin sayfasında yazar.',
      'Prices come from the current service lists of the businesses on this page; the exact price is on each business page.',
    ),
  };
}

function faqItems(input: LandingInput, listed: ListingBusiness[]): FaqItem[] {
  const { lang, city, district, category } = input;
  const items: FaqItem[] = [];
  const place = district?.name ?? city.name;
  const placeLoc = locativeTr(place);
  const n = listed.length;

  if (category && n) {
    const nameLower = lang === 'en' ? category.name.toLowerCase() : lowerTr(category.name);
    const prices = listed.flatMap((b) => b.services.map((s) => Number(s.price))).filter((p) => Number.isFinite(p) && p > 0);
    if (prices.length) {
      const range = formatPriceRange(Math.min(...prices), Math.max(...prices), lang);
      items.push({
        q: pick(lang, `${place} ${nameLower} fiyatları ne kadar?`, `How much does ${nameLower} cost in ${place}?`),
        a: pick(
          lang,
          `Rango’da ${placeLoc} listelenen ${n} ${nameLower} işletmesinde hizmet fiyatları ${range} aralığında. Her hizmetin güncel fiyatı işletmenin sayfasındaki hizmet listesinde yazar.`,
          `At the ${countLabel(lang, n)} listed for ${nameLower} in ${place} on Rango, service prices range ${range}. The current price of each service is on the business page.`,
        ),
      });
    }
    const withHours = listed.filter((b) => (b.working_hours ?? []).length > 0);
    if (withHours.length === n) {
      const sunday = openOnWeekday(listed, 7);
      items.push({
        q: pick(lang, `${placeLoc} pazar günü açık ${nameLower} var mı?`, `Is there ${nameLower} open on Sundays in ${place}?`),
        a: sunday.length
          ? pick(
              lang,
              `Evet. Çalışma saatlerine göre ${joinList(lang, sunday.slice(0, 5).map((b) => b.name))} pazar günü de açık. Güncel saatler işletmenin sayfasında yer alır.`,
              `Yes. According to their opening hours, ${joinList(lang, sunday.slice(0, 5).map((b) => b.name))} ${sunday.length === 1 ? 'is' : 'are'} also open on Sundays. Current hours are on the business page.`,
            )
          : pick(
              lang,
              `Rango’da ${placeLoc} listelenen ${nameLower} işletmeleri çalışma saatlerine göre pazar günü kapalı. Güncel saatler işletmenin sayfasında yer alır.`,
              `According to their opening hours, the businesses listed for ${nameLower} in ${place} are closed on Sundays. Current hours are on the business page.`,
            ),
      });
    }
  }
  return [...items, ...bookingFaqItems(lang)];
}

export function buildLandingPage(input: LandingInput): LandingModel {
  const { lang, city, district, category } = input;
  const scope = { district, categorySlug: category?.slug };
  const kind = landingKind(scope);
  const path = landingPath(city, district, category?.slug);
  const inScope = filterByScope(city, input.businesses, scope);
  const listed = sortForListing(inScope.filter(isBookable));
  const samples = listed.length ? [] : sortForListing(inScope.filter((b) => isSampleBusiness(b) && b.services.length > 0)).slice(0, MAX_SAMPLES);
  const facets = buildFacets(city, input.businesses);
  const indexable = isLandingIndexable(kind, listed.length);
  const copy = copyFor(input, kind, listed);
  const labelOf = (b: ListingBusiness) => input.categories.find((c) => c.slug === b.categories?.slug)?.name;
  const summary = (b: ListingBusiness) => toSummary(b, lang, { categoryLabel: labelOf(b), supabaseUrl: input.supabaseUrl });
  const place = district?.name ?? city.name;

  const searchParams = new URLSearchParams();
  if (category) searchParams.set('kategori', category.slug);
  if (district) searchParams.set('q', district.name);
  const query = searchParams.toString();
  const searchPath = `/ara${query ? `?${query}` : ''}`;

  const blocks: Block[] = [
    { kind: 'breadcrumb', items: breadcrumb(input) },
    {
      kind: 'hero',
      eyebrow: copy.eyebrow,
      title: copy.h1,
      lead: copy.lead,
      actions: listed.length > 1 ? [{ label: pick(lang, 'Fiyata, puana veya mesafeye göre sırala', 'Sort by price, rating or distance'), path: searchPath }] : undefined,
    },
  ];

  if (listed.length) {
    blocks.push({
      kind: 'businesses',
      title: copy.listTitle,
      text: listed.length > MAX_LISTED ? pick(lang, `En çok tercih edilen ${MAX_LISTED} işletme gösteriliyor.`, `Showing the ${MAX_LISTED} most popular businesses.`) : undefined,
      items: listed.slice(0, MAX_LISTED).map(summary),
    });
  } else if (samples.length) {
    blocks.push({
      kind: 'businesses',
      title: pick(lang, 'Örnek işletmeler', 'Sample businesses'),
      text: pick(
        lang,
        'Aşağıdakiler, Rango’nun nasıl çalıştığını göstermek için hazırlanmış örnek işletmelerdir; hizmet ve fiyat bilgileri temsilidir, randevu alınamaz.',
        'These are sample businesses created to show how Rango works; their services and prices are illustrative and they cannot be booked.',
      ),
      items: samples.map(summary),
    });
  }

  const table = priceTable(input, listed);
  if (table) blocks.push(table);
  blocks.push(...siblingBlocks(input, facets));
  blocks.push(howItWorksBlock(lang));
  const questions = faqItems(input, listed);
  blocks.push({ kind: 'faq', title: pick(lang, 'Sık sorulan sorular', 'Frequently asked questions'), items: questions });
  blocks.push(ownerCtaBlock(lang, place));

  const meta: PageMeta = {
    title: copy.title,
    description: copy.description,
    path,
    noindex: !indexable,
    jsonLd: [
      breadcrumbSchema(breadcrumb(input)),
      ...(listed.length ? [itemListSchema(copy.listTitle, listed.slice(0, MAX_LISTED).map((b) => ({ name: b.name, path: `/i/${b.slug}` })))] : []),
      ...(indexable ? [faqSchema(questions)] : []),
    ],
  };

  return { kind, path, count: listed.length, indexable, meta, blocks };
}
