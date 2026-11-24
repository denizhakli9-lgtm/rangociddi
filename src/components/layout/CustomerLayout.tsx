import { Suspense } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, CalendarDays, Compass, Heart, MapPin, Search, User } from 'lucide-react';
import { Logo } from '@/components/ui/Brand';
import { PageLoader } from '@/components/ui/Feedback';
import { LegalFooter } from '@/components/legal/LegalFooter';
import { WhatsAppFab } from '@/components/WhatsAppSupport';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { LanguageToggle } from '@/components/ui/LanguageToggle';
import { useAuth } from '@/contexts/AuthContext';
import { useUserLocation } from '@/contexts/LocationContext';
import { useUnreadCount } from '@/lib/useUnreadCount';
import { useT } from '@/i18n/I18nProvider';
import { useHomePath } from '@/lib/homePath';
import { tx } from '@/i18n/locale';

export function CustomerLayout() {
  const t = useT();
  const { pathname } = useLocation();
  const homePath = useHomePath();
  // On the website the home page also lives at "/".
  const isHome = pathname === '/kesfet' || pathname === '/';
  const { session, profile } = useAuth();
  const { location } = useUserLocation();
  const unread = useUnreadCount();
  const navigate = useNavigate();

  const tabs = [
    { to: homePath, label: t.nav.home, icon: Compass },
    { to: '/ara', label: t.nav.search, icon: Search },
    { to: '/randevularim', label: t.nav.appointments, icon: CalendarDays },
    { to: '/favoriler', label: t.nav.favorites, icon: Heart },
    { to: '/profil', label: t.nav.profile, icon: User },
  ];

  return (
    <div className="min-h-screen bg-ink">
      <header className="sticky top-0 z-40 border-b border-line-soft bg-ink/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to={homePath} aria-label={tx('Rango ana sayfa', 'Rango home')}>
            {isHome ? <span className="font-display text-2xl font-semibold tracking-wide text-white">Rango<span className="text-gold-500">.</span></span> : <Logo size="sm" />}
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {tabs.slice(0, 4).map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                className={({ isActive }) =>
                  `rounded-full px-4 py-2 text-sm transition ${isActive || (tab.to === homePath && isHome) ? 'text-gold-400' : 'text-mist hover:text-white'}`
                }
              >
                {tab.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/konum')}
              aria-label={tx('Konumu değiştir', 'Change location')}
              className="flex min-h-11 min-w-0 max-w-[112px] items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs text-mist transition hover:border-gold-500/40 hover:text-white sm:max-w-[150px]"
            >
              <MapPin className="h-3.5 w-3.5 shrink-0 text-gold-500" />
              <span className="truncate">{location.label}</span>
            </button>
            <LanguageToggle />
            <ThemeToggle />
            {session ? (
              <>
                <Link to="/bildirimler" className="relative flex h-11 w-11 items-center justify-center rounded-full p-2 text-mist transition hover:bg-white/5 hover:text-white" aria-label={t.nav.notifications}>
                  <Bell className="h-5 w-5" />
                  {unread > 0 && (
                    <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold-500 px-1 text-[10px] font-semibold text-ink">
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </Link>
                <Link to="/profil" className="hidden h-9 w-9 items-center justify-center rounded-full border border-gold-500/40 font-display text-gold-300 md:flex">
                  {(profile?.full_name || 'R').charAt(0).toLocaleUpperCase('tr-TR')}
                </Link>
              </>
            ) : (
              <Link to="/giris" className="rounded-full bg-gold-500 px-4 py-1.5 text-xs font-semibold text-ink transition hover:bg-gold-400">
                {t.nav.signIn}
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6">
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
        <LegalFooter className="mt-16" />
      </main>

      <WhatsAppFab />

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line-soft bg-ink/95 backdrop-blur-xl md:hidden">
        <div className="grid grid-cols-5">
          {tabs.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-2.5 text-[10px] transition ${isActive || (to === homePath && isHome) ? 'text-gold-400' : 'text-mist-2'}`
              }
            >
              <Icon className="h-5 w-5" strokeWidth={1.6} />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
