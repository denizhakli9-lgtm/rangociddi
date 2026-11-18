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
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-coal/60 text-[11px] font-semibold tracking-wider text-gold-400 transition hover:border-gold-500/60 hover:bg-gold-500/10 active:scale-95 ${className}`}
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
        <Languages className="h-4 w-4 text-gold-400" strokeWidth={1.6} />
        {tx('Dil', 'Language')}
      </legend>
      <div className="grid grid-cols-2 gap-2">
        {OPTIONS.map(({ value, label }) => (
          <label
            key={value}
            lang={value}
            className={`relative flex cursor-pointer items-center justify-center rounded-xl border p-3 text-xs transition ${locale === value ? 'border-gold-500 bg-gold-500/10 text-gold-500' : 'border-line text-mist hover:border-gold-500/50'}`}
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
