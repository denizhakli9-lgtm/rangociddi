import { useNavigate } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { BUSINESS_LIST_COLUMNS } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { useFavorites } from '@/lib/useFavorites';
import { distanceKm } from '@/lib/geo';
import { useUserLocation } from '@/contexts/LocationContext';
import { BusinessCard } from '@/components/BusinessCard';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState } from '@/components/ui/Feedback';
import type { Business } from '@/lib/types';

export default function Favorites() {
  const navigate = useNavigate();
  const { location } = useUserLocation();
  const { ids, toggle } = useFavorites();
  const { data, loading, error, reload } = useAsync(async () => {
    const { data: rows, error: err } = await supabase.from('favorites').select(`created_at, businesses(${BUSINESS_LIST_COLUMNS})`).order('created_at', { ascending: false });
    if (err) throw err;
    return (rows ?? []).map((r) => (r as unknown as { businesses: Business | null }).businesses).filter((b): b is Business => !!b);
  }, []);

  const list = (data ?? []).filter((b) => ids.has(b.id));

  return (
    <div>
      <p className="eyebrow mb-2">Favoriler</p>
      <h1 className="mb-8 font-display text-4xl text-white">Sevdiğiniz yerler</h1>
      {loading ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton aspect-[4/3]" />)}</div>
      ) : error ? (
        <ErrorState onRetry={reload} />
      ) : !list.length ? (
        <EmptyState icon={<Heart className="h-6 w-6" />} title="Henüz favoriniz yok" text="Beğendiğiniz işletmelerdeki kalp simgesine dokunarak buraya ekleyin." action={<Button onClick={() => navigate('/ara')}>İşletmeleri keşfet</Button>} />
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((b) => (
            <BusinessCard
              key={b.id}
              business={b}
              distance={b.latitude != null && b.longitude != null ? distanceKm(location.lat, location.lng, b.latitude, b.longitude) : null}
              favorite
              onToggleFavorite={toggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}
