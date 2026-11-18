import { safeImageUrl } from '@/lib/safeUrl';

/**
 * Sector photos shown for a business that has not uploaded a cover photo yet.
 *
 * All images are from Pexels (free to use, no attribution required) and are the same
 * photos the sample businesses already use, so they are known to load. A business always
 * gets the same photo (chosen from its id), and neighbouring cards in a list usually get
 * different ones. The photo is never saved on the business: as soon as the owner uploads a
 * cover, theirs is shown instead. Wherever a placeholder is shown it is labelled
 * "Temsili görsel" so customers do not take it for the real salon.
 */
const POOLS: Record<string, number[]> = {
  kuafor: [7195796, 7195812, 7750124, 7195799, 7195811],
  berber: [3037244, 37764947, 9146943, 9971239, 5970245],
  'guzellik-merkezi': [7195799, 12115040, 7446914, 7581075, 7195812],
  'cilt-bakimi': [7446659, 7581075, 12115040, 36436447, 3764552],
  masaj: [6629605, 6629612, 6629614, 9268044, 6186740],
  spa: [6186740, 19695978, 6629614, 9268044, 6629612],
  manikur: [3738377, 4783335, 7446914],
  pedikur: [31091766, 19695978, 7755554],
  'lazer-epilasyon': [10822318, 14438392, 3985354],
  'sac-bakimi': [7195811, 7195796, 7750124],
};

/** Used when the category is unknown (a category added later without its own photos). */
const FALLBACK = [7195799, 3037244, 6186740, 7446659, 3738377];

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
};

const pexels = (id: number) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1200`;

/** Small, stable string hash (FNV-1a) so a business always gets the same photo. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

type CategoryRef = { slug?: string | null; name?: string | null } | null | undefined;

/** The sector photo for a business without a cover. `key` is the business id (or slug). */
export function placeholderCover(key: string, category: CategoryRef): string {
  const slug = category?.slug ?? (category?.name ? BY_TR_NAME[category.name] : undefined);
  const pool = (slug && POOLS[slug]) || FALLBACK;
  return pexels(pool[hash(key || 'rango') % pool.length]);
}

export interface CoverImage {
  src: string;
  /** True when this is a sector photo standing in for the business's own cover. */
  placeholder: boolean;
}

/** The business's own cover when it has a usable one, otherwise its sector photo. */
export function businessCover(b: { id?: string; slug?: string; cover_url?: string | null; categories?: CategoryRef }): CoverImage {
  const own = safeImageUrl(b.cover_url);
  if (own) return { src: own, placeholder: false };
  return { src: placeholderCover(b.id ?? b.slug ?? '', b.categories), placeholder: true };
}
