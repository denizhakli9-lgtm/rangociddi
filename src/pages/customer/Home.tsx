import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, MapPin, Search } from 'lucide-react';
import { useBusinessSearch } from '@/lib/useDiscovery';
import { useCategories, useCityListing } from '@/lib/landingApi';
import { checkTodayAvailability, fetchUpcomingAppointment } from '@/lib/homeData';
import { formatDate, formatTime } from '@/lib/format';
import { isDemoBusiness } from '@/lib/demo';
import { isTestBusiness } from '@/lib/seo/config';
import { useAsync } from '@/lib/useAsync';
import { useFavorites } from '@/lib/useFavorites';
import { useAuth } from '@/contexts/AuthContext';
import { useUserLocation } from '@/contexts/LocationContext';
import { CategoryIcon } from '@/components/CategoryIcon';
import { ErrorState } from '@/components/ui/Feedback';
import { AppointmentStatusBadge } from '@/components/ui/Badge';
import { HomeBusinessSection } from './HomeSections';
import { categoryName } from '@/i18n/categories';
import { locale, tx } from '@/i18n/locale';
import { DEFAULT_CITY, cityCategoryPath, locativeTr } from '@/lib/seo/places';
import { homeMeta } from '@/lib/seo/meta';
import { homeExtraBlocks, homeSchemas } from '@/lib/seo/pages/home';
import { useSeo } from '@/lib/seo/useSeo';
import { Blocks } from '@/components/seo/Blocks';

/** How many businesses the home page asks for; it shows the bookable ones first and a few samples after them. */
const HOME_PAGE_SIZE = 36;
const MAX_BOOKABLE = 9;
const MAX_SAMPLES = 6;

const heroPhoto = (name: string) => `${import.meta.env.BASE_URL}sector-${name}.webp`;

export default function Home() {
  const { profile } = useAuth();
  const { location, hasChosen } = useUserLocation();
  const categoriesQ = useCategories();
  const listingQ = useCityListing(DEFAULT_CITY.name);
  // One request feeds every list on the page: nearest first once a location is chosen, most booked otherwise.
  const discoveryQ = useBusinessSearch({ sort: hasChosen ? 'mesafe' : 'populer' }, HOME_PAGE_SIZE);
  // Discovery is not limited to a city; the sections below are titled with the chosen one, so keep to it.
  const inCity = useMemo(() => discoveryQ.items.filter((i) => (i.business.city || 'İzmir') === location.city), [discoveryQ.items, location.city]);
  const bookable = useMemo(
    () => inCity.filter((i) => !isDemoBusiness(i.business) && !isTestBusiness(i.business.slug) && Number(i.business.min_price) > 0).slice(0, MAX_BOOKABLE),
    [inCity],
  );
  const samples = useMemo(() => inCity.filter((i) => isDemoBusiness(i.business)).slice(0, MAX_SAMPLES), [inCity]);
  const upcomingQ = useAsync(() => fetchUpcomingAppointment(profile?.role === 'customer' ? profile.id : undefined), [profile?.id, profile?.role]);
  const [availabilityVersion, setAvailabilityVersion] = useState(0);
  useEffect(() => {
    // Refresh "free today" every 5 minutes, and only while the tab is visible (each refresh costs slot RPCs).
    const refresh = () => { if (document.visibilityState === 'visible') setAvailabilityVersion((v) => v + 1); };
    const timer = window.setInterval(refresh, 300000);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  // The first free time today, shown on the card of each bookable business that still has one.
  const availabilityQ = useAsync(async () => (discoveryQ.loading ? null : checkTodayAvailability(bookable.filter((i) => i.availableToday))), [bookable, discoveryQ.loading, availabilityVersion]);
  const { ids, toggle } = useFavorites();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    navigate(`/ara${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`);
  };
  const shared = { favorites: ids, toggle, showDistance: hasChosen, loading: discoveryQ.loading, error: discoveryQ.error, reload: discoveryQ.reload };
  const lang = locale();
  // How it works, links by service and area, the common questions and the call to business owners:
  // the same blocks (and structured data) the static home page carries.
  const extrasInput = useMemo(
    () => ({
      lang,
      city: DEFAULT_CITY,
      categories: (categoriesQ.data ?? []).map((c) => ({ slug: c.slug, name: categoryName(c) })),
      businesses: listingQ.data,
      supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined,
    }),
    [lang, categoriesQ.data, listingQ.data],
  );
  // The bookable businesses and the categories are already listed above, with live opening and availability details.
  const extras = useMemo(() => homeExtraBlocks(extrasInput).filter((block) => block.kind !== 'businesses' && block.kind !== 'links'), [extrasInput]);
  useSeo(useMemo(() => ({ ...homeMeta(lang), jsonLd: [...(homeMeta(lang).jsonLd ?? []), ...homeSchemas(extrasInput)] }), [lang, extrasInput]));
  const upcoming = upcomingQ.data;
  const firstName = profile?.full_name?.trim().split(/\s+/)[0];
  const searchLabel = tx('İşletme, hizmet veya semt ara', 'Search businesses, services or areas');

  return (
    <div className="space-y-12 sm:space-y-16">
      <section className="grid items-center gap-10 pt-4 sm:pt-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-16 lg:pb-6 lg:pt-10">
        <div>
          {firstName && <p className="mb-3 text-sm text-mist">{tx(`Merhaba, ${firstName}`, `Hello, ${firstName}`)}</p>}
          <h1 className="font-display text-[42px] leading-[1.04] tracking-[-0.02em] text-white sm:text-6xl lg:text-[68px]">{tx('Randevunun yeni yolu.', 'The new way to book.')}</h1>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-mist sm:text-base">{tx(`Kuaför, berber ve güzellik randevunuzu online alın: ${locativeTr(location.city)}ki işletmeleri keşfedin, size en uygun saati seçin.`, `Book hair, barber and beauty appointments online: discover businesses in ${location.city} and pick the time that suits you.`)}</p>
          <form onSubmit={submit} role="search" className="mt-7 flex max-w-xl items-center gap-1 rounded-2xl border border-line bg-coal p-1.5 shadow-gold transition-colors focus-within:border-white/50">
            <Search className="ml-2.5 h-[18px] w-[18px] shrink-0 text-mist-3" strokeWidth={1.75} />
            <input aria-label={searchLabel} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={searchLabel} enterKeyHint="search" className="h-11 min-w-0 flex-1 bg-transparent px-1.5 text-[15px] text-white placeholder:text-mist-3 focus:outline-none" />
            <Link to="/konum" aria-label={tx(`Konum: ${location.label}. Değiştir`, `Location: ${location.label}. Change`)} className="hidden h-11 max-w-[150px] shrink-0 items-center gap-1.5 border-l border-line pl-3 pr-2 text-[13px] text-mist transition-colors hover:text-white sm:flex">
              <MapPin className="h-4 w-4 shrink-0 text-mist-3" strokeWidth={1.75} />
              <span className="truncate">{location.label}</span>
            </Link>
            <button type="submit" className="h-11 shrink-0 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-fg transition-colors hover:bg-primary/90">{tx('Ara', 'Search')}</button>
          </form>
          <Link to="/konum" className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-[13px] text-mist sm:hidden">
            <MapPin className="h-4 w-4 text-mist-3" strokeWidth={1.75} />
            {hasChosen ? location.label : tx('Yakınınızdaki işletmeler için konum seçin', 'Choose a location to see businesses near you')}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="relative hidden lg:block" aria-hidden="true">
          <img src={heroPhoto('barber-3')} alt="" width={840} height={1050} loading="lazy" decoding="async" className="aspect-[4/5] w-full rounded-3xl object-cover" />
          <img src={heroPhoto('nails-7')} alt="" width={352} height={352} loading="lazy" decoding="async" className="absolute -bottom-8 -left-12 aspect-square w-44 rounded-2xl border-[5px] border-ink object-cover" />
        </div>
      </section>

      <section aria-label={tx('Hizmet kategorileri', 'Service categories')}>
        <div className="mb-4 flex items-end justify-between gap-4">
          <h2 className="font-display text-[26px] text-white sm:text-3xl">{tx('Hizmete göre keşfedin', 'Browse by service')}</h2>
          <Link to="/kategoriler" className="flex min-h-11 shrink-0 items-center gap-1 text-[13px] font-medium text-mist transition-colors hover:text-white">{tx('Tüm kategoriler', 'All categories')} <ArrowRight className="h-3.5 w-3.5" /></Link>
        </div>
        {categoriesQ.error ? <ErrorState onRetry={categoriesQ.reload} /> : (
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
            {categoriesQ.loading ? Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-11 w-28 shrink-0 !rounded-full" />) : (categoriesQ.data ?? []).map((c) => (
              <Link key={c.id} to={cityCategoryPath(DEFAULT_CITY, c.slug)} className="flex h-11 shrink-0 items-center gap-2 rounded-full border border-line bg-coal pl-3.5 pr-4 text-sm text-white transition-colors hover:border-white/40">
                <CategoryIcon name={c.icon} className="h-4 w-4 text-mist-2" />
                {categoryName(c)}
              </Link>
            ))}
          </div>
        )}
      </section>

      {profile?.role === 'customer' && (upcomingQ.loading ? <div className="skeleton h-32" aria-label={tx('Yaklaşan randevu yükleniyor', 'Loading your upcoming booking')} /> : upcomingQ.error ? <ErrorState message={tx('Yaklaşan randevunuz şu anda yüklenemedi.', 'Your upcoming booking could not be loaded right now.')} onRetry={upcomingQ.reload} /> : upcoming && (
        <section className="card flex flex-wrap items-center justify-between gap-x-8 gap-y-4 p-5 sm:p-6" aria-label={tx('Yaklaşan randevunuz', 'Your upcoming booking')}>
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-mist-2">{tx('Yaklaşan randevunuz', 'Your upcoming booking')}</p>
            <h2 className="mt-1 truncate text-lg font-semibold text-white">{upcoming.businesses?.name ?? upcoming.service_name}</h2>
            <p className="mt-0.5 text-sm text-mist">{upcoming.service_name} · {upcoming.employee_name}</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <p className="text-sm font-semibold text-white">{formatDate(upcoming.starts_at, { day: 'numeric', month: 'long', weekday: 'short' })} · {formatTime(upcoming.starts_at)}</p>
            <AppointmentStatusBadge status={upcoming.status} />
            <Link to="/randevularim" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-white underline-offset-4 hover:underline">{tx('Randevuyu görüntüle', 'View booking')} <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </section>
      ))}

      <HomeBusinessSection {...shared} items={bookable} availability={availabilityQ.data ?? undefined} title={tx(`${locativeTr(location.city)} randevu alabileceğiniz işletmeler`, `Businesses you can book in ${location.city}`)} href="/ara" />
      <HomeBusinessSection {...shared} items={samples} quiet title={tx('Örnek profiller', 'Sample profiles')} description={tx('Bir işletme sayfasının Rango’da nasıl göründüğünü gösteren örnekler. Bu profillerden randevu alınamaz.', 'Examples of how a business page looks on Rango. These profiles cannot be booked.')} />

      <Blocks blocks={extras} />
    </div>
  );
}
