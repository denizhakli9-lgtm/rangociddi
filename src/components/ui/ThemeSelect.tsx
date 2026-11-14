import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

type Theme = 'light' | 'dark';

export function ThemeSelect() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem('hizmet-theme');
      return saved === 'light' || saved === 'dark' ? saved : document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#080808' : '#f8f7f3');
    try { localStorage.setItem('hizmet-theme', theme); } catch { /* Storage may be unavailable. */ }
  }, [theme]);

  return (
    <fieldset className="card p-4">
      <legend className="px-2 text-sm font-semibold text-white">Görünüm</legend>
      <div className="grid grid-cols-2 gap-2">
        {([{ value: 'light', label: 'Aydınlık', icon: Sun }, { value: 'dark', label: 'Karanlık', icon: Moon }] as const).map(({ value, label, icon: Icon }) => (
          <label key={value} className={`relative flex cursor-pointer flex-col items-center gap-2 rounded-xl border p-3 text-xs transition ${theme === value ? 'border-gold-500 bg-gold-500/10 text-gold-500' : 'border-line text-mist hover:border-gold-500/50'}`}>
            <input className="peer sr-only" type="radio" name="theme" value={value} checked={theme === value} onChange={() => {
              setTheme(value);
              try { localStorage.setItem('hizmet-theme', value); } catch { /* Device storage may be unavailable. */ }
            }} />
            <span className="absolute inset-0 rounded-xl peer-focus-visible:ring-2 peer-focus-visible:ring-gold-500" />
            <Icon className="h-5 w-5" strokeWidth={1.5} />
            {label}
          </label>
        ))}
      </div>
      <p className="mt-3 text-xs text-mist-2">Seçtiğin görünüm bu cihazda hatırlanır.</p>
    </fieldset>
  );
}
