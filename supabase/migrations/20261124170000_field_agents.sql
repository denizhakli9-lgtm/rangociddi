/*
  # Field agents (saha tanıtım ekibi)

  People who visit salons and bring them onto Rango. They get a limited panel, not admin rights.

  1. Who is an agent
     - `public.field_agents`: one row per agent (a normal Rango account). An admin adds or removes
       an agent by e-mail (`admin_set_field_agent`). Each agent gets a personal 6-character
       referral code and a fixed bonus per approved business, set by the admin.
  2. Referrals
     - `public.business_referrals`: which agent brought which business. Kept out of `businesses`
       because that table is readable by everyone.
     - A business owner attaches a code once, within 30 days of creating the business
       (`claim_business_referral`), normally right after the sign-up form with the code from the
       agent's link. An admin can set or clear the agent of any business (`admin_set_business_agent`).
  3. What an agent can do (`field_agent_*` functions)
     - See their own businesses with the owner's contact, setup progress and booking numbers.
     - Approve or reject the applications of their own businesses (pending or rejected ones only;
       suspending stays with admins). The owner is notified as with an admin decision.
     - See their bonuses.
  4. Bonuses
     - `public.field_agent_bonuses`: one row per business, written by a trigger the first time a
       referred business becomes `approved` (whoever approved it), with the agent's current bonus
       amount and the approver. Admins mark bonuses paid or cancelled (`admin_set_agent_bonus_status`).
  5. Security
     - Row level security on every table; no client writes. Agents read only their own rows.
     - Inactive agents and suspended / anonymous accounts get nothing.
*/

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.field_agents (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9]{6}$'),
  bonus_amount numeric(10,2) NOT NULL DEFAULT 0 CHECK (bonus_amount >= 0 AND bonus_amount <= 100000),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.business_referrals (
  business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.field_agents(user_id) ON DELETE CASCADE,
  set_by text NOT NULL CHECK (set_by IN ('owner', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS business_referrals_agent_idx ON public.business_referrals(agent_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.field_agent_bonuses (
  business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.profiles(id),
  amount numeric(10,2) NOT NULL CHECK (amount >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS field_agent_bonuses_agent_idx ON public.field_agent_bonuses(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS field_agent_bonuses_status_idx ON public.field_agent_bonuses(status, created_at DESC);

ALTER TABLE public.field_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_agent_bonuses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.field_agents, public.business_referrals, public.field_agent_bonuses FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.field_agents, public.business_referrals, public.field_agent_bonuses TO authenticated;
GRANT ALL ON public.field_agents, public.business_referrals, public.field_agent_bonuses TO service_role;

DROP POLICY IF EXISTS "field_agents_select" ON public.field_agents;
CREATE POLICY "field_agents_select" ON public.field_agents FOR SELECT TO authenticated
  USING (
    ((SELECT auth.jwt()) ->> 'is_anonymous')::boolean IS NOT TRUE
    AND (user_id = (SELECT auth.uid()) OR (SELECT private.is_admin()))
  );

DROP POLICY IF EXISTS "business_referrals_select" ON public.business_referrals;
CREATE POLICY "business_referrals_select" ON public.business_referrals FOR SELECT TO authenticated
  USING (
    ((SELECT auth.jwt()) ->> 'is_anonymous')::boolean IS NOT TRUE
    AND (agent_id = (SELECT auth.uid()) OR (SELECT private.is_admin()))
  );

DROP POLICY IF EXISTS "field_agent_bonuses_select" ON public.field_agent_bonuses;
CREATE POLICY "field_agent_bonuses_select" ON public.field_agent_bonuses FOR SELECT TO authenticated
  USING (
    ((SELECT auth.jwt()) ->> 'is_anonymous')::boolean IS NOT TRUE
    AND (agent_id = (SELECT auth.uid()) OR (SELECT private.is_admin()))
  );

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.is_field_agent()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, public
AS $$
  SELECT coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
     AND private.is_active_member()
     AND EXISTS (SELECT 1 FROM public.field_agents WHERE user_id = auth.uid() AND is_active);
$$;
REVOKE EXECUTE ON FUNCTION private.is_field_agent() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_field_agent() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.new_field_agent_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  -- No 0/O/1/I: codes are read out and typed by hand.
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
BEGIN
  LOOP
    SELECT string_agg(substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1), '')
    INTO v_code FROM generate_series(1, 6);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM field_agents WHERE code = v_code);
  END LOOP;
  RETURN v_code;
END;
$$;
REVOKE EXECUTE ON FUNCTION private.new_field_agent_code() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Bonus on first approval of a referred business
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.field_agent_bonus_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
BEGIN
  INSERT INTO field_agent_bonuses (business_id, agent_id, amount, approved_by)
  SELECT NEW.id, r.agent_id, a.bonus_amount, auth.uid()
  FROM business_referrals r JOIN field_agents a ON a.user_id = r.agent_id
  WHERE r.business_id = NEW.id
  ON CONFLICT (business_id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION private.field_agent_bonus_on_approval() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS businesses_field_agent_bonus ON public.businesses;
CREATE TRIGGER businesses_field_agent_bonus
  AFTER UPDATE OF status ON public.businesses
  FOR EACH ROW
  WHEN (NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved')
  EXECUTE FUNCTION private.field_agent_bonus_on_approval();

-- ---------------------------------------------------------------------------
-- Business owner: attach a referral code
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.claim_business_referral(p_business uuid, p_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_business businesses%ROWTYPE;
  v_agent field_agents%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'VEYRA_AUTH_REQUIRED'; END IF;
  PERFORM private.assert_active_member();
  SELECT * INTO v_business FROM businesses WHERE id = p_business AND owner_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;
  IF EXISTS (SELECT 1 FROM business_referrals WHERE business_id = p_business) THEN RAISE EXCEPTION 'VEYRA_INVALID_STATE'; END IF;
  IF v_business.created_at < now() - interval '30 days' THEN RAISE EXCEPTION 'VEYRA_INVALID_STATE'; END IF;

  SELECT * INTO v_agent FROM field_agents WHERE code = v_code AND is_active;
  -- An agent cannot refer their own business.
  IF NOT FOUND OR v_agent.user_id = v_uid THEN RAISE EXCEPTION 'VEYRA_INVALID_CODE'; END IF;

  INSERT INTO business_referrals (business_id, agent_id, set_by) VALUES (p_business, v_agent.user_id, 'owner');
  PERFORM notify(v_agent.user_id, 'field_referral', 'Yeni işletme kaydı',
    v_business.name || ' (' || v_business.district || ') referans kodunuzla kaydoldu.', '/saha/isletmeler');
END;
$$;

-- ---------------------------------------------------------------------------
-- Agent panel
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.field_agent_me()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v_agent field_agents%ROWTYPE;
BEGIN
  IF NOT private.is_field_agent() THEN RETURN NULL; END IF;
  SELECT * INTO v_agent FROM field_agents WHERE user_id = auth.uid();
  RETURN jsonb_build_object('code', v_agent.code, 'bonus_amount', v_agent.bonus_amount, 'since', v_agent.created_at);
END;
$$;

CREATE OR REPLACE FUNCTION private.field_agent_businesses()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF NOT private.is_field_agent() THEN RAISE EXCEPTION 'VEYRA_FORBIDDEN'; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(row_to_json(x) ORDER BY x.referred_at DESC)
    FROM (
      SELECT b.id, b.name, b.slug, b.district, b.city, b.status, b.created_at, r.created_at AS referred_at,
             b.phone, b.cover_url IS NOT NULL AS has_cover,
             length(btrim(b.address)) >= 5 AS has_address,
             btrim(b.description) <> '' AS has_description,
             b.booking_count, b.rating_avg, b.review_count,
             p.full_name AS owner_name, p.phone AS owner_phone, p.email AS owner_email,
             (SELECT count(*) FROM services s WHERE s.business_id = b.id AND s.is_active) AS services,
             (SELECT count(*) FROM employees e WHERE e.business_id = b.id AND e.is_active) AS employees,
             (SELECT count(*) FROM working_hours h WHERE h.business_id = b.id AND NOT h.is_closed) AS open_days,
             (SELECT count(*) FROM appointments a WHERE a.business_id = b.id AND a.status = 'completed') AS completed_appointments,
             (SELECT jsonb_build_object('amount', fb.amount, 'status', fb.status)
                FROM field_agent_bonuses fb WHERE fb.business_id = b.id AND fb.agent_id = v_uid) AS bonus
      FROM business_referrals r
      JOIN businesses b ON b.id = r.business_id
      LEFT JOIN profiles p ON p.id = b.owner_id AND p.deleted_at IS NULL
      WHERE r.agent_id = v_uid
    ) x
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION private.field_agent_set_business_status(p_business uuid, p_status text, p_reason text DEFAULT '')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v_b businesses%ROWTYPE;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  IF NOT private.is_field_agent() THEN RAISE EXCEPTION 'VEYRA_FORBIDDEN'; END IF;
  IF p_status NOT IN ('approved', 'rejected') OR char_length(coalesce(v_reason, '')) > 500 THEN
    RAISE EXCEPTION 'VEYRA_INVALID_INPUT';
  END IF;
  SELECT b.* INTO v_b FROM businesses b
  JOIN business_referrals r ON r.business_id = b.id AND r.agent_id = auth.uid()
  WHERE b.id = p_business FOR UPDATE OF b;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;
  -- Suspended businesses and those without an owner stay with admins.
  IF v_b.owner_id IS NULL OR v_b.status NOT IN ('pending', 'rejected') OR v_b.status = p_status THEN
    RAISE EXCEPTION 'VEYRA_INVALID_STATE';
  END IF;
  IF v_b.owner_id = auth.uid() THEN RAISE EXCEPTION 'VEYRA_FORBIDDEN'; END IF;

  UPDATE businesses SET status = p_status WHERE id = v_b.id;
  PERFORM notify(v_b.owner_id, 'business_status',
    CASE p_status WHEN 'approved' THEN 'İşletmeniz onaylandı' ELSE 'İşletme başvurunuz reddedildi' END,
    CASE p_status WHEN 'approved' THEN v_b.name || ' artık Rango''da yayında ve randevu alabilir.'
                  ELSE coalesce('Neden: ' || v_reason || '. ', '') || 'Bilgilerinizi güncelleyip tekrar başvurabilir veya destek ekibimizle iletişime geçebilirsiniz.' END,
    '/isletme');
END;
$$;

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.admin_set_field_agent(p_email text, p_bonus numeric, p_active boolean)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v_user uuid;
  v_code text;
  v_new boolean;
BEGIN
  IF NOT private.is_admin() THEN RAISE EXCEPTION 'VEYRA_FORBIDDEN'; END IF;
  IF p_bonus IS NULL OR p_bonus < 0 OR p_bonus > 100000 THEN RAISE EXCEPTION 'VEYRA_INVALID_INPUT'; END IF;
  SELECT id INTO v_user FROM profiles
  WHERE lower(email) = lower(btrim(coalesce(p_email, ''))) AND deleted_at IS NULL;
  IF v_user IS NULL THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;

  v_new := NOT EXISTS (SELECT 1 FROM field_agents WHERE user_id = v_user);
  INSERT INTO field_agents (user_id, code, bonus_amount, is_active)
  VALUES (v_user, private.new_field_agent_code(), round(p_bonus, 2), coalesce(p_active, true))
  ON CONFLICT (user_id) DO UPDATE
    SET bonus_amount = EXCLUDED.bonus_amount, is_active = EXCLUDED.is_active, updated_at = now()
  RETURNING code INTO v_code;

  IF v_new AND coalesce(p_active, true) THEN
    PERFORM notify(v_user, 'field_agent', 'Saha ekibine eklendiniz',
      'Saha panelinize girip referans kodunuzu (' || v_code || ') işletmelerle paylaşabilirsiniz.', '/saha');
  END IF;
  RETURN v_code;
END;
$$;

CREATE OR REPLACE FUNCTION private.admin_set_business_agent(p_business uuid, p_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_agent uuid;
BEGIN
  IF NOT private.is_admin() THEN RAISE EXCEPTION 'VEYRA_FORBIDDEN'; END IF;
  IF NOT EXISTS (SELECT 1 FROM businesses WHERE id = p_business) THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;
  IF v_code = '' THEN
    DELETE FROM business_referrals WHERE business_id = p_business;
    RETURN;
  END IF;
  SELECT user_id INTO v_agent FROM field_agents WHERE code = v_code;
  IF v_agent IS NULL THEN RAISE EXCEPTION 'VEYRA_INVALID_CODE'; END IF;
  INSERT INTO business_referrals (business_id, agent_id, set_by) VALUES (p_business, v_agent, 'admin')
  ON CONFLICT (business_id) DO UPDATE SET agent_id = EXCLUDED.agent_id, set_by = 'admin', created_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION private.admin_set_agent_bonus_status(p_business uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
BEGIN
  IF NOT private.is_admin() THEN RAISE EXCEPTION 'VEYRA_FORBIDDEN'; END IF;
  IF p_status NOT IN ('pending', 'paid', 'cancelled') THEN RAISE EXCEPTION 'VEYRA_INVALID_INPUT'; END IF;
  UPDATE field_agent_bonuses
  SET status = p_status, resolved_at = CASE WHEN p_status = 'pending' THEN NULL ELSE now() END
  WHERE business_id = p_business;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Public wrappers and grants
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_business_referral(p_business uuid, p_code text) RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.claim_business_referral(p_business, p_code); $$;

CREATE OR REPLACE FUNCTION public.field_agent_me() RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.field_agent_me(); $$;

CREATE OR REPLACE FUNCTION public.field_agent_businesses() RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.field_agent_businesses(); $$;

CREATE OR REPLACE FUNCTION public.field_agent_set_business_status(p_business uuid, p_status text, p_reason text DEFAULT '') RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.field_agent_set_business_status(p_business, p_status, p_reason); $$;

CREATE OR REPLACE FUNCTION public.admin_set_field_agent(p_email text, p_bonus numeric, p_active boolean) RETURNS text
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.admin_set_field_agent(p_email, p_bonus, p_active); $$;

CREATE OR REPLACE FUNCTION public.admin_set_business_agent(p_business uuid, p_code text) RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.admin_set_business_agent(p_business, p_code); $$;

CREATE OR REPLACE FUNCTION public.admin_set_agent_bonus_status(p_business uuid, p_status text) RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.admin_set_agent_bonus_status(p_business, p_status); $$;

DO $$
DECLARE
  sig text;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'claim_business_referral(uuid, text)',
    'field_agent_me()',
    'field_agent_businesses()',
    'field_agent_set_business_status(uuid, text, text)',
    'admin_set_field_agent(text, numeric, boolean)',
    'admin_set_business_agent(uuid, text)',
    'admin_set_agent_bonus_status(uuid, text)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION private.%s FROM PUBLIC, anon', sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon', sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION private.%s TO authenticated', sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', sig);
  END LOOP;
END;
$$;
