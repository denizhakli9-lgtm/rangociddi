import { ImageIcon } from 'lucide-react';
import { tx } from '@/i18n/locale';

/**
 * Small label over a sector photo that stands in for a business's own cover, so customers
 * do not take a stock photo for the real salon. Place inside a `relative` container.
 */
export function PlaceholderTag({ className = 'bottom-3 left-3', compact = false }: { className?: string; compact?: boolean }) {
  const label = tx('Temsili görsel', 'Illustrative photo');
  return (
    <span
      title={tx('İşletme henüz kendi fotoğrafını eklemedi.', 'The business has not added its own photo yet.')}
      className={`pointer-events-none absolute z-10 inline-flex items-center gap-1 rounded-full bg-ink/70 font-medium text-white/85 backdrop-blur ${compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2.5 py-1 text-[10px]'} ${className}`}
    >
      {!compact && <ImageIcon className="h-3 w-3" aria-hidden="true" />}
      {label}
    </span>
  );
}
