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
import { buildFacets, formatPrice, isLandingIndexable, type ListingBusiness } from '../src/lib/seo/listing';
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
  jsonLdText,
  legalMeta,
  renderHead,
  type PageMeta,
  type SeoCategory,
  type SeoHours,
  type SeoReview,
  type SeoService,
} from '../src/lib/seo/meta';
import { FAQ_PATH, FOR_BUSINESS_PATH, siteLinks } from '../src/lib/seo/pages/common';
import { faqPage } from '../src/lib/seo/pages/faq';
import { forBusinessPage } from '../src/lib/seo/pages/forBusiness';
import { homeExtraBlocks, homeSchemas, type HomeExtrasInput } from '../src/lib/seo/pages/home';
import { buildLandingPage } from '../src/lib/seo/pages/landing';
import { DEFAULT_CITY, cityPath } from '../src/lib/seo/places';
import { LISTING_SELECT, MAX_EMBEDDED_LISTING, PUBLIC_BUSINESS_FIELDS, PUBLIC_REVIEW_FIELDS } from '../src/lib/seo/queries';
import { leadPhoto } from '../src/lib/sectorCovers';
import { LEGAL_DOCUMENTS, type LegalBlock } from '../src/pages/legal/legalContent';
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
      fetchRows<ListingBusiness & Row>(rest, key, 'businesses', { select: compact(LISTING_SELECT), status: 'eq.approved', city: `eq.${DEFAULT_CITY.name}`, 'services.is_active': 'eq.true', order: 'name', limit: '1000' }),
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

/** The "R" monogram, as drawn by `BrandMark` in src/components/ui/Brand.tsx. */
const BRAND_MARK =
  '<svg viewBox="0 0 64 64" aria-hidden="true" class="h-7 w-7 shrink-0"><rect width="64" height="64" rx="15" fill="#0a0a0a"/><rect x="4.5" y="4.5" width="55" height="55" rx="11" fill="none" stroke="#D4AF37" stroke-opacity="0.35" stroke-width="1.5"/><path d="M22 47V17h11.5a8.5 8.5 0 0 1 0 17H22m11 0l10 13" fill="none" stroke="#D4AF37" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const LOGO = `<span class="inline-flex items-center gap-2.5">${BRAND_MARK}<span class="whitespace-nowrap font-display text-[22px] font-semibold leading-none tracking-[-0.01em] text-white">Rango<span class="text-gold-500">.</span></span></span>`;

/** The static page frame: the app's header and footer (CustomerLayout, SiteFooter), with the page's content in between. */
function shell(content: string): string {
  const menuLink = 'relative flex items-center px-3 text-sm text-mist transition-colors hover:text-white';
  const columnTitle = 'text-[13px] font-semibold text-white';
  const columnLink = 'text-[13px] text-mist transition-colors hover:text-white';
  const column = (label: string, title: string, links: { path: string; label: string }[]) =>
    `<nav aria-label="${e(label)}"><p class="${columnTitle}">${e(title)}</p><ul class="mt-4 space-y-2.5">${links
      .map((l) => `<li><a href="${e(l.path)}" class="${columnLink}">${e(l.label)}</a></li>`)
      .join('')}</ul></nav>`;
  return `<div class="flex min-h-screen flex-col bg-ink">
      <header class="sticky top-0 z-40 border-b border-line-soft bg-ink/90 backdrop-blur-md">
        <div class="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <a href="/" aria-label="Rango ana sayfa" class="shrink-0">${LOGO}</a>
          <nav aria-label="Ana menü" class="hidden h-full items-stretch gap-1 md:flex">
            <a href="/" class="${menuLink}">Keşfet</a>
            <a href="/kategoriler" class="${menuLink}">Kategoriler</a>
            <a href="${FOR_BUSINESS_PATH}" class="${menuLink}">İşletmeler için</a>
            <a href="${FAQ_PATH}" class="${menuLink}">Yardım</a>
          </nav>
          <div class="ml-auto flex items-center gap-1.5">
            <a href="/giris" class="ml-1 inline-flex h-9 items-center whitespace-nowrap rounded-xl bg-primary px-4 text-[13px] font-semibold text-primary-fg">Giriş Yap</a>
          </div>
        </div>
      </header>
      <main class="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-6 sm:px-6">
        ${content}
      </main>
      <footer class="border-t border-line-soft pb-24 md:pb-0">
        <div class="mx-auto max-w-6xl px-4 sm:px-6">
          <div class="grid gap-x-8 gap-y-10 py-12 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1.2fr]">
            <div>
              ${LOGO}
              <p class="mt-4 max-w-xs text-[13px] leading-relaxed text-mist">İzmir’de kuaför, berber ve güzellik işletmeleri için online randevu.</p>
            </div>
            ${column('Site bağlantıları', 'Keşfet', [...siteLinks('tr').map((l) => ({ path: l.path, label: l.label })), { path: '/ara', label: 'İşletme ara' }])}
            ${column('İşletme bağlantıları', 'İşletmeler', [
              { path: FOR_BUSINESS_PATH, label: 'Rango’ya katılın' },
              { path: '/kayit', label: 'İşletme hesabı oluştur' },
              { path: '/giris', label: 'İşletme girişi' },
            ])}
            ${column('Yasal bağlantılar', 'Yasal', LEGAL_LINKS.map((l) => ({ path: `/yasal/${l.slug}`, label: l.label })))}
          </div>
          <div class="flex flex-col gap-3 border-t border-line-soft py-6 text-xs text-mist-2 md:flex-row md:items-start md:justify-between md:gap-10">
            <p class="shrink-0 text-mist-3">© ${new Date().getFullYear()} ${e(COMPANY.legalName)}</p>
            <p class="leading-relaxed md:max-w-2xl md:text-right">${e(PAYMENT_PROVIDER.disclosure)} <a href="${e(PAYMENT_PROVIDER.website)}" target="_blank" rel="noopener noreferrer" class="underline underline-offset-2">${e(
              PAYMENT_PROVIDER.website.replace('https://', ''),
            )}</a></p>
          </div>
        </div>
      </footer>
    </div>`;
}

const blockPage = (blocks: Block[]) => shell(renderBlocks(blocks));

/** The category chips of the home page (pages/customer/Home.tsx). */
function categoryChips(categories: SeoCategory[]): string {
  const items = categories
    .map((c) => `<a href="${e(categoryPath(c.slug))}" class="flex h-11 shrink-0 items-center gap-2 rounded-full border border-line bg-coal px-4 text-sm text-white transition-colors hover:border-white/40">${e(c.name)}</a>`)
    .join('');
  return `<div class="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">${items}</div>`;
}

/** The category list of /kategoriler (pages/customer/Categories.tsx). */
function categoryLinks(categories: SeoCategory[]): string {
  if (!categories.length) return '';
  const items = categories
    .map(
      (c) => `<li><a href="${e(categoryPath(c.slug))}" class="group flex h-full items-start justify-between gap-4 border-t border-line py-5">
              <span><span class="block text-base font-semibold text-white">${e(c.name)}</span>${c.description ? `<span class="mt-1 block text-[13px] leading-relaxed text-mist">${e(c.description)}</span>` : ''}</span>
            </a></li>`,
    )
    .join('');
  return `<ul class="mt-8 grid gap-x-10 sm:grid-cols-2 lg:grid-cols-3">${items}</ul>`;
}

function homeBody(input: HomeExtrasInput): string {
  const search = 'İşletme, hizmet veya semt ara';
  return shell(`<div class="space-y-12 sm:space-y-16">
        <section class="grid items-center gap-10 pt-4 sm:pt-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-16 lg:pb-6 lg:pt-10">
          <div>
            <h1 class="font-display text-[42px] leading-[1.04] tracking-[-0.02em] text-white sm:text-6xl lg:text-[68px]">Randevunun yeni yolu.</h1>
            <p class="mt-4 max-w-md text-[15px] leading-relaxed text-mist sm:text-base">Kuaför, berber ve güzellik randevunuzu online alın: İzmir’deki işletmeleri keşfedin, size en uygun saati seçin.</p>
            <form action="/ara" method="get" role="search" class="mt-7 flex max-w-xl items-center gap-1 rounded-2xl border border-line bg-coal p-1.5 shadow-gold">
              <input name="q" aria-label="${search}" placeholder="${search}" class="h-11 min-w-0 flex-1 bg-transparent px-3 text-[15px] text-white placeholder:text-mist-3 focus:outline-none" />
              <button type="submit" class="h-11 shrink-0 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-fg">Ara</button>
            </form>
          </div>
          <div class="relative hidden lg:block" aria-hidden="true">
            <img src="/sector-barber-3.webp" alt="" width="840" height="1050" loading="lazy" decoding="async" class="aspect-[4/5] w-full rounded-3xl object-cover" />
            <img src="/sector-nails-7.webp" alt="" width="352" height="352" loading="lazy" decoding="async" class="absolute -bottom-8 -left-12 aspect-square w-44 rounded-2xl border-[5px] border-ink object-cover" />
          </div>
        </section>
        ${input.categories.length ? `<section aria-label="Hizmet kategorileri"><h2 class="mb-4 font-display text-[26px] text-white sm:text-3xl">Hizmete göre keşfedin</h2>${categoryChips(input.categories)}</section>` : ''}
        ${renderBlocks(homeExtraBlocks(input))}
      </div>`);
}

function categoriesBody(categories: SeoCategory[]): string {
  return shell(`<div class="pt-2 sm:pt-6">
        <h1 class="font-display text-4xl leading-[1.08] tracking-[-0.02em] text-white sm:text-[52px]">Hizmet kategorileri</h1>
        <p class="mt-4 max-w-xl text-[15px] leading-relaxed text-mist">Kadınlara ve erkeklere hizmet veren işletmeleri kategoriye göre keşfedin.</p>
        ${categoryLinks(categories)}
      </div>`);
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
    .map((m) => `<li class="card p-4"><p class="font-medium text-white">${e(m.full_name)}</p>${m.title ? `<p class="text-xs text-mist-2">${e(m.title)}</p>` : ''}</li>`)
    .join('');
  const written = b.reviews
    .filter((r) => r.comment?.trim())
    .slice(0, 10)
    .map(
      (r) => `<li class="card p-5"><p class="text-sm font-medium text-white">${e(r.reviewer_name ?? '')} · ${'★'.repeat(Math.max(1, Math.min(5, Math.round(r.rating))))}</p>${
        r.service_name ? `<p class="text-xs text-mist-2">${e(r.service_name)}</p>` : ''
      }<p class="mt-3 text-sm leading-relaxed text-mist">${e(r.comment ?? '')}</p>${
        r.owner_reply ? `<div class="mt-4 rounded-xl bg-coal-2 px-4 py-3"><p class="text-xs font-semibold text-white">İşletme yanıtı</p><p class="mt-1 text-sm text-mist">${e(r.owner_reply)}</p></div>` : ''
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
            <div class="relative aspect-[4/3] overflow-hidden sm:aspect-[21/9] sm:rounded-3xl">
              <img src="${e(photo.placeholder ? `/${photo.src}` : photo.src)}" alt="${e(photoAlt)}" loading="eager" fetchpriority="high" decoding="async" class="absolute inset-0 h-full w-full object-cover" />
              <div class="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/35 to-transparent"></div>
              ${photo.placeholder ? '<span class="pointer-events-none absolute bottom-4 left-4 z-10 inline-flex items-center gap-1 rounded-md bg-black/70 px-2.5 py-1 text-[10px] font-medium text-[#fff]">Temsili görsel</span>' : ''}
            </div>
          </div>
          <div class="mt-6 grid gap-10 lg:grid-cols-[1fr_340px]">
            <div class="min-w-0">
              <div class="mb-4">${renderBlocks([crumbs])}</div>
              ${category ? `<p class="text-[13px] text-mist">${b.categories?.slug ? `<a href="${e(categoryPath(b.categories.slug))}">${e(category)}</a>` : e(category)}</p>` : ''}
              <h1 class="mt-2 font-display text-4xl leading-[1.08] tracking-[-0.02em] text-white sm:text-5xl">${e(b.name)}</h1>
              ${reviews > 0 ? `<p class="mt-3 text-sm text-mist"><span class="font-semibold text-white">★ ${Number(b.rating_avg ?? 0).toFixed(1)}</span> (${reviews} değerlendirme)</p>` : ''}
              ${address ? `<p class="mt-5 rounded-2xl border border-line bg-coal p-4 text-sm leading-relaxed text-white">${e(address)}</p>` : ''}
              ${b.description ? `<p class="mt-5 max-w-2xl text-[15px] leading-relaxed text-mist">${e(b.description)}</p>` : ''}
              <p class="mt-6"><a href="${e(businessPath(b.slug))}/randevu" class="inline-flex min-h-11 items-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-fg">Randevu Al</a></p>
              ${services ? `<section class="mt-8"><h2 class="${S.sectionTitle}">Hizmetler ve fiyatlar</h2><div class="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-coal">${services}</div></section>` : ''}
              ${team ? `<section class="mt-8"><h2 class="${S.sectionTitle}">Uzmanlar</h2><ul class="mt-4 grid gap-3 sm:grid-cols-2">${team}</ul></section>` : ''}
              ${written ? `<section class="mt-8"><h2 class="${S.sectionTitle}">Değerlendirmeler</h2><ul class="mt-4 space-y-3">${written}</ul></section>` : ''}
              <section class="mt-8 max-w-md"><h2 class="${S.sectionTitle}">Çalışma saatleri</h2><ul class="card mt-4 space-y-2 p-5 text-sm">${hours}</ul></section>
              ${b.cancellation_hours != null ? `<p class="mt-6 text-sm text-mist">Randevuya ${Number(b.cancellation_hours)} saat kalaya kadar ücretsiz iptal ve erteleme.</p>` : ''}
            </div>
          </div>
        </article>`);
}

function legalBlock(block: LegalBlock): string {
  if (block.kind === 'p') return `<p class="text-base leading-relaxed text-mist">${e(block.text)}</p>`;
  if (block.kind === 'ul') {
    return `<ul class="list-disc space-y-1.5 pl-5 text-base leading-relaxed text-mist marker:text-gold-500">${block.items.map((item) => `<li>${e(item)}</li>`).join('')}</ul>`;
  }
  const head = block.head.map((cell) => `<th scope="col" class="px-4 py-3 font-medium">${e(cell)}</th>`).join('');
  const rows = block.rows
    .map((row) => `<tr class="align-top">${row.map((cell, i) => `<td class="px-4 py-3 ${i === 0 ? 'font-medium text-white' : 'text-mist'}">${e(cell)}</td>`).join('')}</tr>`)
    .join('');
  return `<div class="overflow-x-auto rounded-2xl border border-line"><table class="w-full min-w-[520px] text-left text-sm"><thead class="bg-white/[0.03] text-xs uppercase tracking-wide text-mist-2"><tr>${head}</tr></thead><tbody class="divide-y divide-line">${rows}</tbody></table></div>`;
}

/** The legal text itself (src/pages/legal/legalContent.ts), with the markup of pages/legal/LegalPage.tsx. */
function legalBody(slug: keyof typeof LEGAL_DOCUMENTS): string {
  const doc = LEGAL_DOCUMENTS[slug];
  const sections = doc.sections
    .map((section) => `<section lang="tr" class="space-y-3"><h2 class="font-display text-2xl text-white">${e(section.title)}</h2>${section.blocks.map(legalBlock).join('')}</section>`)
    .join('');
  return shell(`<article class="mx-auto max-w-5xl space-y-8">
          <header lang="tr">
            <p class="eyebrow mb-2">${e(doc.eyebrow)}</p>
            <h1 class="font-display text-3xl text-white sm:text-4xl">${e(doc.title)}</h1>
            <p class="mt-3 max-w-2xl text-sm leading-relaxed text-mist-2">${e(doc.summary)}</p>
          </header>
          ${sections}
        </article>`);
}

/** Sign-in and sign-up: nothing to index, but every page links to them, so they answer with their own "noindex" head. */
function accountBody(title: string): string {
  return shell(`<h1 class="font-display text-4xl text-white">${e(title)}</h1>`);
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const REWRITE_MARKER = '# __SEO_STATIC_PAGES__';

/**
 * The rewrite rules that serve the static pages at their real addresses, one exact rule per
 * group of pages. Explicit rules need no file-existence test, so they do not depend on how the
 * host maps its document root.
 */
function rewriteRules(files: string[]): string {
  const lines: string[] = [];
  if (files.includes('index')) lines.push('  RewriteRule ^$ /_seo/index.html [L]');
  const rest = files.filter((file) => file !== 'index');
  // A few dozen addresses per rule keeps every line far below the web server's line-length limit.
  for (let i = 0; i < rest.length; i += 40) {
    lines.push(`  RewriteRule ^(${rest.slice(i, i + 40).join('|')})/?$ /_seo/$1.html [L]`);
  }
  return lines.join('\n');
}

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
        // Home ("/" and its in-app address "/kesfet", whose canonical is "/").
        const homeInput: HomeExtrasInput = { lang: 'tr', city, categories: data?.categories ?? [], businesses: data?.listing ?? null, supabaseUrl: supabase.url };
        const home = homeMeta('tr');
        home.jsonLd = [...(home.jsonLd ?? []), ...homeSchemas(homeInput)];
        const homeHtml = homeBody(homeInput);
        pages.push({ file: 'index', meta: home, body: homeHtml, data: shared });
        pages.push({ file: 'kesfet', meta: home, body: homeHtml, data: shared });

        // Categories: the structured list names only the categories whose page may be indexed.
        const facetsNow = data ? buildFacets(city, data.listing) : null;
        const indexableCategories = (data?.categories ?? []).filter((c) => isLandingIndexable('cityCategory', facetsNow?.byCategory.get(c.slug) ?? 0));
        pages.push({ file: 'kategoriler', meta: categoriesMeta('tr', indexableCategories), body: categoriesBody(data?.categories ?? []), data: shared });

        const signIn: PageMeta = { title: 'Giriş Yap | Rango', description: home.description, path: '/giris', noindex: true };
        const signUp: PageMeta = { title: 'Ücretsiz Hesap Oluştur | Rango', description: home.description, path: '/kayit', noindex: true };
        pages.push({ file: 'giris', meta: signIn, body: accountBody('Giriş Yap') });
        pages.push({ file: 'kayit', meta: signUp, body: accountBody('Hesap Oluştur') });

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
            // A business address is one path segment (the database enforces the same format): a slug with a
            // slash could otherwise be written over another page, such as another business's /randevu address.
            if (!/^[a-z0-9]+(?:-+[a-z0-9]+)*$/.test(b.slug)) continue;
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
        pages.push({ file: `yasal/${link.slug}`, meta, body: legalBody(link.slug) });
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

      // Serve the pages at their real addresses (Hostinger / Apache / LiteSpeed). Read and written in
      // one step, without awaiting in between: another plugin edits the same file (vite.config.ts).
      const htaccess = resolve(outDir, '.htaccess');
      if (existsSync(htaccess)) {
        const rules = readFileSync(htaccess, 'utf8');
        if (rules.includes(REWRITE_MARKER)) {
          writeFileSync(htaccess, rules.replace(REWRITE_MARKER, () => `# Derlemede üretildi (seo/prerender.ts): ${written.length} statik sayfa\n${rewriteRules(written.map((page) => page.file))}`));
        } else {
          console.warn(`[rango] SEO: dist/.htaccess içinde "${REWRITE_MARKER}" satırı yok; statik sayfalar asıl adreslerinde sunulmayacak.`);
        }
      }

      // The sitemap lists every page that may be indexed, by its canonical address.
      const paths = [...new Set(written.filter((page) => !page.meta.noindex).map((page) => page.meta.path))];
      writeFileSync(resolve(outDir, 'sitemap.xml'), sitemap(maintenance ? ['/', ...paths] : paths));

      console.info(`[rango] SEO: ${written.length} statik sayfa ve ${paths.length} adresli sitemap.xml üretildi (${SITE_URL}).`);
    },
  };
}
