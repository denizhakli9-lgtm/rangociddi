import { supabase } from '@/lib/supabase';
import { fetchCategories } from '@/lib/api';
import { prerendered, type ListedBusiness } from '@/lib/prerenderData';
import { LISTING_SELECT } from '@/lib/seo/queries';
import { useCached } from '@/lib/useCached';
import type { Category } from '@/lib/types';

/**
 * A city's approved businesses with their active services and working hours: the data behind
 * the city / district / category pages, the footer links and the home page's area links.
 *
 * One request covers every such page (they only filter it), so moving between them is instant.
 * This is meant for a catalogue of up to a few hundred businesses; beyond that the pages should
 * query per district and category instead.
 */
function normalize(rows: ListedBusiness[]): ListedBusiness[] {
  return rows.map((b) => ({
    ...b,
    services: (b.services ?? []).filter((s) => s.is_active).sort((a, z) => a.sort_order - z.sort_order),
    working_hours: [...(b.working_hours ?? [])].sort((a, z) => a.weekday - z.weekday),
  }));
}

export async function fetchCityListing(city: string): Promise<ListedBusiness[]> {
  const { data, error } = await supabase.from('businesses').select(LISTING_SELECT).eq('status', 'approved').eq('city', city).order('name').limit(1000);
  if (error) throw error;
  return normalize((data ?? []) as unknown as ListedBusiness[]);
}

/** The city's listing; shown at once when the page embeds it or it was loaded earlier in this visit. */
export function useCityListing(city: string) {
  return useCached<ListedBusiness[]>(`listing:${city}`, () => fetchCityListing(city), {
    seed: () => {
      const embedded = prerendered('listing');
      return embedded?.city === city && Array.isArray(embedded.businesses) ? normalize(embedded.businesses) : undefined;
    },
  });
}

/** The active categories, with the same first-render behaviour as `useCityListing`. */
export function useCategories() {
  return useCached<Category[]>('categories', () => fetchCategories(), {
    seed: () => {
      const embedded = prerendered('categories');
      return Array.isArray(embedded) ? embedded : undefined;
    },
  });
}
