/*
  # Bind first-admin bootstrap to an allowlisted email

  private.claim_first_admin() promoted ANY authenticated caller to admin while
  no admin existed. It now also requires the caller's auth email to be on a
  bootstrap allowlist kept inside the private schema. Lock + single-use guard
  are preserved.
*/

CREATE OR REPLACE FUNCTION private.claim_first_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, auth
AS $$
DECLARE
  v_email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'VEYRA_AUTH_REQUIRED'; END IF;

  SELECT lower(u.email) INTO v_email FROM auth.users u WHERE u.id = auth.uid();

  IF v_email IS NULL OR v_email NOT IN ('denizhakli9@gmail.com') THEN
    RAISE EXCEPTION 'VEYRA_FORBIDDEN';
  END IF;

  LOCK TABLE profiles IN SHARE ROW EXCLUSIVE MODE;

  IF EXISTS (SELECT 1 FROM profiles WHERE role = 'admin') THEN RETURN false; END IF;

  UPDATE profiles SET role = 'admin' WHERE id = auth.uid();
  RETURN true;
END;
$$;
