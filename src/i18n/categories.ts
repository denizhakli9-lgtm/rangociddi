import { locale } from '@/i18n/locale';

/**
 * English names for the platform's categories. Categories live in the database in Turkish;
 * matching is by slug when the query selected it, otherwise by the Turkish name. A category
 * added later without an entry here simply shows its Turkish name.
 */
const EN: Record<string, { name: string; description: string }> = {
  kuafor: { name: 'Hair salon', description: 'Cuts, colour and styling' },
  berber: { name: 'Barber', description: 'Classic cuts, beard trims and shaves' },
  'guzellik-merkezi': { name: 'Beauty salon', description: 'Make-up, brows, lashes and holistic care' },
  'cilt-bakimi': { name: 'Skin care', description: 'Professional facials and skin treatments' },
  masaj: { name: 'Massage', description: 'Relaxing and therapeutic massages' },
  spa: { name: 'Spa', description: 'Hammam, spa rituals and wellness' },
  manikur: { name: 'Manicure', description: 'Manicures, gel polish and nail art' },
  pedikur: { name: 'Pedicure', description: 'Foot care and spa pedicures' },
  'lazer-epilasyon': { name: 'Laser hair removal', description: 'Latest-generation laser treatments' },
  'sac-bakimi': { name: 'Hair care', description: 'Keratin, hair botox and repair treatments' },
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
};

type CategoryLike = { slug?: string | null; name?: string | null; description?: string | null } | null | undefined;

function entry(c: CategoryLike) {
  if (!c) return undefined;
  const slug = c.slug ?? (c.name ? BY_TR_NAME[c.name] : undefined);
  return slug ? EN[slug] : undefined;
}

/** The category's name in the current language. */
export function categoryName(c: CategoryLike): string {
  if (locale() === 'en') return entry(c)?.name ?? c?.name ?? '';
  return c?.name ?? '';
}

/** The category's description in the current language. */
export function categoryDescription(c: CategoryLike): string {
  if (locale() === 'en') return entry(c)?.description ?? c?.description ?? '';
  return c?.description ?? '';
}

/**
 * Business and service names are stored in Turkish, so an English search such as "barber"
 * would find nothing. When the visitor uses English and the query names a category, the
 * search switches to that category instead. Returns the category slug, or null.
 */
const EN_KEYWORDS: [RegExp, string][] = [
  [/\b(barber|barbers|beard|shave)\b/i, 'berber'],
  [/\b(hair ?salon|hairdresser|hairdressers|haircut|hair cut|hair colou?r|stylist)\b/i, 'kuafor'],
  [/\b(hair ?care|keratin|hair treatment)\b/i, 'sac-bakimi'],
  [/\b(beauty|make-?up|brows?|lashes|eyelash)\b/i, 'guzellik-merkezi'],
  [/\b(skin|facial|facials|skincare)\b/i, 'cilt-bakimi'],
  [/\b(massage|massages)\b/i, 'masaj'],
  [/\b(spa|hammam|turkish bath|wellness)\b/i, 'spa'],
  [/\b(manicure|nails?|nail art|gel polish)\b/i, 'manikur'],
  [/\b(pedicure|foot care)\b/i, 'pedikur'],
  [/\b(laser|hair removal|epilation)\b/i, 'lazer-epilasyon'],
];

const FILLER = /\b(near ?me|nearby|in|izmir|the|a|an|best|good|cheap|salon|salons|shop|shops|studio|place|places|for|women|men|ladies|gents)\b/gi;

export function englishQueryToCategory(query: string): string | null {
  if (locale() !== 'en') return null;
  const q = query.trim();
  if (!q) return null;
  const hit = EN_KEYWORDS.find(([re]) => re.test(q));
  if (!hit) return null;
  // Only a pure category search ("barber", "nails near me") switches; a name such as
  // "Luna Spa" or "Ayşe Hair Studio" with other words left over stays a text search.
  const rest = q.replace(new RegExp(hit[0].source, 'gi'), ' ').replace(FILLER, ' ').replace(/[^\p{L}\p{N}]+/gu, '');
  return rest ? null : hit[1];
}
