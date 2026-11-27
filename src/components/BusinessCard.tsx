import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, Heart, Star } from 'lucide-react';
import type { Business } from '@/lib/types';
import { formatTime, fromPrice } from '@/lib/format';
import { formatDistance } from '@/lib/geo';
import { isDemoBusiness } from '@/lib/demo';
import { businessCover } from '@/lib/placeholderImages';
import { PlaceholderTag } from '@/components/ui/PlaceholderTag';
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

/** Small label drawn over the photo. Fixed colours: it sits on an image in both themes. */
const photoChip = 'rounded-md px-2 py-1 text-[11px] font-medium leading-none backdrop-blur-sm';

export function BusinessCard({ business: b, distance, favorite, onToggleFavorite, openNow, variant = 'grid', availableAt }: Props) {
  const demo = isDemoBusiness(b);
  const verified = b.is_verified && !demo;
  const cover = businessCover(b);
  const price = Number(b.min_price) > 0 ? fromPrice(b.min_price) : null;
  const place = [categoryName(b.categories), b.district, distance != null ? formatDistance(distance) : null].filter(Boolean).join(' · ');

  const heart = onToggleFavorite && (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        onToggleFavorite(b.id);
      }}
      aria-label={favorite ? tx('Favorilerden çıkar', 'Remove from favourites') : tx('Favorilere ekle', 'Add to favourites')}
      aria-pressed={!!favorite}
      className="absolute right-2.5 top-2.5 flex h-9 w-9 items-center justify-center rounded-full bg-[#fff]/90 text-[#0a0a0a] shadow-sm backdrop-blur-sm transition-colors before:absolute before:-inset-1.5 hover:bg-[#fff]"
    >
      <Heart className={`h-4 w-4 ${favorite ? 'fill-[#e11d48] text-[#e11d48]' : ''}`} strokeWidth={1.9} />
    </button>
  );

  const rating = b.review_count > 0 && (
    <span className="flex shrink-0 items-center gap-1 text-[13px] font-medium text-white">
      <Star className="h-3.5 w-3.5 fill-gold-500 text-gold-500" />
      {Number(b.rating_avg).toFixed(1)}
      <span className="font-normal text-mist-2">({b.review_count})</span>
    </span>
  );

  const name = (
    <h3 className="flex min-w-0 items-center gap-1.5 text-[15px] font-semibold leading-snug text-white">
      <span className="truncate">{b.name}</span>
      {verified && <BadgeCheck className="h-4 w-4 shrink-0 text-gold-500" aria-label={dict().common.verified} />}
    </h3>
  );

  // What a visitor wants to know next: can I book today, is it open, and from how much.
  const status = demo ? (
    <span className="text-mist-2">{tx('Örnek profil · randevu alınamaz', 'Sample profile · not bookable')}</span>
  ) : availableAt ? (
    <span className="font-medium text-success-300">{tx(`Bugün ${formatTime(availableAt)} müsait`, `Free today at ${formatTime(availableAt)}`)}</span>
  ) : openNow !== undefined ? (
    <span className={openNow ? 'text-success-300' : 'text-mist-2'}>{openNow ? tx('Şu an açık', 'Open now') : tx('Şu an kapalı', 'Closed now')}</span>
  ) : null;

  if (variant === 'row') {
    return (
      <Link to={`/i/${b.slug}`} className="card group relative flex gap-4 p-3 transition-colors hover:border-white/30">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-coal-2 sm:h-28 sm:w-36">
          <BusinessCover src={cover.src} name={b.name} />
          {cover.placeholder && <PlaceholderTag compact className="bottom-1 left-1" />}
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5 pr-10">
          <div>
            <div className="flex items-start justify-between gap-3">
              {name}
              {rating}
            </div>
            <p className="mt-0.5 truncate text-[13px] text-mist">{place}</p>
            {demo && <span className="mt-1.5 inline-block rounded-md border border-line bg-coal-2 px-1.5 py-0.5 text-[11px] font-medium text-mist">{dict().demo.badge}</span>}
          </div>
          <div className="flex items-center justify-between gap-3 text-[13px]">
            {demo ? <span className="truncate text-mist-2">{dict().demo.notBookable}</span> : status}
            {!demo && price && <span className="shrink-0 font-medium text-white">{price}</span>}
          </div>
        </div>
        {heart}
      </Link>
    );
  }

  return (
    <Link to={`/i/${b.slug}`} className="group block">
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-coal-2">
        <BusinessCover src={cover.src} name={b.name} />
        <div className="absolute left-2.5 top-2.5 flex flex-wrap gap-1.5 pr-12">
          {demo && <span className={`${photoChip} bg-black/65 text-[#fff]`}>{dict().demo.badge}</span>}
          {!demo && b.is_featured && <span className={`${photoChip} bg-[#fff]/90 text-[#0a0a0a]`}>{dict().common.featured}</span>}
        </div>
        {cover.placeholder && <PlaceholderTag className="bottom-2.5 left-2.5" />}
        {heart}
      </div>
      <div className="pt-3">
        <div className="flex items-start justify-between gap-3">
          {name}
          {rating}
        </div>
        <p className="mt-0.5 truncate text-[13px] text-mist">{place}</p>
        <div className="mt-1 flex items-center justify-between gap-3 text-[13px]">
          <span className="min-w-0 truncate">{status}</span>
          {!demo && price && <span className="shrink-0 font-medium text-white">{price}</span>}
        </div>
      </div>
    </Link>
  );
}

function BusinessCover({ src, name }: { src: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-coal-3" role="img" aria-label={tx(`${name} için görsel bulunmuyor`, `No image for ${name}`)}>
        <span className="font-display text-4xl text-mist-3">{name.trim().charAt(0).toLocaleUpperCase('tr-TR')}</span>
      </div>
    );
  }
  return <img src={src} alt={name} loading="lazy" decoding="async" onError={() => setFailed(true)} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />;
}
