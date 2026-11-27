import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { tx } from '@/i18n/locale';

/** Compact sun/moon switch for headers. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useTheme();
  const dark = theme === 'dark';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label={tx('Karanlık mod', 'Dark mode')}
      title={dark ? tx('Aydınlık moda geç', 'Switch to light mode') : tx('Karanlık moda geç', 'Switch to dark mode')}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-mist transition-colors hover:bg-white/5 hover:text-white md:h-9 md:w-9 ${className}`}
    >
      <Sun
        aria-hidden="true"
        strokeWidth={1.75}
        className={`theme-icon absolute h-[18px] w-[18px] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${dark ? 'rotate-90 scale-50 opacity-0' : 'rotate-0 scale-100 opacity-100'}`}
      />
      <Moon
        aria-hidden="true"
        strokeWidth={1.75}
        className={`theme-icon absolute h-[17px] w-[17px] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${dark ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-50 opacity-0'}`}
      />
    </button>
  );
}
