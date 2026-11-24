/**
 * Yalnızca adrese bağlı sayfa bilgileri (başlık, açıklama, canonical, dizin izni).
 *
 * Kendi verisi olan sayfalar (işletme, semt/kategori, arama) veri gelince bunu `useSeo` ile
 * inceltir. Burada adı geçmeyen her adres kişiye özel sayılır ve "noindex" olur.
 */
import { CITIES } from './places';
import { DEFAULT_TITLE, SITE_NAME, categoriesMeta, homeMeta, legalMeta, searchMeta, type PageMeta, type SeoLang } from './meta';

/** Content pages; their texts are loaded with the page itself (see pages/ContentPage.tsx), not with the app shell. */
const CONTENT_PATHS = ['/sss', '/isletmeler-icin'];

const pick = (lang: SeoLang, tr: string, en: string) => (lang === 'en' ? en : tr);

function privateMeta(lang: SeoLang, path: string, title?: string): PageMeta {
  return {
    title: title ? `${title} | ${SITE_NAME}` : DEFAULT_TITLE[lang],
    description: homeMeta(lang).description,
    path,
    noindex: true,
  };
}

/** `/izmir`, `/izmir/kuafor`, `/izmir/karsiyaka/berber`: a city, optionally followed by one or two slugs. */
export function isLandingPath(path: string): boolean {
  const [, city, first, second, extra] = path.split('/');
  return !extra && CITIES.some((c) => c.slug === city) && [first, second].every((part) => part === undefined || /^[a-z0-9-]+$/.test(part));
}

export function routeMeta(pathname: string, lang: SeoLang): PageMeta {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/' || path === '/kesfet') return homeMeta(lang);
  if (path === '/kategoriler') return categoriesMeta(lang);
  if (path === '/ara') return searchMeta(lang);
  if (path.startsWith('/yasal/')) return legalMeta(lang, path.slice('/yasal/'.length)) ?? privateMeta(lang, path);
  if (CONTENT_PATHS.includes(path)) {
    // Shown only until the page's own code has loaded; it then sets its own (see pages/ContentPage.tsx).
    return { title: DEFAULT_TITLE[lang], description: homeMeta(lang).description, path };
  }
  if (/^\/i\/[^/]+$/.test(path) || isLandingPath(path)) {
    // Whether a business or listing page may be indexed depends on its data (a sample or test
    // business, too few listings, an unknown address). Until the page has loaded that data and
    // set its own metadata, and whenever loading fails, it stays out of the index.
    return privateMeta(lang, path);
  }
  if (path === '/giris') return privateMeta(lang, path, pick(lang, 'Giriş Yap', 'Sign in'));
  if (path === '/kayit') return privateMeta(lang, path, pick(lang, 'Ücretsiz Hesap Oluştur', 'Create a free account'));
  return privateMeta(lang, path);
}
