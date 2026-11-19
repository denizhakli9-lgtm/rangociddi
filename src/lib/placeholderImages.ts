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

export function placeholderCover(key: string, category: CategoryRef): string {
  const sector = (category?.slug && SECTORS[category.slug])
    || (category?.name && SECTORS[BY_TR_NAME[category.name]])
    || 'beauty';
  const variant = hash(key || 'rango') % 2 === 0 ? '' : '-2';
  return `${import.meta.env.BASE_URL}sector-${sector}${variant}.webp`;
}

export interface CoverImage {
  src: string;
  placeholder: boolean;
}

export function businessCover(b: { id?: string; slug?: string; cover_url?: string | null; categories?: CategoryRef }): CoverImage {
  const own = safeImageUrl(b.cover_url);
  if (own) return { src: own, placeholder: false };
  return { src: placeholderCover(b.id ?? b.slug ?? '', b.categories), placeholder: true };
}
