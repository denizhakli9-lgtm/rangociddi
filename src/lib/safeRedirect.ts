/**
 * Validates a redirect target taken from a URL parameter (`?sonra=`) or a
 * stored link (notifications) before it is passed to `navigate()`.
 *
 * Only same-origin app paths are accepted: the value must start with a single
 * '/', must not contain backslashes, whitespace or control characters (browsers
 * turn '/\evil.tld' or '/\t/evil.tld' into '//evil.tld'), and must resolve to
 * this origin. Auth pages are rejected so a login never loops back to itself.
 * Returns the normalised path (pathname + search + hash) or null.
 */
const AUTH_PAGES = /^\/(giris|kayit|sifremi-unuttum|sifre-yenile)(\/|$)/i;
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS = /[\\\s\u0000-\u001f\u007f-\u009f]/;
const MAX_LENGTH = 2048;

export function safeInternalPath(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string' || !raw || raw.length > MAX_LENGTH) return null;
  if (raw[0] !== '/' || raw[1] === '/') return null;
  if (UNSAFE_CHARS.test(raw) || /javascript:/i.test(raw)) return null;
  try {
    const origin = window.location.origin;
    const url = new URL(raw, origin);
    if (url.origin !== origin) return null;
    if (AUTH_PAGES.test(url.pathname)) return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}
