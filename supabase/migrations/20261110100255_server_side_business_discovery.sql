/*
# Server-side business discovery (search, filters, sorting, pagination)

## Summary
Until now the app downloaded EVERY approved business, every active service name and
the working hours of all businesses to the phone, and filtered/sorted there. That does
not scale. This migration moves discovery to the database so each screen only receives
the page of results it actually shows.

## New functions
1. `public.search_businesses(...)` - returns one page of approved businesses.
   - Filters: category slug, free-text query (name, district, description, category
     name and service names), max starting price, min rating, gender focus,
     "available today" (still has bookable time today in Europe/Istanbul), featured only.
   - Sorting: `mesafe` (distance from given lat/lng), `populer`, `puan`, `fiyat`.
   - Pagination: `p_limit` (clamped to 1..50) and `p_offset`.
   - Each row: `business` (jsonb incl. `categories {name, slug, icon}`), `distance_km`,
     `total_count` (total matches before pagination).
2. `public.category_stats()` - per category: number of approved businesses and the
   lowest starting price, so the categories page no longer needs the full list.

## Security
- Both functions are SECURITY INVOKER: they run with the caller's rights, so the
  existing row level security on businesses/services/working_hours/categories still
  applies (only approved businesses are visible to the public).
- EXECUTE granted to anon and authenticated (public discovery data).

## Notes
1. User text is escaped before being used in ILIKE patterns.
2. Safe to re-run (CREATE OR REPLACE).
*/

CREATE OR REPLACE FUNCTION public.search_businesses(
  p_lat double precision DEFAULT NULL,
  p_lng double precision DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_query text DEFAULT NULL,
  p_max_price numeric DEFAULT NULL,
  p_min_rating numeric DEFAULT NULL,
  p_gender text DEFAULT NULL,
  p_available_today boolean DEFAULT false,
  p_featured boolean DEFAULT false,
  p_sort text DEFAULT 'mesafe',
  p_limit integer DEFAULT 24,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (business jsonb, distance_km double precision, total_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH params AS (
    SELECT
      (now() AT TIME ZONE 'Europe/Istanbul') AS local_ts,
      CASE WHEN nullif(btrim(p_query), '') IS NULL THEN NULL
           ELSE '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%'
      END AS pattern
  ),
  base AS (
    SELECT
      b AS biz,
      c.name AS cat_name, c.slug AS cat_slug, c.icon AS cat_icon,
      CASE WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL AND b.latitude IS NOT NULL AND b.longitude IS NOT NULL THEN
        6371 * 2 * asin(sqrt(
          power(sin(radians(b.latitude - p_lat) / 2), 2) +
          cos(radians(p_lat)) * cos(radians(b.latitude)) * power(sin(radians(b.longitude - p_lng) / 2), 2)
        ))
      END AS dist
    FROM public.businesses b
    LEFT JOIN public.categories c ON c.id = b.category_id
    CROSS JOIN params pr
    WHERE b.status = 'approved'
      AND (p_category IS NULL OR c.slug = p_category)
      AND (coalesce(p_max_price, 0) <= 0 OR b.min_price <= p_max_price)
      AND (coalesce(p_min_rating, 0) <= 0 OR (b.review_count > 0 AND b.rating_avg >= p_min_rating))
      AND (p_gender IS NULL OR b.gender_focus = p_gender OR b.gender_focus = 'unisex')
      AND (NOT coalesce(p_featured, false) OR b.is_featured)
      AND (NOT coalesce(p_available_today, false) OR EXISTS (
        SELECT 1 FROM public.working_hours w
        WHERE w.business_id = b.id
          AND w.weekday = extract(isodow FROM pr.local_ts)
          AND NOT w.is_closed
          AND extract(hour FROM pr.local_ts) * 60 + extract(minute FROM pr.local_ts) + 60
              < extract(hour FROM w.close_time) * 60 + extract(minute FROM w.close_time)
      ))
      AND (pr.pattern IS NULL
        OR b.name ILIKE pr.pattern
        OR b.district ILIKE pr.pattern
        OR b.description ILIKE pr.pattern
        OR c.name ILIKE pr.pattern
        OR EXISTS (
          SELECT 1 FROM public.services s
          WHERE s.business_id = b.id AND s.is_active AND s.name ILIKE pr.pattern
        ))
  )
  SELECT
    to_jsonb(biz) || jsonb_build_object('categories',
      CASE WHEN cat_slug IS NULL THEN NULL
           ELSE jsonb_build_object('name', cat_name, 'slug', cat_slug, 'icon', cat_icon) END),
    dist,
    count(*) OVER ()
  FROM base
  ORDER BY
    CASE WHEN p_sort = 'populer' THEN -((biz).booking_count + (biz).review_count * 3) END,
    CASE WHEN p_sort = 'puan' THEN -(biz).rating_avg END,
    CASE WHEN p_sort = 'puan' THEN -(biz).review_count END,
    CASE WHEN p_sort = 'fiyat' THEN (biz).min_price END,
    dist NULLS LAST,
    (biz).created_at DESC,
    (biz).id
  LIMIT least(greatest(coalesce(p_limit, 24), 1), 50)
  OFFSET greatest(coalesce(p_offset, 0), 0);
$$;

CREATE OR REPLACE FUNCTION public.category_stats()
RETURNS TABLE (category_id uuid, business_count bigint, min_price numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT b.category_id, count(*), min(nullif(b.min_price, 0))
  FROM public.businesses b
  WHERE b.status = 'approved'
  GROUP BY b.category_id;
$$;

REVOKE EXECUTE ON FUNCTION public.search_businesses(double precision, double precision, text, text, numeric, numeric, text, boolean, boolean, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_businesses(double precision, double precision, text, text, numeric, numeric, text, boolean, boolean, text, integer, integer) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.category_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.category_stats() TO anon, authenticated;
