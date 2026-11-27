/*
  # Harden grants on public tables (security review, 27 November 2026)

  Nothing here changes what the website or the app shows; it removes privileges that only the
  database (not the client's column lists) should be relied on to withhold.

  1. Privileges the API never uses
    - TRUNCATE, REFERENCES and TRIGGER on every public table are revoked from `anon` and
      `authenticated`.

  2. Business contact details
    - `businesses.phone` and `businesses.email` are no longer readable without signing in: `anon`
      gets SELECT on an explicit column list. A column added to `businesses` later is NOT visible
      to visitors until it is granted here too.
    - `search_businesses` moves to schema `private` as SECURITY DEFINER behind an unchanged public
      wrapper (same pattern as `get_available_slots`), because it reads whole rows. It still
      returns only approved businesses and still removes phone and e-mail from the result.

  3. Reviews
    - `reviews.customer_id` (the reviewer's account id) is no longer readable without signing in.

  4. Tables only signed-in users read
    - `anon` loses SELECT on profiles, appointments, payments, refund_requests,
      commission_records, notifications, favorites and time_slots (no policy ever returned rows to
      it), and EXECUTE on `business_customer_contacts`.

  5. Business address (slug)
    - Format is enforced: lower-case letters and digits separated by hyphens, 3 to 80 characters.
    - Owners can no longer change the slug after creation (the app never does); the public address
      of an approved business stays the one that was reviewed.
*/

-- 1. Privileges the API never uses.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated;

-- 2. search_businesses: definer copy in schema private, public wrapper keeps the signature.
DO $$
DECLARE
  v_sig constant text := 'double precision, double precision, text, text, numeric, numeric, text, boolean, boolean, text, integer, integer';
  v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p
  WHERE p.oid = ('public.search_businesses(' || v_sig || ')')::regprocedure;

  -- Already a wrapper (this migration was applied before): nothing to copy.
  IF position('private.search_businesses' in v_def) = 0 THEN
    v_def := replace(v_def, 'FUNCTION public.search_businesses(', 'FUNCTION private.search_businesses(');
    v_def := replace(v_def, E'\n STABLE\n', E'\n STABLE SECURITY DEFINER\n');
    IF position('FUNCTION private.search_businesses(' in v_def) = 0 OR position('SECURITY DEFINER' in v_def) = 0 THEN
      RAISE EXCEPTION 'search_businesses: unexpected definition, nothing changed';
    END IF;
    EXECUTE v_def;
  END IF;
END $$;

REVOKE ALL ON FUNCTION private.search_businesses(double precision, double precision, text, text, numeric, numeric, text, boolean, boolean, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.search_businesses(double precision, double precision, text, text, numeric, numeric, text, boolean, boolean, text, integer, integer) TO anon, authenticated, service_role;

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
RETURNS TABLE(business jsonb, distance_km double precision, total_count bigint)
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
SELECT * FROM private.search_businesses(p_lat, p_lng, p_category, p_query, p_max_price, p_min_rating, p_gender, p_available_today, p_featured, p_sort, p_limit, p_offset);
$$;

-- 2. Businesses: visitors read an explicit column list (no phone, no email).
REVOKE SELECT ON public.businesses FROM anon;
GRANT SELECT (
  id, owner_id, category_id, name, slug, description, address, district, city, latitude, longitude,
  logo_url, cover_url, gallery, gender_focus, deposit_type, deposit_value, cancellation_hours, auto_confirm,
  status, is_verified, is_featured, rating_avg, review_count, booking_count, min_price, created_at, updated_at
) ON public.businesses TO anon;

-- 3. Reviews: everything except the reviewer's account id.
REVOKE SELECT ON public.reviews FROM anon;
GRANT SELECT (
  id, appointment_id, business_id, employee_id, rating, comment, reviewer_name, service_name, owner_reply, is_hidden, created_at
) ON public.reviews TO anon;

-- 4. Tables only signed-in users read.
REVOKE SELECT ON public.profiles, public.appointments, public.payments, public.refund_requests,
  public.commission_records, public.notifications, public.favorites, public.time_slots FROM anon;
REVOKE EXECUTE ON FUNCTION public.business_customer_contacts(uuid) FROM anon;

-- 5. Slug: fixed format, not changeable by the owner.
ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_slug_format;
ALTER TABLE public.businesses ADD CONSTRAINT businesses_slug_format
  CHECK (slug ~ '^[a-z0-9]+(-+[a-z0-9]+)*$' AND char_length(slug) BETWEEN 3 AND 80);
REVOKE UPDATE (slug) ON public.businesses FROM authenticated;

NOTIFY pgrst, 'reload schema';
