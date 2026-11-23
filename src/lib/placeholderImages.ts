import {
  SECTOR_CHOICE_PREFIX,
  SECTOR_VARIANTS,
  coverChoice,
  placeholderKey,
  sectorChoiceKey,
  sectorFileName,
  sectorOf,
  type CategoryRef,
} from '@/lib/sectorCovers';

const fileFor = (key: string) => `${import.meta.env.BASE_URL}${sectorFileName(key)}`;

export interface SectorOption {
  /** Value to store in `businesses.cover_url`. */
  value: string;
  src: string;
}

/** The ready-made covers an owner can pick from for their category. */
export function sectorCoverOptions(category: CategoryRef): SectorOption[] {
  const sector = sectorOf(category);
  return SECTOR_VARIANTS.map((v) => ({ value: `${SECTOR_CHOICE_PREFIX}${sector}${v}`, src: fileFor(`${sector}${v}`) }));
}

/** Resolves a stored `sector:<key>` choice to its image, or null when it is not a known one. */
export function sectorChoiceSrc(coverUrl?: string | null): string | null {
  const key = sectorChoiceKey(coverUrl);
  return key ? fileFor(key) : null;
}

export function placeholderCover(key: string, category: CategoryRef): string {
  return fileFor(placeholderKey(key, category));
}

export interface CoverImage {
  src: string;
  /** True for ready-made sector covers (picked or automatic), i.e. not the business's own photo. */
  placeholder: boolean;
}

export function businessCover(b: { id?: string; slug?: string; cover_url?: string | null; categories?: CategoryRef }): CoverImage {
  const cover = coverChoice(b, import.meta.env.VITE_SUPABASE_URL as string | undefined, import.meta.env.DEV);
  return cover.placeholder ? { src: `${import.meta.env.BASE_URL}${cover.src}`, placeholder: true } : cover;
}
