import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Bell, LogOut, Menu, X, type LucideIcon } from 'lucide-react';
import { Logo, Avatar } from '@/components/ui/Brand';
import { useAuth } from '@/contexts/AuthContext';
import { useUnreadCount } from '@/lib/useUnreadCount';
import { useT } from '@/i18n/I18nProvider';

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
}

export function DashboardLayout({ title, items, notificationsPath }: Props) {
  const t = useT();
  const { profile, signOut } = useAuth();
  const unread = useUnreadCount();
  const navigate = useNavigate();
  const [drawer, setDrawer] = useState(false);
  const primary = items.filter((i) => i.primary).slice(0, 4);

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
            `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm transition ${
              isActive ? 'border border-gold-500/30 bg-gold-500/10 text-gold-300' : 'border border-transparent text-mist hover:bg-white/5 hover:text-white'
            }`
          }
        >
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.6} />
          {label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-ink lg:flex">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line-soft bg-coal/40 p-5 lg:flex">
        <Link to={items[0]?.to ?? '/'} className="mb-1">
          <Logo size="sm" />
        </Link>
        <p className="eyebrow mb-8 mt-3 pl-10">{title}</p>
        <div className="flex-1 overflow-y-auto">{navList()}</div>
        <div className="mt-6 flex items-center gap-3 border-t border-line pt-5">
          <Avatar name={profile?.full_name || 'Rango'} size="h-9 w-9 text-xs" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-white">{profile?.full_name || profile?.email}</p>
            <p className="text-xs text-mist-2">{profile ? t.role[profile.role] : ''}</p>
          </div>
          <button onClick={handleSignOut} className="rounded-lg p-2 text-mist-2 transition hover:bg-white/5 hover:text-white" aria-label={t.nav.signOut}>
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-line-soft bg-ink/85 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-3 lg:hidden">
            <Logo size="sm" withMark={false} />
            <span className="eyebrow">{title}</span>
          </div>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-1">
            {notificationsPath && (
              <Link to={notificationsPath} className="relative rounded-full p-2 text-mist transition hover:bg-white/5 hover:text-white" aria-label={t.nav.notifications}>
                <Bell className="h-5 w-5" />
                {unread > 0 && (
                  <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold-500 px-1 text-[10px] font-semibold text-ink">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </Link>
            )}
            <button onClick={() => setDrawer(true)} className="rounded-full p-2 text-mist transition hover:bg-white/5 hover:text-white lg:hidden" aria-label="Menü">
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:pb-12">
          <Outlet />
        </main>
      </div>

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-black/70" onClick={() => setDrawer(false)} />
          <div className="absolute right-0 top-0 flex h-full w-72 animate-fade-in flex-col border-l border-line bg-coal p-5">
            <div className="mb-6 flex items-center justify-between">
              <Logo size="sm" />
              <button onClick={() => setDrawer(false)} className="rounded-full p-2 text-mist" aria-label="Kapat">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{navList(() => setDrawer(false))}</div>
            <button onClick={handleSignOut} className="mt-4 flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm text-error-300 hover:bg-error-500/10">
              <LogOut className="h-4 w-4" />
              {t.nav.signOut}
            </button>
          </div>
        </div>
      )}

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line-soft bg-ink/95 backdrop-blur-xl lg:hidden">
        <div className="grid" style={{ gridTemplateColumns: `repeat(${primary.length + 1}, minmax(0, 1fr))` }}>
          {primary.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `flex flex-col items-center gap-1 py-2.5 text-[10px] transition ${isActive ? 'text-gold-400' : 'text-mist-2'}`}
            >
              <Icon className="h-5 w-5" strokeWidth={1.6} />
              <span className="truncate px-1">{label}</span>
            </NavLink>
          ))}
          <button onClick={() => setDrawer(true)} className="flex flex-col items-center gap-1 py-2.5 text-[10px] text-mist-2">
            <Menu className="h-5 w-5" strokeWidth={1.6} />
            Menü
          </button>
        </div>
      </nav>
    </div>
  );
}
