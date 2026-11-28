import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MapPinOff } from 'lucide-react';
import { useCategories, useCityListing } from '@/lib/landingApi';
import { Blocks } from '@/components/seo/Blocks';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/Feedback';
import { buildLandingPage } from '@/lib/seo/pages/landing';
import { DEFAULT_CITY, findDistrict } from '@/lib/seo/places';
import { useSeo } from '@/lib/seo/useSeo';
import { categoryDescription, categoryName } from '@/i18n/categories';
import { locale, tx } from '@/i18n/locale';

/**
 * City, district and category pages: /izmir, /izmir/kuafor, /izmir/karsiyaka,
 * /izmir/karsiyaka/berber. The page itself is described by `buildLandingPage`, which the build
 * also runs to publish the same page as static HTML.
 *
 * The first segment after the city is a category when one has that slug, otherwise a district.
 */
export default function Landing() {
  const { first, second } = useParams();
  const navigate = useNavigate();
  const city = DEFAULT_CITY;
  const categoriesQ = useCategories();
  const listingQ = useCityListing(city.name);
  const lang = locale();

  const page = useMemo(() => {
    if (!categoriesQ.data || !listingQ.data) return null;
    const categories = categoriesQ.data.map((c) => ({ id: c.id, slug: c.slug, name: categoryName(c), description: categoryDescription(c) }));
    const bySlug = (slug?: string) => categories.find((c) => c.slug === slug);
    let category = undefined as (typeof categories)[number] | undefined;
    let district = undefined as ReturnType<typeof findDistrict>;
    if (first && second) {
      district = findDistrict(city, first);
      category = bySlug(second);
      if (!district || !category) return 'missing' as const;
    } else if (first) {
      category = bySlug(first);
      if (!category) district = findDistrict(city, first);
      if (!category && !district) return 'missing' as const;
    }
    return buildLandingPage({ lang, city, district, category, categories, businesses: listingQ.data, supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined });
  }, [categoriesQ.data, listingQ.data, first, second, city, lang]);

  // An unknown area or category answers 200 (single-page app), so it is kept out of search results.
  useSeo(
    page === null
      ? null
      : page === 'missing'
        ? { title: `${tx('Sayfa bulunamadı', 'Page not found')} | Rango`, description: tx('Aradığınız semt veya kategori bulunamadı.', 'The area or category you are looking for was not found.'), path: `/${[city.slug, first, second].filter(Boolean).join('/')}`, noindex: true }
        : page.meta,
  );

  const error = categoriesQ.error || listingQ.error;
  if (error) return <ErrorState onRetry={() => { void categoriesQ.reload(); void listingQ.reload(); }} error={import.meta.env.DEV ? error : undefined} />;
  if (page === null) return <PageLoader />;
  if (page === 'missing') {
    return (
      // As tall as the loading state it replaces, so the footer does not jump into view.
      <div className="flex min-h-[calc(100vh-5.5rem-env(safe-area-inset-top))] items-center supports-[height:100svh]:min-h-[calc(100svh-5.5rem-env(safe-area-inset-top))] justify-center">
        <EmptyState
          icon={<MapPinOff className="h-6 w-6" />}
          title={tx('Sayfa bulunamadı', 'Page not found')}
          text={tx('Aradığınız semt veya kategori bulunamadı.', 'The area or category you are looking for was not found.')}
          action={<Button onClick={() => navigate(`/${city.slug}`)}>{tx(`${city.name} sayfasına git`, `Go to ${city.name}`)}</Button>}
        />
      </div>
    );
  }
  return <Blocks blocks={page.blocks} />;
}
