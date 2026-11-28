import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useCategories, useCityListing } from '@/lib/landingApi';
import { CategoryIcon } from '@/components/CategoryIcon';
import { ErrorState } from '@/components/ui/Feedback';
import { fromPrice } from '@/lib/format';
import { categoryDescription, categoryName } from '@/i18n/categories';
import { locale, tx } from '@/i18n/locale';
import { categoriesMeta } from '@/lib/seo/meta';
import { inCategory, isBookable, isLandingIndexable, lowestPrice } from '@/lib/seo/listing';
import { useSeo } from '@/lib/seo/useSeo';
import { DEFAULT_CITY, cityCategoryPath } from '@/lib/seo/places';

export default function Categories() {
  // Both are known at once when the page was opened as static HTML (embedded data), so the
  // list appears without a loading state.
  const { data, loading, error, reload } = useCategories();
  const listingQ = useCityListing(DEFAULT_CITY.name);
  const categories = useMemo(() => data ?? [], [data]);
  // The numbers on a card follow the rule of the page it opens: real businesses that can be booked.
  const bookable = useMemo(() => (listingQ.data ?? []).filter(isBookable), [listingQ.data]);
  const lang = locale();
  const meta = useMemo(() => {
    if (!data) return null;
    // The structured list names only the categories whose own page may be indexed.
    const indexable = categories.filter((c) => isLandingIndexable('cityCategory', bookable.filter((b) => inCategory(b, c.slug, categories)).length));
    return categoriesMeta(lang, indexable.map((c) => ({ slug: c.slug, name: categoryName(c) })));
  }, [data, categories, bookable, lang]);
  useSeo(meta);

  return (
    <div className="pt-2 sm:pt-6">
      <h1 className="font-display text-4xl leading-[1.08] tracking-[-0.02em] text-white sm:text-[52px]">{tx('Hizmet kategorileri', 'Service categories')}</h1>
      <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-mist">{tx('Kadınlara ve erkeklere hizmet veren işletmeleri kategoriye göre keşfedin.', 'Browse businesses for women and men by category.')}</p>

      {error ? (
        <div className="mt-8"><ErrorState onRetry={reload} error={error} /></div>
      ) : (
        <ul className="mt-8 grid gap-x-10 sm:grid-cols-2 lg:grid-cols-3">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => <li key={i} className="border-t border-line py-5"><div className="skeleton h-12" /></li>)
            : categories.map((c) => {
                const listed = bookable.filter((b) => inCategory(b, c.slug, categories));
                const count = listed.length;
                const minPrice = lowestPrice(listed) ?? 0;
                const description = categoryDescription(c);
                return (
                  <li key={c.id}>
                    <Link to={cityCategoryPath(DEFAULT_CITY, c.slug)} className="group flex h-full items-start justify-between gap-4 border-t border-line py-5">
                      <span className="min-w-0">
                        <span className="flex items-center gap-2.5 text-base font-semibold text-white">
                          <CategoryIcon name={c.icon} className="h-[18px] w-[18px] shrink-0 text-mist-2" />
                          {categoryName(c)}
                        </span>
                        {description && <span className="mt-1 block text-[13px] leading-relaxed text-mist">{description}</span>}
                        {/* The line keeps its height while the numbers load, so the list does not jump. */}
                        <span className="mt-2 block min-h-[18px] text-[13px] text-mist-2">
                          {count > 0 ? (
                            <>
                              <span className="font-medium text-white">{tx(`${count} işletme`, count === 1 ? '1 business' : `${count} businesses`)}</span>
                              {minPrice > 0 && <> · {fromPrice(minPrice)}</>}
                            </>
                          ) : (
                            listingQ.data && tx('Yakında', 'Coming soon')
                          )}
                        </span>
                      </span>
                      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-mist-3 transition-transform group-hover:translate-x-0.5 group-hover:text-white" />
                    </Link>
                  </li>
                );
              })}
        </ul>
      )}
    </div>
  );
}
