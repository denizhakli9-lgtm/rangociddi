import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Bell, LogOut, Menu, X, type LucideIcon } from 'lucide-react';
import { Logo, Avatar } from '@/components/ui/Brand';
import { useAuth } from '@/contexts/AuthContext';
import { useUnreadCount } from '@/lib/useUnreadCount';
import { useT } from '@/i18n/I18nProvider';
import { WhatsAppFab, WhatsAppIcon } from '@/components/WhatsAppSupport';
import { WHATSAPP_SUPPORT, whatsAppLinkProps } from '@/lib/whatsapp';
import { tx } from '@/i18n/locale';

export interface DashNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  primary?: boolean;
}

interface Props {
  title: string;
  items: DashNavItem[];
  notificationsPath?: string;
  /**
   * Shows the 24/7 WhatsApp support line (button on computers, menu entry on phones) and
   * pre-fills this text in the chat. Leave out to hide the line.
   */
  whatsAppMessage?: string;
}

export function DashboardLayout({ title, items, notificationsPath, whatsAppMessage }: Props) {
  const t = useT();
  const { profile, signOut } = useAuth();
  const unread = useUnreadCount();
  const navigate = useNavigate();
  const [drawer, setDrawer] = useState(false);
  const primary = items.filter((i) => i.primary).slice(0, 4);
  const whatsApp = whatsAppMessage !== undefined ? whatsAppLinkProps(whatsAppMessage) : null;

  const handleSignOut = async () => {
    await signOut();
    navigate('/giris');
  };

  const navList = (onClick?: () => void) => (
    <nav className="space-y-1">
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onClick}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
              isActive ? 'bg-coal-3 font-medium text-white' : 'text-mist hover:bg-white/5 hover:text-white'
            }`
          }
        >
          <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
          {label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-ink lg:flex">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line-soft bg-coal p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] lg:flex">
        <Link to={items[0]?.to ?? '/'} className="flex items-center gap-2.5 px-2 pt-1">
          <Logo size="sm" />
        </Link>
        <p className="mb-5 mt-5 px-3 text-xs font-medium text-mist-2">{title}</p>
        <div className="flex-1 overflow-y-auto">{navList()}</div>
        <div className="mt-4 flex items-center gap-3 border-t border-line-soft px-1 pt-4">
          <Avatar name={profile?.full_name || 'Rango'} size="h-9 w-9 text-xs" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{profile?.full_name || profile?.email}</p>
            <p className="text-xs text-mist-2">{profile ? t.role[profile.role] : ''}</p>
          </div>
          <button onClick={handleSignOut} className="rounded-lg p-2 text-mist-2 transition hover:bg-white/5 hover:text-white" aria-label={t.nav.signOut}>
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center justify-between border-b border-line-soft bg-ink/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-md sm:px-6 lg:h-[calc(4rem+env(safe-area-inset-top))]">
          <div className="flex items-center gap-3 lg:hidden">
            <Logo size="sm" />
            <span className="border-l border-line pl-3 text-xs font-medium text-mist-2">{title}</span>
          </div>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-1">
            {notificationsPath && (
              <Link to={notificationsPath} className="relative flex h-10 w-10 items-center justify-center rounded-lg text-mist transition-colors hover:bg-white/5 hover:text-white" aria-label={t.nav.notifications}>
                <Bell className="h-[18px] w-[18px]" strokeWidth={1.75} />
                {unread > 0 && (
                  <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold-500 px-1 text-[10px] font-semibold text-ink">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </Link>
            )}
            <button onClick={() => setDrawer(true)} className="flex h-10 w-10 items-center justify-center rounded-lg text-mist transition-colors hover:bg-white/5 hover:text-white lg:hidden" aria-label={tx('Menü', 'Menu')}>
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </header>
        <main className={`mx-auto max-w-6xl px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 ${whatsApp ? '' : 'lg:pb-[calc(3rem+env(safe-area-inset-bottom))]'}`}>
          <Outlet />
        </main>
      </div>

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-black/60" onClick={() => setDrawer(false)} />
          <div className="absolute right-0 top-0 flex h-full w-72 animate-fade-in flex-col border-l border-line bg-coal p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-[calc(1.25rem+env(safe-area-inset-top))]">
            <div className="mb-6 flex items-center justify-between">
              <Logo size="sm" />
              <button onClick={() => setDrawer(false)} className="rounded-lg p-2 text-mist transition-colors hover:bg-white/5 hover:text-white" aria-label={tx('Kapat', 'Close')}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{navList(() => setDrawer(false))}</div>
            {/* Outside the scrolling list so it is always in view on short phone screens. */}
            {whatsApp && (
              <a
                {...whatsApp}
                onClick={(e) => {
                  whatsApp.onClick(e);
                  setDrawer(false);
                }}
                className="mt-4 flex items-center gap-3 rounded-lg border border-line px-3 py-2.5 text-sm text-white transition-colors hover:border-white/30"
              >
                <WhatsAppIcon className="h-[18px] w-[18px] text-[#1fa855]" />
                <span className="flex-1">
                  <span className="block font-medium">{tx('WhatsApp destek', 'WhatsApp support')}</span>
                  <span className="block text-xs text-mist-2">{WHATSAPP_SUPPORT.display}</span>
                </span>
              </a>
            )}
            <button onClick={handleSignOut} className="mt-4 flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm text-error-300 hover:bg-error-500/10">
              <LogOut className="h-4 w-4" />
              {t.nav.signOut}
            </button>
          </div>
        </div>
      )}

      {whatsApp && <WhatsAppFab message={whatsAppMessage} from="lg" />}

      <nav data-tabbar className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line-soft bg-ink/95 backdrop-blur-md lg:hidden">
        <div className="grid" style={{ gridTemplateColumns: `repeat(${primary.length + 1}, minmax(0, 1fr))` }}>
          {primary.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `flex flex-col items-center gap-1 py-2.5 text-[10.5px] transition-colors ${isActive ? 'font-semibold text-white' : 'text-mist-2'}`}
            >
              <Icon className="h-5 w-5" strokeWidth={1.6} />
              <span className="truncate px-1">{label}</span>
            </NavLink>
          ))}
          <button onClick={() => setDrawer(true)} className="flex flex-col items-center gap-1 py-2.5 text-[10.5px] text-mist-2">
            <Menu className="h-5 w-5" strokeWidth={1.6} />
            {tx('Menü', 'Menu')}
          </button>
        </div>
      </nav>
    </div>
  );
}
