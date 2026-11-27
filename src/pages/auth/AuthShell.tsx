import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/ui/Brand';
import { LegalFooter } from '@/components/legal/LegalFooter';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { LanguageToggle } from '@/components/ui/LanguageToggle';
import { useT } from '@/i18n/I18nProvider';
import { tx } from '@/i18n/locale';
import { useHomePath } from '@/lib/homePath';

/** One of the site's own cover photographs (see GORSEL-KAYNAKLARI.md); nothing is loaded from a third party. */
const IMAGE = `${import.meta.env.BASE_URL}sector-hair-5.webp`;

/** `eyebrow` is accepted for older callers but not shown: the title already says where the visitor is. */
export function AuthShell({ title, subtitle, children }: { eyebrow?: string; title: string; subtitle: string; children: ReactNode }) {
  const t = useT();
  const homePath = useHomePath();
  return (
    <div className="grid min-h-screen bg-ink lg:grid-cols-[1fr_1.1fr]">
      <div className="relative hidden overflow-hidden lg:block">
        <img src={IMAGE} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-12 pb-12 pt-40">
          <p className="max-w-sm font-display text-[40px] leading-[1.08] tracking-[-0.02em] text-[#fff]">{t.brand.tagline}</p>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-[#fff]/80">{tx('İzmir’de kuaför, berber ve güzellik işletmeleri için online randevu.', 'Online booking for hair, barber and beauty businesses in İzmir.')}</p>
        </div>
      </div>
      <div className="flex flex-col px-5 py-6 sm:px-12 lg:px-20">
        <div className="mb-10 flex items-center justify-between gap-4 sm:mb-14">
          <Link to={homePath} aria-label={tx('Rango ana sayfa', 'Rango home')}>
            <Logo size="sm" />
          </Link>
          <div className="flex items-center gap-1">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>
        <div className="mx-auto w-full max-w-md flex-1">
          <h1 className="font-display text-4xl leading-[1.08] tracking-[-0.02em] text-white sm:text-[44px]">{title}</h1>
          <p className="mb-8 mt-3 text-[15px] leading-relaxed text-mist">{subtitle}</p>
          {children}
        </div>
        <LegalFooter className="mt-14" />
      </div>
    </div>
  );
}
