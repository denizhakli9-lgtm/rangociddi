import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BadgeCheck, CalendarClock, Clock, Heart, MapPin, MessageSquare, Navigation, Phone, Share2, ShieldCheck, Star, Store } from 'lucide-react';
import { fetchBusinessDetail, fetchBusinessReviews } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { useFavorites } from '@/lib/useFavorites';
import { depositFor, formatDuration, formatRelative, formatTRY, isoWeekday, dateKey, shortTime } from '@/lib/format';
import { isOpenNow } from '@/lib/hours';
import { distanceKm, formatDistance } from '@/lib/geo';
import { fullAddress, hasExactPin } from '@/lib/maps';
import { isDemoBusiness } from '@/lib/demo';
import { safeImageUrl } from '@/lib/safeUrl';
import { categoryName } from '@/i18n/categories';
import { businessCover } from '@/lib/placeholderImages';
import { PlaceholderTag } from '@/components/ui/PlaceholderTag';
import { publicUrl, shareLink } from '@/lib/platform';
import { useUserLocation } from '@/contexts/LocationContext';
import { useToast } from '@/contexts/ToastContext';
import { useT } from '@/i18n/I18nProvider';
import { DirectionsButton } from '@/components/DirectionsSheet';
import { Avatar, Segmented, Stars } from '@/components/ui/Brand';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/Feedback';
import { tx } from '@/i18n/locale';

type Tab = 'services' | 'staff' | 'reviews' | 'info';

export default function BusinessDetail() {
  const t = useT();
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { location, hasChosen } = useUserLocation();
  const { ids, toggle } = useFavorites();
  const [tab, setTab] = useState<Tab>('services');
  const [photo, setPhoto] = useState(0);

  const { data, loading, error, reload } = useAsync(async () => {
    const detail = await fetchBusinessDetail(slug);
    if (!detail) return null;
    const reviews = await fetchBusinessReviews(detail.business.id);
    return { ...detail, reviews };
  }, [slug]);

  if (loading) return <PageLoader />;
  // Raw backend details only in development; visitors see the Turkish message.
  if (error) return <ErrorState onRetry={reload} error={import.meta.env.DEV ? error : undefined} />;
  if (!data) {
    return <EmptyState icon={<Store className="h-6 w-6" />} title={tx('İşletme bulunamadı', 'Business not found')} text={tx('Aradığınız işletme yayından kaldırılmış olabilir.', 'The business you are looking for may have been removed.')} action={<Button onClick={() => navigate('/ara')}>{tx('İşletmeleri keşfet', 'Discover businesses')}</Button>} />;
  }

  const { business: b, services, employees, hours, reviews } = data;
  const demo = isDemoBusiness(b);
  const ownPhotos = [b.cover_url, ...(b.gallery ?? [])].map(safeImageUrl).filter((src): src is string => !!src);
  // No photos yet: a labelled sector photo instead of an empty header.
  const placeholderPhoto = ownPhotos.length === 0;
  const photos = placeholderPhoto ? [businessCover(b).src] : ownPhotos;
  const todayWd = isoWeekday(dateKey());
  const open = isOpenNow(hours.find((h) => h.weekday === todayWd));
  const fav = ids.has(b.id);
  const book = (serviceId?: string) => {
    if (demo) return;
    navigate(`/i/${b.slug}/randevu${serviceId ? `?hizmet=${serviceId}` : ''}`);
  };
  const goBack = () => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate('/kesfet', { replace: true }));
  const depositLabel = b.deposit_type === 'percentage' ? `%${Number(b.deposit_value)}` : formatTRY(b.deposit_value);
  const address = fullAddress(b);
  const distance = hasChosen && b.latitude != null && b.longitude != null ? formatDistance(distanceKm(location.lat, location.lng, b.latitude, b.longitude)) : null;
  // Demo businesses have invented numbers that may belong to real people: never show or dial them.
  const tel = !demo && b.phone ? `tel:${b.phone.replace(/\s/g, '')}` : null;

  const share = async () => {
    // In the app window.location is https://localhost, so share the public site address.
    const url = publicUrl(window.location.pathname + window.location.search);
    try {
      if ((await shareLink(b.name, url)) === 'copied') toast(tx('Bağlantı kopyalandı', 'Link copied'), 'success');
    } catch {
      /* user dismissed share sheet */
    }
  };

  return (
    <div className="pb-24 md:pb-0">
      <div className="relative -mx-4 -mt-6 sm:mx-0 sm:mt-0">
        <div className="relative aspect-[4/3] overflow-hidden sm:aspect-[21/9] sm:rounded-3xl sm:border sm:border-gold-500/20">
          {photos.map((src, i) => (
            <img key={src + i} src={src} alt={b.name} loading={i === 0 ? "eager" : "lazy"} decoding="async" className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${i === photo ? 'opacity-100' : 'opacity-0'}`} />
          ))}
          <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/20 to-ink/40" />
          {placeholderPhoto && <PlaceholderTag className="bottom-4 left-4" />}
          <div className="absolute inset-x-4 top-4 flex justify-between">
            <button onClick={goBack} className="flex h-10 w-10 items-center justify-center rounded-full bg-ink/60 text-white backdrop-blur transition hover:bg-ink" aria-label={t.common.back}>
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex gap-2">
              <button onClick={share} className="flex h-10 w-10 items-center justify-center rounded-full bg-ink/60 text-white backdrop-blur transition hover:bg-ink" aria-label={tx('Paylaş', 'Share')}>
                <Share2 className="h-4 w-4" />
              </button>
              <button onClick={() => toggle(b.id)} className="flex h-10 w-10 items-center justify-center rounded-full bg-ink/60 backdrop-blur transition hover:bg-ink" aria-label={fav ? tx('Favorilerden çıkar', 'Remove from favourites') : tx('Favorilere ekle', 'Add to favourites')} aria-pressed={fav}>
                <Heart className={`h-4 w-4 ${fav ? 'fill-gold-500 text-gold-500' : 'text-white'}`} />
              </button>
            </div>
          </div>
          {photos.length > 1 && (
            <div className="absolute bottom-4 right-4 flex gap-1.5">
              {photos.map((_, i) => (
                <button key={i} onClick={() => setPhoto(i)} aria-label={tx(`Fotoğraf ${i + 1}`, `Photo ${i + 1}`)} className={`h-1.5 rounded-full transition-all ${i === photo ? 'w-6 bg-gold-500' : 'w-1.5 bg-white/50'}`} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          <div className="animate-fade-up">
            <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-gold-500">
              {categoryName(b.categories)}
              <span className="text-mist-3">·</span>
              <span className="text-mist">{t.genderFocus[b.gender_focus]}</span>
            </div>
            <h1 className="mt-2 flex items-center gap-2 font-display text-4xl text-white sm:text-5xl">
              {b.name}
              {b.is_verified && !demo && <BadgeCheck className="h-6 w-6 shrink-0 text-gold-400" aria-label={t.common.verified} />}
            </h1>
            {demo && (
              <div className="mt-3 flex max-w-2xl flex-col items-start gap-2 rounded-2xl border border-warning-500/40 bg-warning-900/40 px-4 py-3 text-sm text-warning-300 sm:flex-row sm:items-center sm:gap-3">
                <Badge tone="warning">{t.demo.badge}</Badge>
                <span>{t.demo.explanation}</span>
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-mist">
              <span className="flex items-center gap-1.5">
                <Star className="h-4 w-4 fill-gold-500 text-gold-500" />
                <span className="font-semibold text-white">{b.review_count ? Number(b.rating_avg).toFixed(1) : t.common.new}</span>
                {b.review_count > 0 && <span>({tx(`${b.review_count} değerlendirme`, b.review_count === 1 ? '1 review' : `${b.review_count} reviews`)})</span>}
              </span>
              <span className={`flex items-center gap-1.5 ${open ? 'text-success-300' : 'text-mist-2'}`}><Clock className="h-4 w-4" />{open ? tx('Şu an açık', 'Open now') : tx('Şu an kapalı', 'Closed now')}</span>
            </div>
            <div className="mt-5 flex flex-col gap-4 rounded-2xl border border-line bg-coal/70 p-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gold-500/10 text-gold-400"><MapPin className="h-5 w-5" /></span>
                <div className="min-w-0">
                  <p className="text-sm leading-relaxed text-white">{address}</p>
                  {distance && <p className="mt-0.5 text-xs text-mist-2">{hasExactPin(b) ? tx(`Sana ${distance} uzaklıkta`, `${distance} away`) : tx(`${b.district} merkezine ${distance}`, `${distance} from central ${b.district}`)}</p>}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <DirectionsButton target={b} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-gold-500 px-4 text-sm font-medium text-ink transition hover:bg-gold-400 sm:flex-none">
                  <Navigation className="h-4 w-4" /> {tx('Yol tarifi al', 'Get directions')}
                </DirectionsButton>
                {tel && (
                  <a href={tel} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-line px-4 text-sm text-white transition hover:border-gold-500/40">
                    <Phone className="h-4 w-4" /> {tx('Ara', 'Call')}
                  </a>
                )}
              </div>
            </div>
            {b.description && <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-mist">{b.description}</p>}
          </div>

          <div className="mt-8">
            <Segmented<Tab>
              value={tab}
              onChange={setTab}
              options={[
                { value: 'services', label: tx('Hizmetler', 'Services'), count: services.length },
                { value: 'staff', label: tx('Uzmanlar', 'Specialists'), count: employees.length },
                { value: 'reviews', label: tx('Yorumlar', 'Reviews'), count: reviews.length },
                { value: 'info', label: tx('Bilgi', 'Info') },
              ]}
            />
          </div>

          <div className="mt-6 animate-fade-in" key={tab}>
            {tab === 'services' && (
              services.length ? (
                <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-coal">
                  {services.map((s) => (
                    <div key={s.id} className="flex items-center gap-4 px-5 py-4 transition hover:bg-white/[0.02]">
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-medium text-white">{s.name}</p>
                        {s.description && <p className="mt-0.5 line-clamp-2 text-xs text-mist-2">{s.description}</p>}
                        <p className="mt-1.5 flex items-center gap-1 text-xs text-mist"><Clock className="h-3 w-3" />{formatDuration(s.duration_minutes)}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-white">{formatTRY(s.price)}</p>
                        <p className="text-[11px] text-mist-2">{tx('Kapora', 'Deposit')} {formatTRY(depositFor(Number(s.price), b.deposit_type, Number(b.deposit_value)))}</p>
                      </div>
                      <Button size="sm" variant="outline" disabled={demo} title={demo ? t.demo.notBookable : undefined} onClick={() => book(s.id)}>{tx('Seç', 'Select')}</Button>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon={<CalendarClock className="h-6 w-6" />} title={tx('Henüz hizmet yok', 'No services yet')} text={tx('Bu işletme yakında hizmetlerini ekleyecek.', 'This business will add its services soon.')} />
              )
            )}

            {tab === 'staff' && (
              <div className="grid gap-3 sm:grid-cols-2">
                {employees.map((e) => (
                  <div key={e.id} className="card flex items-center gap-4 p-4">
                    <Avatar name={e.full_name} src={safeImageUrl(e.avatar_url)} size="h-14 w-14 text-base" />
                    <div className="min-w-0">
                      <p className="font-medium text-white">{e.full_name}</p>
                      <p className="text-xs text-gold-400">{e.title}</p>
                      {e.bio && <p className="mt-1 line-clamp-2 text-xs text-mist-2">{e.bio}</p>}
                    </div>
                  </div>
                ))}
                {!employees.length && <p className="text-sm text-mist-2">{tx('Uzman bilgisi yakında eklenecek.', 'Specialist details coming soon.')}</p>}
              </div>
            )}

            {tab === 'reviews' && (
              reviews.length ? (
                <div className="space-y-3">
                  {reviews.map((r) => (
                    <div key={r.id} className="card p-5">
                      <div className="flex items-center gap-3">
                        <Avatar name={r.reviewer_name} size="h-10 w-10 text-xs" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-white">{r.reviewer_name}</p>
                          <p className="text-xs text-mist-2">{r.service_name} · {formatRelative(r.created_at)}</p>
                        </div>
                        <Stars value={r.rating} />
                      </div>
                      {r.comment && <p className="mt-3 text-sm leading-relaxed text-mist">{r.comment}</p>}
                      {r.owner_reply && (
                        <div className="mt-4 rounded-xl border-l-2 border-gold-500 bg-ink/50 px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-gold-400">{tx('İşletme yanıtı', 'Reply from the business')}</p>
                          <p className="mt-1 text-sm text-mist">{r.owner_reply}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon={<MessageSquare className="h-6 w-6" />} title={tx('Henüz yorum yok', 'No reviews yet')} text={tx('İlk değerlendirmeyi siz yapın.', 'Be the first to leave a review.')} />
              )
            )}

            {tab === 'info' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="card p-5">
                  <p className="eyebrow mb-4">{tx('Çalışma saatleri', 'Opening hours')}</p>
                  <ul className="space-y-2 text-sm">
                    {[1, 2, 3, 4, 5, 6, 7].map((wd) => {
                      const h = hours.find((x) => x.weekday === wd);
                      return (
                        <li key={wd} className={`flex justify-between ${wd === todayWd ? 'text-gold-300' : 'text-mist'}`}>
                          <span>{t.weekdays[wd - 1]}</span>
                          <span>{!h || h.is_closed ? tx('Kapalı', 'Closed') : `${shortTime(h.open_time)} – ${shortTime(h.close_time)}`}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <div className="space-y-4">
                  <div className="card p-5">
                    <p className="eyebrow mb-3">{tx('Adres', 'Address')}</p>
                    <p className="text-sm text-mist">{address}</p>
                    <DirectionsButton target={b} className="mt-3 inline-flex items-center gap-1.5 text-xs text-gold-400 hover:text-gold-300" />
                    {tel && (
                      <a href={tel} className="mt-3 flex items-center gap-1.5 text-xs text-mist hover:text-white">
                        <Phone className="h-3.5 w-3.5" /> {b.phone}
                      </a>
                    )}
                  </div>
                  <div className="card p-5">
                    <p className="eyebrow mb-3">{tx('Randevu politikası', 'Booking policy')}</p>
                    <p className="text-sm text-mist">{tx('Kapora', 'Deposit')}: <span className="text-white">{depositLabel}</span>. {tx('Kalan tutar işletmede ödenir.', 'The rest is paid at the business.')}</p>
                    <p className="mt-2 text-sm text-mist">{tx('Randevuya ', 'Free cancellation and rescheduling up to ')}<span className="text-white">{tx(`${b.cancellation_hours} saat`, `${b.cancellation_hours} hours`)}</span>{tx(' kalaya kadar ücretsiz iptal ve erteleme.', ' before the appointment.')}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <aside className="hidden lg:block">
          <div className="card-gold sticky top-24 p-6">
            <p className="eyebrow mb-2">{tx('Randevu', 'Booking')}</p>
            <p className="font-display text-3xl text-white">{tx('', 'from ')}{formatTRY(b.min_price)}<span className="text-base text-mist">{tx('’den başlayan', '')}</span></p>
            <ul className="mt-5 space-y-3 text-sm text-mist">
              <li className="flex gap-2.5"><ShieldCheck className="h-4 w-4 shrink-0 text-gold-400" />{tx(`${depositLabel} kapora ile yeriniz garanti`, `Your spot is secured with a ${depositLabel} deposit`)}</li>
              <li className="flex gap-2.5"><CalendarClock className="h-4 w-4 shrink-0 text-gold-400" />{tx(`${b.cancellation_hours} saat öncesine kadar ücretsiz iptal`, `Free cancellation up to ${b.cancellation_hours} hours before`)}</li>
              <li className="flex gap-2.5"><BadgeCheck className="h-4 w-4 shrink-0 text-gold-400" />{b.auto_confirm ? tx('Anında onay (aynı gün randevuları hariç)', 'Instant confirmation (except same-day bookings)') : tx('İşletme onaylı randevu', 'Confirmed by the business')}</li>
            </ul>
            <Button full size="lg" className="mt-6" disabled={demo} onClick={() => book()}>{demo ? tx('Randevu alınamaz', 'Not bookable') : tx('Randevu Al', 'Book now')}</Button>
            {demo && <p className="mt-2 text-center text-xs text-mist-2">{t.demo.notBookable}</p>}
            <DirectionsButton target={b} className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-line text-sm text-white transition hover:border-gold-500/40">
              <Navigation className="h-4 w-4 text-gold-400" /> {tx('Yol tarifi al', 'Get directions')}
            </DirectionsButton>
            <Link to="/ara" className="mt-3 block text-center text-xs text-mist-2 hover:text-white">{tx('Benzer işletmeleri gör', 'See similar businesses')}</Link>
          </div>
        </aside>
      </div>

      <div className="safe-bottom fixed inset-x-0 bottom-[60px] z-30 border-t border-line bg-ink/95 px-4 py-3 backdrop-blur-xl md:bottom-0 lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="min-w-0">
            {demo ? (
              <>
                <p className="text-[11px] text-warning-300">{t.demo.badge}</p>
                <p className="text-xs text-mist">{t.demo.notBookable}</p>
              </>
            ) : (
              <>
                <p className="text-[11px] text-mist-2">{tx('Başlayan fiyatlarla', 'Prices from')}</p>
                <p className="font-semibold text-white">{formatTRY(b.min_price)}</p>
              </>
            )}
          </div>
          <div className="flex flex-1 items-center justify-end gap-2 sm:flex-none">
            <DirectionsButton target={b} ariaLabel={tx('Yol tarifi al', 'Get directions')} className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-line text-gold-400 transition hover:border-gold-500/40">
              <Navigation className="h-5 w-5" />
            </DirectionsButton>
            <Button size="lg" disabled={demo} onClick={() => book()} className="flex-1 sm:flex-none">{demo ? tx('Randevu alınamaz', 'Not bookable') : tx('Randevu Al', 'Book now')}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
