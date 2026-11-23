import { safeImageUrl } from '@/lib/safeUrl';

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

type CategoryRef = { slug?: string | null; name?: string | null } | null | undefined;

/** Ready-made cover variants shipped in /public per sector (`sector-<name><suffix>.webp`). */
const VARIANTS = ['', '-2', '-3', '-4', '-5', '-6', '-7', '-8'] as const;
/** Only the first ones are used as the automatic cover, so existing listings keep their image. */
const AUTO_VARIANTS = 2;
/** `cover_url` value for a ready-made cover the owner picked, e.g. `sector:hair-2`. */
const CHOICE_PREFIX = 'sector:';

function sectorOf(category: CategoryRef): string {
  return (category?.slug && SECTORS[category.slug])
    || (category?.name && SECTORS[BY_TR_NAME[category.name]])
    || 'beauty';
}

const fileFor = (key: string) => `${import.meta.env.BASE_URL}sector-${key}.webp`;

export interface SectorOption {
  /** Value to store in `businesses.cover_url`. */
  value: string;
  src: string;
}

/** The ready-made covers an owner can pick from for their category. */
export function sectorCoverOptions(category: CategoryRef): SectorOption[] {
  const sector = sectorOf(category);
  return VARIANTS.map((v) => ({ value: `${CHOICE_PREFIX}${sector}${v}`, src: fileFor(`${sector}${v}`) }));
}

/** Resolves a stored `sector:<key>` choice to its image, or null when it is not a known one. */
export function sectorChoiceSrc(coverUrl?: string | null): string | null {
  if (!coverUrl?.startsWith(CHOICE_PREFIX)) return null;
  const key = coverUrl.slice(CHOICE_PREFIX.length);
  const known = new Set(Object.values(SECTORS).flatMap((s) => VARIANTS.map((v) => `${s}${v}`)));
  return known.has(key) ? fileFor(key) : null;
}

export function placeholderCover(key: string, category: CategoryRef): string {
  const variant = VARIANTS[hash(key || 'rango') % AUTO_VARIANTS];
  return fileFor(`${sectorOf(category)}${variant}`);
}

export interface CoverImage {
  src: string;
  /** True for ready-made sector covers (picked or automatic), i.e. not the business's own photo. */
  placeholder: boolean;
}

export function businessCover(b: { id?: string; slug?: string; cover_url?: string | null; categories?: CategoryRef }): CoverImage {
  const own = safeImageUrl(b.cover_url);
  if (own) return { src: own, placeholder: false };
  return { src: sectorChoiceSrc(b.cover_url) ?? placeholderCover(b.id ?? b.slug ?? '', b.categories), placeholder: true };
}
