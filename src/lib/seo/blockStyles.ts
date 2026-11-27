/**
 * İçerik bloklarının Tailwind sınıfları. React işleyicisi (`components/seo/Blocks.tsx`) ve
 * statik HTML işleyicisi (`seo/renderBlocks.ts`) aynı sınıfları buradan alır; ikisi her zaman
 * aynı görünür. Sınıflar tam yazılır (birleştirilerek üretilmez) ki Tailwind bu dosyadan bulsun.
 */
export const BLOCK_STYLES = {
  page: 'space-y-12 sm:space-y-14',

  breadcrumbList: 'flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-mist-2',
  breadcrumbLink: 'transition hover:text-white',
  breadcrumbCurrent: 'text-mist',
  breadcrumbSeparator: 'text-mist-3',

  heroEyebrow: 'eyebrow mb-3',
  heroTitle: 'font-display text-4xl leading-[1.08] tracking-[-0.02em] text-white sm:text-[52px]',
  heroLead: 'mt-4 max-w-2xl text-[15px] leading-relaxed text-mist sm:text-base',
  actions: 'mt-7 flex flex-wrap gap-3',
  actionPrimary: 'inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-fg transition-colors hover:bg-primary/90',
  actionSecondary: 'inline-flex min-h-11 items-center justify-center rounded-xl border border-line bg-coal px-5 text-sm font-semibold text-white transition-colors hover:border-white/40',

  sectionTitle: 'font-display text-[26px] text-white sm:text-3xl',
  sectionText: 'mt-1.5 max-w-2xl text-sm leading-relaxed text-mist',

  businessGrid: 'mt-5 grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3',
  businessCard: 'group block h-full',
  businessMedia: 'relative aspect-[4/3] overflow-hidden rounded-2xl bg-coal-2',
  businessImage: 'h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]',
  businessImageNote: 'pointer-events-none absolute bottom-2.5 left-2.5 rounded-md bg-black/70 px-2 py-1 text-[10px] font-medium text-[#fff]',
  businessBadge: 'absolute left-2.5 top-2.5 rounded-md bg-black/65 px-2 py-1 text-[11px] font-medium leading-none text-[#fff]',
  businessBody: 'pt-3',
  businessEyebrow: 'text-[13px] text-mist-2',
  businessName: 'mt-0.5 text-[15px] font-semibold leading-snug text-white',
  businessFacts: 'mt-0.5 text-[13px] text-mist',
  businessText: 'mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-mist-2',

  tableWrap: 'mt-5 overflow-x-auto rounded-2xl border border-line bg-coal',
  table: 'w-full text-left text-sm',
  tableHead: 'border-b border-line text-xs text-mist-2',
  tableHeadCell: 'px-4 py-3 font-medium',
  tableBody: 'divide-y divide-line',
  tableCellFirst: 'px-4 py-3 font-medium text-white',
  tableCell: 'px-4 py-3 text-mist',
  note: 'mt-2 text-xs leading-relaxed text-mist-2',

  linkList: 'mt-5 flex flex-wrap gap-2',
  linkChip: 'inline-flex min-h-10 items-center gap-2 rounded-full border border-line bg-coal px-4 py-2 text-sm text-white transition-colors hover:border-white/40',
  linkDetail: 'text-xs text-mist-2',

  cardGrid3: 'mt-6 grid gap-x-8 gap-y-8 sm:grid-cols-3',
  cardGrid: 'mt-6 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3',
  stepCard: 'border-t border-line pt-5',
  stepNumber: 'block font-display text-[34px] leading-none text-mist-3',
  cardTitle: 'mt-3 text-base font-semibold text-white',
  featureTitle: 'text-base font-semibold text-white',
  cardText: 'mt-1.5 text-sm leading-relaxed text-mist',

  faqList: 'mt-5 divide-y divide-line border-y border-line',
  faqItem: 'group py-4',
  faqQuestion: 'flex cursor-pointer list-none items-start justify-between gap-4 text-[15px] font-medium text-white [&::-webkit-details-marker]:hidden',
  faqIcon: 'mt-0.5 shrink-0 text-xl font-light leading-none text-mist-2 transition-transform group-open:rotate-45',
  faqAnswer: 'mt-2.5 max-w-3xl text-sm leading-relaxed text-mist',
  faqLink: 'mt-2 inline-block text-sm font-medium text-white underline underline-offset-4',

  prose: 'mt-4 max-w-3xl space-y-3 text-[15px] leading-relaxed text-mist',
  proseUntitled: 'max-w-3xl space-y-3 text-[15px] leading-relaxed text-mist',

  cta: 'rounded-3xl bg-coal-2 px-6 py-9 sm:px-10 sm:py-12',
  ctaTitle: 'font-display text-3xl text-white sm:text-4xl',
  ctaText: 'mt-2 max-w-2xl text-sm leading-relaxed text-mist',

  notice: 'text-sm leading-relaxed text-mist',
  noticeLink: 'ml-1 font-medium text-white underline underline-offset-4',
} as const;
