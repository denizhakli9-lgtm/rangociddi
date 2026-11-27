import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { tx } from '@/i18n/locale';

export function ThemeSelect() {
  const [theme, setTheme] = useTheme();

  return (
    <fieldset className="card p-4">
      <legend className="px-2 text-sm font-semibold text-white">{tx('Görünüm', 'Appearance')}</legend>
      <div className="grid grid-cols-2 gap-2">
        {([{ value: 'light', label: tx('Aydınlık', 'Light'), icon: Sun }, { value: 'dark', label: tx('Karanlık', 'Dark'), icon: Moon }] as const).map(({ value, label, icon: Icon }) => (
          <label key={value} className={`relative flex cursor-pointer flex-col items-center gap-2 rounded-xl border p-3 text-xs transition ${theme === value ? 'border-white/70 bg-coal-2 font-semibold text-white' : 'border-line text-mist hover:border-white/30'}`}>
            <input className="peer sr-only" type="radio" name="theme" value={value} checked={theme === value} onChange={() => setTheme(value)} />
            <span className="absolute inset-0 rounded-xl peer-focus-visible:ring-2 peer-focus-visible:ring-gold-500" />
            <Icon className="h-5 w-5" strokeWidth={1.5} />
            {label}
          </label>
        ))}
      </div>
      <p className="mt-3 text-xs text-mist-2">{tx('Seçtiğin görünüm bu cihazda hatırlanır.', 'Your choice is remembered on this device.')}</p>
    </fieldset>
  );
}
