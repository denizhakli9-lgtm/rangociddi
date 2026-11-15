import { Link } from 'react-router-dom';
import { ArrowUpRight, Search } from 'lucide-react';
import { BusinessCard } from '@/components/BusinessCard';
import { ErrorState } from '@/components/ui/Feedback';
import type { DiscoveryItem } from '@/lib/useDiscovery';

interface Props {
  title: string;
  description: string;
  href: string;
  items: DiscoveryItem[];
  loading: boolean;
  error: unknown;
  reload: () => void;
  favorites: Set<string>;
  toggle: (id: string) => void;
  showDistance: boolean;
  availability?: Map<string, string>;
}

export function HomeBusinessSection({ title, description, href, items, loading, error, reload, favorites, toggle, showDistance, availability }: Props) {
  return (
    <section aria-label={title}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl text-white">{title}</h2>
          <p className="mt-1 text-xs leading-relaxed text-mist sm:text-sm">{description}</p>
        </div>
        <Link to={href} className="flex min-h-11 shrink-0 items-center gap-1 text-xs font-semibold text-gold-500">Tümü <ArrowUpRight className="h-4 w-4" /></Link>
      </div>
      {error ? <ErrorState onRetry={reload} /> : loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3" aria-label="İşletmeler yükleniyor" aria-busy="true">
          {[0, 1, 2].map((i) => <div key={i} className={`skeleton h-72 ${i === 2 ? 'hidden sm:block' : ''}`} />)}
        </div>
      ) : !items.length ? (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-line p-5 text-sm text-mist">
          <Search className="h-5 w-5 shrink-0 text-gold-500" />
          <p>Bu bölümde henüz uygun işletme bulunamadı. Farklı bir konum veya kategori deneyebilirsin.</p>
        </div>
      ) : (
        <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 lg:grid-cols-3">
          {items.map((item) => (
            <div key={item.business.id} className="w-[82%] max-w-[340px] shrink-0 snap-start sm:w-auto sm:max-w-none">
              <BusinessCard business={item.business} distance={showDistance ? item.distance : null} openNow={item.openNow} favorite={favorites.has(item.business.id)} onToggleFavorite={toggle} availableAt={availability?.get(item.business.id)} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
