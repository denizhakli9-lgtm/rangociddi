import { ImageIcon } from 'lucide-react';
import { tx } from '@/i18n/locale';

export function PlaceholderTag({ className = 'bottom-3 left-3', compact = false }: { className?: string; compact?: boolean }) {
  const label = tx('Temsili görsel', 'Illustrative image');
  return (
    <span
      title={tx('Temsili görsel. İşletmenin gerçek fotoğrafı değildir.', 'Illustrative image. Not an actual photo of the business.')}
      className={`pointer-events-none absolute z-10 inline-flex max-w-[calc(100%-24px)] items-center gap-1 rounded-xl bg-black/85 font-medium text-white backdrop-blur ${compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2.5 py-1 text-[10px]'} ${className}`}
    >
      {!compact && <ImageIcon className="h-3 w-3" aria-hidden="true" />}
      {label}
    </span>
  );
}
