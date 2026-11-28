import { useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useCached } from '@/lib/useCached';
import { CITY_LIST, type City } from '@/lib/cities';
import { TEST_BUSINESS_SLUGS, isTestBusiness } from '@/lib/seo/config';

const SOON = CITY_LIST.filter((c) => c.status === 'soon');

/**
 * The "soon" cities that already have a live business. One approved business with an owner
 * (not a seeded sample, not a test business) is enough to open a city to customers.
 */
async function fetchLiveSoonCities(): Promise<string[]> {
  const live = await Promise.all(
    SOON.map(async (city) => {
      const { data, error } = await supabase
        .from('businesses')
        .select('slug')
        .eq('status', 'approved')
        .eq('city', city.name)
        .not('owner_id', 'is', null)
        // Enough rows that one real business is found even if every test business is in this city.
        .limit(TEST_BUSINESS_SLUGS.size + 1);
      if (error) throw error;
      return (data ?? []).some((b) => !isTestBusiness(b.slug)) ? city.name : null;
    }),
  );
  return live.filter((name): name is string => name !== null);
}

/**
 * Which cities customers can choose. `open` cities always; `soon` cities once their first
 * business is live. Until the check answers (or if it fails) soon cities stay "coming soon".
 */
export function useOpenCities() {
  const q = useCached<string[]>('open-cities', fetchLiveSoonCities);
  const live = useMemo(() => new Set(q.data ?? []), [q.data]);
  const isOpen = useCallback((c: City) => c.status === 'open' || (c.status === 'soon' && live.has(c.name)), [live]);
  return { isOpen, loading: q.loading };
}
