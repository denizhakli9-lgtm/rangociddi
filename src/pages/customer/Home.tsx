import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, CalendarDays, LocateFixed, Search, Sparkles } from 'lucide-react';
import { useBusinessSearch } from '@/lib/useDiscovery';
import { fetchCategories } from '@/lib/api';
import { checkTodayAvailability, fetchUpcomingAppointment } from '@/lib/homeData';
import { formatDate, formatTime } from '@/lib/format';
import { useAsync } from '@/lib/useAsync';
import { useFavorites } from '@/lib/useFavorites';
import { useAuth } from '@/contexts/AuthContext';
import { useUserLocation } from '@/contexts/LocationContext';
import { CategoryIcon } from '@/components/CategoryIcon';
import { ErrorState } from '@/components/ui/Feedback';
import { AppointmentStatusBadge } from '@/components/ui/Badge';
import { HomeBusinessSection } from './HomeSections';
import { useT } from '@/i18n/I18nProvider';
import { categoryName } from '@/i18n/categories';
import { tx } from '@/i18n/locale';

export default function Home() {
  const t = useT();
  const { profile } = useAuth();
  const { location, hasChosen } = useUserLocation();
  const gender = profile?.gender === 'female' || profile?.gender === 'male' ? profile.gender : null;
  const categoriesQ = useAsync(() => fetchCategories(), []);
  const featuredQ = useBusinessSearch({ featured: true, sort: 'populer' }, 6);
  const nearbyQ = useBusinessSearch({ sort: 'mesafe' }, 6);
  const todayQ = useBusinessSearch({ availableToday: true, sort: 'mesafe' }, 6);
  const popularQ = useBusinessSearch({ sort: 'populer' }, 6);
  const ratedQ = useBusinessSearch({ sort: 'puan', minRating: 4 }, 6);
  const recommendationsQ = useBusinessSearch({ gender, sort: 'mesafe' }, 6);
  const upcomingQ = useAsync(() => fetchUpcomingAppointment(profile?.role === 'customer' ? profile.id : undefined), [profile?.id, profile?.role]);
  const [availabilityVersion, setAvailabilityVersion] = useState(0);
  useEffect(() => {
    // Refresh "free today" every 5 minutes, and only while the tab is visible (each refresh costs slot RPCs).
    const refresh = () => { if (document.visibilityState === 'visible') setAvailabilityVersion((v) => v + 1); };
    const timer = window.setInterval(refresh, 300000);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  // Wait for the "today" list before checking slots: running on the initial empty list would
  // resolve to an empty Map and show the empty state instead of skeletons during the real check.
  const availabilityQ = useAsync(async () => (todayQ.loading ? null : checkTodayAvailability(todayQ.items)), [todayQ.items, todayQ.loading, availabilityVersion]);
  const { ids, toggle } = useFavorites();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    navigate(`/ara${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`);
  };
  const shared = { favorites: ids, toggle, showDistance: hasChosen };
  const upcoming = upcomingQ.data;

  return (
    <div className="space-y-8 sm:space-y-10">
      <section className="relative overflow-hidden rounded-3xl border border-gold-500/20 bg-gradient-to-br from-coal via-coal-2 to-gold-500/10 px-5 py-7 sm:px-10 sm:py-10">
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full border border-gold-500/10" />
        <div className="relative max-w-2xl animate-fade-up">
          <p className="eyebrow mb-3">{profile?.full_name ? tx(`Merhaba, ${profile.full_name.split(' ')[0]}`, `Hello, ${profile.full_name.split(' ')[0]}`) : tx('Günün güzel bir anı olsun', 'Treat yourself today')}</p>
          <h1 className="max-w-lg break-words font-display text-[36px] leading-[1.2] tracking-tight text-white sm:text-6xl">{t.brand.tagline}</h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-mist sm:text-base">{tx('Aradığın hizmeti keşfet, sana en uygun zamanı seç.', 'Find the service you want and pick the time that suits you.')}</p>
          <form onSubmit={submit} role="search" className="mt-6 flex items-center gap-2 rounded-2xl border border-line bg-coal p-2 shadow-sm focus-within:border-gold-500">
            <Search className="ml-2 h-5 w-5 shrink-0 text-gold-500" />
            <input aria-label={tx('İşletme, hizmet veya semt ara', 'Search businesses, services or areas')} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tx('İşletme, hizmet veya semt ara', 'Search businesses, services or areas')} className="h-11 min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-mist-2 focus:outline-none" />
            <button type="submit" className="h-11 rounded-xl bg-gold-500 px-4 text-sm font-semibold text-ink transition hover:bg-gold-400 active:scale-95">{tx('Ara', 'Search')}</button>
          </form>
          {!hasChosen && <Link to="/konum" className="mt-3 inline-flex min-h-11 items-center gap-2 text-xs text-mist"><LocateFixed className="h-4 w-4 text-gold-500" /> {tx('Yakınındaki yerler için konumunu kullan veya semt seç', 'Use your location or pick an area to see places near you')} <ArrowRight className="h-4 w-4 shrink-0" /></Link>}
        </div>
      </section>

      <section aria-label={tx('Hizmet kategorileri', 'Service categories')}>
        <div className="mb-4 flex items-center justify-between"><h2 className="font-display text-3xl text-white">{tx('Bugün neye ihtiyacın var?', 'What do you need today?')}</h2><Link to="/kategoriler" className="flex min-h-11 items-center text-xs font-semibold text-gold-500">{t.common.all}</Link></div>
        {categoriesQ.error ? <ErrorState onRetry={categoriesQ.reload} /> : (
          <div className="grid grid-cols-4 gap-2 sm:gap-4 lg:grid-cols-8">
            {categoriesQ.loading ? Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-24" />) : (categoriesQ.data ?? []).map((c) => (
              <Link key={c.id} to={`/ara?kategori=${encodeURIComponent(c.slug)}`} className="group flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-line bg-coal p-2 text-center transition hover:-translate-y-1 hover:border-gold-500/50 hover:shadow-sm active:scale-95">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold-500/10 text-gold-500"><CategoryIcon name={c.icon} className="h-5 w-5" /></span>
                <span className="text-[11px] font-medium leading-snug text-white sm:text-xs">{categoryName(c)}</span>
              </Link>
            ))}
          </div>
        )}
        {!categoriesQ.loading && !categoriesQ.error && !categoriesQ.data?.length && <p className="rounded-2xl border border-dashed border-line p-4 text-sm text-mist">{tx('Hizmet kategorileri henüz yayınlanmadı.', 'Service categories have not been published yet.')}</p>}
      </section>

      <section className="rounded-2xl border border-line bg-coal p-5" aria-label={tx('Kampanyalar ve özel teklifler', 'Offers and promotions')}>
        <p className="eyebrow">{tx('Kampanyalar ve özel teklifler', 'Offers and promotions')}</p>
        <p className="mt-2 text-sm text-mist">{tx('Kampanya bilgileri henüz sunulmuyor. Aşağıdaki işletmelerin güncel hizmetlerini ve fiyatlarını inceleyebilirsin.', 'No offers yet. You can browse the current services and prices of the businesses below.')}</p>
      </section>
      <HomeBusinessSection {...shared} {...featuredQ} title={tx('Özenle seçilen adresler', 'Hand-picked places')} description={tx('Öne çıkan işletmeleri keşfet. Sana iyi gelecek bir yer bul.', 'Discover featured businesses and find a place that feels right.')} href="/ara?sirala=populer" />
      <HomeBusinessSection {...shared} {...nearbyQ} title={tx('Yakınında keşfet', 'Near you')} description={hasChosen ? tx(`${location.label} çevresindeki adresler · Mesafeler yaklaşık olarak gösterilir.`, `Places around ${location.label} · Distances are approximate.`) : tx('Şimdilik İzmir merkezine göre sıralanıyor. Konumunu seçerek kişiselleştir.', 'Sorted from central İzmir for now. Choose your location to personalise.')} href="/ara?sirala=mesafe" />
      <HomeBusinessSection {...shared} title={tx('Bugün kendine zaman ayır', 'Make time for yourself today')} description={tx('Kontrol edilen boş saatler · Aynı gün randevuları işletme onayı gerektirir.', 'Checked free times · Same-day bookings need the business’s approval.')} href="/ara?bugun=1" items={todayQ.items.filter((i) => availabilityQ.data?.has(i.business.id))} loading={todayQ.loading || (!availabilityQ.data && !availabilityQ.error)} error={todayQ.error || availabilityQ.error} reload={() => { todayQ.reload(); availabilityQ.reload(); }} availability={availabilityQ.data ?? undefined} />
      <HomeBusinessSection {...shared} {...popularQ} title={tx('Çok tercih edilenler', 'Popular choices')} description={tx('Randevu sayısına göre popüler adresler. Varsa gerçek müşteri puanlarını görebilirsin.', 'Popular places by number of bookings, with real customer ratings where available.')} href="/ara?sirala=populer" />
      <HomeBusinessSection {...shared} {...ratedQ} items={ratedQ.items.filter((i) => i.business.review_count > 0)} title={tx('Deneyimiyle öne çıkanlar', 'Top rated')} description={tx('Gerçek müşteri değerlendirmelerinde 4 ve üzeri puan alan işletmeler.', 'Businesses rated 4 or higher in real customer reviews.')} href="/ara?sirala=puan" />
      <HomeBusinessSection {...shared} {...recommendationsQ} title={gender ? tx('Senin için seçtiklerimiz', 'Picked for you') : tx('Keşfetmeye devam et', 'Keep exploring')} description={gender ? tx('Profil tercihin ve seçilen konuma göre önerilen adresler.', 'Places suggested from your profile and chosen location.') : tx('Seçilen konumun çevresinde yeni bir bakım deneyimi keşfet.', 'Discover a new care experience around your chosen location.')} href="/ara?sirala=mesafe" />

      {profile?.role === 'customer' && (upcomingQ.loading ? <div className="skeleton h-40" aria-label={tx('Yaklaşan randevu yükleniyor', 'Loading your upcoming booking')} /> : upcomingQ.error ? <ErrorState message={tx('Yaklaşan randevun şu anda yüklenemedi.', 'Your upcoming booking could not be loaded right now.')} onRetry={upcomingQ.reload} /> : upcoming && (
        <section className="card-gold p-5 sm:p-6" aria-label={tx('Yaklaşan randevun', 'Your upcoming booking')}>
          <div className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-gold-500" /><p className="eyebrow">{tx('Sana ayrılmış bir an', 'Your upcoming booking')}</p></div>
          <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
            <div><h2 className="font-display text-2xl text-white">{upcoming.businesses?.name ?? upcoming.service_name}</h2><p className="mt-1 text-sm text-mist">{upcoming.service_name} · {upcoming.employee_name}</p><p className="mt-3 text-sm font-semibold text-white">{formatDate(upcoming.starts_at, { day: 'numeric', month: 'long', weekday: 'short' })} · {formatTime(upcoming.starts_at)}</p></div>
            <AppointmentStatusBadge status={upcoming.status} />
          </div>
          <Link to="/randevularim" className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-gold-500">{tx('Randevumu görüntüle', 'View my booking')} <ArrowRight className="h-4 w-4" /></Link>
        </section>
      ))}
      <div className="flex items-center justify-center gap-2 border-t border-line-soft pt-6 text-xs text-mist-2"><Sparkles className="h-4 w-4 text-gold-500" /> {tx('İyi hissetmenin yeni adresi.', 'Your new place to feel good.')}</div>
    </div>
  );
}
