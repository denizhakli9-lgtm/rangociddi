/*
  # Fixes from the pre-release review of field agents and appointment messages

  1. Agents whose account is gone or suspended
     - Deleting an account (profiles.deleted_at set) now also deactivates its field-agent record,
       so the agent's code stops working.
     - A referral code is accepted only when the agent's account is active (not suspended, not
       deleted), and the approval trigger writes no bonus for a suspended or deleted agent.
  2. Admin decisions stay with admins
     - An owner can attach a referral code only while the business is still `pending`, so a code
       claimed after an admin rejected the business gives the agent no power over it.
     - An agent can re-approve a `rejected` business only when that agent rejected it and nobody
       changed its status since (`business_referrals.agent_rejected_at`, cleared by a trigger on any
       other status change). `field_agent_businesses` returns `rejected_by_me` for the panel.
  3. Bonus follows the agent an admin assigns
     - `admin_set_business_agent` moves a still-pending bonus to the new agent (at the new agent's
       amount), removes it when the agent is cleared, and creates one when an agent is assigned to an
       already approved business that has none. Paid or cancelled bonuses are left as they are.
  4. Message notifications
     - A new message is announced unless the sender already has an UNREAD message in that
       conversation from the last 10 minutes. Before, any own message in the last 10 minutes
       suppressed it, so a follow-up after the other side had read and replied went unannounced.
*/

ALTER TABLE public.business_referrals ADD COLUMN IF NOT EXISTS agent_rejected_at timestamptz;

-- ---------------------------------------------------------------------------
-- 1. Deleted / suspended agents
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.deactivate_field_agent_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
BEGIN
  UPDATE field_agents SET is_active = false, updated_at = now() WHERE user_id = NEW.id AND is_active;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION private.deactivate_field_agent_on_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_deactivate_field_agent ON public.profiles;
CREATE TRIGGER profiles_deactivate_field_agent
  AFTER UPDATE OF deleted_at ON public.profiles
  FOR EACH ROW
  WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
  EXECUTE FUNCTION private.deactivate_field_agent_on_delete();

-- Accounts already deleted before this migration.
UPDATE public.field_agents a SET is_active = false, updated_at = now()
FROM public.profiles p
WHERE p.id = a.user_id AND p.deleted_at IS NOT NULL AND a.is_active;

CREATE OR REPLACE FUNCTION private.field_agent_bonus_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
BEGIN
  INSERT INTO field_agent_bonuses (business_id, agent_id, amount, approved_by)
  SELECT NEW.id, r.agent_id, a.bonus_amount, auth.uid()
  FROM business_referrals r
  JOIN field_agents a ON a.user_id = r.agent_id
  JOIN profiles p ON p.id = r.agent_id
  WHERE r.business_id = NEW.id AND NOT p.is_suspended AND p.deleted_at IS NULL
  ON CONFLICT (business_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Any status change not made by the referring agent ends that agent's right to reopen a rejection.
CREATE OR REPLACE FUNCTION private.clear_agent_rejection_on_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
BEGIN
  UPDATE business_referrals SET agent_rejected_at = NULL
  WHERE business_id = NEW.id AND agent_rejected_at IS NOT NULL
    AND agent_id IS DISTINCT FROM auth.uid();
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION private.clear_agent_rejection_on_status() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS businesses_clear_agent_rejection ON public.businesses;
CREATE TRIGGER businesses_clear_agent_rejection
  AFTER UPDATE OF status ON public.businesses
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION private.clear_agent_rejection_on_status();

-- ---------------------------------------------------------------------------
-- 2. Referral claim and agent decisions
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
  -- Only while the application is still open: a code must not reopen an admin's decision.
  IF v_business.status <> 'pending' OR v_business.created_at < now() - interval '30 days' THEN
    RAISE EXCEPTION 'VEYRA_INVALID_STATE';
  END IF;

  SELECT a.* INTO v_agent FROM field_agents a JOIN profiles p ON p.id = a.user_id
  WHERE a.code = v_code AND a.is_active AND NOT p.is_suspended AND p.deleted_at IS NULL;
  -- An agent cannot refer their own business.
  IF NOT FOUND OR v_agent.user_id = v_uid THEN RAISE EXCEPTION 'VEYRA_INVALID_CODE'; END IF;

  INSERT INTO business_referrals (business_id, agent_id, set_by) VALUES (p_business, v_agent.user_id, 'owner');
  PERFORM notify(v_agent.user_id, 'field_referral', 'Yeni işletme kaydı',
    v_business.name || ' (' || v_business.district || ') referans kodunuzla kaydoldu.', '/saha/isletmeler');
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
  v_ref business_referrals%ROWTYPE;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  IF NOT private.is_field_agent() THEN RAISE EXCEPTION 'VEYRA_FORBIDDEN'; END IF;
  IF p_status NOT IN ('approved', 'rejected') OR char_length(coalesce(v_reason, '')) > 500 THEN
    RAISE EXCEPTION 'VEYRA_INVALID_INPUT';
  END IF;
  SELECT * INTO v_ref FROM business_referrals WHERE business_id = p_business AND agent_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;
  SELECT * INTO v_b FROM businesses WHERE id = p_business FOR UPDATE;
  IF v_b.owner_id IS NULL OR v_b.owner_id = auth.uid() THEN RAISE EXCEPTION 'VEYRA_FORBIDDEN'; END IF;
  -- Pending applications only; a rejection can be reopened only by the agent who made it.
  IF NOT (v_b.status = 'pending'
          OR (v_b.status = 'rejected' AND p_status = 'approved' AND v_ref.agent_rejected_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'VEYRA_INVALID_STATE';
  END IF;

  UPDATE businesses SET status = p_status WHERE id = v_b.id;
  UPDATE business_referrals SET agent_rejected_at = CASE WHEN p_status = 'rejected' THEN now() END
  WHERE business_id = v_b.id;
  PERFORM notify(v_b.owner_id, 'business_status',
    CASE p_status WHEN 'approved' THEN 'İşletmeniz onaylandı' ELSE 'İşletme başvurunuz reddedildi' END,
    CASE p_status WHEN 'approved' THEN v_b.name || ' artık Rango''da yayında ve randevu alabilir.'
                  ELSE coalesce('Neden: ' || v_reason || '. ', '') || 'Bilgilerinizi güncelleyip tekrar başvurabilir veya destek ekibimizle iletişime geçebilirsiniz.' END,
    '/isletme');
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
             (b.status = 'rejected' AND r.agent_rejected_at IS NOT NULL) AS rejected_by_me,
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

-- ---------------------------------------------------------------------------
-- 3. Admin reassignment keeps the bonus with the assigned agent
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.admin_set_business_agent(p_business uuid, p_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_agent field_agents%ROWTYPE;
  v_status text;
BEGIN
  IF NOT private.is_admin() THEN RAISE EXCEPTION 'VEYRA_FORBIDDEN'; END IF;
  SELECT status INTO v_status FROM businesses WHERE id = p_business FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;

  IF v_code = '' THEN
    DELETE FROM business_referrals WHERE business_id = p_business;
    DELETE FROM field_agent_bonuses WHERE business_id = p_business AND status = 'pending';
    RETURN;
  END IF;

  SELECT * INTO v_agent FROM field_agents WHERE code = v_code;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEYRA_INVALID_CODE'; END IF;
  INSERT INTO business_referrals (business_id, agent_id, set_by) VALUES (p_business, v_agent.user_id, 'admin')
  ON CONFLICT (business_id) DO UPDATE
    SET agent_id = EXCLUDED.agent_id, set_by = 'admin', created_at = now(), agent_rejected_at = NULL;

  -- A bonus not yet paid follows the agent; an approved business without one gets it now.
  UPDATE field_agent_bonuses SET agent_id = v_agent.user_id, amount = v_agent.bonus_amount
  WHERE business_id = p_business AND status = 'pending' AND agent_id <> v_agent.user_id;
  IF v_status = 'approved' THEN
    INSERT INTO field_agent_bonuses (business_id, agent_id, amount, approved_by)
    VALUES (p_business, v_agent.user_id, v_agent.bonus_amount, NULL)
    ON CONFLICT (business_id) DO NOTHING;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Message notification throttle
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.send_appointment_message(p_appointment uuid, p_body text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_appt appointments%ROWTYPE;
  v_business businesses%ROWTYPE;
  v_role text;
  v_id uuid;
  v_recent boolean;
  v_when text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'VEYRA_AUTH_REQUIRED'; END IF;
  PERFORM private.assert_active_member();
  IF char_length(v_body) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'VEYRA_INVALID_INPUT'; END IF;

  SELECT * INTO v_appt FROM appointments WHERE id = p_appointment FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;
  SELECT * INTO v_business FROM businesses WHERE id = v_appt.business_id;

  IF v_appt.customer_id = v_uid THEN v_role := 'customer';
  ELSIF v_business.owner_id = v_uid THEN v_role := 'business';
  ELSE RAISE EXCEPTION 'VEYRA_NOT_FOUND';
  END IF;

  -- Open once the deposit is settled, and for a week after the visit.
  IF NOT (v_appt.status IN ('pending_approval', 'confirmed')
          OR (v_appt.status IN ('completed', 'no_show') AND v_appt.ends_at > now() - interval '7 days')) THEN
    RAISE EXCEPTION 'VEYRA_CHAT_CLOSED';
  END IF;

  IF (SELECT count(*) FROM appointment_messages
      WHERE sender_id = v_uid AND created_at > now() - interval '1 minute') >= 20 THEN
    RAISE EXCEPTION 'VEYRA_MESSAGE_RATE';
  END IF;

  -- Announced unless the other side already has an unread message from this sender from the
  -- last 10 minutes (they were notified and have not looked yet).
  v_recent := EXISTS (SELECT 1 FROM appointment_messages
                      WHERE appointment_id = v_appt.id AND sender_id = v_uid AND read_at IS NULL
                        AND created_at > now() - interval '10 minutes');

  INSERT INTO appointment_messages (appointment_id, sender_id, sender_role, body)
  VALUES (v_appt.id, v_uid, v_role, v_body)
  RETURNING id INTO v_id;

  IF NOT v_recent THEN
    v_when := to_char(v_appt.starts_at AT TIME ZONE 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI');
    IF v_role = 'customer' THEN
      PERFORM notify(v_business.owner_id, 'appointment_message', 'Müşteriden yeni mesaj',
        v_appt.service_name || ', ' || v_when || ' randevusu için yeni bir mesajınız var.', '/isletme/randevular');
    ELSE
      PERFORM notify(v_appt.customer_id, 'appointment_message', 'İşletmeden yeni mesaj',
        v_business.name || ', ' || v_when || ' randevunuz için yeni bir mesajınız var.', '/randevularim');
    END IF;
  END IF;

  RETURN v_id;
END;
$$;
