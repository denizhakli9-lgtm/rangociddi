import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { locale } from '@/i18n/locale';
import { isNative } from '@/lib/platform';
import { DEFAULT_OG_IMAGE, ROBOTS_INDEX, ROBOTS_NOINDEX, SITE_NAME, absoluteUrl, jsonLdText, type PageMeta } from './meta';
import { routeMeta } from './routes';

function setMeta(attr: 'name' | 'property', key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

/** `null` removes the tag: a page that is kept out of the index names no canonical address. */
function setCanonical(href: string | null): void {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!href) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('link');
    el.rel = 'canonical';
    document.head.appendChild(el);
  }
  el.href = href;
}

/** Writes a page's title, description, canonical address, share tags and structured data into <head>. */
export function applySeo(meta: PageMeta): void {
  // The app's pages are not web pages: nothing to index, and its address is https://localhost.
  if (isNative) {
    document.title = meta.title;
    return;
  }
  const url = absoluteUrl(meta.path);
  const image = absoluteUrl(meta.image ?? DEFAULT_OG_IMAGE);
  document.title = meta.title;
  setMeta('name', 'description', meta.description);
  setMeta('name', 'robots', meta.noindex ? ROBOTS_NOINDEX : ROBOTS_INDEX);
  setCanonical(meta.noindex ? null : url);
  setMeta('property', 'og:type', 'website');
  setMeta('property', 'og:site_name', SITE_NAME);
  setMeta('property', 'og:locale', locale() === 'en' ? 'en_GB' : 'tr_TR');
  setMeta('property', 'og:title', meta.title);
  setMeta('property', 'og:description', meta.description);
  setMeta('property', 'og:url', url);
  setMeta('property', 'og:image', image);
  setMeta('name', 'twitter:card', 'summary_large_image');
  setMeta('name', 'twitter:title', meta.title);
  setMeta('name', 'twitter:description', meta.description);
  setMeta('name', 'twitter:image', image);

  document.head.querySelectorAll('script[type="application/ld+json"]').forEach((el) => el.remove());
  for (const data of meta.jsonLd ?? []) {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = jsonLdText(data);
    document.head.appendChild(script);
  }
}

/**
 * Page-specific metadata for pages that know more than their address (a business, a
 * category). Pass `null` while the data is still loading.
 */
export function useSeo(meta: PageMeta | null): void {
  const key = meta ? JSON.stringify(meta) : null;
  useEffect(() => {
    if (meta) applySeo(meta);
    // `key` is the serialised `meta`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/**
 * Sets the metadata every address has by default. Rendered once, before the routes, so a
 * page's own `useSeo` (which runs after it) wins.
 */
export function RouteSeo(): null {
  const { pathname } = useLocation();
  useEffect(() => {
    applySeo(routeMeta(pathname, locale()));
  }, [pathname]);
  return null;
}
