import { Link } from 'react-router-dom';
import { BadgeCheck, Heart, MapPin, Star } from 'lucide-react';
import type { Business } from '@/lib/types';
import { formatTime, formatTRY } from '@/lib/format';
import { useState } from 'react';
import { formatDistance } from '@/lib/geo';
import { isDemoBusiness } from '@/lib/demo';
import { safeImageUrl } from '@/lib/safeUrl';
import { categoryName } from '@/i18n/categories';
import { dict, tx } from '@/i18n/locale';

interface Props {
  business: Business;
  distance?: number | null;
  favorite?: boolean;
  onToggleFavorite?: (id: string) => void;
  openNow?: boolean;
  variant?: 'grid' | 'row';
  availableAt?: string;
}

export function BusinessCard({ business: b, distance, favorite, onToggleFavorite, openNow, variant = 'grid', availableAt }: Props) {
  const demo = isDemoBusiness(b);
  const verified = b.is_verified && !demo;
  const cover = safeImageUrl(b.cover_url);
  const heart = onToggleFavorite && (
    <button
      onClick={(e) => {
        e.preventDefault();
        onToggleFavorite(b.id);
      }}
      aria-label={favorite ? tx('Favorilerden çıkar', 'Remove from favourites') : tx('Favorilere ekle', 'Add to favourites')}
      aria-pressed={!!favorite}
      className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full border border-line bg-coal/95 backdrop-blur transition hover:scale-105 active:scale-95"
    >
      <Heart className={`h-4 w-4 transition ${favorite ? 'fill-gold-500 text-gold-500' : 'text-white'}`} />
    </button>
  );

  const meta = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-mist">
      {b.review_count > 0 && <span className="flex items-center gap-1">
        <Star className="h-3.5 w-3.5 fill-gold-500 text-gold-500" />
        <span className="font-semibold text-white">{b.review_count ? Number(b.rating_avg).toFixed(1) : dict().common.new}</span>
        {b.review_count > 0 && <span className="text-mist-2">({b.review_count})</span>}
      </span>}
      <span className="flex min-w-0 items-center gap-1 truncate">
        <MapPin className="h-3.5 w-3.5 shrink-0 text-mist-2" />
        <span className="truncate">{b.district}</span>
        {distance != null && <span className="text-mist-2">· {formatDistance(distance)}</span>}
      </span>
    </div>
  );

  if (variant === 'row') {
    return (
      <Link to={`/i/${b.slug}`} className="card group relative flex gap-4 p-3 transition hover:border-gold-500/40">
        <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl sm:h-32 sm:w-36">
          <BusinessCover src={cover} name={b.name} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-between py-1 pr-10">
          <div>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] uppercase tracking-[0.18em] text-gold-500">
              {categoryName(b.categories)}
              {demo && <DemoBadge />}
            </p>
            <h3 className="mt-1 flex items-center gap-1.5 truncate font-display text-xl text-white">
              <span className="truncate">{b.name}</span>
              {verified && <BadgeCheck className="h-4 w-4 shrink-0 text-gold-400" aria-label={dict().common.verified} />}
            </h3>
            <div className="mt-1.5">{meta}</div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-mist-2">
              {tx('', 'from ')}<span className="font-semibold text-white">{formatTRY(b.min_price)}</span>{tx(' ’den başlayan', '')}
            </p>
            {openNow !== undefined && (
              <span className={`text-[11px] ${openNow ? 'text-success-300' : 'text-mist-2'}`}>{openNow ? tx('Şu an açık', 'Open now') : tx('Kapalı', 'Closed')}</span>
            )}
          </div>
        </div>
        {heart}
      </Link>
    );
  }

  return (
    <Link to={`/i/${b.slug}`} className="card group block overflow-hidden transition hover:border-gold-500/40 hover:shadow-card active:scale-[0.99]">
      <div className="relative aspect-[4/3] overflow-hidden">
        <BusinessCover src={cover} name={b.name} />
        <div className="absolute left-3 right-16 top-3 flex flex-wrap gap-1.5">
          {demo && <span className="rounded-full border border-warning-500/40 bg-ink/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-warning-300 backdrop-blur">{dict().demo.badge}</span>}
          {b.is_featured && <span className="rounded-full bg-gold-500 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-ink">{dict().common.featured}</span>}
          {openNow && <span className="rounded-full bg-ink/70 px-2.5 py-1 text-[10px] font-semibold text-success-300 backdrop-blur">{tx('Açık', 'Open')}</span>}
        </div>
        {heart}
      </div>
      <div className="p-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-gold-400">{categoryName(b.categories)}</p>
          <h3 className="mt-1 flex items-center gap-1.5 font-display text-2xl leading-tight text-white">
            <span className="truncate">{b.name}</span>
            {verified && <BadgeCheck className="h-4 w-4 shrink-0 text-gold-400" aria-label={dict().common.verified} />}
          </h3>
        </div>
      <div className="mt-2">{meta}</div>
      {demo ? (
        <p className="mt-3 text-xs text-mist-2">{dict().demo.notBookable}</p>
      ) : availableAt && <p className="mt-3 text-xs font-medium text-success-300">{tx(`Bugün ${formatTime(availableAt)} · Uygun saat bulundu`, `Today ${formatTime(availableAt)} · Free slot found`)}</p>}
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-line-soft pt-3">
        <span className="text-xs font-semibold text-gold-500">{tx('İncele', 'View')} →</span>
        <span className="shrink-0 text-xs text-mist-2">
          <span className="font-semibold text-white">{formatTRY(b.min_price)}</span>+
        </span>
      </div>
      </div>
    </Link>
  );
}

function DemoBadge() {
  return <span className="rounded-full border border-warning-500/40 bg-warning-900/60 px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-warning-300">{dict().demo.badge}</span>;
}

function BusinessCover({ src, name }: { src: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-coal-2 to-gold-500/10" aria-label={tx(`${name} için görsel bulunmuyor`, `No image for ${name}`)}><MapPin className="h-10 w-10 text-gold-500/50" strokeWidth={1} /></div>;
  return <img src={src} alt={name} loading="lazy" decoding="async" onError={() => setFailed(true)} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />;
}
