/*
  # Explicit consent for the AI support assistant, and in-app account deletion requests
  #   (App Review guidelines 5.1.2(i) and 5.1.1(v))

  Additive and backward compatible: the deployed website keeps working. Its users simply get a
  person instead of the AI until they consent in a version that has the new prompt.

  1. AI support consent (opt-in)
     - `public.support_ai_consents` (one row per user who agreed). Existing users have no row, so
       nobody is opted in by this migration. Users read only their own row; no client writes.
     - `support_set_ai_consent(p_consent)`: the caller gives (true) or withdraws (false) consent.
       Withdrawing also moves the caller's open AI conversations to the human queue.
     - `support_action('create')`: a new conversation starts with the AI ('ai') only when the caller
       has consented, otherwise it goes straight to the human queue ('waiting').
     - `support_action('handoff')` on a conversation that is already with a person is a no-op
       instead of an error (the deployed account-deletion flow calls create, send, handoff).
     - `support_claim_ai` (called by the support-ai edge function before every OpenAI request)
       returns false and moves the conversation to the human queue when the thread owner has not
       consented. This is enforced here, so even an older edge function never calls OpenAI for
       users without consent.
     - Consent rows are removed when an account is erased (profiles.deleted_at set).

  2. Account deletion requests (business and admin accounts)
     - Customer accounts keep the immediate `delete_my_account()`.
     - `public.account_deletion_requests`: one pending request per user. The requester and admins
       read it (RLS); writes only through the functions below.
     - `request_account_deletion()`: business and admin accounts. Records the request (due in
       30 days), notifies active admins and, when the business has no upcoming or unpaid bookings,
       hides its listing at once (status 'suspended'; the previous status is kept so a cancelled
       request can restore it). With upcoming bookings the listing stays until they are settled,
       so customers keep seeing their bookings. Idempotent: a second call returns the pending one.
       The last active admin cannot ask (VEYRA_LAST_ADMIN): nobody else could resolve the request.
     - `admin_list_account_deletion_requests()`: requests with the requester, the business and the
       obligations that still block completion (upcoming bookings, open refunds).
     - `admin_resolve_account_deletion(p_request, p_action, p_note)`:
       `complete` requires no upcoming bookings and no open refunds (as a customer or at the
       business). It suspends the business and clears its contact phone and e-mail, then erases
       the person exactly like `delete_my_account()` (profile anonymised, sign-in closed).
       Booking, payment, refund, commission, payout-account and sale-consent records are kept
       (tax / commercial law, payment institution agreement); nothing financial is deleted.
       `cancel` closes the request and restores a listing that the request (or `hide`) had hidden.
       `hide` takes a still listed ('approved') business off the listings so that no new bookings
       come in while the existing ones are settled; the request stays pending and `cancel` restores
       the listing.
       Admins cannot resolve their own request.
*/

-- ---------------------------------------------------------------------------
-- 1. AI support consent
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.support_ai_consents (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  consented_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.support_ai_consents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.support_ai_consents FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.support_ai_consents TO authenticated;
GRANT ALL ON public.support_ai_consents TO service_role;

DROP POLICY IF EXISTS "support_ai_consents_select_own" ON public.support_ai_consents;
CREATE POLICY "support_ai_consents_select_own" ON public.support_ai_consents
  FOR SELECT TO authenticated
  USING (
    ((SELECT auth.jwt()) ->> 'is_anonymous')::boolean IS NOT TRUE
    AND user_id = (SELECT auth.uid())
  );

CREATE OR REPLACE FUNCTION private.support_set_ai_consent(p_consent boolean)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_at timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'VEYRA_AUTH_REQUIRED'; END IF;
  IF coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN RAISE EXCEPTION 'VEYRA_FORBIDDEN'; END IF;
  IF p_consent IS NULL THEN RAISE EXCEPTION 'VEYRA_INVALID_INPUT'; END IF;

  IF p_consent THEN
    -- Giving consent needs an active account; withdrawing it never does.
    IF NOT private.is_active_member() THEN RAISE EXCEPTION 'VEYRA_FORBIDDEN'; END IF;
    INSERT INTO support_ai_consents (user_id) VALUES (v_uid)
    ON CONFLICT (user_id) DO UPDATE SET consented_at = now()
    RETURNING consented_at INTO v_at;
    RETURN v_at;
  END IF;

  DELETE FROM support_ai_consents WHERE user_id = v_uid;
  -- Only a conversation still waiting for an answer goes to a person; the rest are closed, so
  -- agents do not read what was shared with the assistant only, and retention/erasure still apply.
  UPDATE support_threads t
  SET status = CASE WHEN (SELECT m.sender FROM support_messages m WHERE m.thread_id = t.id
                          ORDER BY m.created_at DESC, m.id DESC LIMIT 1) = 'user'
                    THEN 'waiting' ELSE 'resolved' END,
      updated_at = now()
  WHERE t.user_id = v_uid AND t.status = 'ai';
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.support_set_ai_consent(p_consent boolean)
RETURNS timestamptz
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$ SELECT private.support_set_ai_consent(p_consent); $$;

REVOKE EXECUTE ON FUNCTION private.support_set_ai_consent(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.support_set_ai_consent(boolean) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.support_set_ai_consent(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_set_ai_consent(boolean) TO authenticated;

-- Erased accounts keep no consent row.
CREATE OR REPLACE FUNCTION private.erase_support_ai_consent_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
BEGIN
  DELETE FROM support_ai_consents WHERE user_id = NEW.id;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION private.erase_support_ai_consent_on_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_erase_support_ai_consent ON public.profiles;
CREATE TRIGGER profiles_erase_support_ai_consent
  AFTER UPDATE OF deleted_at ON public.profiles
  FOR EACH ROW
  WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
  EXECUTE FUNCTION private.erase_support_ai_consent_on_delete();

-- Same as 20261114200000_rango_security_hardening.sql, plus: no AI without the owner's consent.
CREATE OR REPLACE FUNCTION public.support_claim_ai(p_thread uuid, p_message uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v uuid;
  s text;
  o uuid;
  subj text;
  v_user_quota constant int := 20;
  v_global_quota constant int := 1500;
BEGIN
  SELECT t.status, t.user_id, t.subject INTO s, o, subj FROM public.support_threads t WHERE t.id = p_thread FOR UPDATE;
  IF s IS DISTINCT FROM 'ai' THEN RETURN false; END IF;
  SELECT m.id INTO v FROM public.support_messages m WHERE m.thread_id = p_thread ORDER BY m.created_at DESC, m.id DESC LIMIT 1;
  IF v IS DISTINCT FROM p_message THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.support_messages m
                 WHERE m.id = p_message AND m.thread_id = p_thread AND m.sender = 'user' AND NOT m.ai_requested) THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.support_ai_consents c WHERE c.user_id = o)
     OR subj ILIKE 'kvkk%'
     OR (SELECT count(*) FROM public.support_messages m
         WHERE m.author_id = o AND m.ai_requested AND m.created_at > now() - interval '24 hours') >= v_user_quota
     OR (SELECT count(*) FROM public.support_messages m
         WHERE m.ai_requested AND m.created_at > now() - interval '24 hours') >= v_global_quota THEN
    UPDATE public.support_threads SET status = 'waiting', updated_at = now() WHERE id = p_thread;
    RETURN false;
  END IF;

  UPDATE public.support_messages SET ai_requested = true
  WHERE id = p_message AND thread_id = p_thread AND sender = 'user' AND NOT ai_requested;
  RETURN FOUND;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.support_claim_ai(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_claim_ai(uuid, uuid) TO service_role;

-- Same as 20261114200000_rango_security_hardening.sql, plus: 'create' starts with the AI only
-- after consent, and 'handoff' on a conversation already with a person is a no-op.
CREATE OR REPLACE FUNCTION private.support_action(p_action text, p_thread uuid DEFAULT NULL, p_text text DEFAULT '')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  t public.support_threads;
  v uuid;
  a boolean;
  v_found boolean;
BEGIN
  IF auth.uid() IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean, false)
     OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND NOT is_suspended) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  a := private.support_is_agent();
  IF p_action = 'create' THEN
    IF char_length(btrim(p_text)) NOT BETWEEN 3 AND 120
       OR (SELECT count(*) FROM public.support_threads WHERE user_id = auth.uid() AND status <> 'resolved') >= 5 THEN
      RAISE EXCEPTION 'Invalid request';
    END IF;
    INSERT INTO public.support_threads(subject, status)
    VALUES (btrim(p_text),
            CASE WHEN EXISTS (SELECT 1 FROM public.support_ai_consents c WHERE c.user_id = auth.uid())
                 THEN 'ai' ELSE 'waiting' END)
    RETURNING id INTO v;
    RETURN v;
  END IF;
  SELECT * INTO t FROM public.support_threads WHERE id = p_thread FOR UPDATE;
  v_found := FOUND;
  IF v_found AND a AND t.user_id IS DISTINCT FROM auth.uid() AND t.subject ILIKE 'kvkk%'
     AND NOT private.support_is_admin() THEN
    a := false;
  END IF;
  IF NOT v_found OR NOT (t.user_id = auth.uid() OR a) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_action = 'handoff' AND t.user_id = auth.uid() AND t.status = 'ai' THEN
    UPDATE public.support_threads SET status = 'waiting', updated_at = now() WHERE id = t.id;
  ELSIF p_action = 'handoff' AND t.user_id = auth.uid() AND t.status IN ('waiting', 'human') THEN
    NULL; -- Already with a person.
  ELSIF p_action = 'claim' AND a AND t.status = 'waiting' THEN
    UPDATE public.support_threads SET status = 'human', assigned_to = auth.uid(), updated_at = now() WHERE id = t.id;
  ELSIF p_action = 'resolve' AND a AND t.assigned_to = auth.uid() AND t.status = 'human' THEN
    UPDATE public.support_threads SET status = 'resolved', updated_at = now() WHERE id = t.id;
  ELSIF p_action = 'send' AND t.status <> 'resolved' THEN
    IF char_length(btrim(p_text)) NOT BETWEEN 1 AND 4000
       OR (SELECT count(*) FROM public.support_messages WHERE author_id = auth.uid() AND created_at > now() - interval '1 minute') >= 15 THEN
      RAISE EXCEPTION 'Invalid request';
    END IF;
    IF t.user_id = auth.uid() THEN
      INSERT INTO public.support_messages(thread_id, author_id, sender, body) VALUES (t.id, auth.uid(), 'user', btrim(p_text));
    ELSIF a AND t.assigned_to = auth.uid() AND t.status = 'human' THEN
      INSERT INTO public.support_messages(thread_id, author_id, sender, body) VALUES (t.id, auth.uid(), 'agent', btrim(p_text));
      -- Through notify(): no notification rows for an erased account.
      PERFORM public.notify(t.user_id, 'support', 'Destek ekibinden yeni yanıt', 'Destek konuşmana yeni bir yanıt geldi.', '/destek');
    ELSE
      RAISE EXCEPTION 'Not authorized';
    END IF;
    UPDATE public.support_threads SET updated_at = now() WHERE id = t.id;
  ELSE
    RAISE EXCEPTION 'Invalid transition';
  END IF;
  RETURN t.id;
END;
$$;
REVOKE EXECUTE ON FUNCTION private.support_action(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.support_action(text, uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Account deletion requests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('customer', 'business', 'admin')),
  business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  -- Status of the business before the request hid it; NULL when the listing was not hidden.
  business_status_before text CHECK (business_status_before IS NULL OR business_status_before IN ('pending', 'approved', 'rejected', 'suspended')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  admin_note text CHECK (admin_note IS NULL OR char_length(admin_note) <= 500),
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);
CREATE UNIQUE INDEX IF NOT EXISTS account_deletion_requests_one_pending
  ON public.account_deletion_requests (user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS account_deletion_requests_user_idx ON public.account_deletion_requests (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS account_deletion_requests_business_idx ON public.account_deletion_requests (business_id);
CREATE INDEX IF NOT EXISTS account_deletion_requests_resolved_by_idx ON public.account_deletion_requests (resolved_by);

ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_deletion_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.account_deletion_requests TO authenticated;
GRANT ALL ON public.account_deletion_requests TO service_role;

DROP POLICY IF EXISTS "account_deletion_requests_select" ON public.account_deletion_requests;
CREATE POLICY "account_deletion_requests_select" ON public.account_deletion_requests
  FOR SELECT TO authenticated
  USING (
    ((SELECT auth.jwt()) ->> 'is_anonymous')::boolean IS NOT TRUE
    AND (
      user_id = (SELECT auth.uid())
      OR ((SELECT private.is_active_member()) AND (SELECT private.is_admin()))
    )
  );

-- Obligations that block erasure: bookings that are upcoming or awaiting approval / payment
-- (same rule as delete_my_account), as a customer or at the user's business, and open refunds.
CREATE OR REPLACE FUNCTION private.account_open_obligations(p_uid uuid)
RETURNS TABLE (upcoming_as_customer integer, upcoming_at_business integer, open_refunds integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, public
AS $$
  WITH settings AS (
    SELECT coalesce((SELECT pending_payment_minutes FROM platform_settings WHERE id = 1), 15) AS minutes
  ),
  owned AS (
    SELECT b.id FROM businesses b WHERE b.owner_id = p_uid
  ),
  active AS (
    SELECT a.customer_id, a.business_id
    FROM appointments a, settings s
    WHERE (a.customer_id = p_uid OR a.business_id IN (SELECT id FROM owned))
      AND (a.status = 'pending_approval'
           OR (a.status = 'confirmed' AND a.starts_at > now())
           OR (a.status = 'pending_payment' AND a.starts_at > now()
               AND a.created_at > now() - make_interval(mins => s.minutes)))
  )
  SELECT
    (SELECT count(*)::int FROM active WHERE customer_id = p_uid),
    (SELECT count(*)::int FROM active WHERE business_id IN (SELECT id FROM owned)),
    (SELECT count(*)::int FROM refund_requests r
      WHERE r.status = 'pending' AND (r.customer_id = p_uid OR r.business_id IN (SELECT id FROM owned)));
$$;
REVOKE EXECUTE ON FUNCTION private.account_open_obligations(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.request_account_deletion()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile profiles%ROWTYPE;
  v_req account_deletion_requests%ROWTYPE;
  v_business businesses%ROWTYPE;
  v_has_business boolean;
  v_upcoming int;
  v_before text;
  v_admin uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'VEYRA_AUTH_REQUIRED'; END IF;
  IF coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN RAISE EXCEPTION 'VEYRA_FORBIDDEN'; END IF;

  -- Suspended accounts may still ask: KVKK rights do not depend on the account being active.
  SELECT * INTO v_profile FROM profiles WHERE id = v_uid FOR UPDATE;
  IF NOT FOUND OR v_profile.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'VEYRA_FORBIDDEN'; END IF;
  -- Customer accounts are deleted immediately with delete_my_account().
  IF v_profile.role = 'customer' THEN RAISE EXCEPTION 'VEYRA_FORBIDDEN'; END IF;

  SELECT * INTO v_req FROM account_deletion_requests WHERE user_id = v_uid AND status = 'pending';
  IF FOUND THEN
    RETURN jsonb_build_object('id', v_req.id, 'created_at', v_req.created_at, 'due_at', v_req.due_at,
      'listing_hidden', v_req.business_status_before IS NOT NULL, 'existing', true);
  END IF;

  -- Admins cannot resolve their own request, so the last active admin could never be deleted.
  IF v_profile.role = 'admin' AND NOT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.role = 'admin' AND NOT p.is_suspended AND p.deleted_at IS NULL AND p.id <> v_uid
  ) THEN
    RAISE EXCEPTION 'VEYRA_LAST_ADMIN';
  END IF;

  SELECT * INTO v_business FROM businesses WHERE owner_id = v_uid ORDER BY created_at LIMIT 1 FOR UPDATE;
  v_has_business := FOUND;
  IF v_has_business AND v_business.status = 'approved' THEN
    SELECT o.upcoming_at_business INTO v_upcoming FROM private.account_open_obligations(v_uid) o;
    -- With upcoming bookings the listing stays visible, so customers keep their booking details.
    IF coalesce(v_upcoming, 0) = 0 THEN
      v_before := v_business.status;
      UPDATE businesses SET status = 'suspended' WHERE id = v_business.id;
    END IF;
  END IF;

  INSERT INTO account_deletion_requests (user_id, role, business_id, business_status_before)
  VALUES (v_uid, v_profile.role, CASE WHEN v_has_business THEN v_business.id END, v_before)
  RETURNING * INTO v_req;

  FOR v_admin IN
    SELECT p.id FROM profiles p
    WHERE p.role = 'admin' AND NOT p.is_suspended AND p.deleted_at IS NULL AND p.id <> v_uid
  LOOP
    PERFORM notify(v_admin, 'account_deletion', 'Yeni hesap silme talebi',
      CASE WHEN v_profile.role = 'admin' THEN 'Bir yönetici hesabı' ELSE 'Bir işletme hesabı' END
        || ' silinmek istiyor. 30 gün içinde sonuçlandırın.',
      '/yonetim/silme-talepleri');
  END LOOP;

  RETURN jsonb_build_object('id', v_req.id, 'created_at', v_req.created_at, 'due_at', v_req.due_at,
    'listing_hidden', v_before IS NOT NULL, 'existing', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.request_account_deletion()
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$ SELECT private.request_account_deletion(); $$;

REVOKE EXECUTE ON FUNCTION private.request_account_deletion() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.request_account_deletion() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.request_account_deletion() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_account_deletion() TO authenticated;

CREATE OR REPLACE FUNCTION private.admin_list_account_deletion_requests()
RETURNS TABLE (
  id uuid, user_id uuid, role text, full_name text, email text, phone text,
  business_id uuid, business_name text, business_status text, listing_hidden boolean,
  status text, admin_note text, created_at timestamptz, due_at timestamptz, resolved_at timestamptz,
  upcoming_as_customer integer, upcoming_at_business integer, open_refunds integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = private, public
AS $$
BEGIN
  IF coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
     OR NOT private.is_active_member() OR NOT private.is_admin() THEN
    RAISE EXCEPTION 'VEYRA_FORBIDDEN';
  END IF;
  RETURN QUERY
  SELECT r.id, r.user_id, r.role, p.full_name, p.email, p.phone,
         r.business_id, b.name, b.status, r.business_status_before IS NOT NULL,
         r.status, r.admin_note, r.created_at, r.due_at, r.resolved_at,
         coalesce(o.upcoming_as_customer, 0), coalesce(o.upcoming_at_business, 0), coalesce(o.open_refunds, 0)
  FROM account_deletion_requests r
  JOIN profiles p ON p.id = r.user_id
  LEFT JOIN businesses b ON b.id = r.business_id
  LEFT JOIN LATERAL (
    SELECT * FROM private.account_open_obligations(r.user_id) WHERE r.status = 'pending'
  ) o ON true
  ORDER BY (r.status = 'pending') DESC, r.created_at DESC
  LIMIT 300;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_account_deletion_requests()
RETURNS TABLE (
  id uuid, user_id uuid, role text, full_name text, email text, phone text,
  business_id uuid, business_name text, business_status text, listing_hidden boolean,
  status text, admin_note text, created_at timestamptz, due_at timestamptz, resolved_at timestamptz,
  upcoming_as_customer integer, upcoming_at_business integer, open_refunds integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$ SELECT * FROM private.admin_list_account_deletion_requests(); $$;

REVOKE EXECUTE ON FUNCTION private.admin_list_account_deletion_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.admin_list_account_deletion_requests() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_list_account_deletion_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_account_deletion_requests() TO authenticated;

-- Erases a person: the same steps as private.delete_my_account() (20261114200000), for any role.
-- Called only from admin_resolve_account_deletion after the obligation checks.
CREATE OR REPLACE FUNCTION private.erase_account_identity(p_uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v_label constant text := 'Silinmiş kullanıcı';
  v_col text;
BEGIN
  -- Expired payment holds of this person as a customer.
  UPDATE payments p SET status = 'cancelled'
  FROM appointments a
  WHERE p.appointment_id = a.id AND p.status = 'pending' AND a.customer_id = p_uid AND a.status = 'pending_payment';
  UPDATE appointments SET status = 'cancelled', cancelled_by = 'system', cancelled_at = now(),
    cancellation_reason = 'Ödeme süresi doldu'
  WHERE customer_id = p_uid AND status = 'pending_payment';

  DELETE FROM favorites WHERE customer_id = p_uid;
  DELETE FROM notifications WHERE user_id = p_uid;
  DELETE FROM support_messages m USING support_threads t
  WHERE m.thread_id = t.id AND t.user_id = p_uid AND t.status IN ('resolved', 'ai');
  DELETE FROM support_threads WHERE user_id = p_uid AND status IN ('resolved', 'ai');
  UPDATE support_threads SET status = 'waiting', assigned_to = NULL, updated_at = now()
  WHERE assigned_to = p_uid AND status = 'human';
  DELETE FROM support_agents WHERE user_id = p_uid;

  UPDATE appointments SET customer_note = '' WHERE customer_id = p_uid AND customer_note <> '';
  UPDATE appointments SET cancellation_reason = NULL
  WHERE customer_id = p_uid AND cancelled_by = 'customer' AND cancellation_reason IS NOT NULL;

  UPDATE reviews SET reviewer_name = v_label WHERE customer_id = p_uid;

  UPDATE profiles SET
    full_name = v_label, email = NULL, phone = NULL, gender = 'unspecified',
    district = NULL, latitude = NULL, longitude = NULL, avatar_url = NULL, push_token = NULL,
    is_suspended = true, deleted_at = coalesce(deleted_at, now())
  WHERE id = p_uid;

  DELETE FROM auth.refresh_tokens WHERE user_id = p_uid::text;
  DELETE FROM auth.sessions WHERE user_id = p_uid;
  DELETE FROM auth.identities WHERE user_id = p_uid;
  IF to_regclass('auth.mfa_factors') IS NOT NULL THEN
    EXECUTE 'DELETE FROM auth.mfa_factors WHERE user_id = $1' USING p_uid;
  END IF;
  IF to_regclass('auth.one_time_tokens') IS NOT NULL THEN
    EXECUTE 'DELETE FROM auth.one_time_tokens WHERE user_id = $1' USING p_uid;
  END IF;

  UPDATE auth.users SET
    email = 'deleted+' || p_uid::text || '@deleted.invalid',
    phone = NULL,
    banned_until = now() + interval '100 years',
    raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) - ARRAY[
      'full_name', 'name', 'phone', 'gender', 'avatar_url', 'picture', 'email', 'email_verified',
      'phone_verified', 'preferred_username', 'user_name', 'nickname', 'given_name', 'family_name'],
    updated_at = now()
  WHERE id = p_uid;

  FOREACH v_col IN ARRAY ARRAY['email_change', 'phone_change'] LOOP
    IF EXISTS (SELECT 1 FROM pg_attribute
               WHERE attrelid = 'auth.users'::regclass AND attname = v_col AND NOT attisdropped) THEN
      EXECUTE format('UPDATE auth.users SET %I = %L WHERE id = $1', v_col, '') USING p_uid;
    END IF;
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION private.erase_account_identity(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.admin_resolve_account_deletion(p_request uuid, p_action text, p_note text DEFAULT '')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_req account_deletion_requests%ROWTYPE;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_customer int;
  v_business int;
  v_refunds int;
BEGIN
  IF v_admin IS NULL THEN RAISE EXCEPTION 'VEYRA_AUTH_REQUIRED'; END IF;
  IF coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
     OR NOT private.is_active_member() OR NOT private.is_admin() THEN
    RAISE EXCEPTION 'VEYRA_FORBIDDEN';
  END IF;
  -- NULL must never fall through to the erase path below.
  IF p_action IS NULL OR p_action NOT IN ('complete', 'cancel', 'hide') OR char_length(coalesce(v_note, '')) > 500 THEN
    RAISE EXCEPTION 'VEYRA_INVALID_INPUT';
  END IF;

  SELECT * INTO v_req FROM account_deletion_requests WHERE id = p_request FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'VEYRA_INVALID_STATE'; END IF;
  -- Another admin decides on an admin's own request.
  IF v_req.user_id = v_admin THEN RAISE EXCEPTION 'VEYRA_FORBIDDEN'; END IF;

  -- Stops new bookings while the existing ones are settled; the request stays pending.
  IF p_action = 'hide' THEN
    IF v_req.business_id IS NULL THEN RAISE EXCEPTION 'VEYRA_INVALID_STATE'; END IF;
    UPDATE businesses SET status = 'suspended'
    WHERE id = v_req.business_id AND status = 'approved';
    IF FOUND THEN
      UPDATE account_deletion_requests SET business_status_before = 'approved'
      WHERE id = v_req.id AND business_status_before IS NULL;
    END IF;
    RETURN;
  END IF;

  IF p_action = 'cancel' THEN
    IF v_req.business_status_before IS NOT NULL THEN
      UPDATE businesses SET status = v_req.business_status_before
      WHERE id = v_req.business_id AND status = 'suspended';
    END IF;
    UPDATE account_deletion_requests
    SET status = 'cancelled', admin_note = v_note, resolved_by = v_admin, resolved_at = now()
    WHERE id = v_req.id;
    PERFORM notify(v_req.user_id, 'account_deletion', 'Hesap silme talebiniz kapatıldı',
      coalesce(v_note, 'Hesabınız silinmedi. Ayrıntılar için Yardım ve Destek bölümünden bize yazabilirsiniz.'), '/destek');
    RETURN;
  END IF;

  IF p_action IS DISTINCT FROM 'complete' THEN RAISE EXCEPTION 'VEYRA_INVALID_INPUT'; END IF;

  SELECT o.upcoming_as_customer, o.upcoming_at_business, o.open_refunds
  INTO v_customer, v_business, v_refunds
  FROM private.account_open_obligations(v_req.user_id) o;
  IF coalesce(v_customer, 0) > 0 OR coalesce(v_business, 0) > 0 THEN RAISE EXCEPTION 'VEYRA_ACTIVE_APPOINTMENTS'; END IF;
  IF coalesce(v_refunds, 0) > 0 THEN RAISE EXCEPTION 'VEYRA_OPEN_REFUND'; END IF;

  -- The business row stays (bookings, payments, commissions and payouts refer to it), hidden and
  -- without its contact details. Payout account and sale consents are retained by law.
  UPDATE businesses SET status = 'suspended', is_featured = false, phone = NULL, email = NULL
  WHERE owner_id = v_req.user_id;

  PERFORM private.erase_account_identity(v_req.user_id);

  UPDATE account_deletion_requests
  SET status = 'completed', admin_note = v_note, resolved_by = v_admin, resolved_at = now()
  WHERE id = v_req.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_resolve_account_deletion(p_request uuid, p_action text, p_note text DEFAULT '')
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$ SELECT private.admin_resolve_account_deletion(p_request, p_action, p_note); $$;

REVOKE EXECUTE ON FUNCTION private.admin_resolve_account_deletion(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.admin_resolve_account_deletion(uuid, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_resolve_account_deletion(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_account_deletion(uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
