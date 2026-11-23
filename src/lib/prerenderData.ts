import type { Business, Category, Employee, Review, Service, WorkingHours } from '@/lib/types';

/**
 * Data the build embedded in a prerendered page (`<script type="application/json" id="rango-data">`,
 * written by seo/prerender.ts). A static page already shows its content; with this data the app can
 * render the same content on its very first paint instead of replacing the page with a loading
 * spinner. The data is as old as the last build, so every consumer shows it immediately and then
 * refreshes from Supabase (prices and hours must never stay stale).
 *
 * The shapes are exactly what the app's own queries return (same select strings, see
 * src/lib/seo/queries.ts).
 */
export type ListedBusiness = Business & {
  services: Pick<Service, 'name' | 'description' | 'price' | 'duration_minutes' | 'is_active' | 'sort_order'>[];
  working_hours: Pick<WorkingHours, 'weekday' | 'is_closed' | 'open_time' | 'close_time'>[];
};

export interface PrerenderedBusiness {
  slug: string;
  business: Business;
  services: Service[];
  employees: Employee[];
  hours: WorkingHours[];
  reviews: Review[];
}

export interface PrerenderPayload {
  categories?: Category[];
  listing?: { city: string; businesses: ListedBusiness[] };
  business?: PrerenderedBusiness;
}

export const PRERENDER_DATA_ID = 'rango-data';

let payload: PrerenderPayload | null | undefined;

function read(): PrerenderPayload | null {
  if (payload !== undefined) return payload;
  payload = null;
  try {
    const text = typeof document === 'undefined' ? null : document.getElementById(PRERENDER_DATA_ID)?.textContent;
    const parsed: unknown = text ? JSON.parse(text) : null;
    if (parsed && typeof parsed === 'object') payload = parsed as PrerenderPayload;
  } catch {
    /* malformed or missing: the page simply loads its data as usual */
  }
  return payload;
}

/** The embedded value for `key`, if the page that was opened carries one. */
export function prerendered<K extends keyof PrerenderPayload>(key: K): PrerenderPayload[K] | undefined {
  return read()?.[key];
}
