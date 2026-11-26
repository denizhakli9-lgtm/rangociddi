/*
  # Phone sign-up for business owners (no SMS provider)

  Business owners may register with a mobile number instead of an e-mail address. Supabase Auth only
  has e-mail/password enabled, so the app signs them up with a technical login address derived from
  the number: tel-90<10 digits>@rango.com.tr (src/lib/phoneLogin.ts). This migration:

  1. private.is_phone_login_email(text): the one definition of that address pattern on the server.
  2. handle_new_user: the reserved range (tel-…@rango.com.tr) is accepted only for a *business*
     sign-up whose metadata phone is the same number, so nobody can take another person's number
     with a customer account or a hand-written address. For these accounts profiles.email is NULL
     (the technical address is never shown) and profiles.phone holds the number as "0532 123 45 67".
     Every other sign-up behaves exactly as before.
  3. profiles.phone of a phone account can only be re-formatted, not changed to another number:
     the number is the login identifier, and changing only the profile copy would lock the owner out.
  4. admin_reset_phone_password(user): phone accounts cannot receive a reset e-mail, so an admin can
     set a one-off temporary password and send it to the registered number over WhatsApp. Existing
     sessions of that account are signed out. Refused for e-mail accounts (they use the e-mail reset).
  5. admin_phone_login_users(): ids of phone accounts, so the admin panel can label them without
     reading auth.users from the client.
*/

-- 1. Pattern ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.is_phone_login_email(p_email text)
RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$ SELECT coalesce(lower(btrim(p_email)) ~ '^tel-905[0-9]{9}@rango\.com\.tr$', false); $$;

REVOKE EXECUTE ON FUNCTION private.is_phone_login_email(text) FROM PUBLIC, anon, authenticated;

/** "+90 532 123 45 67" / "05321234567" / "5321234567" -> "5321234567", else NULL. */
CREATE OR REPLACE FUNCTION private.normalize_tr_mobile(p_phone text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = ''
AS $$
DECLARE
  d text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
BEGIN
  IF length(d) = 12 AND left(d, 2) = '90' THEN d := substr(d, 3); END IF;
  IF length(d) = 11 AND left(d, 1) = '0' THEN d := substr(d, 2); END IF;
  RETURN CASE WHEN d ~ '^5[0-9]{9}$' THEN d END;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.normalize_tr_mobile(text) FROM PUBLIC, anon, authenticated;

-- 2. Profile creation ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_type text := coalesce(NEW.raw_user_meta_data->>'account_type', 'customer');
  v_gender text := coalesce(NEW.raw_user_meta_data->>'gender', 'unspecified');
  v_email text := NEW.email;
  v_phone text := left(NEW.raw_user_meta_data->>'phone', 30);
  v_mobile text;
BEGIN
  IF v_type NOT IN ('customer','business') THEN v_type := 'customer'; END IF;
  IF v_gender NOT IN ('female','male','other','unspecified') THEN v_gender := 'unspecified'; END IF;

  IF lower(coalesce(NEW.email, '')) LIKE 'tel-%@rango.com.tr' THEN
    v_mobile := private.normalize_tr_mobile(NEW.raw_user_meta_data->>'phone');
    IF NOT private.is_phone_login_email(NEW.email)
       OR v_type <> 'business'
       OR v_mobile IS NULL
       OR lower(btrim(NEW.email)) <> 'tel-90' || v_mobile || '@rango.com.tr' THEN
      -- Aborts the sign-up (Auth answers "Database error saving new user").
      RAISE EXCEPTION 'VEYRA_PHONE_LOGIN_INVALID';
    END IF;
    v_email := NULL;
    v_phone := '0' || substr(v_mobile, 1, 3) || ' ' || substr(v_mobile, 4, 3) || ' '
               || substr(v_mobile, 7, 2) || ' ' || substr(v_mobile, 9, 2);
  END IF;

  INSERT INTO profiles (id, role, full_name, email, phone, gender)
  VALUES (
    NEW.id, v_type,
    left(coalesce(NEW.raw_user_meta_data->>'full_name', ''), 120),
    v_email,
    v_phone,
    v_gender
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 3. Login number stays put ------------------------------------------------
CREATE OR REPLACE FUNCTION private.guard_phone_login_number() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_login text;
BEGIN
  -- Clearing the number (account deletion / anonymisation) is always allowed.
  IF NEW.phone IS NULL OR NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
  SELECT u.email INTO v_login FROM auth.users u WHERE u.id = NEW.id;
  IF private.is_phone_login_email(v_login)
     AND private.normalize_tr_mobile(NEW.phone) IS DISTINCT FROM substr(lower(btrim(v_login)), 7, 10) THEN
    RAISE EXCEPTION 'VEYRA_PHONE_LOGIN_LOCKED';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION private.guard_phone_login_number() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_guard_phone_login_number ON public.profiles;
CREATE TRIGGER profiles_guard_phone_login_number
  BEFORE UPDATE OF phone ON public.profiles
  FOR EACH ROW WHEN (NEW.phone IS DISTINCT FROM OLD.phone)
  EXECUTE FUNCTION private.guard_phone_login_number();

-- 4. Admin: temporary password for a phone account ------------------------
CREATE OR REPLACE FUNCTION private.admin_reset_phone_password(p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_login text;
  v_password text := '';
  v_alphabet constant text := 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea := extensions.gen_random_bytes(12);
  i int;
BEGIN
  IF NOT private.is_admin() THEN RAISE EXCEPTION 'VEYRA_FORBIDDEN'; END IF;
  SELECT u.email INTO v_login FROM auth.users u WHERE u.id = p_user;
  IF v_login IS NULL THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;
  IF NOT private.is_phone_login_email(v_login) THEN RAISE EXCEPTION 'VEYRA_INVALID_INPUT'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_user AND p.deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'VEYRA_NOT_FOUND';
  END IF;

  FOR i IN 0..11 LOOP
    v_password := v_password || substr(v_alphabet, (get_byte(v_bytes, i) % length(v_alphabet)) + 1, 1);
  END LOOP;

  UPDATE auth.users
     SET encrypted_password = extensions.crypt(v_password, extensions.gen_salt('bf')),
         updated_at = now()
   WHERE id = p_user;
  -- Whoever was signed in to this account (e.g. someone who registered the number first) is signed out.
  DELETE FROM auth.sessions WHERE user_id = p_user;

  RETURN jsonb_build_object(
    'password', v_password,
    'phone', '0' || substr(lower(btrim(v_login)), 7, 10)
  );
END;
$$;

-- 5. Admin: which accounts sign in with a phone number ----------------------
CREATE OR REPLACE FUNCTION private.admin_phone_login_users()
RETURNS uuid[]
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_admin() THEN RAISE EXCEPTION 'VEYRA_FORBIDDEN'; END IF;
  RETURN coalesce(
    (SELECT array_agg(u.id) FROM auth.users u WHERE private.is_phone_login_email(u.email)),
    '{}'::uuid[]);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reset_phone_password(p_user uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.admin_reset_phone_password(p_user); $$;

CREATE OR REPLACE FUNCTION public.admin_phone_login_users() RETURNS uuid[]
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.admin_phone_login_users(); $$;

DO $$
DECLARE
  sig text;
BEGIN
  FOREACH sig IN ARRAY ARRAY['admin_reset_phone_password(uuid)', 'admin_phone_login_users()'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION private.%s FROM PUBLIC, anon', sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon', sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION private.%s TO authenticated', sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', sig);
  END LOOP;
END;
$$;
