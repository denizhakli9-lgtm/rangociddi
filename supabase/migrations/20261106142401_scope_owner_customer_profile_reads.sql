/*
  # Stop business owners reading full customer profile rows

  1. Problem
     - profiles_select allowed a business owner to SELECT the ENTIRE profile row
       of any customer who had booked with them (row rules are row-level), which
       included push_token, latitude/longitude, city, district, locale, role and
       is_suspended. The owner UI only needs name, phone, email and gender.

  2. Change
     - Remove the private.is_customer_of_my_business(id) branch from
       profiles_select, so owners no longer read profiles directly.
     - Add private.business_customer_contacts(uuid) (SECURITY DEFINER) plus a
       thin SECURITY INVOKER public wrapper that returns ONLY
       customer_id, full_name, phone, email, gender for customers of a business
       the caller owns (admins may query any business).

  3. Security
     - Wrapper EXECUTE granted to authenticated only; ownership verified inside
       the definer function, so a caller cannot name another salon's business id.
*/

DROP POLICY IF EXISTS "profiles_select" ON profiles;

CREATE POLICY "profiles_select" ON profiles FOR SELECT
  TO authenticated
  USING ((id = auth.uid()) OR private.is_admin());

CREATE OR REPLACE FUNCTION private.business_customer_contacts(p_business uuid)
RETURNS TABLE (customer_id uuid, full_name text, phone text, email text, gender text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = private, public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'VEYRA_AUTH_REQUIRED'; END IF;

  IF NOT (private.is_admin() OR EXISTS (
    SELECT 1 FROM businesses b WHERE b.id = p_business AND b.owner_id = auth.uid()
  )) THEN
    RAISE EXCEPTION 'VEYRA_NOT_FOUND';
  END IF;

  RETURN QUERY
  SELECT DISTINCT p.id, p.full_name, p.phone, p.email, p.gender
  FROM profiles p
  JOIN appointments a ON a.customer_id = p.id
  WHERE a.business_id = p_business;
END;
$$;

CREATE OR REPLACE FUNCTION public.business_customer_contacts(p_business uuid)
RETURNS TABLE (customer_id uuid, full_name text, phone text, email text, gender text)
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT * FROM private.business_customer_contacts(p_business);
$$;

REVOKE EXECUTE ON FUNCTION public.business_customer_contacts(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.business_customer_contacts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.business_customer_contacts(uuid) TO authenticated, service_role;
