import { safeImageUrlFor } from '@/lib/sectorCovers';

/**
 * Image URLs stored in the database (covers, galleries, staff avatars) can be written through
 * the REST API, so they are only rendered when they point at public objects in our own
 * `business-media` storage bucket or at the Pexels seed images. Anything else (tracking pixels,
 * other hosts, other Supabase endpoints such as /rest or /functions, non-https) returns null and
 * the caller shows its placeholder instead. The rule itself lives in `sectorCovers.ts` so the
 * build-time static pages apply exactly the same one.
 */
export function safeImageUrl(url?: string | null): string | null {
  return safeImageUrlFor(url, import.meta.env.VITE_SUPABASE_URL as string | undefined, import.meta.env.DEV);
}
