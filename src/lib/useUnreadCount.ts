import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

export function useUnreadCount(): number {
  const { session } = useAuth();
  const { pathname } = useLocation();
  const { toast } = useToast();
  const [count, setCount] = useState(0);
  const [tick, setTick] = useState(0);
  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) {
      setCount(0);
      return;
    }
    let active = true;
    const load = async () => {
      const { count: c, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('is_read', false);
      if (!error && active) setCount(c ?? 0);
    };
    load();
    const timer = setInterval(load, 60000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [userId, pathname, tick]);

  // New rows arrive over realtime, so the bell updates at once; the poll above stays as a fallback.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, (payload) => {
        setTick((n) => n + 1);
        const row = payload.new as { type?: string; title?: string };
        // Announcements from Rango are not tied to something the person just did, so point them out.
        if (row.type === 'announcement' && row.title) toast(row.title, 'info');
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, toast]);

  return count;
}
