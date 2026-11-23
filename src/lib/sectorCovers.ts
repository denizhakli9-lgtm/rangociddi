/**
 * Sektör kapak görsellerinin saf çekirdeği (`/public/sector-<ad><varyant>.webp`).
 *
 * Tarayıcıya ve `import.meta.env`'e bağlı değildir; hem uygulama (`placeholderImages.ts`) hem de
 * derleme eklentisi (statik sayfalar) aynı işletme için aynı görseli seçsin diye ayrı tutulur.
 */
const SECTORS: Record<string, string> = {
  kuafor: 'hair',
  berber: 'barber',
  'guzellik-merkezi': 'beauty',
  'cilt-bakimi': 'beauty',
  masaj: 'spa',
  spa: 'spa',
  manikur: 'nails',
  pedikur: 'nails',
  'lazer-epilasyon': 'beauty',
  'sac-bakimi': 'hair',
  dovme: 'tattoo',
  'dovme-studyosu': 'tattoo',
  tattoo: 'tattoo',
};

const BY_TR_NAME: Record<string, string> = {
  'Kuaför': 'kuafor',
  'Berber': 'berber',
  'Güzellik Merkezi': 'guzellik-merkezi',
  'Cilt Bakımı': 'cilt-bakimi',
  'Masaj': 'masaj',
  'Spa': 'spa',
  'Manikür': 'manikur',
  'Pedikür': 'pedikur',
  'Lazer Epilasyon': 'lazer-epilasyon',
  'Saç Bakımı': 'sac-bakimi',
  'Dövme': 'dovme',
  'Dövme Stüdyosu': 'dovme-studyosu',
};

function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export type CategoryRef = { slug?: string | null; name?: string | null } | null | undefined;

/** Ready-made cover variants shipped in /public per sector (`sector-<name><suffix>.webp`). */
export const SECTOR_VARIANTS = ['', '-2', '-3', '-4', '-5', '-6', '-7', '-8'] as const;
/** Only the first ones are used as the automatic cover, so existing listings keep their image. */
const AUTO_VARIANTS = 2;
/** `cover_url` value for a ready-made cover the owner picked, e.g. `sector:hair-2`. */
export const SECTOR_CHOICE_PREFIX = 'sector:';

export function sectorOf(category: CategoryRef): string {
  return (category?.slug && SECTORS[category.slug])
    || (category?.name && SECTORS[BY_TR_NAME[category.name]])
    || 'beauty';
}

/** File name of a sector cover, relative to the site root: `sector-hair-2.webp`. */
export function sectorFileName(key: string): string {
  return `sector-${key}.webp`;
}

/** The key (`hair-2`) of a stored `sector:<key>` choice, or null when it is not a known one. */
export function sectorChoiceKey(coverUrl?: string | null): string | null {
  if (!coverUrl?.startsWith(SECTOR_CHOICE_PREFIX)) return null;
  const key = coverUrl.slice(SECTOR_CHOICE_PREFIX.length);
  const known = new Set(Object.values(SECTORS).flatMap((s) => SECTOR_VARIANTS.map((v) => `${s}${v}`)));
  return known.has(key) ? key : null;
}

/** The automatic cover for a business without a photo: stable per business, by category. */
export function placeholderKey(key: string, category: CategoryRef): string {
  const variant = SECTOR_VARIANTS[hash(key || 'rango') % AUTO_VARIANTS];
  return `${sectorOf(category)}${variant}`;
}

/**
 * Image URLs stored in the database (covers, galleries, staff avatars) can be written through
 * the REST API, so they are only rendered when they point at public objects in our own
 * `business-media` storage bucket or at the Pexels seed images. Anything else (tracking pixels,
 * other hosts, other Supabase endpoints such as /rest or /functions, non-https) returns null and
 * the caller shows its placeholder instead.
 */
function parseUrl(raw: unknown): URL | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

export function safeImageUrlFor(url: string | null | undefined, supabaseUrl: string | undefined, allowHttp = false): string | null {
  const u = parseUrl(url?.trim());
  if (!u || u.username || u.password) return null;
  if (u.protocol === 'https:' && u.host === 'images.pexels.com') return u.href;
  const supabase = parseUrl(supabaseUrl);
  // WHATWG URL parsing normalises '..' and '%2e%2e' segments, so an href prefix check cannot be
  // escaped into another API path.
  const mediaPrefix = supabase ? `${supabase.origin}/storage/v1/object/public/business-media/` : null;
  // Local development (supabase start) serves storage over plain http on the API origin.
  if (mediaPrefix && u.href.startsWith(mediaPrefix) && (u.protocol === 'https:' || allowHttp)) return u.href;
  return null;
}

export interface CoverChoice {
  /** Absolute URL of the business's own photo, or a site-root-relative sector cover (`sector-hair.webp`). */
  src: string;
  /** True for ready-made sector covers (picked or automatic), i.e. not the business's own photo. */
  placeholder: boolean;
}

/** The cover a business shows: its own photo when it has a safe one, otherwise a sector cover. */
export function coverChoice(
  b: { id?: string; slug?: string; cover_url?: string | null; categories?: CategoryRef },
  supabaseUrl: string | undefined,
  allowHttp = false,
): CoverChoice {
  const own = safeImageUrlFor(b.cover_url, supabaseUrl, allowHttp);
  if (own) return { src: own, placeholder: false };
  return { src: sectorFileName(sectorChoiceKey(b.cover_url) ?? placeholderKey(b.id ?? b.slug ?? '', b.categories)), placeholder: true };
}

/**
 * The first photo on a business's own page: its cover or, failing that, the first gallery
 * photo; a sector cover when it has no photo of its own.
 */
export function leadPhoto(
  b: { id?: string; slug?: string; cover_url?: string | null; gallery?: (string | null)[] | null; categories?: CategoryRef },
  supabaseUrl: string | undefined,
  allowHttp = false,
): CoverChoice {
  for (const url of [b.cover_url, ...(b.gallery ?? [])]) {
    const own = safeImageUrlFor(url, supabaseUrl, allowHttp);
    if (own) return { src: own, placeholder: false };
  }
  return coverChoice(b, supabaseUrl, allowHttp);
}
