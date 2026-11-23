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
 *    (`/kategoriler` → `_seo/kategoriler.html`); uygulama açılınca metnin yerini alır.
 *  - `dist/sitemap.xml` dosyasını üretir.
 *
 * Kategoriler ve işletmeler derleme anında Supabase'den (herkese açık anon anahtarla,
 * ziyaretçinin gördüğü verinin aynısı) okunur. Supabase'e ulaşılamazsa derleme durmaz;
 * yalnızca sabit sayfalar üretilir. Yeni bir işletmenin kendi statik sayfası ve sitemap
 * kaydı bir sonraki derlemede oluşur; o zamana kadar sayfa yine çalışır ve Google onu
 * JavaScript'i çalıştırarak okuyabilir.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Plugin } from 'vite';
import { LEGAL_LINKS } from '../src/lib/legal';
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
  legalMeta,
  renderHead,
  searchMeta,
  type PageMeta,
  type SeoBusiness,
  type SeoCategory,
  type SeoHours,
  type SeoService,
} from '../src/lib/seo/meta';

interface BusinessRow extends SeoBusiness {
  services: (SeoService & { is_active: boolean; sort_order: number })[];
  working_hours: SeoHours[];
}

interface SiteData {
  categories: SeoCategory[];
  businesses: BusinessRow[];
}

const HEAD_START = '<!--seo:start-->';
const HEAD_END = '<!--seo:end-->';
const WEEKDAYS_TR = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

async function fetchJson<T>(url: string, key: string): Promise<T> {
  const response = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return (await response.json()) as T;
}

async function loadSiteData(supabaseUrl: string, key: string): Promise<SiteData | null> {
  const rest = `${supabaseUrl.replace(/\/+$/, '')}/rest/v1`;
  try {
    const [categories, businesses] = await Promise.all([
      fetchJson<SeoCategory[]>(`${rest}/categories?select=slug,name,description&is_active=eq.true&order=sort_order`, key),
      fetchJson<BusinessRow[]>(
        `${rest}/businesses?select=name,slug,owner_id,description,address,district,city,latitude,longitude,cover_url,rating_avg,review_count,min_price,` +
          'categories(name,slug),services(name,description,price,duration_minutes,is_active,sort_order),working_hours(weekday,is_closed,open_time,close_time)' +
          '&status=eq.approved&owner_id=not.is.null&order=name',
        key,
      ),
    ]);
    return {
      categories,
      businesses: businesses.map((b) => ({
        ...b,
        services: (b.services ?? []).filter((s) => s.is_active).sort((a, z) => a.sort_order - z.sort_order),
        working_hours: (b.working_hours ?? []).slice().sort((a, z) => a.weekday - z.weekday),
      })),
    };
  } catch (error) {
    console.warn(`[rango] SEO: Supabase verisi okunamadı (${error instanceof Error ? error.message : String(error)}); yalnızca sabit sayfalar üretiliyor.`);
    return null;
  }
}

const e = escapeHtml;
const price = (value: number | string) => `${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(Number(value))} ₺`;

/** The static page body: the app's header and footer, with the page's text in between. */
function shell(content: string): string {
  const legal = LEGAL_LINKS.map((l) => `<a href="/yasal/${l.slug}" class="transition hover:text-white">${e(l.label)}</a>`).join('');
  return `<div class="min-h-screen bg-ink">
      <header class="sticky top-0 z-40 border-b border-line-soft bg-ink/85 backdrop-blur-xl">
        <div class="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <a href="/" class="font-display text-2xl font-semibold tracking-wide text-white">Rango<span class="text-gold-500">.</span></a>
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
          <nav aria-label="Yasal bağlantılar" class="flex flex-wrap gap-x-5 gap-y-2">${legal}</nav>
        </footer>
      </main>
    </div>`;
}

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

function businessLinks(businesses: BusinessRow[]): string {
  if (!businesses.length) return '';
  const items = businesses
    .map((b) => {
      const facts = [b.categories?.name, b.district].filter(Boolean).join(' · ');
      const from = Number(b.min_price) > 0 ? ` · ${price(b.min_price ?? 0)}’den başlayan fiyatlarla` : '';
      return `<li><a href="${e(businessPath(b.slug))}" class="card block p-5 transition hover:border-gold-500/40">
              <h3 class="font-display text-2xl text-white">${e(b.name)}</h3>
              <p class="mt-1 text-xs text-mist">${e(facts + from)}</p>
              ${b.description ? `<p class="mt-2 text-sm text-mist-2">${e(b.description)}</p>` : ''}
            </a></li>`;
    })
    .join('');
  return `<ul class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">${items}</ul>`;
}

function homeBody(data: SiteData | null): string {
  return shell(`<section class="rounded-3xl border border-gold-500/20 bg-gradient-to-br from-coal via-coal-2 to-gold-500/10 px-5 py-7 sm:px-10 sm:py-10">
          <p class="eyebrow mb-3">İzmir · Online randevu</p>
          <h1 class="max-w-lg font-display text-[36px] leading-[1.2] tracking-tight text-white sm:text-6xl">Randevunun yeni yolu.</h1>
          <p class="mt-3 max-w-md text-sm leading-relaxed text-mist sm:text-base">İzmir’de kuaför, berber, güzellik merkezi ve spa randevunu online al: aradığın hizmeti keşfet, sana en uygun zamanı seç.</p>
          <p class="mt-6"><a href="/ara" class="inline-flex h-11 items-center rounded-xl bg-gold-500 px-4 text-sm font-semibold text-ink">İşletmeleri keşfet</a></p>
        </section>
        ${data?.categories.length ? `<section class="mt-8" aria-label="Hizmet kategorileri"><h2 class="font-display text-3xl text-white">Bugün neye ihtiyacın var?</h2>${categoryLinks(data.categories)}</section>` : ''}
        ${data?.businesses.length ? `<section class="mt-8"><h2 class="font-display text-3xl text-white">Rango’daki işletmeler</h2>${businessLinks(data.businesses)}</section>` : ''}`);
}

function categoriesBody(data: SiteData | null): string {
  return shell(`<p class="eyebrow mb-2">Kategoriler</p>
        <h1 class="font-display text-4xl text-white">Size iyi gelecek her şey</h1>
        <p class="mt-2 max-w-xl text-sm text-mist">Kadın ve erkek müşterilere özel hizmet veren seçkin işletmeleri kategoriye göre keşfedin.</p>
        ${categoryLinks(data?.categories ?? [])}`);
}

function searchBody(data: SiteData | null, category?: SeoCategory): string {
  const businesses = (data?.businesses ?? []).filter((b) => !category || b.categories?.slug === category.slug);
  return shell(`<p class="eyebrow mb-2">${category ? 'Kategori' : 'Keşfet'}</p>
        <h1 class="font-display text-4xl text-white">${category ? e(category.name) : 'Tüm işletmeler'}</h1>
        ${category?.description ? `<p class="mt-2 max-w-xl text-sm text-mist">${e(category.description)}</p>` : ''}
        ${businessLinks(businesses)}
        <p class="mt-8 text-sm text-mist"><a href="/kategoriler" class="text-gold-500">Tüm kategoriler</a></p>`);
}

function businessBody(b: BusinessRow): string {
  // The street address often already ends with the district ("…, Karşıyaka"); do not repeat it.
  const address = [b.address, b.district, b.city].reduce<string[]>((parts, part) => (part && !parts.some((p) => p.includes(part)) ? [...parts, part] : parts), []).join(', ');
  const services = b.services
    .map(
      (s) => `<li class="flex items-center gap-4 px-5 py-4">
                <div class="min-w-0 flex-1">
                  <p class="text-[15px] font-medium text-white">${e(s.name)}</p>
                  ${s.description ? `<p class="mt-0.5 text-xs text-mist-2">${e(s.description)}</p>` : ''}
                  ${s.duration_minutes ? `<p class="mt-1.5 text-xs text-mist">${s.duration_minutes} dk</p>` : ''}
                </div>
                <p class="font-semibold text-white">${price(s.price)}</p>
              </li>`,
    )
    .join('');
  const hours = b.working_hours
    .map((h) => `<li class="flex justify-between text-mist"><span>${WEEKDAYS_TR[h.weekday - 1] ?? ''}</span><span>${h.is_closed ? 'Kapalı' : `${h.open_time.slice(0, 5)} – ${h.close_time.slice(0, 5)}`}</span></li>`)
    .join('');
  return shell(`<article>
          ${b.categories?.name ? `<p class="text-[11px] uppercase tracking-[0.2em] text-gold-500">${b.categories.slug ? `<a href="${e(categoryPath(b.categories.slug))}">${e(b.categories.name)}</a>` : e(b.categories.name)}</p>` : ''}
          <h1 class="mt-2 font-display text-4xl text-white sm:text-5xl">${e(b.name)}</h1>
          ${address ? `<p class="mt-3 text-sm text-white">${e(address)}</p>` : ''}
          ${b.description ? `<p class="mt-5 max-w-2xl text-[15px] leading-relaxed text-mist">${e(b.description)}</p>` : ''}
          <p class="mt-6"><a href="${e(businessPath(b.slug))}/randevu" class="inline-flex h-11 items-center rounded-xl bg-gold-500 px-4 text-sm font-semibold text-ink">Randevu Al</a></p>
          ${services ? `<section class="mt-8"><h2 class="font-display text-3xl text-white">Hizmetler ve fiyatlar</h2><ul class="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-coal">${services}</ul></section>` : ''}
          ${hours ? `<section class="mt-8 max-w-md"><h2 class="font-display text-3xl text-white">Çalışma saatleri</h2><ul class="card mt-4 space-y-2 p-5 text-sm">${hours}</ul></section>` : ''}
        </article>`);
}

function legalBody(meta: PageMeta, title: string): string {
  return shell(`<article>
          <h1 class="font-display text-3xl text-white sm:text-4xl">${e(title)}</h1>
          <p class="mt-3 max-w-2xl text-sm leading-relaxed text-mist-2">${e(meta.description)}</p>
        </article>`);
}

function sitemap(entries: { path: string; lastmod?: string }[]): string {
  const urls = entries
    .map(({ path, lastmod }) => `  <url>\n    <loc>${e(absoluteUrl(path))}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}\n  </url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
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
      if (start < 0 || end < start || !template.includes('<div id="root"></div>')) {
        throw new Error(`[rango] SEO: index.html içinde ${HEAD_START} … ${HEAD_END} işaretleri ya da <div id="root"></div> bulunamadı.`);
      }

      const today = new Date().toISOString().slice(0, 10);
      const legalPages = LEGAL_LINKS.map((l) => ({ link: l, meta: legalMeta('tr', l.slug)! }));

      // Bakım modunda site her adreste bakım ekranını gösterir; yalnızca yasal metinler açıktır.
      const maintenance = /MAINTENANCE_ENABLED\s*=\s*true/.test(readFileSync(resolve(root, 'src/lib/maintenance.ts'), 'utf8'));
      const data = maintenance ? null : await loadSiteData(supabase.url, supabase.key);
      const businesses = (data?.businesses ?? []).filter((b) => isIndexableBusiness(b, b.services));
      const site = data ? { categories: data.categories, businesses } : null;

      const pages: { file: string; meta: PageMeta; body: string }[] = [];
      if (!maintenance) {
        const home = homeMeta('tr');
        if (businesses.length) {
          home.jsonLd = [...(home.jsonLd ?? []), itemListSchema('Rango’daki işletmeler', businesses.map((b) => ({ name: b.name, path: businessPath(b.slug) })))];
        }
        pages.push({ file: 'index', meta: home, body: homeBody(site) });
        // /kesfet is the same page as "/" (its canonical address).
        pages.push({ file: 'kesfet', meta: home, body: homeBody(site) });
        pages.push({ file: 'kategoriler', meta: categoriesMeta('tr', site?.categories ?? []), body: categoriesBody(site) });
        pages.push({ file: 'ara', meta: searchMeta('tr'), body: searchBody(site) });
        for (const category of site?.categories ?? []) {
          pages.push({ file: `kategori/${category.slug}`, meta: searchMeta('tr', { category }), body: searchBody(site, category) });
        }
        for (const b of businesses) {
          pages.push({ file: `i/${b.slug}`, meta: businessMeta('tr', b, b.services, b.working_hours), body: businessBody(b) });
        }
      }
      for (const { link, meta } of legalPages) {
        pages.push({ file: `yasal/${link.slug}`, meta, body: legalBody(meta, link.label) });
      }

      for (const page of pages) {
        if (!/^[a-z0-9/-]+$/.test(page.file)) continue; // .htaccess yalnızca bu biçimdeki adresleri eşler
        const html =
          template.slice(0, start) +
          `${HEAD_START}\n    ${renderHead(page.meta)}\n    ` +
          template.slice(end).replace('<div id="root"></div>', `<div id="root">${page.body}</div>`);
        const file = resolve(outDir, '_seo', `${page.file}.html`);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, html);
      }

      const entries: { path: string; lastmod?: string }[] = maintenance
        ? [{ path: '/' }]
        : [
            { path: '/', lastmod: today },
            { path: '/kategoriler', lastmod: today },
            { path: '/ara', lastmod: today },
            ...(site?.categories ?? []).map((c) => ({ path: categoryPath(c.slug), lastmod: today })),
            ...businesses.map((b) => ({ path: businessPath(b.slug), lastmod: today })),
          ];
      entries.push(...legalPages.map(({ meta }) => ({ path: meta.path })));
      writeFileSync(resolve(outDir, 'sitemap.xml'), sitemap(entries));

      console.info(`[rango] SEO: ${pages.length} statik sayfa ve ${entries.length} adresli sitemap.xml üretildi (${SITE_URL}).`);
    },
  };
}
