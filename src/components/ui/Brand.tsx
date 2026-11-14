import type { ReactNode } from 'react';
import { MapPin, Star } from 'lucide-react';
import { initials } from '@/lib/format';

export function Logo({ size = 'md', withMark = true }: { size?: 'sm' | 'md' | 'lg'; withMark?: boolean }) {
  const text = { sm: 'text-xl', md: 'text-2xl', lg: 'text-5xl' }[size];
  const mark = { sm: 'h-7 w-7', md: 'h-8 w-8', lg: 'h-14 w-14' }[size];
  return (
    <span className="inline-flex items-center gap-2.5">
      {withMark && <BrandMark className={mark} />}
      <WordMark className={text} />
    </span>
  );
}

export function BrandMark({ className = 'h-8 w-8', iconClassName = 'h-1/2 w-1/2' }: { className?: string; iconClassName?: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full border border-gold-500/60 bg-gradient-to-b from-gold-500/15 to-transparent ${className}`}>
      <MapPin className={`text-gold-400 ${iconClassName}`} strokeWidth={1.6} />
    </span>
  );
}

export function WordMark({ className = '' }: { className?: string }) {
  return (
    <span className={`whitespace-nowrap font-display font-semibold leading-none tracking-[0.02em] text-white ${className}`}>
      Rango<span className="text-gold-400">.</span>
    </span>
  );
}

export function RangoSignature({ className = '' }: { className?: string }) {
  return (
    <p className={`text-[11px] uppercase tracking-[0.24em] text-mist-3 ${className}`}>
      Bir <span className="font-semibold text-gold-400/80">RANGO</span> ürünü
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
          <button key={i} type="button" onClick={() => onChange(i)} className="p-1 transition hover:scale-110" aria-label={`${i} yıldız`}>
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
  if (src) return <img src={src} alt={name} loading="lazy" decoding="async" className={`${size} shrink-0 rounded-full object-cover`} />;
  return (
    <span className={`${size} flex shrink-0 items-center justify-center rounded-full border border-gold-500/40 bg-gradient-to-br from-gold-500/20 to-coal-3 font-display font-semibold text-gold-300`}>
      {initials(name) || 'H'}
    </span>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number }[] }) {
  return (
    <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-full border border-line bg-coal p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition ${value === o.value ? 'bg-gold-500 text-ink' : 'text-mist hover:text-white'}`}
        >
          {o.label}
          {o.count !== undefined && (
            <span className={`rounded-full px-1.5 text-[10px] ${value === o.value ? 'bg-ink/20' : 'bg-coal-3'}`}>{o.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function SectionTitle({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
        <h2 className="font-display text-[28px] text-white sm:text-3xl">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function StatCard({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon: ReactNode }) {
  return (
    <div className="card group relative overflow-hidden p-5 transition hover:border-gold-500/30">
      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gold-500/5 transition group-hover:bg-gold-500/10" />
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-gold-500/30 bg-gold-500/10 text-gold-400">{icon}</div>
      <p className="text-xs text-mist-2">{label}</p>
      <p className="mt-1 font-display text-3xl text-white">{value}</p>
      {sub && <p className="mt-1 text-xs text-mist-2">{sub}</p>}
    </div>
  );
}
