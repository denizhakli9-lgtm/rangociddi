/**
 * İçerik bloklarının Tailwind sınıfları. React işleyicisi (`components/seo/Blocks.tsx`) ve
 * statik HTML işleyicisi (`seo/renderBlocks.ts`) aynı sınıfları buradan alır; ikisi her zaman
 * aynı görünür. Sınıflar tam yazılır (birleştirilerek üretilmez) ki Tailwind bu dosyadan bulsun.
 */
export const BLOCK_STYLES = {
  page: 'space-y-10',

  breadcrumbList: 'flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-mist-2',
  breadcrumbLink: 'transition hover:text-white',
  breadcrumbCurrent: 'text-mist',
  breadcrumbSeparator: 'text-mist-3',

  heroEyebrow: 'eyebrow mb-2',
  heroTitle: 'font-display text-4xl text-white sm:text-5xl',
  heroLead: 'mt-3 max-w-2xl text-sm leading-relaxed text-mist sm:text-base',
  actions: 'mt-6 flex flex-wrap gap-3',
  actionPrimary: 'inline-flex h-11 items-center justify-center rounded-full bg-gold-500 px-5 text-sm font-semibold text-ink transition hover:bg-gold-400',
  actionSecondary: 'inline-flex h-11 items-center justify-center rounded-full border border-line bg-coal px-5 text-sm font-semibold text-white transition hover:border-gold-500/40',

  sectionTitle: 'font-display text-3xl text-white',
  sectionText: 'mt-1 max-w-2xl text-sm leading-relaxed text-mist',

  businessGrid: 'mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3',
  businessCard: 'card group block h-full overflow-hidden transition hover:border-gold-500/40',
  businessMedia: 'relative aspect-[4/3] overflow-hidden bg-coal-2',
  businessImage: 'h-full w-full object-cover transition duration-500 group-hover:scale-105',
  businessImageNote: 'pointer-events-none absolute bottom-2.5 left-2.5 rounded-xl bg-black/85 px-2.5 py-1 text-[10px] font-medium text-white',
  businessBadge: 'absolute left-3 top-3 rounded-full border border-warning-500/40 bg-ink/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-warning-300',
  businessBody: 'p-4',
  businessEyebrow: 'text-[10px] uppercase tracking-[0.2em] text-gold-400',
  businessName: 'mt-1 font-display text-2xl leading-tight text-white',
  businessFacts: 'mt-1 text-xs text-mist',
  businessText: 'mt-2 line-clamp-2 text-sm text-mist-2',

  tableWrap: 'mt-4 overflow-x-auto rounded-2xl border border-line bg-coal',
  table: 'w-full text-left text-sm',
  tableHead: 'bg-white/[0.03] text-xs uppercase tracking-wide text-mist-2',
  tableHeadCell: 'px-4 py-3 font-medium',
  tableBody: 'divide-y divide-line',
  tableCellFirst: 'px-4 py-3 font-medium text-white',
  tableCell: 'px-4 py-3 text-mist',
  note: 'mt-2 text-xs leading-relaxed text-mist-2',

  linkList: 'mt-4 flex flex-wrap gap-2',
  linkChip: 'inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-coal px-4 py-2 text-sm text-white transition hover:border-gold-500/40',
  linkDetail: 'text-xs text-mist-2',

  cardGrid3: 'mt-4 grid gap-4 sm:grid-cols-3',
  cardGrid: 'mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3',
  stepCard: 'card p-5',
  stepNumber: 'flex h-9 w-9 items-center justify-center rounded-full border border-gold-500/40 bg-gold-500/10 font-display text-lg text-gold-400',
  cardTitle: 'mt-3 font-display text-2xl leading-tight text-white',
  featureTitle: 'font-display text-2xl leading-tight text-white',
  cardText: 'mt-2 text-sm leading-relaxed text-mist',

  faqList: 'mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-coal',
  faqItem: 'group px-5 py-4',
  faqQuestion: 'flex cursor-pointer list-none items-start justify-between gap-4 text-[15px] font-medium text-white [&::-webkit-details-marker]:hidden',
  faqIcon: 'mt-0.5 shrink-0 text-lg leading-none text-gold-400 transition group-open:rotate-45',
  faqAnswer: 'mt-3 max-w-3xl text-sm leading-relaxed text-mist',
  faqLink: 'mt-2 inline-block text-sm font-semibold text-gold-500',

  prose: 'mt-4 max-w-3xl space-y-3 text-[15px] leading-relaxed text-mist',
  proseUntitled: 'max-w-3xl space-y-3 text-[15px] leading-relaxed text-mist',

  cta: 'card-gold p-6 sm:p-8',
  ctaTitle: 'font-display text-3xl text-white',
  ctaText: 'mt-2 max-w-2xl text-sm leading-relaxed text-mist',

  notice: 'rounded-2xl border border-dashed border-line p-5 text-sm leading-relaxed text-mist',
  noticeLink: 'ml-1 font-semibold text-gold-500',
} as const;
