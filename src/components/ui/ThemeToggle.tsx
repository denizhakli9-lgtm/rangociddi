import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/lib/theme';

/** Compact sun/moon switch for headers. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useTheme();
  const dark = theme === 'dark';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Karanlık mod"
      title={dark ? 'Aydınlık moda geç' : 'Karanlık moda geç'}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      className={`group relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-coal/60 text-gold-400 transition duration-300 hover:border-gold-500/60 hover:bg-gold-500/10 hover:shadow-gold active:scale-95 ${className}`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 rounded-full bg-gradient-to-b from-gold-500/15 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100`}
      />
      <Sun
        aria-hidden="true"
        strokeWidth={1.7}
        className={`theme-icon absolute h-[18px] w-[18px] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${dark ? 'rotate-90 scale-50 opacity-0' : 'rotate-0 scale-100 opacity-100'}`}
      />
      <Moon
        aria-hidden="true"
        strokeWidth={1.7}
        className={`theme-icon absolute h-[17px] w-[17px] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${dark ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-50 opacity-0'}`}
      />
    </button>
  );
}
