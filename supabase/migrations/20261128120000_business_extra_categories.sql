/*
  # Businesses in more than one category

  A beauty centre also does nails and laser epilation, a barber also does skin care: a business now
  has one primary category and up to four more.

  Backward compatible: `businesses.category_id` stays the primary category. Everything that reads it
  (installed app versions, the deployed website, the `categories(...)` embedding) keeps working
  unchanged. The extra categories are a plain column, not a join table: a join table would give
  PostgREST a second businesses → categories relationship and make `categories(...)` ambiguous for
  every existing client.

  1. `businesses.extra_category_ids uuid[]`: up to 4 extra categories, in the owner's order. A trigger
     keeps the list clean (existing categories only, no duplicates, never the primary category) and
     rejects more than 4 (VEYRA_INVALID_INPUT). Readable like the other public columns; owners write
     it like the other profile columns (column grants below, same RLS policies as before).
  2. `search_businesses`: the category filter and the free-text search also match extra categories.
     Patched from the live definition (as in 20261127013938_harden_public_grants.sql), so nothing else
     in the function changes; stops without changing anything if the definition is not the expected one.
  3. `category_stats`: a business counts under each of its categories.
*/

-- ---------------------------------------------------------------------------
-- 1. Column, clean-up trigger, grants
-- ---------------------------------------------------------------------------
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS extra_category_ids uuid[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS businesses_extra_category_ids_idx ON public.businesses USING gin (extra_category_ids);

CREATE OR REPLACE FUNCTION private.clean_extra_categories()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v uuid[];
BEGIN
  -- Existing categories other than the primary one, each once, in the given order.
  SELECT coalesce(array_agg(x.id ORDER BY x.ord), '{}') INTO v
  FROM (
    SELECT DISTINCT ON (e.id) e.id, e.ord
    FROM unnest(coalesce(NEW.extra_category_ids, '{}'::uuid[])) WITH ORDINALITY AS e(id, ord)
    WHERE e.id IS NOT NULL
      AND e.id IS DISTINCT FROM NEW.category_id
      AND EXISTS (SELECT 1 FROM categories c WHERE c.id = e.id)
    ORDER BY e.id, e.ord
  ) x;
  IF cardinality(v) > 4 THEN RAISE EXCEPTION 'VEYRA_INVALID_INPUT'; END IF;
  NEW.extra_category_ids := v;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION private.clean_extra_categories() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS businesses_clean_extra_categories ON public.businesses;
CREATE TRIGGER businesses_clean_extra_categories
  BEFORE INSERT OR UPDATE OF extra_category_ids, category_id ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION private.clean_extra_categories();

GRANT SELECT (extra_category_ids) ON public.businesses TO anon, authenticated;
GRANT INSERT (extra_category_ids), UPDATE (extra_category_ids) ON public.businesses TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. search_businesses: category filter and text search include extra categories
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_def text;
  v_filter constant text := 'AND (p_category IS NULL OR c.slug = p_category)';
  v_text constant text := 'OR c.name ILIKE pr.pattern';
BEGIN
  v_def := pg_get_functiondef('private.search_businesses(double precision, double precision, text, text, numeric, numeric, text, boolean, boolean, text, integer, integer)'::regprocedure);
  IF position('extra_category_ids' in v_def) > 0 THEN
    RETURN; -- already applied
  END IF;
  IF position(v_filter in v_def) = 0 OR position(v_text in v_def) = 0 THEN
    RAISE EXCEPTION 'search_businesses: unexpected definition, nothing changed';
  END IF;
  v_def := replace(v_def, v_filter,
    'AND (p_category IS NULL OR c.slug = p_category OR EXISTS (SELECT 1 FROM public.categories ce WHERE ce.slug = p_category AND ce.id = ANY (b.extra_category_ids)))');
  v_def := replace(v_def, v_text,
    v_text || E'\n' || 'OR EXISTS (SELECT 1 FROM public.categories ce WHERE ce.id = ANY (b.extra_category_ids) AND ce.name ILIKE pr.pattern)');
  EXECUTE v_def;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. category_stats: a business counts under each of its categories
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.category_stats()
RETURNS TABLE (category_id uuid, business_count bigint, min_price numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT x.category_id, count(*), min(nullif(x.min_price, 0))
  FROM (
    SELECT b.category_id, b.min_price
    FROM public.businesses b
    WHERE b.status = 'approved'
    UNION ALL
    SELECT e.id, b.min_price
    FROM public.businesses b
    CROSS JOIN LATERAL unnest(b.extra_category_ids) AS e(id)
    WHERE b.status = 'approved'
  ) x
  GROUP BY x.category_id;
$$;

NOTIFY pgrst, 'reload schema';
