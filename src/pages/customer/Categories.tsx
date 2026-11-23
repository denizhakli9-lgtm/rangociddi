import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { fetchCategories, fetchCategoryStats } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { CategoryIcon } from '@/components/CategoryIcon';
import { ErrorState } from '@/components/ui/Feedback';
import { formatTRY } from '@/lib/format';
import { categoryDescription, categoryName } from '@/i18n/categories';
import { locale, tx } from '@/i18n/locale';
import { categoriesMeta } from '@/lib/seo/meta';
import { useSeo } from '@/lib/seo/useSeo';

export default function Categories() {
  const { data, loading, error, reload } = useAsync(async () => {
    const [categories, stats] = await Promise.all([fetchCategories(), fetchCategoryStats()]);
    return { categories, stats: new Map(stats.map((s) => [s.category_id, s])) };
  }, []);
  const categories = data?.categories ?? [];
  useSeo(data ? categoriesMeta(locale(), categories.map((c) => ({ slug: c.slug, name: categoryName(c) }))) : null);

  return (
    <div>
      <p className="eyebrow mb-2">{tx('Kategoriler', 'Categories')}</p>
      <h1 className="font-display text-4xl text-white">{tx('Size iyi gelecek her şey', 'Everything that feels good')}</h1>
      <p className="mt-2 max-w-xl text-sm text-mist">{tx('Kadın ve erkek müşterilere özel hizmet veren seçkin işletmeleri kategoriye göre keşfedin.', 'Browse selected businesses for women and men by category.')}</p>

      {error ? (
        <div className="mt-8"><ErrorState onRetry={reload} error={error} /></div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-40" />)
            : categories.map((c, idx) => {
                const stat = data?.stats.get(c.id);
                const count = stat?.business_count ?? 0;
                const minPrice = stat?.min_price ?? 0;
                return (
                  <Link
                    key={c.id}
                    to={`/ara?kategori=${c.slug}`}
                    style={{ animationDelay: `${idx * 40}ms` }}
                    className="card group relative animate-fade-up overflow-hidden p-6 transition hover:-translate-y-0.5 hover:border-gold-500/40"
                  >
                    <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gold-500/5 transition group-hover:bg-gold-500/15" />
                    <div className="relative flex items-start justify-between">
                      <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-gold-500/30 bg-gold-500/10 text-gold-400">
                        <CategoryIcon name={c.icon} className="h-5 w-5" />
                      </span>
                      <ArrowUpRight className="h-5 w-5 text-mist-3 transition group-hover:text-gold-400" />
                    </div>
                    <h2 className="relative mt-5 font-display text-2xl text-white">{categoryName(c)}</h2>
                    <p className="relative mt-1 line-clamp-2 text-xs text-mist-2">{categoryDescription(c)}</p>
                    <p className="relative mt-4 text-xs text-mist">
                      <span className="text-white">{tx(`${count} işletme`, count === 1 ? '1 business' : `${count} businesses`)}</span>
                      {minPrice > 0 && <> · {tx(`${formatTRY(minPrice)}’den başlayan`, `from ${formatTRY(minPrice)}`)}</>}
                    </p>
                  </Link>
                );
              })}
        </div>
      )}
    </div>
  );
}
