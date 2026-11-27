import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { BusinessCard } from '@/components/BusinessCard';
import { ErrorState } from '@/components/ui/Feedback';
import type { DiscoveryItem } from '@/lib/useDiscovery';
import { tx } from '@/i18n/locale';

interface Props {
  title: string;
  description?: string;
  /** Where "see all" leads; left out when the section has no fuller list. */
  href?: string;
  items: DiscoveryItem[];
  loading: boolean;
  error: unknown;
  reload: () => void;
  favorites: Set<string>;
  toggle: (id: string) => void;
  showDistance: boolean;
  availability?: Map<string, string>;
  /** A secondary section: it shows nothing while loading or on error, so it never draws attention to itself. */
  quiet?: boolean;
}

/** A titled list of businesses on the home page. A section without businesses is not shown at all. */
export function HomeBusinessSection({ title, description, href, items, loading, error, reload, favorites, toggle, showDistance, availability, quiet }: Props) {
  if (quiet && (loading || error)) return null;
  if (!loading && !error && !items.length) return null;
  return (
    <section aria-label={title}>
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-[26px] text-white sm:text-3xl">{title}</h2>
          {description && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-mist">{description}</p>}
        </div>
        {href && <Link to={href} className="flex min-h-11 shrink-0 items-center gap-1 text-[13px] font-medium text-mist transition-colors hover:text-white">{tx('Tümünü gör', 'See all')} <ArrowRight className="h-3.5 w-3.5" /></Link>}
      </div>
      {error ? <ErrorState onRetry={reload} /> : loading ? (
        <div className="grid grid-cols-2 gap-x-5 gap-y-8 lg:grid-cols-3" aria-label={tx('İşletmeler yükleniyor', 'Loading businesses')} aria-busy="true">
          {[0, 1, 2].map((i) => <div key={i} className={`skeleton aspect-[4/3] !rounded-2xl ${i === 2 ? 'hidden lg:block' : ''}`} />)}
        </div>
      ) : (
        <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory scroll-pl-4 gap-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-x-5 sm:gap-y-8 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3">
          {items.map((item) => (
            <div key={item.business.id} className="w-[78%] max-w-[320px] shrink-0 snap-start sm:w-auto sm:max-w-none">
              <BusinessCard business={item.business} distance={showDistance ? item.distance : null} openNow={item.openNow} favorite={favorites.has(item.business.id)} onToggleFavorite={toggle} availableAt={availability?.get(item.business.id)} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
