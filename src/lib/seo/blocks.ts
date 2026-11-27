/**
 * İçerik sayfalarının veri modeli.
 *
 * Semt/kategori sayfaları, SSS ve "İşletmeler için" gibi içerik sayfaları burada tanımlanan
 * bloklardan oluşur. Aynı blok listesi iki yerde işlenir:
 *  - uygulamada React ile: `src/components/seo/Blocks.tsx`
 *  - derleme sırasında statik HTML olarak: `seo/renderBlocks.ts`
 * Böylece arama motorunun gördüğü statik sayfa ile ziyaretçinin gördüğü sayfa aynı metni taşır.
 *
 * Kurallar: metinler düz yazıdır (HTML yok); bağlantılar `path` ile verilir. `/` ile başlayan
 * yollar site içidir, `https://`, `mailto:` ve `tel:` ile başlayanlar dışarı açılır.
 * Bu dosya saf veridir: tarayıcıya ya da `@/` takma adına bağlı hiçbir şey içermez.
 */
import type { PageMeta } from './meta';

export interface BlockLink {
  label: string;
  path: string;
  /** Small secondary text next to the label, e.g. "3 işletme". */
  detail?: string;
}

export interface BlockAction extends BlockLink {
  primary?: boolean;
}

/** What a listing card needs; everything is already formatted for display. */
export interface BusinessSummary {
  slug: string;
  name: string;
  path: string;
  category?: string;
  district?: string;
  /** e.g. "₺250" */
  priceFrom?: string;
  /** e.g. "4.8" (only when the business has reviews) */
  rating?: string;
  reviewCount?: number;
  description?: string;
  /** Cover photo. `note` labels a ready-made sector photo ("Temsili görsel"). */
  image?: { src: string; alt: string; note?: string };
  /** Short label over the photo, e.g. "Örnek işletme" for a sample listing. */
  badge?: string;
}

export interface FaqItem {
  q: string;
  a: string;
  link?: BlockLink;
}

export type Block =
  | { kind: 'breadcrumb'; items: { name: string; path?: string }[] }
  | { kind: 'hero'; eyebrow?: string; title: string; lead?: string; actions?: BlockAction[] }
  | { kind: 'businesses'; title?: string; text?: string; items: BusinessSummary[] }
  | { kind: 'table'; title: string; text?: string; head: string[]; rows: string[][]; note?: string }
  | { kind: 'links'; title: string; text?: string; items: BlockLink[] }
  | { kind: 'steps'; title: string; text?: string; items: { title: string; text: string }[] }
  | { kind: 'features'; title: string; text?: string; items: { title: string; text: string }[] }
  | { kind: 'faq'; title: string; text?: string; items: FaqItem[] }
  | { kind: 'prose'; title?: string; paragraphs: string[] }
  | { kind: 'cta'; title: string; text?: string; actions: BlockAction[] }
  | { kind: 'notice'; text: string; link?: BlockLink };

export interface PageModel {
  meta: PageMeta;
  blocks: Block[];
}

export function isExternalPath(path: string): boolean {
  return !path.startsWith('/');
}

/** Every question on the page, in order (several FAQ blocks are merged). */
export function faqItems(blocks: Block[]): FaqItem[] {
  return blocks.flatMap((b) => (b.kind === 'faq' ? b.items : []));
}

/** The breadcrumb trail shown on the page, if it has one. */
export function breadcrumbItems(blocks: Block[]): { name: string; path?: string }[] {
  const block = blocks.find((b) => b.kind === 'breadcrumb');
  return block && block.kind === 'breadcrumb' ? block.items : [];
}

/** The one-line facts under a business name: "Karşıyaka · ★ 4.8 (12) · ₺250’den". */
export function businessFactsLine(item: BusinessSummary): string {
  return [
    item.district,
    item.rating ? `★ ${item.rating}${item.reviewCount ? ` (${item.reviewCount})` : ''}` : '',
    item.priceFrom ?? '',
  ]
    .filter(Boolean)
    .join(' · ');
}
