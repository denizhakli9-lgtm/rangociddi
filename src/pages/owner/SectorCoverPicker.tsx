import { Check } from 'lucide-react';
import { sectorCoverOptions } from '@/lib/placeholderImages';
import type { Category } from '@/lib/types';

interface Props {
  category: Category | undefined;
  /** Current `cover_url`; a `sector:` value highlights the matching option. */
  value: string | null;
  onChange: (value: string) => void;
}

/** Lets an owner pick one of the ready-made covers for their sector. */
export function SectorCoverPicker({ category, value, onChange }: Props) {
  const options = sectorCoverOptions(category);
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Hazır kapak görselleri">
      {options.map((o, i) => {
        const selected = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`Hazır görsel ${i + 1}`}
            onClick={() => onChange(o.value)}
            className={`relative aspect-[16/9] overflow-hidden rounded-xl border-2 transition ${selected ? 'border-gold-500' : 'border-line hover:border-white/30'}`}
          >
            <img src={o.src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
            {selected && (
              <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-fg">
                <Check className="h-4 w-4" aria-hidden="true" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
