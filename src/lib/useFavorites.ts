import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

export function useFavorites() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [ids, setIds] = useState<Set<string>>(new Set());
  const isCustomer = profile?.role === 'customer';

  useEffect(() => {
    if (!isCustomer) {
      setIds(new Set());
      return;
    }
    supabase
      .from('favorites')
      .select('business_id')
      .then(({ data, error }) => {
        if (error) console.error('favorites load failed', error);
        else setIds(new Set((data ?? []).map((r) => r.business_id as string)));
      });
  }, [isCustomer, profile?.id]);

  const toggle = useCallback(
    async (businessId: string) => {
      if (!profile) {
        navigate(`/giris?sonra=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      if (!isCustomer) {
        toast('Favoriler yalnızca müşteri hesaplarında kullanılabilir.', 'info');
        return;
      }
      const had = ids.has(businessId);
      setIds((prev) => {
        const next = new Set(prev);
        if (had) next.delete(businessId);
        else next.add(businessId);
        return next;
      });
      const { error } = had
        ? await supabase.from('favorites').delete().eq('business_id', businessId).eq('customer_id', profile.id)
        : await supabase.from('favorites').insert({ business_id: businessId });
      if (error) {
        setIds((prev) => {
          const next = new Set(prev);
          if (had) next.add(businessId);
          else next.delete(businessId);
          return next;
        });
        toast(friendlyError(error), 'error');
      } else {
        toast(had ? 'Favorilerden çıkarıldı' : 'Favorilere eklendi', 'success');
      }
    },
    [ids, isCustomer, navigate, profile, toast],
  );

  return { ids, toggle };
}
