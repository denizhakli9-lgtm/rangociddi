/**
 * SEO metinleri ve yapısal veri (schema.org).
 *
 * Bu dosya hem tarayıcıda (bkz. `useSeo.ts`) hem de derleme sırasında statik sayfaları
 * üreten Vite eklentisinde (`seo/prerender.ts`) kullanılır. Bu yüzden yalnızca göreli
 * import içerir ve tarayıcıya özgü hiçbir şeye (window, document, `@/` takma adı) dokunmaz.
 */
import { COMPANY, LEGAL_LINKS, type LegalSlug } from '../legal';
import { isTestBusiness } from './config';
import { formatPrice } from './format';
import { ALL_DISTRICTS } from '../cities';
import { DEFAULT_CITY, cityCategoryPath, cityPath } from './places';

export const SITE_URL = 'https://rango.com.tr';
export const SITE_NAME = 'Rango';
export const DEFAULT_OG_IMAGE = '/og-image.jpg';

export type SeoLang = 'tr' | 'en';

export interface PageMeta {
  title: string;
  description: string;
  /** Canonical path (with query string if it is part of the page's identity), e.g. `/ara?kategori=kuafor`. */
  path: string;
  /** Private, filtered or placeholder pages: kept out of search results. */
  noindex?: boolean;
  /** Absolute URL or site path of the share image. */
  image?: string;
  jsonLd?: Record<string, unknown>[];
}

export interface SeoCategory {
  slug: string;
  name: string;
  description?: string | null;
}

export interface SeoBusiness {
  name: string;
  slug: string;
  description?: string | null;
  address?: string | null;
  district?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  cover_url?: string | null;
  owner_id?: string | null;
  rating_avg?: number | string | null;
  review_count?: number | null;
  min_price?: number | string | null;
  categories?: { name?: string | null; slug?: string | null } | null;
}

export interface SeoService {
  name: string;
  description?: string | null;
  price: number | string;
  duration_minutes?: number | null;
}

export interface SeoHours {
  weekday: number;
  is_closed: boolean;
  open_time: string;
  close_time: string;
}

export interface SeoReview {
  rating: number;
  comment?: string | null;
  reviewer_name?: string | null;
  created_at?: string | null;
}

export interface BusinessExtras {
  /** The business's own photo as an absolute URL; never a ready-made sector cover. */
  photo?: string;
  /** Published reviews, newest first. */
  reviews?: SeoReview[];
}

const pick = (lang: SeoLang, tr: string, en: string) => (lang === 'en' ? en : tr);

export function absoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${SITE_URL}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`;
}

/** Cuts a text at a word boundary so it fits a search result snippet. */
export function clip(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s.,;:–-]+$/, '')}…`;
}

/**
 * Which business pages search engines may index: real businesses (seeded samples have no
 * owner; test businesses are listed in config.ts) that already list at least one service. An empty profile is a thin page that
 * would only weaken the site in search results; it becomes indexable once services are added.
 */
export function isIndexableBusiness(b: SeoBusiness, services: SeoService[]): boolean {
  return b.owner_id !== null && services.length > 0 && !isTestBusiness(b.slug);
}

// ---------------------------------------------------------------------------
// Structured data
// ---------------------------------------------------------------------------

const ORGANIZATION_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;

export function organizationSchema(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': ORGANIZATION_ID,
    name: SITE_NAME,
    legalName: COMPANY.legalName,
    url: `${SITE_URL}/`,
    logo: absoluteUrl('/icon-512.png'),
    email: COMPANY.email,
    address: { '@type': 'PostalAddress', addressLocality: 'İzmir', addressCountry: 'TR' },
    areaServed: { '@type': 'City', name: 'İzmir' },
  };
}

export function websiteSchema(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    inLanguage: 'tr-TR',
    publisher: { '@id': ORGANIZATION_ID },
  };
}

export function breadcrumbSchema(items: { name: string; path: string }[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function itemListSchema(name: string, paths: { name: string; path: string }[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    numberOfItems: paths.length,
    itemListElement: paths.map((p, i) => ({ '@type': 'ListItem', position: i + 1, name: p.name, url: absoluteUrl(p.path) })),
  };
}

/** Question-and-answer pairs that are visible on the page, as FAQPage structured data. */
export function faqSchema(items: { q: string; a: string }[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
}

const BUSINESS_TYPES: Record<string, string> = {
  kuafor: 'HairSalon',
  berber: 'HairSalon',
  'sac-bakimi': 'HairSalon',
  'guzellik-merkezi': 'BeautySalon',
  'cilt-bakimi': 'BeautySalon',
  'lazer-epilasyon': 'BeautySalon',
  spa: 'DaySpa',
  masaj: 'DaySpa',
  manikur: 'NailSalon',
  pedikur: 'NailSalon',
  dovme: 'TattooParlor',
  'dovme-studyosu': 'TattooParlor',
};

const MAX_SCHEMA_REVIEWS = 5;

/** Same test as `isDistrictCentre` in src/lib/maps.ts. */
function isDistrictCentre(latitude: number, longitude: number): boolean {
  return ALL_DISTRICTS.some(({ district: d }) => Math.abs(d.lat - latitude) < 0.00005 && Math.abs(d.lng - longitude) < 0.00005);
}
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function businessPath(slug: string): string {
  return `/i/${slug}`;
}

/** A category's page: its city landing page (`/izmir/kuafor`). */
export function categoryPath(slug: string): string {
  return cityCategoryPath(DEFAULT_CITY, slug);
}

export function localBusinessSchema(b: SeoBusiness, services: SeoService[] = [], hours: SeoHours[] = [], extras: BusinessExtras = {}): Record<string, unknown> {
  const url = absoluteUrl(businessPath(b.slug));
  const prices = services.map((s) => Number(s.price)).filter((p) => Number.isFinite(p) && p > 0);
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': BUSINESS_TYPES[b.categories?.slug ?? ''] ?? 'HealthAndBeautyBusiness',
    '@id': `${url}#business`,
    name: b.name,
    url,
    currenciesAccepted: 'TRY',
    address: {
      '@type': 'PostalAddress',
      ...(b.address ? { streetAddress: b.address } : {}),
      ...(b.district ? { addressLocality: b.district } : {}),
      addressRegion: b.city || 'İzmir',
      addressCountry: 'TR',
    },
  };
  if (b.description?.trim()) schema.description = clip(b.description, 300);
  if (extras.photo) schema.image = extras.photo;
  // A business created without a map pin is stored with its district's centre; that is not its location.
  if (b.latitude != null && b.longitude != null && !isDistrictCentre(Number(b.latitude), Number(b.longitude))) {
    schema.geo = { '@type': 'GeoCoordinates', latitude: Number(b.latitude), longitude: Number(b.longitude) };
  }
  if (prices.length) {
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    schema.priceRange = min === max ? `₺${min}` : `₺${min} - ₺${max}`;
  }
  const open = hours.filter((h) => !h.is_closed && h.weekday >= 1 && h.weekday <= 7);
  if (open.length) {
    schema.openingHoursSpecification = open.map((h) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: `https://schema.org/${WEEKDAYS[h.weekday - 1]}`,
      opens: h.open_time.slice(0, 5),
      closes: h.close_time.slice(0, 5),
    }));
  }
  const reviews = Number(b.review_count ?? 0);
  const rating = Number(b.rating_avg ?? 0);
  if (reviews > 0 && rating > 0) {
    schema.aggregateRating = { '@type': 'AggregateRating', ratingValue: rating.toFixed(1), reviewCount: reviews, bestRating: 5, worstRating: 1 };
    // Reviews are written on Rango by customers whose appointment was completed (a third-party
    // marketplace's reviews of the business, not the business reviewing itself).
    const written = (extras.reviews ?? []).filter((r) => r.comment?.trim() && r.reviewer_name?.trim() && r.rating >= 1 && r.rating <= 5).slice(0, MAX_SCHEMA_REVIEWS);
    if (written.length) {
      schema.review = written.map((r) => ({
        '@type': 'Review',
        author: { '@type': 'Person', name: r.reviewer_name!.trim() },
        reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5, worstRating: 1 },
        reviewBody: clip(r.comment!, 500),
        ...(r.created_at ? { datePublished: r.created_at.slice(0, 10) } : {}),
      }));
    }
  }
  if (services.length) {
    schema.hasOfferCatalog = {
      '@type': 'OfferCatalog',
      name: 'Hizmetler',
      itemListElement: services.slice(0, 40).map((s) => ({
        '@type': 'Offer',
        price: Number(s.price),
        priceCurrency: 'TRY',
        url,
        itemOffered: { '@type': 'Service', name: s.name, ...(s.description?.trim() ? { description: clip(s.description, 200) } : {}) },
      })),
    };
  }
  return schema;
}

// ---------------------------------------------------------------------------
// Page metadata
// ---------------------------------------------------------------------------

export const DEFAULT_TITLE: Record<SeoLang, string> = {
  tr: 'Rango | Randevunun yeni yolu.',
  en: 'Rango | The new way to book.',
};

/** Keep in step with the tags in index.html (the shell every address starts from). */
export const HOME_TITLE: Record<SeoLang, string> = {
  tr: 'Rango | Online Kuaför, Berber ve Güzellik Randevusu',
  en: 'Rango | Book Hair, Barber & Beauty Appointments Online',
};
export const HOME_DESCRIPTION: Record<SeoLang, string> = {
  tr: 'Rango ile kuaför, berber ve güzellik işletmelerinden online randevu alın. İzmir’deki işletmeleri inceleyin, hizmet ve fiyatları karşılaştırın, saatinizi seçin.',
  en: 'Book hair, barber and beauty businesses online with Rango. Browse businesses in İzmir, compare services and prices, and pick a time that suits you.',
};

export function homeMeta(lang: SeoLang): PageMeta {
  return {
    title: HOME_TITLE[lang],
    description: HOME_DESCRIPTION[lang],
    path: '/',
    jsonLd: [organizationSchema(), websiteSchema()],
  };
}

export function categoriesMeta(lang: SeoLang, categories: SeoCategory[] = []): PageMeta {
  return {
    title: pick(lang, 'Hizmet Kategorileri: Kuaför, Berber, Güzellik, Spa | Rango', 'Categories: Hair, Barber, Beauty, Spa | Rango'),
    description: pick(
      lang,
      'Kuaför, berber, güzellik merkezi, cilt bakımı, masaj, spa, manikür ve lazer epilasyon: İzmir’deki işletmeleri kategoriye göre keşfedin, online randevu alın.',
      'Hair salons, barbers, beauty salons, skin care, massage, spa, nails and laser hair removal: browse businesses in İzmir by category and book online.',
    ),
    path: '/kategoriler',
    jsonLd: [
      breadcrumbSchema([
        { name: SITE_NAME, path: '/' },
        { name: pick(lang, 'Kategoriler', 'Categories'), path: '/kategoriler' },
      ]),
      ...(categories.length
        ? [itemListSchema(pick(lang, 'Hizmet kategorileri', 'Service categories'), categories.map((c) => ({ name: c.name, path: categoryPath(c.slug) })))]
        : []),
    ],
  };
}

/**
 * The search page is a tool, not a destination: every variant of it (plain, searched, filtered,
 * sorted, by category) carries "noindex". The pages meant for search engines are the city,
 * district and category pages (`/izmir/...`, see pages/landing.ts).
 */
export function searchMeta(lang: SeoLang, options: { category?: SeoCategory | null } = {}): PageMeta {
  const { category } = options;
  if (category) {
    return {
      title: pick(lang, `${category.name} işletmeleri: ara ve filtrele | Rango`, `${category.name}: search and filter | Rango`),
      description: clip(
        pick(
          lang,
          `İzmir’deki ${category.name.toLocaleLowerCase('tr-TR')} işletmelerini fiyata, puana ve mesafeye göre filtreleyin; online randevunuzu Rango ile alın.`,
          `Filter ${category.name.toLowerCase()} businesses in İzmir by price, rating and distance, and book online with Rango.`,
        ),
      ),
      path: `/ara?kategori=${encodeURIComponent(category.slug)}`,
      noindex: true,
    };
  }
  return {
    title: pick(lang, 'İşletme Ara | Rango', 'Search businesses | Rango'),
    description: pick(
      lang,
      'İzmir’deki kuaför, berber, güzellik merkezi ve spa işletmelerini arayın; fiyata, puana ve mesafeye göre sıralayın, online randevunuzu hemen oluşturun.',
      'Search hair salons, barbers, beauty salons and spas in İzmir; sort by price, rating and distance, and book online right away.',
    ),
    path: '/ara',
    noindex: true,
  };
}

export function businessMeta(
  lang: SeoLang,
  b: SeoBusiness,
  services: SeoService[] = [],
  hours: SeoHours[] = [],
  /** Category name in the page's language (the database stores the Turkish one). */
  categoryLabel?: string,
  extras: BusinessExtras = {},
): PageMeta {
  const category = categoryLabel || b.categories?.name || '';
  const place = [b.district, b.city].filter(Boolean).join(', ');
  const indexable = isIndexableBusiness(b, services);
  const crumbs = [
    { name: SITE_NAME, path: '/' },
    { name: DEFAULT_CITY.name, path: cityPath(DEFAULT_CITY) },
  ];
  if (b.categories?.slug && category) crumbs.push({ name: category, path: categoryPath(b.categories.slug) });
  crumbs.push({ name: b.name, path: businessPath(b.slug) });

  // Title: the fullest form that fits a search result; optional parts are dropped, never cut mid-word.
  const brand = pick(lang, 'Rango Randevu', 'Book on Rango');
  const lowerName = b.name.toLocaleLowerCase('tr-TR');
  const categoryPart = category && !lowerName.includes(category.toLocaleLowerCase('tr-TR')) ? category : '';
  const districtPart = b.district && !lowerName.includes(b.district.toLocaleLowerCase('tr-TR')) ? b.district : '';
  const title =
    [
      `${b.name} – ${[districtPart, categoryPart].filter(Boolean).join(' ')} | ${brand}`,
      `${b.name} – ${districtPart} | ${brand}`,
      `${b.name} | ${brand}`,
    ].find((candidate) => !candidate.includes('–  |') && !candidate.includes('– |') && candidate.length <= 60) ?? `${clip(b.name, 50)} | ${SITE_NAME}`;

  // Description: the business's own text when it has one, otherwise what it offers.
  const about = b.description?.trim() ? `${b.description.trim().replace(/[.!?]+$/, '')}. ` : '';
  const names = services.slice(0, 3).map((service) => service.name.trim()).filter(Boolean);
  const prices = services.map((service) => Number(service.price)).filter((p) => Number.isFinite(p) && p > 0);
  const offer =
    !about && names.length
      ? pick(
          lang,
          ` ${names.join(', ')}${services.length > names.length ? ' ve diğer hizmetler' : ''}.${prices.length ? ` En düşük hizmet fiyatı ${formatPrice(Math.min(...prices), lang)}.` : ''}`,
          ` ${names.join(', ')}${services.length > names.length ? ' and more' : ''}.${prices.length ? ` Prices start at ${formatPrice(Math.min(...prices), lang)}.` : ''}`,
        )
      : '';
  const who = `${b.name}${place ? ` (${place})` : ''}`;
  return {
    title,
    description: clip(
      offer
        ? pick(lang, `${who}:${offer} Online randevu Rango’da.`, `${who}:${offer} Book online on Rango.`)
        : pick(lang, `${about}${who}: hizmetler, fiyatlar ve online randevu Rango’da.`, `${about}${who}: services, prices and online booking on Rango.`),
    ),
    path: businessPath(b.slug),
    noindex: !indexable,
    image: extras.photo,
    jsonLd: indexable ? [localBusinessSchema(b, services, hours, extras), breadcrumbSchema(crumbs)] : [],
  };
}

const LEGAL_DESCRIPTIONS: Record<LegalSlug, string> = {
  'aydinlatma-metni': 'Rango’nun 6698 sayılı KVKK kapsamında müşteri, işletme sahibi ve ziyaretçilerin kişisel verilerini nasıl işlediğini açıklayan aydınlatma metni.',
  'kullanim-kosullari': 'Rango online randevu platformunun kullanım koşulları: müşteri ve işletme hesapları, randevu, kapora ve sorumluluklar.',
  'cerez-politikasi': 'Rango reklam veya analitik çerezi kullanmaz. Tarayıcı depolama alanının hangi amaçlarla kullanıldığını açıklayan çerez politikası.',
  'satis-sozlesmesi': 'Kapora ödemeli randevularda müşteri, hizmet sağlayıcı işletme ve Rango arasındaki mesafeli hizmet satış sözleşmesi ve satış onayı.',
  'iptal-iade': 'Rango üzerinden alınan kapora ödemeli randevularda iptal, erteleme, cayma hakkı ve iade kuralları.',
  'kvkk-basvuru': 'KVKK md. 11 kapsamındaki haklarınızı kullanmak için Rango’ya başvuru yöntemleri ve başvuru şablonu.',
  'hesap-silme': 'Rango hesabınızı uygulamadan veya web sitesinden nasıl sileceğiniz, hangi verilerin silindiği ve hangilerinin ne kadar süre saklandığı.',
  kunye: 'Rango’nun hizmet sağlayıcı bilgileri: şirket unvanı, adres, vergi numarası ve iletişim.',
};

export function legalMeta(lang: SeoLang, slug: string): PageMeta | null {
  const link = LEGAL_LINKS.find((l) => l.slug === slug);
  if (!link) return null;
  return {
    title: `${pick(lang, link.label, link.labelEn)} | ${SITE_NAME}`,
    description: LEGAL_DESCRIPTIONS[link.slug],
    path: `/yasal/${link.slug}`,
  };
}

// ---------------------------------------------------------------------------
// <head> rendering for the prerendered pages
// ---------------------------------------------------------------------------

export const ROBOTS_INDEX = 'index, follow, max-image-preview:large, max-snippet:-1';
export const ROBOTS_NOINDEX = 'noindex, follow';

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** JSON that is safe inside a <script> element. */
export function jsonLdText(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

/** The route-specific <head> tags, as written into the prerendered HTML files. */
export function renderHead(meta: PageMeta, lang: SeoLang = 'tr'): string {
  const url = absoluteUrl(meta.path);
  const image = absoluteUrl(meta.image ?? DEFAULT_OG_IMAGE);
  const title = escapeHtml(meta.title);
  const description = escapeHtml(meta.description);
  const tags = [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<meta name="robots" content="${meta.noindex ? ROBOTS_NOINDEX : ROBOTS_INDEX}" />`,
    ...(meta.noindex ? [] : [`<link rel="canonical" href="${escapeHtml(url)}" />`]),
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:locale" content="${lang === 'en' ? 'en_GB' : 'tr_TR'}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
    ...(meta.jsonLd ?? []).map((data) => `<script type="application/ld+json">${jsonLdText(data)}</script>`),
  ];
  return tags.join('\n    ');
}
