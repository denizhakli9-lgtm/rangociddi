import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Logo, RangoSignature } from '@/components/ui/Brand';
import { LegalFooter } from '@/components/legal/LegalFooter';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { LanguageToggle } from '@/components/ui/LanguageToggle';
import { useT } from '@/i18n/I18nProvider';
import { tx } from '@/i18n/locale';

const IMAGE = 'https://images.pexels.com/photos/10317447/pexels-photo-10317447.jpeg?auto=compress&cs=tinysrgb&h=1400&w=1000';

export function AuthShell({ eyebrow, title, subtitle, children }: { eyebrow: string; title: string; subtitle: string; children: ReactNode }) {
  const t = useT();
  return (
    <div className="grid min-h-screen bg-ink lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden lg:block">
        <img src={IMAGE} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink/30 via-ink/40 to-ink" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink to-transparent p-14">
          <p className="eyebrow mb-4">Rango · İzmir</p>
          <p className="max-w-md font-display text-4xl leading-tight text-white">{t.brand.tagline}</p>
        </div>
      </div>
      <div className="flex flex-col px-6 py-8 sm:px-12 lg:px-20">
        <div className="mb-12 flex items-center justify-between gap-4">
          <Link to="/kesfet" aria-label={tx('Rango ana sayfa', 'Rango home')}>
            <Logo size="sm" />
          </Link>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>
        <div className="mx-auto w-full max-w-md flex-1 animate-fade-up">
          <p className="eyebrow mb-3">{eyebrow}</p>
          <h1 className="font-display text-4xl text-white sm:text-[44px]">{title}</h1>
          <p className="mb-8 mt-3 text-sm text-mist">{subtitle}</p>
          {children}
        </div>
        <RangoSignature className="mt-12 text-center" />
        <LegalFooter className="mt-6" />
      </div>
    </div>
  );
}
