import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, BellRing, CalendarCheck, CalendarX2, CheckCheck, CreditCard, Megaphone, MessageCircle, MessageSquare, RefreshCw, Star, Store, Trash2, type LucideIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';
import { friendlyError } from '@/lib/errors';
import { formatRelative } from '@/lib/format';
import { safeInternalPath } from '@/lib/safeRedirect';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/Feedback';
import type { AppNotification } from '@/lib/types';
import { notificationBody, notificationTitle } from '@/i18n/notifications';
import { tx } from '@/i18n/locale';

const ICONS: Record<string, LucideIcon> = {
  appointment_confirmed: CalendarCheck,
  appointment_cancelled: CalendarX2,
  appointment_rescheduled: RefreshCw,
  appointment_reminder: BellRing,
  payment_confirmed: CreditCard,
  refund: CreditCard,
  business_status: Store,
  new_booking: CalendarCheck,
  review_request: Star,
  new_review: MessageSquare,
  announcement: Megaphone,
  appointment_message: MessageCircle,
};

export default function Notifications() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const { data, loading, error, reload, setData } = useAsync(async () => {
    const { data: rows, error: err } = await supabase.from('notifications').select('*').eq('user_id', profile!.id).order('created_at', { ascending: false }).limit(100);
    if (err) throw err;
    return (rows ?? []) as AppNotification[];
  }, [profile?.id]);

  useEffect(() => {
    if (profile?.role !== 'customer') return;
    supabase.rpc('generate_my_reminders').then(({ data: created, error: err }) => {
      if (err) console.error('reminders failed', err);
      else if (Number(created) > 0) reload();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const list = data ?? [];
  const unread = list.filter((n) => !n.is_read).length;

  const markAll = async () => {
    const { error: err } = await supabase.from('notifications').update({ is_read: true }).eq('user_id', profile!.id).eq('is_read', false);
    if (err) return toast(friendlyError(err), 'error');
    setData(list.map((n) => ({ ...n, is_read: true })));
  };

  const open = async (n: AppNotification) => {
    if (!n.is_read) {
      await supabase.from('notifications').update({ is_read: true }).eq('id', n.id);
      setData(list.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
    }
    const to = safeInternalPath(n.link);
    if (to) navigate(to);
  };

  const remove = async (id: string) => {
    const { error: err } = await supabase.from('notifications').delete().eq('id', id);
    if (err) return toast(friendlyError(err), 'error');
    setData(list.filter((n) => n.id !== id));
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-2">{tx('Bildirimler', 'Notifications')}</p>
          <h1 className="font-display text-4xl text-white">{tx('Gelişmelerden haberdar olun', 'Stay up to date')}</h1>
        </div>
        {unread > 0 && <Button size="sm" variant="ghost" icon={<CheckCheck className="h-4 w-4" />} onClick={markAll}>{tx('Tümünü okundu yap', 'Mark all as read')}</Button>}
      </div>

      {loading ? (
        <SkeletonList count={4} className="h-20" />
      ) : error ? (
        <ErrorState onRetry={reload} />
      ) : !list.length ? (
        <EmptyState icon={<Bell className="h-6 w-6" />} title={tx('Bildiriminiz yok', 'No notifications')} text={tx('Randevu onayları, hatırlatmalar ve ödeme bilgileri burada görünecek.', 'Booking confirmations, reminders and payment updates will appear here.')} />
      ) : (
        <ul className="space-y-2">
          {list.map((n) => {
            const Icon = ICONS[n.type] ?? Bell;
            return (
              <li key={n.id} className={`group flex items-start gap-4 rounded-2xl border p-4 transition ${n.is_read ? 'border-line bg-coal' : 'border-gold-500/30 bg-gold-500/[0.04]'}`}>
                <button onClick={() => open(n)} className="flex min-w-0 flex-1 items-start gap-4 text-left">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${n.is_read ? 'border-line text-mist' : 'border-gold-500/40 text-gold-400'}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">{notificationTitle(n.title)}</span>
                      {!n.is_read && <span className="h-1.5 w-1.5 rounded-full bg-gold-500" />}
                    </span>
                    <span className="mt-0.5 block text-sm text-mist">{notificationBody(n.body)}</span>
                    <span className="mt-1 block text-xs text-mist-3">{formatRelative(n.created_at)}</span>
                  </span>
                </button>
                <button onClick={() => remove(n.id)} className="rounded-full p-2 text-mist-3 opacity-100 transition hover:bg-white/5 hover:text-error-300 sm:opacity-0 sm:group-hover:opacity-100" aria-label={tx('Sil', 'Delete')}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
