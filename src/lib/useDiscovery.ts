import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchWorkingHoursFor, searchBusinesses, type DiscoveryQuery } from '@/lib/api';
import { hasTimeLeftToday, isOpenNow, todayHours } from '@/lib/hours';
import { useUserLocation } from '@/contexts/LocationContext';
import type { Business } from '@/lib/types';

export interface DiscoveryItem {
  business: Business;
  distance: number | null;
  openNow: boolean;
  availableToday: boolean;
}

export type DiscoveryFilters = Omit<DiscoveryQuery, 'lat' | 'lng' | 'limit' | 'offset'>;

async function loadPage(query: DiscoveryQuery) {
  const page = await searchBusinesses(query);
  const hours = page.rows.length ? await fetchWorkingHoursFor(page.rows.map((r) => r.business.id)) : [];
  const items: DiscoveryItem[] = page.rows.map(({ business, distance }) => {
    const h = todayHours(hours, business.id);
    return { business, distance, openNow: isOpenNow(h), availableToday: hasTimeLeftToday(h) };
  });
  return { items, total: page.total };
}

export function useBusinessSearch(filters: DiscoveryFilters, pageSize = 24) {
  const { location } = useUserLocation();
  const [items, setItems] = useState<DiscoveryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const callId = useRef(0);
  const key = JSON.stringify(filters);

  const base = useCallback(
    (offset: number): DiscoveryQuery => ({ ...(JSON.parse(key) as DiscoveryFilters), lat: location.lat, lng: location.lng, limit: pageSize, offset }),
    [key, location.lat, location.lng, pageSize],
  );

  const reload = useCallback(async () => {
    const id = ++callId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await loadPage(base(0));
      if (id !== callId.current) return;
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      console.error(e);
      if (id === callId.current) setError(e);
    } finally {
      if (id === callId.current) setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    reload();
  }, [reload]);

  const loadMore = useCallback(async () => {
    if (loadingMore) return;
    const id = callId.current;
    setLoadingMore(true);
    try {
      const res = await loadPage(base(items.length));
      if (id !== callId.current) return;
      setItems((prev) => {
        const seen = new Set(prev.map((p) => p.business.id));
        return [...prev, ...res.items.filter((i) => !seen.has(i.business.id))];
      });
      setTotal(res.total);
    } catch (e) {
      console.error(e);
      if (id === callId.current) setError(e);
    } finally {
      setLoadingMore(false);
    }
  }, [base, items.length, loadingMore]);

  return { items, total, loading, loadingMore, hasMore: items.length < total, loadMore, error, reload };
}
