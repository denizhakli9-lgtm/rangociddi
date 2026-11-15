import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LayoutGrid, List, Search as SearchIcon, SearchX, SlidersHorizontal, X } from 'lucide-react';
import { fetchCategories, type DiscoverySort } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { useBusinessSearch } from '@/lib/useDiscovery';
import { useFavorites } from '@/lib/useFavorites';
import { formatTRY } from '@/lib/format';
import { BusinessCard } from '@/components/BusinessCard';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Field';
import { EmptyState, ErrorState } from '@/components/ui/Feedback';
import { useT } from '@/i18n/I18nProvider';
import type { GenderFocus } from '@/lib/types';

type Sort = DiscoverySort;
const SORTS: { value: Sort; label: string }[] = [
  { value: 'mesafe', label: 'En yakın' },
  { value: 'populer', label: 'En popüler' },
  { value: 'puan', label: 'En yüksek puan' },
  { value: 'fiyat', label: 'En uygun fiyat' },
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

  useEffect(() => setText(q), [q]);

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next, { replace: true });
  };

  const activeFilters = [maxPrice, minRating, gender, today].filter(Boolean).length;
  const currentCategory = categories.find((c) => c.slug === category);

  return (
    <div>
      <div className="mb-6">
        <p className="eyebrow mb-2">{currentCategory ? 'Kategori' : 'Keşfet'}</p>
        <h1 className="font-display text-4xl text-white">{currentCategory?.name ?? (q ? `“${q}” için sonuçlar` : 'Tüm işletmeler')}</h1>
        {currentCategory?.description && <p className="mt-2 max-w-xl text-sm text-mist">{currentCategory.description}</p>}
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
          <input aria-label="İşletme, hizmet veya semt ara" value={text} onChange={(e) => setText(e.target.value)} placeholder="Hizmet, salon veya semt" className="h-12 w-full rounded-full border border-line bg-coal pl-11 pr-10 text-sm text-white placeholder:text-mist-3 focus:border-gold-500/60 focus:outline-none" />
          {text && (
            <button type="button" onClick={() => { setText(''); update({ q: null }); }} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-mist-2 hover:text-white" aria-label="Temizle">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button type="button" onClick={() => setFiltersOpen(true)} aria-label={activeFilters > 0 ? `Filtreler (${activeFilters} etkin)` : 'Filtreler'} className="relative flex h-12 items-center gap-2 rounded-full border border-line bg-coal px-4 text-sm text-white transition hover:border-gold-500/40">
          <SlidersHorizontal className="h-4 w-4 text-gold-400" />
          <span className="hidden sm:inline">Filtreler</span>
          {activeFilters > 0 && <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gold-500 text-[10px] font-bold text-ink">{activeFilters}</span>}
        </button>
      </form>

      <div className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        <Chip active={!category} onClick={() => update({ kategori: null })}>{t.common.all}</Chip>
        {categories.map((c) => (
          <Chip key={c.id} active={category === c.slug} onClick={() => update({ kategori: category === c.slug ? null : c.slug })}>{c.name}</Chip>
        ))}
      </div>

      <div className="mb-5 mt-6 flex items-center justify-between gap-3">
        <p className="text-sm text-mist">{loading ? 'Yükleniyor...' : `${total} işletme`}</p>
        <div className="flex items-center gap-2">
          <select aria-label="Sıralama" value={sort} onChange={(e) => update({ sirala: e.target.value })} className="h-9 rounded-full border border-line bg-coal px-3 text-xs text-white focus:border-gold-500/60 focus:outline-none">
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <div className="hidden rounded-full border border-line bg-coal p-0.5 sm:flex">
            <button type="button" onClick={() => setView('grid')} className={`rounded-full p-1.5 ${view === 'grid' ? 'bg-gold-500 text-ink' : 'text-mist'}`} aria-label="Izgara görünümü" aria-pressed={view === 'grid'}><LayoutGrid className="h-4 w-4" /></button>
            <button type="button" onClick={() => setView('row')} className={`rounded-full p-1.5 ${view === 'row' ? 'bg-gold-500 text-ink' : 'text-mist'}`} aria-label="Liste görünümü" aria-pressed={view === 'row'}><List className="h-4 w-4" /></button>
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
          title="Sonuç bulunamadı"
          text="Filtreleri gevşetmeyi veya farklı bir arama yapmayı deneyin."
          action={<Button variant="outline" onClick={() => setParams({}, { replace: true })}>Filtreleri temizle</Button>}
        />
      ) : (
        <div className={view === 'grid' ? 'grid gap-6 sm:grid-cols-2 lg:grid-cols-3' : 'grid gap-3 lg:grid-cols-2'}>
          {results.map((i) => (
            <BusinessCard key={i.business.id} variant={view} business={i.business} distance={i.distance} openNow={i.openNow} favorite={ids.has(i.business.id)} onToggleFavorite={toggle} />
          ))}
        </div>
      )}

      {!loading && !error && hasMore && (
        <div className="mt-8 flex justify-center">
          <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Yükleniyor...' : `Daha fazla göster (${total - results.length})`}
          </Button>
        </div>
      )}

      <Modal
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filtreler"
        footer={
          <div className="flex gap-3">
            <Button variant="ghost" full onClick={() => update({ fiyat: null, puan: null, cinsiyet: null, bugun: null })}>Temizle</Button>
            <Button full onClick={() => setFiltersOpen(false)}>{loading ? 'Yükleniyor...' : `${total} sonucu göster`}</Button>
          </div>
        }
      >
        <div className="space-y-7">
          <Toggle checked={today} onChange={(v) => update({ bugun: v ? '1' : null })} label="Bugün müsait" description="Bugün hâlâ randevu verebilecek işletmeler" />
          <FilterGroup label="En düşük hizmet fiyatı">
            {PRICE_STEPS.map((p) => (
              <Chip key={p} active={maxPrice === p} onClick={() => update({ fiyat: p ? String(p) : null })}>{p ? `${formatTRY(p)} ve altı` : 'Fark etmez'}</Chip>
            ))}
          </FilterGroup>
          <FilterGroup label="Minimum puan">
            {RATING_STEPS.map((r) => (
              <Chip key={r} active={minRating === r} onClick={() => update({ puan: r ? String(r) : null })}>{r ? `${r}+ yıldız` : 'Fark etmez'}</Chip>
            ))}
          </FilterGroup>
          <FilterGroup label="Hizmet verilen">
            <Chip active={!gender} onClick={() => update({ cinsiyet: null })}>Herkes</Chip>
            <Chip active={gender === 'female'} onClick={() => update({ cinsiyet: 'female' })}>Kadın</Chip>
            <Chip active={gender === 'male'} onClick={() => update({ cinsiyet: 'male' })}>Erkek</Chip>
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
      className={`shrink-0 rounded-full border px-4 py-2 text-xs font-medium transition ${active ? 'border-gold-500 bg-gold-500 text-ink' : 'border-line bg-coal text-mist hover:border-gold-500/40 hover:text-white'}`}
    >
      {children}
    </button>
  );
}
