/**
 * Ana sayfanın işletme listelerinden sonra gelen içerik bölümleri: nasıl çalışır, hizmete ve
 * semte göre bağlantılar, sık sorulan sorular ve işletme sahiplerine çağrı. Uygulamada
 * `pages/customer/Home.tsx`, statik ana sayfada `seo/prerender.ts` aynı listeyi gösterir.
 */
import type { Block, BlockLink, FaqItem } from '../blocks';
import { businessPath, faqSchema, itemListSchema, type SeoCategory, type SeoLang } from '../meta';
import { cityCategoryPath, cityPath, districtPath, locativeTr, type PlaceCity } from '../places';
import { buildFacets, isBookable, isLandingIndexable, sortForListing, toSummary, type ListingBusiness } from '../listing';
import { FAQ_PATH, bookingFaqItems, howItWorksBlock, ownerCtaBlock } from './common';

const pick = (lang: SeoLang, tr: string, en: string) => (lang === 'en' ? en : tr);

export interface HomeExtrasInput {
  lang: SeoLang;
  city: PlaceCity;
  /** Active categories in display order, in the page's language. */
  categories: SeoCategory[];
  /** The city's approved businesses; null while they are not known (the business and link sections are left out). */
  businesses: ListingBusiness[] | null;
  /** The project's Supabase URL, needed to show a business's own photo (see sectorCovers.ts). */
  supabaseUrl?: string;
}

/** How many businesses the home page lists; all of them are on the city page. */
const MAX_HOME_BUSINESSES = 12;

/** The real, bookable businesses shown on the home page, most popular first. */
function homeBusinesses(input: HomeExtrasInput): ListingBusiness[] {
  return input.businesses ? sortForListing(input.businesses.filter(isBookable)).slice(0, MAX_HOME_BUSINESSES) : [];
}

const businessesTitle = (lang: SeoLang) => pick(lang, 'Rango’da randevu alabileceğiniz işletmeler', 'Businesses you can book on Rango');

export function homeFaqItems(lang: SeoLang): FaqItem[] {
  return [
    {
      q: pick(lang, 'Rango nedir?', 'What is Rango?'),
      a: pick(
        lang,
        'Rango; kuaför, berber, güzellik merkezi, spa ve benzeri kişisel bakım işletmelerinden online randevu almanızı sağlayan bir platformdur. Rango şu anda İzmir’de hizmet veriyor.',
        'Rango is a platform for booking hair salons, barbers, beauty salons, spas and similar personal-care businesses online. Rango currently serves İzmir.',
      ),
    },
    {
      q: pick(lang, 'Rango’yu kullanmak ücretli mi?', 'Does it cost anything to use Rango?'),
      a: pick(
        lang,
        'Hayır. Hesap oluşturmak ve randevu almak müşteriler için ücretsizdir; ödeyeceğiniz tutar, işletmenin belirlediği hizmet fiyatıdır.',
        'No. Creating an account and booking is free for customers; what you pay is the service price set by the business.',
      ),
    },
    ...bookingFaqItems(lang),
  ];
}

export function homeExtraBlocks(input: HomeExtrasInput): Block[] {
  const { lang, city, categories, businesses } = input;
  const count = (n: number) => pick(lang, `${n} işletme`, n === 1 ? '1 business' : `${n} businesses`);
  const blocks: Block[] = [];

  const listed = homeBusinesses(input);
  if (listed.length) {
    const labelOf = (b: ListingBusiness) => categories.find((c) => c.slug === b.categories?.slug)?.name;
    blocks.push({
      kind: 'businesses',
      title: businessesTitle(lang),
      items: listed.map((b) => toSummary(b, lang, { categoryLabel: labelOf(b), supabaseUrl: input.supabaseUrl })),
    });
  }
  blocks.push(howItWorksBlock(lang));

  if (businesses) {
    const facets = buildFacets(city, businesses);
    const services: BlockLink[] = categories
      .map((c) => ({ c, n: facets.byCategory.get(c.slug) ?? 0 }))
      .filter(({ n }) => isLandingIndexable('cityCategory', n))
      .map(({ c, n }) => ({ label: `${city.name} ${c.name}`, path: cityCategoryPath(city, c.slug), detail: count(n) }));
    if (isLandingIndexable('city', facets.total)) {
      services.unshift({ label: pick(lang, `${locativeTr(city.name)}ki tüm işletmeler`, `All businesses in ${city.name}`), path: cityPath(city), detail: count(facets.total) });
    }
    if (services.length) blocks.push({ kind: 'links', title: pick(lang, 'Hizmete göre keşfedin', 'Browse by service'), items: services });

    const districts: BlockLink[] = city.districts
      .map((d) => ({ d, n: facets.byDistrict.get(d.slug) ?? 0 }))
      .filter(({ n }) => isLandingIndexable('district', n))
      .map(({ d, n }) => ({ label: d.name, path: districtPath(city, d), detail: count(n) }));
    if (districts.length) blocks.push({ kind: 'links', title: pick(lang, 'Semte göre keşfedin', 'Browse by area'), items: districts });
  }

  blocks.push({ kind: 'faq', title: pick(lang, 'Sık sorulan sorular', 'Frequently asked questions'), items: homeFaqItems(lang) });
  blocks.push({
    kind: 'notice',
    text: pick(lang, 'Kapora, iptal, iade ve işletme üyeliği hakkında daha fazlası:', 'More about deposits, cancellations, refunds and joining as a business:'),
    link: { label: pick(lang, 'Tüm sorular ve yanıtlar', 'All questions and answers'), path: FAQ_PATH },
  });
  blocks.push(ownerCtaBlock(lang));
  return blocks;
}

/**
 * Structured data for the home page: the businesses it lists and the two questions about Rango
 * itself. The booking questions are shown here too, but they are marked up once, on /sss.
 */
export function homeSchemas(input: HomeExtrasInput): Record<string, unknown>[] {
  const listed = homeBusinesses(input);
  return [
    ...(listed.length ? [itemListSchema(businessesTitle(input.lang), listed.map((b) => ({ name: b.name, path: businessPath(b.slug) })))] : []),
    faqSchema(homeFaqItems(input.lang).slice(0, 2)),
  ];
}
