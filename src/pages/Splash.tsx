import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, homePathFor } from '@/contexts/AuthContext';
import { useT } from '@/i18n/I18nProvider';
import { BrandMark, WordMark } from '@/components/ui/Brand';
import { ProfileLoadError } from '@/components/layout/RequireAuth';

export const ONBOARDED_KEY = 'veyra.onboarded';

// Storage can throw when site data is blocked (Safari Lockdown, strict
// enterprise policies); the app must keep navigating either way.
export function hasOnboarded(): boolean {
  try {
    return !!localStorage.getItem(ONBOARDED_KEY);
  } catch {
    return false;
  }
}

export function markOnboarded(): void {
  try {
    localStorage.setItem(ONBOARDED_KEY, '1');
  } catch {
    /* storage unavailable: onboarding is simply shown again next time */
  }
}

export default function Splash() {
  const t = useT();
  const { session, profile, loading } = useAuth();
  const navigate = useNavigate();
  const [isRecovery] = useState(() => /type=recovery/.test(window.location.hash));

  useEffect(() => {
    if (isRecovery) navigate('/sifre-yenile', { replace: true });
  }, [isRecovery, navigate]);

  useEffect(() => {
    if (isRecovery || loading || (session && !profile)) return;
    const timer = setTimeout(() => {
      if (session) navigate(homePathFor(profile), { replace: true });
      else navigate(hasOnboarded() ? '/kesfet' : '/hosgeldin', { replace: true });
    }, 2200);
    return () => clearTimeout(timer);
  }, [isRecovery, loading, session, profile, navigate]);

  // Signed in, but the profile could not be read: offer retry / sign-out
  // instead of leaving the logo animating forever.
  if (!isRecovery && !loading && session && !profile) return <ProfileLoadError />;

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-ink">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold-500/10 blur-[120px]" />
      <div className="relative flex flex-col items-center">
        <BrandMark className="mb-8 h-16 w-16 animate-scale-in" iconClassName="h-7 w-7" />
        <h1 className="animate-logo-reveal px-6 text-center">
          <WordMark className="text-5xl sm:text-7xl" />
        </h1>
        <span className="mt-5 h-px w-40 origin-center animate-line-grow bg-gradient-to-r from-transparent via-gold-500 to-transparent" />
        <p className="mt-5 max-w-sm animate-fade-in px-6 text-center text-sm leading-relaxed tracking-wide text-mist [animation-delay:1s]">{t.brand.tagline}</p>
      </div>
    </div>
  );
}
