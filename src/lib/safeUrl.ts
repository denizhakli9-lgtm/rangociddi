/**
 * Image URLs stored in the database (covers, galleries, staff avatars) can be written through
 * the REST API, so they are only rendered when they point at public objects in our own
 * `business-media` storage bucket or at the Pexels seed images. Anything else (tracking pixels,
 * other hosts, other Supabase endpoints such as /rest or /functions, non-https) returns null and
 * the caller shows its placeholder instead.
 */
function originOf(raw: unknown): URL | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

const SUPABASE = originOf(import.meta.env.VITE_SUPABASE_URL);
// WHATWG URL parsing normalises '..' and '%2e%2e' segments, so an href prefix check cannot be
// escaped into another API path.
const MEDIA_PREFIX = SUPABASE ? `${SUPABASE.origin}/storage/v1/object/public/business-media/` : null;

export function safeImageUrl(url?: string | null): string | null {
  const u = originOf(url?.trim());
  if (!u || u.username || u.password) return null;
  if (u.protocol === 'https:' && u.host === 'images.pexels.com') return u.href;
  // Local development (supabase start) serves storage over plain http on the API origin.
  if (MEDIA_PREFIX && u.href.startsWith(MEDIA_PREFIX) && (u.protocol === 'https:' || import.meta.env.DEV)) return u.href;
  return null;
}
