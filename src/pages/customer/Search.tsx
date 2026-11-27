import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LayoutGrid, List, MapPin, Search as SearchIcon, SearchX, SlidersHorizontal, X } from 'lucide-react';
import { fetchCategories, type DiscoverySort } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { useBusinessSearch } from '@/lib/useDiscovery';
import { useFavorites } from '@/lib/useFavorites';
import { isDemoBusiness } from '@/lib/demo';
import { useUserLocation } from '@/contexts/LocationContext';
import { formatTRY } from '@/lib/format';
import { BusinessCard } from '@/components/BusinessCard';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Field';
import { EmptyState, ErrorState } from '@/components/ui/Feedback';
import { useT } from '@/i18n/I18nProvider';
import { categoryDescription, categoryName, englishQueryToCategory } from '@/i18n/categories';
import type { GenderFocus } from '@/lib/types';
import { locale, tx } from '@/i18n/locale';
import { searchMeta } from '@/lib/seo/meta';
import { useSeo } from '@/lib/seo/useSeo';

type Sort = DiscoverySort;
const SORTS: { value: Sort; label: [string, string] }[] = [
  { value: 'mesafe', label: ['En yakın', 'Nearest'] },
  { value: 'populer', label: ['En popüler', 'Most popular'] },
  { value: 'puan', label: ['En yüksek puan', 'Highest rated'] },
  { value: 'fiyat', label: ['En uygun fiyat', 'Lowest price'] },
];
const PRICE_STEPS = [0, 300, 500, 800, 1200, 2000];
const RATING_STEPS = [0, 3.5, 4, 4.5];

export default function SearchPage() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const { ids, toggle } = useFavorites();
  const { data: categoryData } = useAsync(() => fetchCategories(), []);
  const categories = categoryData ?? [];
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [view, setView] = useState<'grid' | 'row'>('grid');
  const [text, setText] = useState(params.get('q') ?? '');

  const q = params.get('q') ?? '';
  const category = params.get('kategori') ?? '';
  const today = params.get('bugun') === '1';
  const sort = (params.get('sirala') as Sort) || 'mesafe';
  const maxPrice = Number(params.get('fiyat') ?? 0);
  const minRating = Number(params.get('puan') ?? 0);
  const gender = (params.get('cinsiyet') as GenderFocus | null) ?? null;

  const filters = useMemo(
    () => ({ query: q, category, availableToday: today, sort, maxPrice, minRating, gender }),
    [q, category, today, sort, maxPrice, minRating, gender],
  );
  const { items: results, total, loading, loadingMore, hasMore, loadMore, error, reload } = useBusinessSearch(filters);
  const { location } = useUserLocation();
  // Businesses that can be booked come before the sample profiles; each group keeps the chosen order.
  const ordered = useMemo(() => [...results].sort((a, z) => Number(isDemoBusiness(a.business)) - Number(isDemoBusiness(z.business))), [results]);

  useEffect(() => setText(q), [q]);

  // English visitors searching for a category ("barber", "nails") get that category, since
  // business and service names are stored in Turkish.
  useEffect(() => {
    const slug = englishQueryToCategory(q);
    if (slug) {
      const next = new URLSearchParams(params);
      next.delete('q');
      next.set('kategori', slug);
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next, { replace: true });
  };

  const activeFilters = [maxPrice, minRating, gender, today].filter(Boolean).length;
  const currentCategory = categories.find((c) => c.slug === category);

  // The search page is never indexed (see searchMeta); it only names the category it is showing.
  useSeo(
    category && !categoryData
      ? null
      : searchMeta(locale(), { category: currentCategory ? { slug: currentCategory.slug, name: categoryName(currentCategory), description: categoryDescription(currentCategory) } : null }),
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px] text-white">{currentCategory ? categoryName(currentCategory) : q ? tx(`“${q}” için sonuçlar`, `Results for “${q}”`) : tx('Tüm işletmeler', 'All businesses')}</h1>
        {currentCategory?.description && <p className="mt-2 max-w-xl text-sm text-mist">{categoryDescription(currentCategory)}</p>}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          update({ q: text.trim() || null });
        }}
        role="search"
        className="flex items-center gap-2"
      >
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-mist-2" />
          <input aria-label={tx('İşletme, hizmet veya semt ara', 'Search businesses, services or areas')} value={text} onChange={(e) => setText(e.target.value)} placeholder={tx('Hizmet, salon veya semt', 'Service, salon or area')} className="h-12 w-full rounded-full border border-line bg-coal pl-11 pr-10 text-sm text-white placeholder:text-mist-3 focus:border-gold-500/60 focus:outline-none" />
          {text && (
            <button type="button" onClick={() => { setText(''); update({ q: null }); }} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-mist-2 hover:text-white" aria-label={tx('Temizle', 'Clear')}>
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button type="button" onClick={() => setFiltersOpen(true)} aria-label={activeFilters > 0 ? tx(`Filtreler (${activeFilters} etkin)`, `Filters (${activeFilters} active)`) : tx('Filtreler', 'Filters')} className="relative flex h-12 items-center gap-2 rounded-full border border-line bg-coal px-4 text-sm text-white transition hover:border-white/30">
          <SlidersHorizontal className="h-4 w-4 text-gold-400" />
          <span className="hidden sm:inline">{tx('Filtreler', 'Filters')}</span>
          {activeFilters > 0 && <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gold-500 text-[10px] font-bold text-ink">{activeFilters}</span>}
        </button>
      </form>

      <div className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        <Chip active={!category} onClick={() => update({ kategori: null })}>{t.common.all}</Chip>
        {categories.map((c) => (
          <Chip key={c.id} active={category === c.slug} onClick={() => update({ kategori: category === c.slug ? null : c.slug })}>{categoryName(c)}</Chip>
        ))}
      </div>

      <div className="mb-5 mt-6 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <p className="shrink-0 text-sm text-mist">{loading ? t.common.loading : tx(`${total} işletme`, total === 1 ? '1 business' : `${total} businesses`)}</p>
          {/* The header shows the location on wider screens only; distances here are measured from it. */}
          <Link to="/konum" aria-label={tx(`Konum: ${location.label}. Değiştir`, `Location: ${location.label}. Change`)} className="inline-flex min-h-11 min-w-0 items-center gap-1 text-[13px] text-mist lg:hidden">
            <MapPin className="h-4 w-4 shrink-0 text-mist-3" strokeWidth={1.75} />
            <span className="truncate">{location.label}</span>
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <select aria-label={tx('Sıralama', 'Sort by')} value={sort} onChange={(e) => update({ sirala: e.target.value })} className="h-9 rounded-full border border-line bg-coal px-3 text-xs text-white focus:border-gold-500/60 focus:outline-none">
            {SORTS.map((s) => <option key={s.value} value={s.value}>{tx(...s.label)}</option>)}
          </select>
          <div className="hidden rounded-full border border-line bg-coal p-0.5 sm:flex">
            <button type="button" onClick={() => setView('grid')} className={`rounded-full p-1.5 ${view === 'grid' ? 'bg-primary text-primary-fg' : 'text-mist'}`} aria-label={tx('Izgara görünümü', 'Grid view')} aria-pressed={view === 'grid'}><LayoutGrid className="h-4 w-4" /></button>
            <button type="button" onClick={() => setView('row')} className={`rounded-full p-1.5 ${view === 'row' ? 'bg-primary text-primary-fg' : 'text-mist'}`} aria-label={tx('Liste görünümü', 'List view')} aria-pressed={view === 'row'}><List className="h-4 w-4" /></button>
          </div>
        </div>
      </div>

      {error ? (
        <ErrorState onRetry={reload} error={import.meta.env.DEV ? error : undefined} />
      ) : loading ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton aspect-[4/3]" />)}</div>
      ) : results.length === 0 ? (
        <EmptyState
          icon={<SearchX className="h-6 w-6" />}
          title={tx('Sonuç bulunamadı', 'No results')}
          text={tx('Filtreleri gevşetmeyi veya farklı bir arama yapmayı deneyin.', 'Try loosening the filters or searching for something else.')}
          action={<Button variant="outline" onClick={() => setParams({}, { replace: true })}>{tx('Filtreleri temizle', 'Clear filters')}</Button>}
        />
      ) : (
        <div className={view === 'grid' ? 'grid gap-6 sm:grid-cols-2 lg:grid-cols-3' : 'grid gap-3 lg:grid-cols-2'}>
          {ordered.map((i) => (
            <BusinessCard key={i.business.id} variant={view} business={i.business} distance={i.distance} openNow={i.openNow} favorite={ids.has(i.business.id)} onToggleFavorite={toggle} />
          ))}
        </div>
      )}

      {!loading && !error && hasMore && (
        <div className="mt-8 flex justify-center">
          <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? t.common.loading : tx(`Daha fazla göster (${total - results.length})`, `Show more (${total - results.length})`)}
          </Button>
        </div>
      )}

      <Modal
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title={tx('Filtreler', 'Filters')}
        footer={
          <div className="flex gap-3">
            <Button variant="ghost" full onClick={() => update({ fiyat: null, puan: null, cinsiyet: null, bugun: null })}>{tx('Temizle', 'Clear')}</Button>
            <Button full onClick={() => setFiltersOpen(false)}>{loading ? t.common.loading : tx(`${total} sonucu göster`, total === 1 ? 'Show 1 result' : `Show ${total} results`)}</Button>
          </div>
        }
      >
        <div className="space-y-7">
          <Toggle checked={today} onChange={(v) => update({ bugun: v ? '1' : null })} label={tx('Bugün müsait', 'Available today')} description={tx('Bugün hâlâ randevu verebilecek işletmeler', 'Businesses that can still take bookings today')} />
          <FilterGroup label={tx('En düşük hizmet fiyatı', 'Starting price')}>
            {PRICE_STEPS.map((p) => (
              <Chip key={p} active={maxPrice === p} onClick={() => update({ fiyat: p ? String(p) : null })}>{p ? tx(`${formatTRY(p)} ve altı`, `${formatTRY(p)} or less`) : tx('Fark etmez', 'Any')}</Chip>
            ))}
          </FilterGroup>
          <FilterGroup label={tx('Minimum puan', 'Minimum rating')}>
            {RATING_STEPS.map((r) => (
              <Chip key={r} active={minRating === r} onClick={() => update({ puan: r ? String(r) : null })}>{r ? tx(`${r}+ yıldız`, `${r}+ stars`) : tx('Fark etmez', 'Any')}</Chip>
            ))}
          </FilterGroup>
          <FilterGroup label={tx('Hizmet verilen', 'Serves')}>
            <Chip active={!gender} onClick={() => update({ cinsiyet: null })}>{tx('Herkes', 'Everyone')}</Chip>
            <Chip active={gender === 'female'} onClick={() => update({ cinsiyet: 'female' })}>{tx('Kadın', 'Women')}</Chip>
            <Chip active={gender === 'male'} onClick={() => update({ cinsiyet: 'male' })}>{tx('Erkek', 'Men')}</Chip>
          </FilterGroup>
        </div>
      </Modal>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-mist">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 rounded-full border px-4 py-2 text-xs font-medium transition ${active ? 'border-gold-500 bg-primary text-primary-fg' : 'border-line bg-coal text-mist hover:border-white/30 hover:text-white'}`}
    >
      {children}
    </button>
  );
}
