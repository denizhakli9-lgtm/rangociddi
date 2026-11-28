import { Check } from 'lucide-react';
import { CategoryIcon } from '@/components/CategoryIcon';
import type { Category } from '@/lib/types';

/** Extra categories besides the primary one (the database allows up to 4, see businesses.extra_category_ids). */
export const MAX_EXTRA_CATEGORIES = 4;

interface Props {
  categories: Category[];
  /** The primary category: it is not offered again here. */
  primaryId: string;
  value: string[];
  onChange: (value: string[]) => void;
}

/**
 * "Diğer hizmet kategorileri": a beauty centre that also does nails and laser epilation is then
 * listed on those category pages too. Chips in the owner's order of choice.
 */
export function ExtraCategoriesField({ categories, primaryId, value, onChange }: Props) {
  const options = categories.filter((c) => c.id !== primaryId);
  const selected = value.filter((id) => id !== primaryId);
  const full = selected.length >= MAX_EXTRA_CATEGORIES;
  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter((x) => x !== id));
    else if (!full) onChange([...selected, id]);
  };

  return (
    <fieldset className="space-y-1.5">
      <legend className="block text-[13px] font-medium text-mist">
        Diğer hizmet kategorileri <span className="font-normal text-mist-2">(isteğe bağlı, en fazla {MAX_EXTRA_CATEGORIES})</span>
      </legend>
      <p className="text-xs text-mist-2">
        Ana kategorinizin dışında verdiğiniz hizmetleri seçin. İşletmeniz bu kategorilerin sayfalarında ve aramalarında da çıkar.
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        {options.map((c) => {
          const on = selected.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={on}
              disabled={!on && full}
              onClick={() => toggle(c.id)}
              className={`flex min-h-11 items-center gap-2 rounded-full border px-3.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                on ? 'border-gold-500 bg-primary text-primary-fg' : 'border-line bg-coal text-white hover:border-white/40'
              }`}
            >
              {on ? <Check className="h-4 w-4" /> : <CategoryIcon name={c.icon} className="h-4 w-4 text-mist-2" />}
              {c.name}
            </button>
          );
        })}
      </div>
      {full && <p className="text-xs text-mist-2">En fazla {MAX_EXTRA_CATEGORIES} ek kategori seçebilirsiniz. Değiştirmek için birini kaldırın.</p>}
    </fieldset>
  );
}
