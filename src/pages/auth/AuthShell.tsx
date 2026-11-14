import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Logo, RangoSignature } from '@/components/ui/Brand';
import { useT } from '@/i18n/I18nProvider';

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
        <Link to="/kesfet" className="mb-12">
          <Logo size="sm" />
        </Link>
        <div className="mx-auto w-full max-w-md flex-1 animate-fade-up">
          <p className="eyebrow mb-3">{eyebrow}</p>
          <h1 className="font-display text-4xl text-white sm:text-[44px]">{title}</h1>
          <p className="mb-8 mt-3 text-sm text-mist">{subtitle}</p>
          {children}
        </div>
        <RangoSignature className="mt-12 text-center" />
      </div>
    </div>
  );
}
