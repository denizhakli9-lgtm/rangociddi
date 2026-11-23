/**
 * SEO metinleri ve yapısal veri (schema.org).
 *
 * Bu dosya hem tarayıcıda (bkz. `useSeo.ts`) hem de derleme sırasında statik sayfaları
 * üreten Vite eklentisinde (`seo/prerender.ts`) kullanılır. Bu yüzden yalnızca göreli
 * import içerir ve tarayıcıya özgü hiçbir şeye (window, document, `@/` takma adı) dokunmaz.
 */
import { COMPANY, LEGAL_LINKS, type LegalSlug } from '../legal';

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
 * owner) that already list at least one service. An empty profile is a thin page that
 * would only weaken the site in search results; it becomes indexable once services are added.
 */
export function isIndexableBusiness(b: SeoBusiness, services: SeoService[]): boolean {
  return b.owner_id !== null && services.length > 0;
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
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}/ara?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
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

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function businessPath(slug: string): string {
  return `/i/${slug}`;
}

export function categoryPath(slug: string): string {
  return `/ara?kategori=${encodeURIComponent(slug)}`;
}

export function localBusinessSchema(b: SeoBusiness, services: SeoService[] = [], hours: SeoHours[] = []): Record<string, unknown> {
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
  if (b.cover_url && /^https:\/\//i.test(b.cover_url)) schema.image = b.cover_url;
  if (b.latitude != null && b.longitude != null) {
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

const DEFAULT_TITLE: Record<SeoLang, string> = {
  tr: 'Rango | Randevunun yeni yolu.',
  en: 'Rango | The new way to book.',
};

export function homeMeta(lang: SeoLang): PageMeta {
  return {
    title: pick(lang, 'Rango | İzmir Online Kuaför, Berber ve Güzellik Randevusu', 'Rango | Book Hair, Barber & Beauty Appointments in İzmir'),
    description: pick(
      lang,
      'İzmir’de kuaför, berber, güzellik merkezi, spa ve cilt bakımı için online randevu. Hizmetleri ve fiyatları karşılaştırın, uygun saati seçin, yerinizi saniyeler içinde ayırtın.',
      'Book hair salons, barbers, beauty salons, spas and skin care in İzmir online. Compare services and prices, pick a time and secure your spot in seconds.',
    ),
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

export function searchMeta(lang: SeoLang, options: { category?: SeoCategory | null; filtered?: boolean } = {}): PageMeta {
  const { category, filtered } = options;
  if (category) {
    const detail = category.description?.trim();
    return {
      title: pick(lang, `İzmir ${category.name} Randevusu | Rango`, `${category.name} in İzmir: Book Online | Rango`),
      description: clip(
        pick(
          lang,
          `İzmir’de ${category.name.toLocaleLowerCase('tr-TR')} için online randevu alın.${detail ? ` ${detail}.` : ''} İşletmeleri, fiyatları ve boş saatleri görün; yerinizi Rango ile ayırtın.`,
          `Book ${category.name.toLowerCase()} appointments in İzmir online.${detail ? ` ${detail}.` : ''} See businesses, prices and free times, and secure your spot with Rango.`,
        ),
      ),
      path: categoryPath(category.slug),
      noindex: filtered,
      jsonLd: [
        breadcrumbSchema([
          { name: SITE_NAME, path: '/' },
          { name: pick(lang, 'Kategoriler', 'Categories'), path: '/kategoriler' },
          { name: category.name, path: categoryPath(category.slug) },
        ]),
      ],
    };
  }
  return {
    title: pick(lang, 'İzmir’de Kuaför, Berber ve Güzellik Merkezleri | Rango', 'Hair Salons, Barbers & Beauty Salons in İzmir | Rango'),
    description: pick(
      lang,
      'İzmir’deki kuaför, berber, güzellik merkezi ve spa işletmelerini arayın; fiyata, puana ve mesafeye göre sıralayın, online randevunuzu hemen oluşturun.',
      'Search hair salons, barbers, beauty salons and spas in İzmir; sort by price, rating and distance, and book online right away.',
    ),
    path: '/ara',
    noindex: filtered,
  };
}

export function businessMeta(
  lang: SeoLang,
  b: SeoBusiness,
  services: SeoService[] = [],
  hours: SeoHours[] = [],
  /** Category name in the page's language (the database stores the Turkish one). */
  categoryLabel?: string,
): PageMeta {
  const category = categoryLabel || b.categories?.name || '';
  const place = [b.district, b.city].filter(Boolean).join(', ');
  const titleMiddle = [b.district, category].filter(Boolean).join(' ');
  const indexable = isIndexableBusiness(b, services);
  const intro = b.description?.trim() ? `${b.description.trim().replace(/[.!?]+$/, '')}. ` : '';
  const crumbs = [{ name: SITE_NAME, path: '/' }];
  if (b.categories?.slug && category) crumbs.push({ name: category, path: categoryPath(b.categories.slug) });
  crumbs.push({ name: b.name, path: businessPath(b.slug) });
  return {
    title: clip(`${b.name}${titleMiddle ? ` – ${titleMiddle}` : ''} | ${pick(lang, 'Rango Randevu', 'Book on Rango')}`, 70),
    description: clip(
      pick(
        lang,
        `${intro}${b.name}${place ? ` (${place})` : ''}: hizmetler, fiyatlar ve online randevu Rango’da.`,
        `${intro}${b.name}${place ? ` (${place})` : ''}: services, prices and online booking on Rango.`,
      ),
    ),
    path: businessPath(b.slug),
    noindex: !indexable,
    image: b.cover_url && /^https:\/\//i.test(b.cover_url) ? b.cover_url : undefined,
    jsonLd: indexable ? [localBusinessSchema(b, services, hours), breadcrumbSchema(crumbs)] : [],
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

function privateMeta(lang: SeoLang, path: string, title?: string): PageMeta {
  return {
    title: title ? `${title} | ${SITE_NAME}` : DEFAULT_TITLE[lang],
    description: homeMeta(lang).description,
    path,
    noindex: true,
  };
}

/**
 * Metadata that depends only on the address. Pages with their own data (a business, a
 * category) refine it through `useSeo` once that data has loaded.
 */
export function routeMeta(pathname: string, lang: SeoLang): PageMeta {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/' || path === '/kesfet') return homeMeta(lang);
  if (path === '/kategoriler') return categoriesMeta(lang);
  if (path === '/ara') return searchMeta(lang);
  if (path.startsWith('/yasal/')) return legalMeta(lang, path.slice('/yasal/'.length)) ?? privateMeta(lang, path);
  if (/^\/i\/[^/]+$/.test(path)) {
    // Shown only until the business has loaded; BusinessDetail replaces it.
    return { title: DEFAULT_TITLE[lang], description: homeMeta(lang).description, path };
  }
  if (path === '/giris') {
    return {
      title: pick(lang, 'Giriş Yap | Rango', 'Sign in | Rango'),
      description: pick(lang, 'Rango hesabınıza giriş yapın; randevularınızı yönetin, favori işletmelerinize hızlıca ulaşın.', 'Sign in to your Rango account to manage your bookings and reach your favourite businesses.'),
      path,
    };
  }
  if (path === '/kayit') {
    return {
      title: pick(lang, 'Ücretsiz Hesap Oluştur | Rango', 'Create a free account | Rango'),
      description: pick(
        lang,
        'Rango’ya ücretsiz üye olun, İzmir’deki kuaför, berber ve güzellik merkezlerinden online randevu alın. İşletme sahibiyseniz salonunuzu Rango’ya ekleyin.',
        'Join Rango for free and book hair salons, barbers and beauty salons in İzmir online. Own a business? Add your salon to Rango.',
      ),
      path,
    };
  }
  return privateMeta(lang, path);
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
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
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
