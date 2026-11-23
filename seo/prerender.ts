/**
 * SEO derleme eklentisi.
 *
 * Rango tek sayfalık bir uygulamadır: sunucu her adres için aynı boş index.html dosyasını
 * verir, içerik JavaScript ile sonradan gelir. Arama motorları ve bağlantı önizlemeleri
 * (WhatsApp, Instagram, X) bu yüzden her sayfada aynı başlığı görür ya da hiç içerik görmez.
 *
 * Bu eklenti `npm run build` sonunda:
 *  - dizine girmesi istenen her sayfa için `dist/_seo/` altına, kendi başlığı, açıklaması,
 *    canonical adresi, paylaşım etiketleri, yapısal verisi (schema.org) ve okunabilir metni
 *    olan bir HTML dosyası yazar. `.htaccess` bu dosyaları asıl adreslerinde sunar
 *    (`/izmir/berber` → `_seo/izmir/berber.html`); uygulama açılınca sayfanın yerini alır.
 *  - sayfanın verisini HTML'e gömer (`<script type="application/json" id="rango-data">`);
 *    uygulama ilk çiziminde bu veriyi kullanır, böylece statik sayfa bir "yükleniyor"
 *    ekranıyla değişmez. Veri her zaman arka planda Supabase'den yenilenir.
 *  - `dist/sitemap.xml` dosyasını üretir.
 *
 * Şehir / semt / kategori sayfaları, SSS ve "İşletmeler için" sayfaları uygulamadakiyle aynı
 * sayfa modelinden (`src/lib/seo/pages`) üretilir; statik sayfa ile uygulama birebir aynıdır.
 *
 * Kategoriler ve işletmeler derleme anında Supabase'den (herkese açık anahtarla, ziyaretçinin
 * gördüğü verinin aynısı) okunur. Supabase'e ulaşılamazsa derleme durmaz; yalnızca veri
 * gerektirmeyen sayfalar üretilir. Yeni bir işletmenin kendi statik sayfası ve sitemap kaydı
 * bir sonraki derlemede oluşur; o zamana kadar sayfa yine çalışır ve Google onu JavaScript'i
 * çalıştırarak okuyabilir.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Plugin } from 'vite';
import { LEGAL_LINKS, PAYMENT_PROVIDER, COMPANY } from '../src/lib/legal';
import { BLOCK_STYLES as S } from '../src/lib/seo/blockStyles';
import type { Block, PageModel } from '../src/lib/seo/blocks';
import { buildFacets, formatPrice, isBookable, isLandingIndexable, sortForListing, toSummary, type ListingBusiness } from '../src/lib/seo/listing';
import {
  SITE_URL,
  absoluteUrl,
  businessMeta,
  businessPath,
  categoriesMeta,
  categoryPath,
  escapeHtml,
  homeMeta,
  isIndexableBusiness,
  itemListSchema,
  jsonLdText,
  legalMeta,
  renderHead,
  searchMeta,
  type PageMeta,
  type SeoCategory,
  type SeoHours,
  type SeoReview,
  type SeoService,
} from '../src/lib/seo/meta';
import { siteLinks } from '../src/lib/seo/pages/common';
import { faqPage } from '../src/lib/seo/pages/faq';
import { forBusinessPage } from '../src/lib/seo/pages/forBusiness';
import { homeExtraBlocks, homeFaqSchema } from '../src/lib/seo/pages/home';
import { buildLandingPage } from '../src/lib/seo/pages/landing';
import { DEFAULT_CITY, cityPath } from '../src/lib/seo/places';
import { LISTING_SELECT, MAX_EMBEDDED_LISTING, PUBLIC_BUSINESS_FIELDS, PUBLIC_REVIEW_FIELDS } from '../src/lib/seo/queries';
import { leadPhoto } from '../src/lib/sectorCovers';
import { renderBlocks } from './renderBlocks';

type Row = Record<string, unknown>;

type CategoryRow = SeoCategory & Row;

/** A business with everything its own page shows (same columns as the app's queries). */
interface DetailRow extends ListingBusiness {
  gallery?: (string | null)[] | null;
  cancellation_hours?: number | null;
  services: (SeoService & { is_active: boolean; sort_order: number })[];
  employees: { full_name: string; title?: string | null }[];
  working_hours: SeoHours[];
  reviews: (SeoReview & { service_name?: string | null; owner_reply?: string | null })[];
}

interface SiteData {
  categories: CategoryRow[];
  /** The city's approved businesses exactly as the app's listing query returns them (embedded in pages). */
  listingRows: Row[];
  /** The same businesses with only their active services, as the page models expect them. */
  listing: ListingBusiness[];
  /** Businesses that get their own static page, by slug. */
  details: DetailRow[];
}

/** What a page hands to the app for its first render (see src/lib/prerenderData.ts). */
interface Embedded {
  categories?: Row[];
  listing?: { city: string; businesses: Row[] };
  business?: Row;
}

interface Page {
  /** File under dist/_seo, without ".html"; also the address it is served at. */
  file: string;
  meta: PageMeta;
  body: string;
  data?: Embedded;
}

const HEAD_START = '<!--seo:start-->';
const HEAD_END = '<!--seo:end-->';
const ROOT = '<div id="root"></div>';
const WEEKDAYS_TR = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
const e = escapeHtml;

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

async function fetchRows<T>(rest: string, key: string, table: string, params: Record<string, string>): Promise<T[]> {
  const query = new URLSearchParams(params);
  const response = await fetch(`${rest}/${table}?${query.toString()}`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`${table}: ${response.status} ${response.statusText}`);
  const rows: unknown = await response.json();
  if (!Array.isArray(rows)) throw new Error(`${table}: beklenmeyen yanıt`);
  return rows as T[];
}

/** PostgREST does not accept the spaces the app's readable select strings contain. */
const compact = (select: string) => select.replace(/\s+/g, '');

async function loadSiteData(supabaseUrl: string, key: string): Promise<SiteData | null> {
  const rest = `${supabaseUrl.replace(/\/+$/, '')}/rest/v1`;
  try {
    const [categories, listingRows, detailRows] = await Promise.all([
      fetchRows<CategoryRow>(rest, key, 'categories', { select: '*', is_active: 'eq.true', order: 'sort_order' }),
      fetchRows<ListingBusiness & Row>(rest, key, 'businesses', { select: compact(LISTING_SELECT), status: 'eq.approved', city: `eq.${DEFAULT_CITY.name}`, order: 'name', limit: '1000' }),
      fetchRows<DetailRow>(rest, key, 'businesses', {
        select: compact(`${PUBLIC_BUSINESS_FIELDS}, services(*), employees(*, employee_services(service_id)), working_hours(*), reviews(${PUBLIC_REVIEW_FIELDS})`),
        status: 'eq.approved',
        owner_id: 'not.is.null',
        'services.is_active': 'eq.true',
        'services.order': 'sort_order',
        'employees.is_active': 'eq.true',
        'employees.order': 'sort_order',
        'working_hours.order': 'weekday',
        'reviews.is_hidden': 'eq.false',
        'reviews.order': 'created_at.desc',
        'reviews.limit': '20',
        order: 'name',
        limit: '1000',
      }),
    ]);
    const activeServices = <T extends { services?: (SeoService & { is_active?: boolean; sort_order?: number })[] }>(b: T) =>
      (b.services ?? []).filter((s) => s.is_active !== false).sort((a, z) => (a.sort_order ?? 0) - (z.sort_order ?? 0));
    return {
      categories,
      listingRows,
      listing: listingRows.map((b) => ({ ...b, services: activeServices(b) })),
      details: detailRows.filter((b) => isIndexableBusiness(b, b.services ?? [])),
    };
  } catch (error) {
    console.warn(`[rango] SEO: Supabase verisi okunamadı (${error instanceof Error ? error.message : String(error)}); yalnızca veri gerektirmeyen sayfalar üretiliyor.`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Static page bodies
// ---------------------------------------------------------------------------

/** The static page frame: the app's header and footer, with the page's content in between. */
function shell(content: string): string {
  const site = siteLinks('tr')
    .map((l) => `<a href="${e(l.path)}" class="transition hover:text-white">${e(l.label)}</a>`)
    .join('');
  const legal = LEGAL_LINKS.map((l) => `<a href="/yasal/${l.slug}" class="transition hover:text-white">${e(l.label)}</a>`).join('');
  return `<div class="min-h-screen bg-ink">
      <header class="sticky top-0 z-40 border-b border-line-soft bg-ink/85 backdrop-blur-xl">
        <div class="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <a href="/" aria-label="Rango ana sayfa" class="font-display text-2xl font-semibold tracking-wide text-white">Rango<span class="text-gold-500">.</span></a>
          <nav class="flex items-center gap-1" aria-label="Ana menü">
            <a href="/kategoriler" class="rounded-full px-4 py-2 text-sm text-mist hover:text-white">Kategoriler</a>
            <a href="/ara" class="hidden rounded-full px-4 py-2 text-sm text-mist hover:text-white md:flex">İşletmeler</a>
            <a href="/giris" class="rounded-full bg-gold-500 px-4 py-1.5 text-xs font-semibold text-ink">Giriş Yap</a>
          </nav>
        </div>
      </header>
      <main class="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6">
        ${content}
        <footer class="mt-16 border-t border-line-soft pt-6 text-xs text-mist-2">
          <nav aria-label="Site bağlantıları" class="flex flex-wrap gap-x-5 gap-y-2 text-mist">${site}</nav>
          <nav aria-label="Yasal bağlantılar" class="mt-3 flex flex-wrap gap-x-5 gap-y-2">${legal}</nav>
          <p class="mt-4 leading-relaxed">${e(PAYMENT_PROVIDER.disclosure)} <a href="${e(PAYMENT_PROVIDER.website)}" target="_blank" rel="noopener noreferrer" class="underline underline-offset-2">${e(
            PAYMENT_PROVIDER.website.replace('https://', ''),
          )}</a></p>
          <p class="mt-2 text-mist-3">© ${new Date().getFullYear()} ${e(COMPANY.legalName)}. Tüm hakları saklıdır.</p>
        </footer>
      </main>
    </div>`;
}

const blockPage = (blocks: Block[]) => shell(renderBlocks(blocks));

function categoryLinks(categories: SeoCategory[]): string {
  if (!categories.length) return '';
  const items = categories
    .map(
      (c) => `<li><a href="${e(categoryPath(c.slug))}" class="card block p-5 transition hover:border-gold-500/40">
              <h3 class="font-display text-2xl text-white">${e(c.name)}</h3>
              ${c.description ? `<p class="mt-1 text-xs text-mist-2">${e(c.description)}</p>` : ''}
            </a></li>`,
    )
    .join('');
  return `<ul class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">${items}</ul>`;
}

/** Real, bookable businesses as cards (the same card the city and category pages use). */
function businessList(title: string, businesses: ListingBusiness[], supabaseUrl: string): string {
  if (!businesses.length) return '';
  return renderBlocks([{ kind: 'businesses', title, items: businesses.map((b) => toSummary(b, 'tr', { supabaseUrl })) }]);
}

function homeBody(data: SiteData | null, supabaseUrl: string): string {
  const bookable = data ? sortForListing(data.listing.filter(isBookable)) : [];
  const extras = homeExtraBlocks({ lang: 'tr', city: DEFAULT_CITY, categories: data?.categories ?? [], businesses: data?.listing ?? null });
  return shell(`<div class="space-y-8 sm:space-y-10">
        <section class="rounded-3xl border border-gold-500/20 bg-gradient-to-br from-coal via-coal-2 to-gold-500/10 px-5 py-7 sm:px-10 sm:py-10">
          <p class="eyebrow mb-3">İzmir · Online randevu</p>
          <h1 class="max-w-lg font-display text-[36px] leading-[1.2] tracking-tight text-white sm:text-6xl">Randevunun yeni yolu.</h1>
          <p class="mt-3 max-w-md text-sm leading-relaxed text-mist sm:text-base">İzmir’de kuaför, berber, güzellik merkezi ve spa randevunu online al: aradığın hizmeti keşfet, sana en uygun zamanı seç.</p>
          <p class="mt-6"><a href="${e(cityPath(DEFAULT_CITY))}" class="inline-flex h-11 items-center rounded-xl bg-gold-500 px-4 text-sm font-semibold text-ink">İşletmeleri keşfet</a></p>
        </section>
        ${data?.categories.length ? `<section aria-label="Hizmet kategorileri"><h2 class="font-display text-3xl text-white">Bugün neye ihtiyacın var?</h2>${categoryLinks(data.categories)}</section>` : ''}
        ${businessList('Rango’daki işletmeler', bookable.slice(0, 12), supabaseUrl)}
        ${renderBlocks(extras)}
      </div>`);
}

function categoriesBody(data: SiteData | null): string {
  return shell(`<p class="eyebrow mb-2">Kategoriler</p>
        <h1 class="font-display text-4xl text-white">Size iyi gelecek her şey</h1>
        <p class="mt-2 max-w-xl text-sm text-mist">Kadın ve erkek müşterilere özel hizmet veren seçkin işletmeleri kategoriye göre keşfedin.</p>
        ${categoryLinks(data?.categories ?? [])}`);
}

function searchBody(data: SiteData | null, supabaseUrl: string): string {
  const bookable = data ? sortForListing(data.listing.filter(isBookable)) : [];
  return shell(`<p class="eyebrow mb-2">Keşfet</p>
        <h1 class="font-display text-4xl text-white">Tüm işletmeler</h1>
        <div class="mt-6">${businessList('', bookable, supabaseUrl)}</div>
        <p class="mt-8 text-sm text-mist"><a href="/kategoriler" class="text-gold-500">Tüm kategoriler</a></p>`);
}

/** Mirrors the layout of pages/customer/BusinessDetail.tsx so the page does not jump when the app takes over. */
function businessBody(b: DetailRow, supabaseUrl: string): string {
  const photo = leadPhoto(b, supabaseUrl);
  const category = b.categories?.name ?? '';
  const photoAlt = [b.name, [b.district, category].filter(Boolean).join(' ')].filter(Boolean).join(' – ');
  // The street address often already ends with the district ("…, Karşıyaka"); do not repeat it.
  const address = [b.address, b.district, b.city].reduce<string[]>((parts, part) => (part && !parts.some((p) => p.includes(part)) ? [...parts, part] : parts), []).join(', ');
  const crumbs: Block = {
    kind: 'breadcrumb',
    items: [
      { name: 'Rango', path: '/' },
      { name: DEFAULT_CITY.name, path: cityPath(DEFAULT_CITY) },
      ...(b.categories?.slug ? [{ name: category, path: categoryPath(b.categories.slug) }] : []),
      { name: b.name },
    ],
  };
  const reviews = Number(b.review_count ?? 0);
  const services = b.services
    .map(
      (s) => `<div class="flex items-center gap-4 px-5 py-4">
                  <div class="min-w-0 flex-1">
                    <p class="text-[15px] font-medium text-white">${e(s.name)}</p>
                    ${s.description ? `<p class="mt-0.5 line-clamp-2 text-xs text-mist-2">${e(s.description)}</p>` : ''}
                    ${s.duration_minutes ? `<p class="mt-1.5 text-xs text-mist">${s.duration_minutes} dk</p>` : ''}
                  </div>
                  <p class="font-semibold text-white">${e(formatPrice(s.price))}</p>
                </div>`,
    )
    .join('');
  const team = b.employees
    .map((m) => `<li class="card p-4"><p class="font-medium text-white">${e(m.full_name)}</p>${m.title ? `<p class="text-xs text-gold-400">${e(m.title)}</p>` : ''}</li>`)
    .join('');
  const written = b.reviews
    .filter((r) => r.comment?.trim())
    .slice(0, 10)
    .map(
      (r) => `<li class="card p-5"><p class="text-sm font-medium text-white">${e(r.reviewer_name ?? '')} · ${'★'.repeat(Math.max(1, Math.min(5, Math.round(r.rating))))}</p>${
        r.service_name ? `<p class="text-xs text-mist-2">${e(r.service_name)}</p>` : ''
      }<p class="mt-3 text-sm leading-relaxed text-mist">${e(r.comment ?? '')}</p>${
        r.owner_reply ? `<div class="mt-4 rounded-xl border-l-2 border-gold-500 bg-ink/50 px-4 py-3"><p class="text-[11px] font-semibold uppercase tracking-wider text-gold-400">İşletme yanıtı</p><p class="mt-1 text-sm text-mist">${e(r.owner_reply)}</p></div>` : ''
      }</li>`,
    )
    .join('');
  const hours = [1, 2, 3, 4, 5, 6, 7]
    .map((weekday) => {
      const h = b.working_hours.find((x) => x.weekday === weekday);
      return `<li class="flex justify-between text-mist"><span>${WEEKDAYS_TR[weekday - 1]}</span><span>${!h || h.is_closed ? 'Kapalı' : `${h.open_time.slice(0, 5)} – ${h.close_time.slice(0, 5)}`}</span></li>`;
    })
    .join('');

  return shell(`<article class="pb-24 md:pb-0">
          <div class="relative -mx-4 -mt-6 sm:mx-0 sm:mt-0">
            <div class="relative aspect-[4/3] overflow-hidden sm:aspect-[21/9] sm:rounded-3xl sm:border sm:border-gold-500/20">
              <img src="${e(photo.placeholder ? `/${photo.src}` : photo.src)}" alt="${e(photoAlt)}" loading="eager" fetchpriority="high" decoding="async" class="absolute inset-0 h-full w-full object-cover" />
              <div class="absolute inset-0 bg-gradient-to-t from-ink via-ink/20 to-ink/40"></div>
              ${photo.placeholder ? '<span class="pointer-events-none absolute bottom-4 left-4 z-10 inline-flex items-center gap-1 rounded-xl bg-black/85 px-2.5 py-1 text-[10px] font-medium text-white">Temsili görsel</span>' : ''}
            </div>
          </div>
          <div class="mt-6 grid gap-10 lg:grid-cols-[1fr_340px]">
            <div class="min-w-0">
              <div class="mb-4">${renderBlocks([crumbs])}</div>
              ${category ? `<p class="text-[11px] uppercase tracking-[0.2em] text-gold-500">${b.categories?.slug ? `<a href="${e(categoryPath(b.categories.slug))}">${e(category)}</a>` : e(category)}</p>` : ''}
              <h1 class="mt-2 font-display text-4xl text-white sm:text-5xl">${e(b.name)}</h1>
              ${reviews > 0 ? `<p class="mt-3 text-sm text-mist"><span class="font-semibold text-white">★ ${Number(b.rating_avg ?? 0).toFixed(1)}</span> (${reviews} değerlendirme)</p>` : ''}
              ${address ? `<p class="mt-5 rounded-2xl border border-line bg-coal/70 p-4 text-sm leading-relaxed text-white">${e(address)}</p>` : ''}
              ${b.description ? `<p class="mt-5 max-w-2xl text-[15px] leading-relaxed text-mist">${e(b.description)}</p>` : ''}
              <p class="mt-6"><a href="${e(businessPath(b.slug))}/randevu" class="inline-flex h-11 items-center rounded-full bg-gold-500 px-5 text-sm font-semibold text-ink">Randevu Al</a></p>
              ${services ? `<section class="mt-8"><h2 class="${S.sectionTitle}">Hizmetler ve fiyatlar</h2><div class="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-coal">${services}</div></section>` : ''}
              ${team ? `<section class="mt-8"><h2 class="${S.sectionTitle}">Uzmanlar</h2><ul class="mt-4 grid gap-3 sm:grid-cols-2">${team}</ul></section>` : ''}
              ${written ? `<section class="mt-8"><h2 class="${S.sectionTitle}">Değerlendirmeler</h2><ul class="mt-4 space-y-3">${written}</ul></section>` : ''}
              <section class="mt-8 max-w-md"><h2 class="${S.sectionTitle}">Çalışma saatleri</h2><ul class="card mt-4 space-y-2 p-5 text-sm">${hours}</ul></section>
              ${b.cancellation_hours != null ? `<p class="mt-6 text-sm text-mist">Randevuya ${Number(b.cancellation_hours)} saat kalaya kadar ücretsiz iptal ve erteleme.</p>` : ''}
            </div>
          </div>
        </article>`);
}

function legalBody(meta: PageMeta, title: string): string {
  return shell(`<article>
          <h1 class="font-display text-3xl text-white sm:text-4xl">${e(title)}</h1>
          <p class="mt-3 max-w-2xl text-sm leading-relaxed text-mist-2">${e(meta.description)}</p>
        </article>`);
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function sitemap(paths: string[]): string {
  const urls = paths.map((path) => `  <url>\n    <loc>${e(absoluteUrl(path))}</loc>\n  </url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/** The business page's data in the shape the app's own queries produce (see BusinessDetail.tsx). */
function businessPayload(b: DetailRow): Row {
  const { services, employees, working_hours, reviews, ...business } = b as DetailRow & Row;
  return { slug: b.slug, business, services, employees, hours: working_hours, reviews };
}

export function seoPrerender(supabase: { url: string; key: string }): Plugin {
  let root = process.cwd();
  let outDir = 'dist';
  return {
    name: 'rango-seo-prerender',
    apply: 'build',
    configResolved(config) {
      root = config.root;
      outDir = resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      const templateFile = resolve(outDir, 'index.html');
      if (!existsSync(templateFile)) return;
      const template = readFileSync(templateFile, 'utf8');
      const start = template.indexOf(HEAD_START);
      const end = template.indexOf(HEAD_END);
      if (start < 0 || end < start || !template.includes(ROOT)) {
        throw new Error(`[rango] SEO: index.html içinde ${HEAD_START} … ${HEAD_END} işaretleri ya da ${ROOT} bulunamadı.`);
      }

      // Bakım modunda site her adreste bakım ekranını gösterir; yalnızca yasal metinler açıktır.
      const maintenance = /MAINTENANCE_ENABLED\s*=\s*true/.test(readFileSync(resolve(root, 'src/lib/maintenance.ts'), 'utf8'));
      const data = maintenance ? null : await loadSiteData(supabase.url, supabase.key);
      const city = DEFAULT_CITY;
      const pages: Page[] = [];
      const model = (file: string, page: PageModel, embedded?: Embedded): Page => ({ file, meta: page.meta, body: blockPage(page.blocks), data: embedded });

      if (!maintenance) {
        const listing = data && data.listingRows.length <= MAX_EMBEDDED_LISTING ? { listing: { city: city.name, businesses: data.listingRows } } : {};
        const shared: Embedded | undefined = data ? { categories: data.categories, ...listing } : undefined;
        const bookable = data ? sortForListing(data.listing.filter(isBookable)) : [];

        // Home ("/" and its in-app address "/kesfet", whose canonical is "/").
        const home = homeMeta('tr');
        home.jsonLd = [
          ...(home.jsonLd ?? []),
          ...(bookable.length ? [itemListSchema('Rango’daki işletmeler', bookable.slice(0, 12).map((b) => ({ name: b.name, path: businessPath(b.slug) })))] : []),
          homeFaqSchema('tr'),
        ];
        const homeHtml = homeBody(data, supabase.url);
        pages.push({ file: 'index', meta: home, body: homeHtml, data: shared });
        pages.push({ file: 'kesfet', meta: home, body: homeHtml, data: shared });

        pages.push({ file: 'kategoriler', meta: categoriesMeta('tr', data?.categories ?? []), body: categoriesBody(data), data: data ? { categories: data.categories } : undefined });
        pages.push({ file: 'ara', meta: searchMeta('tr'), body: searchBody(data, supabase.url) });
        pages.push(model('sss', faqPage('tr')));
        pages.push(model('isletmeler-icin', forBusinessPage('tr')));

        if (data) {
          // City, district and category pages: only the ones with enough bookable businesses (see INDEX_THRESHOLDS).
          const facets = buildFacets(city, data.listing);
          const input = { lang: 'tr' as const, city, categories: data.categories, businesses: data.listing, supabaseUrl: supabase.url };
          const landings = [buildLandingPage(input)];
          for (const category of data.categories) {
            if (isLandingIndexable('cityCategory', facets.byCategory.get(category.slug) ?? 0)) landings.push(buildLandingPage({ ...input, category }));
          }
          for (const district of city.districts) {
            if (isLandingIndexable('district', facets.byDistrict.get(district.slug) ?? 0)) landings.push(buildLandingPage({ ...input, district }));
            for (const category of data.categories) {
              if (isLandingIndexable('districtCategory', facets.byDistrictCategory.get(`${district.slug}/${category.slug}`) ?? 0)) landings.push(buildLandingPage({ ...input, district, category }));
            }
          }
          for (const landing of landings) {
            if (landing.indexable) pages.push(model(landing.path.slice(1), landing, shared));
          }

          for (const b of data.details) {
            const photo = leadPhoto(b, supabase.url);
            pages.push({
              file: `i/${b.slug}`,
              meta: businessMeta('tr', b, b.services, b.working_hours, undefined, { photo: photo.placeholder ? undefined : photo.src, reviews: b.reviews }),
              body: businessBody(b, supabase.url),
              data: { business: businessPayload(b) },
            });
          }
        }
      }
      for (const link of LEGAL_LINKS) {
        const meta = legalMeta('tr', link.slug)!;
        pages.push({ file: `yasal/${link.slug}`, meta, body: legalBody(meta, link.label) });
      }

      const written: Page[] = [];
      for (const page of pages) {
        // .htaccess yalnızca bu biçimdeki adresleri statik dosyalara eşler.
        if (!/^[a-z0-9]+(?:[/-][a-z0-9]+)*$/.test(page.file)) {
          console.warn(`[rango] SEO: "${page.file}" adresi statik sayfa olarak yazılamadı (yalnızca a-z, 0-9, "-" ve "/" desteklenir).`);
          continue;
        }
        const embedded = page.data ? `<script type="application/json" id="rango-data">${jsonLdText(page.data)}</script>` : '';
        const html =
          template.slice(0, start) +
          `${HEAD_START}\n    ${renderHead(page.meta)}\n    ` +
          template.slice(end).replace(ROOT, () => `<div id="root">${page.body}</div>${embedded}`);
        const file = resolve(outDir, '_seo', `${page.file}.html`);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, html);
        written.push(page);
      }

      // The sitemap lists every page that may be indexed, by its canonical address.
      const paths = [...new Set(written.filter((page) => !page.meta.noindex).map((page) => page.meta.path))];
      writeFileSync(resolve(outDir, 'sitemap.xml'), sitemap(maintenance ? ['/', ...paths] : paths));

      console.info(`[rango] SEO: ${written.length} statik sayfa ve ${paths.length} adresli sitemap.xml üretildi (${SITE_URL}).`);
    },
  };
}
