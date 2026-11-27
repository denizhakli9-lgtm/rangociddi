import { Suspense } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Bell, CalendarDays, Compass, Heart, MapPin, Search, User } from 'lucide-react';
import { Logo } from '@/components/ui/Brand';
import { PageLoader } from '@/components/ui/Feedback';
import { SiteFooter } from '@/components/legal/LegalFooter';
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

  const tabs = [
    { to: homePath, label: t.nav.home, icon: Compass },
    { to: '/ara', label: t.nav.search, icon: Search },
    { to: '/randevularim', label: t.nav.appointments, icon: CalendarDays },
    { to: '/favoriler', label: t.nav.favorites, icon: Heart },
    { to: '/profil', label: t.nav.profile, icon: User },
  ];

  // Desktop menu: visitors see what the site offers; signed-in customers see their own pages.
  const menu = session
    ? [
        { to: homePath, label: t.nav.home },
        { to: '/ara', label: t.nav.search },
        { to: '/randevularim', label: t.nav.appointments },
        { to: '/favoriler', label: t.nav.favorites },
      ]
    : [
        { to: homePath, label: t.nav.home },
        { to: '/kategoriler', label: tx('Kategoriler', 'Categories') },
        { to: '/isletmeler-icin', label: tx('İşletmeler için', 'For businesses') },
        { to: '/sss', label: tx('Yardım', 'Help') },
      ];

  return (
    <div className="flex min-h-screen flex-col bg-ink">
      <header className="sticky top-0 z-40 border-b border-line-soft bg-ink/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link to={homePath} aria-label={tx('Rango ana sayfa', 'Rango home')} className="shrink-0">
            <Logo size="sm" />
          </Link>
          <nav aria-label={tx('Ana menü', 'Main menu')} className="hidden h-full items-stretch gap-1 md:flex">
            {menu.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => {
                  const active = isActive || (item.to === homePath && isHome);
                  return `relative flex items-center whitespace-nowrap px-3 text-sm transition-colors after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:transition-colors ${active ? 'font-medium text-white after:bg-gold-500' : 'text-mist after:bg-transparent hover:text-white'}`;
                }}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
            <Link
              to="/konum"
              aria-label={tx(`Konum: ${location.label}. Değiştir`, `Location: ${location.label}. Change`)}
              className="hidden h-9 min-w-0 max-w-[168px] items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-mist transition-colors hover:bg-white/5 hover:text-white lg:flex"
            >
              <MapPin className="h-4 w-4 shrink-0 text-mist-3" strokeWidth={1.75} />
              <span className="truncate">{location.label}</span>
            </Link>
            <LanguageToggle />
            <ThemeToggle />
            {session ? (
              <>
                <Link to="/bildirimler" className="relative flex h-10 w-10 items-center justify-center rounded-lg text-mist transition-colors hover:bg-white/5 hover:text-white md:h-9 md:w-9" aria-label={t.nav.notifications}>
                  <Bell className="h-[18px] w-[18px]" strokeWidth={1.75} />
                  {unread > 0 && (
                    <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold-500 px-1 text-[10px] font-semibold text-ink">
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </Link>
                <Link to="/profil" aria-label={t.nav.profile} className="ml-1 hidden h-9 w-9 items-center justify-center rounded-full border border-line bg-coal-2 text-sm font-semibold text-white transition-colors hover:border-white/40 md:flex">
                  {(profile?.full_name || 'R').charAt(0).toLocaleUpperCase('tr-TR')}
                </Link>
              </>
            ) : (
              <Link to="/giris" className="ml-1 inline-flex h-9 items-center whitespace-nowrap rounded-xl bg-primary px-4 text-[13px] font-semibold text-primary-fg transition-colors hover:bg-primary/90">
                {t.nav.signIn}
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-6 sm:px-6">
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </main>

      <SiteFooter />

      <WhatsAppFab />

      <nav aria-label={tx('Alt menü', 'Tab bar')} className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line-soft bg-ink/95 backdrop-blur-md md:hidden">
        <div className="grid grid-cols-5">
          {tabs.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-2.5 text-[10.5px] transition-colors ${isActive || (to === homePath && isHome) ? 'font-semibold text-white' : 'text-mist-2'}`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className="h-[21px] w-[21px]" strokeWidth={isActive || (to === homePath && isHome) ? 2 : 1.6} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
