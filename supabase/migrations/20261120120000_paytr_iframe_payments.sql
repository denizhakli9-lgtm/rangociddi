/*
  # PayTR iFrame API: online deposit payments

  1. Flow
     - The `paytr-token` Edge Function (signed-in customer) calls `paytr_begin_order`, which checks the
       booking and records a PayTR order (merchant_oid) for the deposit, then asks PayTR for an iframe token.
     - The customer pays on PayTR's own page (card data never reaches Rango).
     - PayTR posts the result server-to-server to the `paytr-callback` Edge Function, which verifies the
       PayTR hash and calls `paytr_apply_callback`. Only this callback marks a deposit as paid.
  2. New
     - `platform_settings.paytr_test_mode`: while true, PayTR orders are sent with test_mode=1 (PayTR test
       cards, no real charge) and are stored with a `TEST-` provider id like the old test flow.
     - `private.paytr_orders`: one row per payment attempt; not reachable from the Data API.
  3. Safety
     - Both functions are callable only by service_role (the Edge Functions).
     - A callback is applied at most once per merchant_oid (row lock + status check).
     - A successful payment that can no longer confirm its booking (hold expired, booking cancelled,
       already paid by another attempt, amount lower than expected) is never lost: it is stored as
       `refund_pending` with a refund request for an admin.
  4. Switching on (done by an admin, not by this migration):
       UPDATE platform_settings SET payment_mode = 'live', payment_provider = 'paytr' WHERE id = 1;
     and after PayTR approves the store:
       UPDATE platform_settings SET paytr_test_mode = false WHERE id = 1;
*/

ALTER TABLE public.platform_settings ADD COLUMN IF NOT EXISTS paytr_test_mode boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS private.paytr_orders (
  merchant_oid text PRIMARY KEY CHECK (merchant_oid ~ '^[A-Za-z0-9]{8,64}$'),
  payment_id uuid NOT NULL REFERENCES public.payments(id),
  appointment_id uuid NOT NULL REFERENCES public.appointments(id),
  customer_id uuid NOT NULL REFERENCES public.profiles(id),
  amount_kurus integer NOT NULL CHECK (amount_kurus > 0),
  test_mode boolean NOT NULL,
  status text NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'success', 'failed')),
  result text,
  callback_amount_kurus integer,
  failed_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS paytr_orders_appointment_idx ON private.paytr_orders(appointment_id);
ALTER TABLE private.paytr_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.paytr_orders FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Start a PayTR order for a pending deposit. Called by the paytr-token Edge Function
-- with the caller's verified user id.
-- ---------------------------------------------------------------------------
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
BEGIN
  SELECT * INTO v_settings FROM platform_settings WHERE id = 1;
  IF v_settings.payment_mode <> 'live' OR v_settings.payment_provider <> 'paytr' THEN
    RAISE EXCEPTION 'VEYRA_PROVIDER_REQUIRED';
  END IF;
  IF p_user IS NULL OR p_oid IS NULL OR p_oid !~ '^[A-Za-z0-9]{8,64}$' THEN RAISE EXCEPTION 'VEYRA_INVALID_INPUT'; END IF;

  SELECT * INTO v_profile FROM profiles WHERE id = p_user AND NOT is_suspended AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEYRA_FORBIDDEN'; END IF;

  SELECT * INTO v_appt FROM appointments WHERE id = p_appointment AND customer_id = p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;
  IF v_appt.status <> 'pending_payment' THEN RAISE EXCEPTION 'VEYRA_INVALID_STATE'; END IF;

  v_left := floor(extract(epoch FROM (v_appt.created_at + make_interval(mins => v_settings.pending_payment_minutes) - now())))::integer;
  IF v_left <= 0 THEN RAISE EXCEPTION 'VEYRA_PAYMENT_EXPIRED'; END IF;
  -- Leave enough time for card entry and 3D Secure before the hold is released.
  IF v_left < 120 THEN RAISE EXCEPTION 'VEYRA_PAYMENT_TOO_LATE'; END IF;

  SELECT * INTO v_payment FROM payments
  WHERE appointment_id = v_appt.id AND status = 'pending' AND amount > 0
  ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEYRA_INVALID_STATE'; END IF;

  IF (SELECT count(*) FROM paytr_orders WHERE appointment_id = v_appt.id) >= 10 THEN RAISE EXCEPTION 'VEYRA_LIMIT'; END IF;

  SELECT * INTO v_business FROM businesses WHERE id = v_appt.business_id;
  IF v_business.owner_id IS NULL THEN RAISE EXCEPTION 'VEYRA_BOOKING_CLOSED'; END IF;

  v_amount := round(v_payment.amount * 100)::integer;
  INSERT INTO paytr_orders (merchant_oid, payment_id, appointment_id, customer_id, amount_kurus, test_mode)
  VALUES (p_oid, v_payment.id, v_appt.id, p_user, v_amount, v_settings.paytr_test_mode);

  RETURN jsonb_build_object(
    'amount_kurus', v_amount,
    'test_mode', v_settings.paytr_test_mode,
    'seconds_left', v_left,
    'full_name', coalesce(v_profile.full_name, ''),
    'email', coalesce(v_profile.email, ''),
    'phone', coalesce(v_profile.phone, ''),
    'address', concat_ws(', ', nullif(v_profile.district, ''), nullif(v_profile.city, '')),
    'item', left(v_business.name || ' - ' || v_appt.service_name || ' (kapora)', 200)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Apply a PayTR notification whose hash the paytr-callback Edge Function has verified.
-- Returns a short result code for logging; never raises for a known order, so PayTR gets "OK".
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.paytr_apply_callback(p_oid text, p_success boolean, p_amount_kurus integer, p_reason text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v_order paytr_orders%ROWTYPE;
  v_appt appointments%ROWTYPE;
  v_payment payments%ROWTYPE;
  v_business businesses%ROWTYPE;
  v_provider_id text;
  v_new_status text;
  v_refund_payment uuid;
  v_amount numeric(10,2);
  v_when text;
BEGIN
  SELECT * INTO v_order FROM paytr_orders WHERE merchant_oid = p_oid FOR UPDATE;
  IF NOT FOUND THEN RETURN 'unknown_order'; END IF;
  IF v_order.status <> 'started' THEN RETURN 'duplicate'; END IF;

  IF NOT coalesce(p_success, false) THEN
    UPDATE paytr_orders SET status = 'failed', result = 'failed', failed_reason = left(coalesce(p_reason, ''), 300), completed_at = now()
    WHERE merchant_oid = p_oid;
    RETURN 'failed';
  END IF;

  v_provider_id := CASE WHEN v_order.test_mode THEN 'TEST-PAYTR-' ELSE 'PAYTR-' END || p_oid;
  SELECT * INTO v_appt FROM appointments WHERE id = v_order.appointment_id FOR UPDATE;
  SELECT * INTO v_payment FROM payments WHERE id = v_order.payment_id FOR UPDATE;
  SELECT * INTO v_business FROM businesses WHERE id = v_appt.business_id;
  v_when := to_char(v_appt.starts_at AT TIME ZONE 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI');

  -- Normal case: the hold is still ours, so the deposit confirms the booking.
  IF v_appt.status = 'pending_payment' AND v_payment.status = 'pending' AND coalesce(p_amount_kurus, 0) >= v_order.amount_kurus THEN
    v_new_status := CASE WHEN v_business.auto_confirm
                           AND (v_appt.starts_at AT TIME ZONE 'Europe/Istanbul')::date > (now() AT TIME ZONE 'Europe/Istanbul')::date
                         THEN 'confirmed' ELSE 'pending_approval' END;

    UPDATE payments SET status = 'paid', paid_at = now(), provider = 'paytr', provider_payment_id = v_provider_id
    WHERE id = v_payment.id;
    UPDATE appointments SET status = v_new_status WHERE id = v_appt.id;
    UPDATE businesses SET booking_count = booking_count + 1 WHERE id = v_business.id;
    UPDATE paytr_orders SET status = 'success', result = 'paid', callback_amount_kurus = p_amount_kurus, completed_at = now()
    WHERE merchant_oid = p_oid;

    IF v_order.test_mode THEN
      PERFORM notify(v_appt.customer_id, 'payment_confirmed', 'Test ödemesi kaydedildi',
        to_char(v_payment.amount, 'FM999G999D00') || ' ₺ kapora PayTR test modunda kaydedildi. Kartınızdan herhangi bir tahsilat yapılmadı.',
        '/randevularim');
    ELSE
      PERFORM notify(v_appt.customer_id, 'payment_confirmed', 'Kapora ödemesi alındı',
        to_char(v_payment.amount, 'FM999G999D00') || ' ₺ kapora ödemeniz alındı.', '/randevularim');
    END IF;
    PERFORM notify(v_appt.customer_id, 'appointment_confirmed',
      CASE WHEN v_new_status = 'confirmed' THEN 'Randevunuz onaylandı' ELSE 'Randevunuz işletme onayı bekliyor' END,
      v_business.name || ' - ' || v_appt.service_name || ', ' || v_when, '/randevularim');
    PERFORM notify(v_business.owner_id, 'new_booking',
      CASE WHEN v_new_status = 'confirmed' THEN 'Yeni randevu' ELSE 'Onay bekleyen yeni randevu' END,
      v_appt.service_name || ' - ' || v_appt.employee_name || ', ' || v_when, '/isletme/randevular');
    RETURN 'paid';
  END IF;

  -- Money was taken but the booking cannot be confirmed (hold expired or cancelled, a second payment for
  -- the same booking, or a lower amount): keep the payment on record and queue a refund for an admin.
  v_amount := round(coalesce(p_amount_kurus, v_order.amount_kurus) / 100.0, 2);
  IF v_payment.status IN ('pending', 'cancelled', 'failed') THEN
    UPDATE payments SET status = 'refund_pending', paid_at = now(), provider = 'paytr', provider_payment_id = v_provider_id, amount = v_amount
    WHERE id = v_payment.id;
    v_refund_payment := v_payment.id;
  ELSE
    INSERT INTO payments (appointment_id, customer_id, business_id, amount, status, provider, provider_payment_id, paid_at)
    VALUES (v_appt.id, v_appt.customer_id, v_appt.business_id, v_amount, 'refund_pending', 'paytr', v_provider_id, now())
    RETURNING id INTO v_refund_payment;
  END IF;

  INSERT INTO refund_requests (appointment_id, payment_id, customer_id, business_id, amount, reason)
  VALUES (v_appt.id, v_refund_payment, v_appt.customer_id, v_appt.business_id, v_amount,
    'Otomatik: ödeme alındı ancak randevu onaylanamadı (' ||
    CASE WHEN v_appt.status <> 'pending_payment' THEN 'randevu durumu: ' || v_appt.status
         WHEN v_payment.status <> 'pending' THEN 'kapora zaten ödenmiş'
         ELSE 'tutar eksik' END || '). PayTR sipariş no: ' || p_oid);

  UPDATE paytr_orders SET status = 'success', result = 'refund_queued', callback_amount_kurus = p_amount_kurus, completed_at = now()
  WHERE merchant_oid = p_oid;

  PERFORM notify(v_appt.customer_id, 'refund', 'Ödemeniz iade edilecek',
    CASE WHEN v_order.test_mode
      THEN 'PayTR test ödemesi randevuya bağlanamadı. Test modunda kartınızdan tahsilat yapılmadı.'
      ELSE to_char(v_amount, 'FM999G999D00') || ' ₺ ödemeniz alındı ancak randevu süresi dolduğu için onaylanamadı. Tutar kartınıza iade edilecek.'
    END, '/randevularim');
  PERFORM notify(p.id, 'refund', 'İade bekleyen PayTR ödemesi',
    'PayTR sipariş ' || p_oid || ': ödeme alındı ancak randevu onaylanamadı. İade taleplerini kontrol edin.', '/yonetim/iadeler')
  FROM profiles p WHERE p.role = 'admin' AND NOT p.is_suspended;
  RETURN 'refund_queued';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.paytr_begin_order(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.paytr_apply_callback(text, boolean, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.paytr_begin_order(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.paytr_apply_callback(text, boolean, integer, text) TO service_role;
