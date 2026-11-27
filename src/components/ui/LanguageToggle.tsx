import { Languages } from 'lucide-react';
import { useI18n, type Locale } from '@/i18n/I18nProvider';
import { tx } from '@/i18n/locale';

const OPTIONS: { value: Locale; label: string; short: string }[] = [
  { value: 'tr', label: 'Türkçe', short: 'TR' },
  { value: 'en', label: 'English', short: 'EN' },
];

/** Compact language switch for headers: shows the language you would switch to. */
export function LanguageToggle({ className = '' }: { className?: string }) {
  const { locale, setLocale } = useI18n();
  const next: Locale = locale === 'tr' ? 'en' : 'tr';
  const target = OPTIONS.find((o) => o.value === next)!;

  return (
    <button
      type="button"
      onClick={() => setLocale(next)}
      lang={next}
      aria-label={next === 'en' ? 'Switch to English' : 'Türkçe’ye geç'}
      title={next === 'en' ? 'Switch to English' : 'Türkçe’ye geç'}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-semibold text-mist transition-colors hover:bg-white/5 hover:text-white md:h-9 md:w-9 ${className}`}
    >
      {target.short}
    </button>
  );
}

/** Language card for the profile / settings page. */
export function LanguageSelect() {
  const { locale, setLocale } = useI18n();

  return (
    <fieldset className="card p-4">
      <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-white">
        <Languages className="h-4 w-4 text-mist-2" strokeWidth={1.6} />
        {tx('Dil', 'Language')}
      </legend>
      <div className="grid grid-cols-2 gap-2">
        {OPTIONS.map(({ value, label }) => (
          <label
            key={value}
            lang={value}
            className={`relative flex cursor-pointer items-center justify-center rounded-xl border p-3 text-xs transition ${locale === value ? 'border-white/70 bg-coal-2 font-semibold text-white' : 'border-line text-mist hover:border-white/30'}`}
          >
            <input className="peer sr-only" type="radio" name="language" value={value} checked={locale === value} onChange={() => setLocale(value)} />
            <span className="absolute inset-0 rounded-xl peer-focus-visible:ring-2 peer-focus-visible:ring-gold-500" />
            {label}
          </label>
        ))}
      </div>
      <p className="mt-3 text-xs text-mist-2">
        {tx('İşletme paneli ve yasal metinler Türkçe kalır.', 'The business panel and legal texts stay in Turkish.')}
      </p>
    </fieldset>
  );
}
