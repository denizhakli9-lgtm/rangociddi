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
  if (/^\/i\/[^/]+$/.test(path) || isLandingPath(path) || CONTENT_PATHS.includes(path)) {
    // Shown only until the page has loaded; it then sets its own (see BusinessDetail, Landing, ContentPage).
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
        'Rango’ya ücretsiz üye olun, İzmir’deki kuaför, berber ve güzellik merkezlerinden online randevu alın. İşletme sahibiyseniz işletmenizi Rango’ya ekleyin.',
        'Join Rango for free and book hair salons, barbers and beauty salons in İzmir online. Own a business? Add it to Rango.',
      ),
      path,
    };
  }
  return privateMeta(lang, path);
}
