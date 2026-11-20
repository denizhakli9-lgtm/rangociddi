/*
  # PayTR security review fixes

  - paytr_begin_order refuses to start a PayTR payment when the customer's profile has no name or phone
    (VEYRA_PROFILE_INCOMPLETE) instead of sending invented contact details to PayTR. The check runs before an
    order is recorded, so it does not count as a payment attempt.
  Related Edge Function changes (same commit): paytr-callback accepts only status 'success' / 'failed' and
  trusts only the signed total_amount; paytr-token takes the customer IP only from cf-connecting-ip / x-real-ip.
*/

CREATE OR REPLACE FUNCTION public.paytr_begin_order(p_user uuid, p_appointment uuid, p_oid text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v_settings platform_settings%ROWTYPE;
  v_profile profiles%ROWTYPE;
  v_appt appointments%ROWTYPE;
  v_payment payments%ROWTYPE;
  v_business businesses%ROWTYPE;
  v_left integer;
  v_amount integer;
  v_platform_paytr boolean;
  v_test_mode boolean;
BEGIN
  SELECT * INTO v_settings FROM platform_settings WHERE id = 1;
  v_platform_paytr := v_settings.payment_mode = 'live' AND v_settings.payment_provider = 'paytr';
  IF NOT v_platform_paytr AND NOT EXISTS (SELECT 1 FROM paytr_testers WHERE user_id = p_user) THEN
    RAISE EXCEPTION 'VEYRA_PROVIDER_REQUIRED';
  END IF;
  -- Testers always pay in PayTR test mode unless the whole platform is on PayTR.
  v_test_mode := CASE WHEN v_platform_paytr THEN v_settings.paytr_test_mode ELSE true END;
  IF p_user IS NULL OR p_oid IS NULL OR p_oid !~ '^[A-Za-z0-9]{8,64}$' THEN RAISE EXCEPTION 'VEYRA_INVALID_INPUT'; END IF;

  SELECT * INTO v_profile FROM profiles WHERE id = p_user AND NOT is_suspended AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEYRA_FORBIDDEN'; END IF;
  -- PayTR needs the payer's real name and phone; nothing is invented (checked before an order is recorded).
  IF coalesce(trim(v_profile.full_name), '') = '' OR coalesce(trim(v_profile.phone), '') = '' THEN
    RAISE EXCEPTION 'VEYRA_PROFILE_INCOMPLETE';
  END IF;

  SELECT * INTO v_appt FROM appointments WHERE id = p_appointment AND customer_id = p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;
  IF v_appt.status IN ('pending_approval', 'confirmed') THEN RAISE EXCEPTION 'VEYRA_ALREADY_PAID'; END IF;
  IF v_appt.status <> 'pending_payment' THEN RAISE EXCEPTION 'VEYRA_INVALID_STATE'; END IF;

  v_left := floor(extract(epoch FROM (v_appt.created_at + make_interval(mins => v_settings.pending_payment_minutes) - now())))::integer;
  IF v_left <= 0 THEN RAISE EXCEPTION 'VEYRA_PAYMENT_EXPIRED'; END IF;
  -- Leave enough time for card entry and 3D Secure before the hold is released.
  IF v_left < 120 THEN RAISE EXCEPTION 'VEYRA_PAYMENT_TOO_LATE'; END IF;

  SELECT * INTO v_payment FROM payments
  WHERE appointment_id = v_appt.id AND status = 'pending' AND amount > 0 AND payment_type = 'deposit'
  ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEYRA_INVALID_STATE'; END IF;

  -- Double clicks / a page opened twice: one PayTR order at a time.
  IF EXISTS (SELECT 1 FROM paytr_orders WHERE appointment_id = v_appt.id AND status = 'started' AND created_at > now() - interval '20 seconds') THEN
    RAISE EXCEPTION 'VEYRA_PAYMENT_IN_PROGRESS';
  END IF;
  IF (SELECT count(*) FROM paytr_orders WHERE appointment_id = v_appt.id) >= 10 THEN RAISE EXCEPTION 'VEYRA_PAYMENT_ATTEMPTS'; END IF;

  SELECT * INTO v_business FROM businesses WHERE id = v_appt.business_id;
  IF v_business.owner_id IS NULL THEN RAISE EXCEPTION 'VEYRA_BOOKING_CLOSED'; END IF;

  v_amount := round(v_payment.amount * 100)::integer;
  -- PayTR accepts payments of at least 1 TL.
  IF v_amount < 100 THEN RAISE EXCEPTION 'VEYRA_PAYMENT_MIN_AMOUNT'; END IF;
  INSERT INTO paytr_orders (merchant_oid, payment_id, appointment_id, customer_id, amount_kurus, test_mode)
  VALUES (p_oid, v_payment.id, v_appt.id, p_user, v_amount, v_test_mode);

  RETURN jsonb_build_object(
    'amount_kurus', v_amount,
    'test_mode', v_test_mode,
    'seconds_left', v_left,
    'full_name', coalesce(v_profile.full_name, ''),
    'email', coalesce(v_profile.email, ''),
    'phone', coalesce(v_profile.phone, ''),
    'address', concat_ws(', ', nullif(v_profile.district, ''), nullif(v_profile.city, '')),
    'item', left(v_business.name || ' - ' || v_appt.service_name || ' (kapora)', 200)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.paytr_begin_order(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.paytr_begin_order(uuid, uuid, text) TO service_role;
