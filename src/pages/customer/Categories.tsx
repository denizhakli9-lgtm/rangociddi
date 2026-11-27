import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { useCategories, useCityListing } from '@/lib/landingApi';
import { CategoryIcon } from '@/components/CategoryIcon';
import { ErrorState } from '@/components/ui/Feedback';
import { formatTRY } from '@/lib/format';
import { categoryDescription, categoryName } from '@/i18n/categories';
import { locale, tx } from '@/i18n/locale';
import { categoriesMeta } from '@/lib/seo/meta';
import { isBookable, isLandingIndexable, lowestPrice } from '@/lib/seo/listing';
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
    const indexable = categories.filter((c) => isLandingIndexable('cityCategory', bookable.filter((b) => b.categories?.slug === c.slug).length));
    return categoriesMeta(lang, indexable.map((c) => ({ slug: c.slug, name: categoryName(c) })));
  }, [data, categories, bookable, lang]);
  useSeo(meta);

  return (
    <div>
      <p className="eyebrow mb-2">{tx('Kategoriler', 'Categories')}</p>
      <h1 className="font-display text-4xl text-white">{tx('Size iyi gelecek her şey', 'Everything that feels good')}</h1>
      <p className="mt-2 max-w-xl text-sm text-mist">{tx('Kadınlara ve erkeklere hizmet veren işletmeleri kategoriye göre keşfedin.', 'Browse businesses for women and men by category.')}</p>

      {error ? (
        <div className="mt-8"><ErrorState onRetry={reload} error={error} /></div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-40" />)
            : categories.map((c, idx) => {
                const listed = bookable.filter((b) => b.categories?.slug === c.slug);
                const count = listed.length;
                const minPrice = lowestPrice(listed) ?? 0;
                return (
                  <Link
                    key={c.id}
                    to={cityCategoryPath(DEFAULT_CITY, c.slug)}
                    style={{ animationDelay: `${idx * 40}ms` }}
                    className="card group relative animate-fade-up overflow-hidden p-6 transition hover:-translate-y-0.5 hover:border-white/30"
                  >
                    <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gold-500/5 transition group-hover:bg-gold-500/15" />
                    <div className="relative flex items-start justify-between">
                      <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-gold-500/10 text-gold-400">
                        <CategoryIcon name={c.icon} className="h-5 w-5" />
                      </span>
                      <ArrowUpRight className="h-5 w-5 text-mist-3 transition group-hover:text-gold-400" />
                    </div>
                    <h2 className="relative mt-5 font-display text-2xl text-white">{categoryName(c)}</h2>
                    <p className="relative mt-1 line-clamp-2 text-xs text-mist-2">{categoryDescription(c)}</p>
                    {/* The line keeps its height while the numbers load, so the cards do not jump. */}
                    <p className="relative mt-4 min-h-4 text-xs text-mist">
                      {count > 0 ? (
                        <>
                          <span className="text-white">{tx(`${count} işletme`, count === 1 ? '1 business' : `${count} businesses`)}</span>
                          {minPrice > 0 && <> · {tx(`${formatTRY(minPrice)}’den başlayan`, `from ${formatTRY(minPrice)}`)}</>}
                        </>
                      ) : (
                        listingQ.data && <span className="text-mist-2">{tx('Yakında', 'Coming soon')}</span>
                      )}
                    </p>
                  </Link>
                );
              })}
        </div>
      )}
    </div>
  );
}
