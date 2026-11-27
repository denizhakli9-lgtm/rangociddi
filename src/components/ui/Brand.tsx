import type { ReactNode } from 'react';
import { Star } from 'lucide-react';
import { initials } from '@/lib/format';
import { safeImageUrl } from '@/lib/safeUrl';
import { tx } from '@/i18n/locale';

export function Logo({ size = 'md', withMark = true }: { size?: 'sm' | 'md' | 'lg'; withMark?: boolean }) {
  const text = { sm: 'text-[22px]', md: 'text-2xl', lg: 'text-5xl' }[size];
  const mark = { sm: 'h-7 w-7', md: 'h-8 w-8', lg: 'h-14 w-14' }[size];
  return (
    <span className="inline-flex items-center gap-2.5">
      {withMark && <BrandMark className={mark} />}
      <WordMark className={text} />
    </span>
  );
}

/** The "R" monogram: the same mark as the app icon and the favicon. */
export function BrandMark({ className = 'h-8 w-8' }: { className?: string; iconClassName?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={`shrink-0 ${className}`}>
      <rect width="64" height="64" rx="15" fill="#0a0a0a" />
      <rect x="4.5" y="4.5" width="55" height="55" rx="11" fill="none" stroke="#D4AF37" strokeOpacity="0.35" strokeWidth="1.5" />
      <path d="M22 47V17h11.5a8.5 8.5 0 0 1 0 17H22m11 0l10 13" fill="none" stroke="#D4AF37" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function WordMark({ className = '' }: { className?: string }) {
  return (
    <span className={`whitespace-nowrap font-display font-semibold leading-none tracking-[-0.01em] text-white ${className}`}>
      Rango<span className="text-gold-500">.</span>
    </span>
  );
}

export function RangoSignature({ className = '' }: { className?: string }) {
  return (
    <p className={`text-xs text-mist-3 ${className}`}>
      Rango · {tx('İzmir', 'İzmir')}
    </p>
  );
}

export function Stars({ value, size = 'h-3.5 w-3.5', onChange }: { value: number; size?: string; onChange?: (v: number) => void }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => {
        const filled = i <= Math.round(value);
        const icon = <Star className={`${size} ${filled ? 'fill-gold-500 text-gold-500' : 'text-mist-3'}`} />;
        return onChange ? (
          <button key={i} type="button" onClick={() => onChange(i)} className="p-1 transition hover:scale-110" aria-label={tx(`${i} yıldız`, i === 1 ? '1 star' : `${i} stars`)}>
            {icon}
          </button>
        ) : (
          <span key={i}>{icon}</span>
        );
      })}
    </span>
  );
}

export function Avatar({ name, src, size = 'h-10 w-10 text-sm' }: { name: string; src?: string | null; size?: string }) {
  // Avatar URLs are user-writable; only trusted storage/seed hosts are rendered, anything else falls back to initials.
  const safe = safeImageUrl(src);
  if (safe) return <img src={safe} alt={name} loading="lazy" decoding="async" className={`${size} shrink-0 rounded-full object-cover`} />;
  return (
    <span className={`${size} flex shrink-0 items-center justify-center rounded-full border border-line bg-coal-2 font-semibold text-white`}>
      {initials(name) || 'R'}
    </span>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number }[] }) {
  return (
    <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-xl border border-line bg-coal-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-medium transition-colors ${value === o.value ? 'bg-primary text-primary-fg' : 'text-mist hover:text-white'}`}
        >
          {o.label}
          {o.count !== undefined && (
            <span className={`rounded px-1.5 text-[11px] tabular-nums ${value === o.value ? 'bg-primary-fg/15' : 'bg-coal-3'}`}>{o.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function SectionTitle({ title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <h2 className="text-lg font-semibold tracking-tight text-white">{title}</h2>
      {action}
    </div>
  );
}

export function StatCard({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon: ReactNode }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-medium text-mist-2">{label}</p>
        <span className="text-mist-3 [&>svg]:h-[18px] [&>svg]:w-[18px]">{icon}</span>
      </div>
      <p className="mt-3 text-[28px] font-semibold leading-none tracking-tight text-white tabular-nums">{value}</p>
      {sub && <p className="mt-2 text-xs text-mist-2">{sub}</p>}
    </div>
  );
}
