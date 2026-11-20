/*
  # PayTR: refunds through PayTR, status reconciliation, admin payment-mode switch

  1. Refunds (PayTR İade API, https://www.paytr.com/odeme/iade)
     - `private.paytr_refunds`: one row per refund request sent to PayTR (reference_no = request id), so a
       refund is never sent twice and an interrupted attempt can be checked with PayTR's status query.
     - `paytr_refund_begin` / `paytr_refund_finish` (service_role only) are used by the `paytr-refund`
       Edge Function, which an admin calls when approving a refund of a PayTR payment.
     - `admin_resolve_refund` now refuses to approve a refund of a real (non-test) PayTR payment unless
       PayTR has accepted the refund, so a customer is never told "sent to your card" when nothing was sent.
  2. Reconciliation (PayTR Durum Sorgu, https://www.paytr.com/odeme/durum-sorgu)
     - `paytr_orders_to_check` (service_role only) lists a customer's recent unfinished PayTR orders for one
       booking, at most once per 10 seconds per order; the `paytr-status` Edge Function asks PayTR about
       them and applies a successful payment exactly like the notification would. This keeps bookings
       correct even if a notification is delayed or the Bildirim URL is misconfigured.
     - `paytr_apply_callback`: a success for an order previously marked failed is still applied (money
       taken is never ignored); a late failure after a success stays a duplicate.
  3. Admin payment mode
     - `admin_set_payment_mode('test' | 'paytr_test' | 'paytr_live')` lets an admin switch modes from the
       admin settings page instead of SQL.
*/

-- ---------------------------------------------------------------------------
-- 1. Orders: reconciliation throttle
-- ---------------------------------------------------------------------------
ALTER TABLE private.paytr_orders ADD COLUMN IF NOT EXISTS last_checked_at timestamptz;

-- Start of a PayTR order (unchanged except: PayTR's 1 TL minimum is checked up front).
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
  -- PayTR accepts payments of at least 1 TL.
  IF v_amount < 100 THEN RAISE EXCEPTION 'VEYRA_PAYMENT_MIN_AMOUNT'; END IF;
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

-- A success for an order previously marked failed is still applied; a failure after a success is ignored.
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
  IF v_order.status = 'success' THEN RETURN 'duplicate'; END IF;

  IF NOT coalesce(p_success, false) THEN
    IF v_order.status = 'failed' THEN RETURN 'duplicate'; END IF;
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
    UPDATE paytr_orders SET status = 'success', result = 'paid', callback_amount_kurus = p_amount_kurus,
      failed_reason = CASE WHEN p_reason = 'durum-sorgu' THEN 'durum-sorgu ile doğrulandı' ELSE failed_reason END, completed_at = now()
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

-- Recent unfinished orders of one booking that the customer's app may ask PayTR about (throttled per order).
CREATE OR REPLACE FUNCTION public.paytr_orders_to_check(p_user uuid, p_appointment uuid)
RETURNS TABLE (merchant_oid text, amount_kurus integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT o.merchant_oid
    FROM paytr_orders o
    WHERE o.appointment_id = p_appointment
      AND o.customer_id = p_user
      AND o.status IN ('started', 'failed')
      AND o.created_at > now() - interval '3 hours'
      AND (o.last_checked_at IS NULL OR o.last_checked_at < now() - interval '10 seconds')
    ORDER BY o.created_at DESC
    LIMIT 3
    FOR UPDATE SKIP LOCKED
  )
  UPDATE paytr_orders o SET last_checked_at = now()
  FROM picked
  WHERE o.merchant_oid = picked.merchant_oid
  RETURNING o.merchant_oid, o.amount_kurus;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Refunds through PayTR
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS private.paytr_refunds (
  refund_request_id uuid PRIMARY KEY REFERENCES public.refund_requests(id),
  merchant_oid text NOT NULL,
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  reference_no text NOT NULL UNIQUE CHECK (reference_no ~ '^[A-Za-z0-9]{1,64}$'),
  test_mode boolean NOT NULL,
  status text NOT NULL DEFAULT 'sending' CHECK (status IN ('sending', 'sent', 'failed')),
  error text,
  requested_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS paytr_refunds_oid_idx ON private.paytr_refunds(merchant_oid);
ALTER TABLE private.paytr_refunds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.paytr_refunds FROM PUBLIC, anon, authenticated;

-- Claims a pending refund request of a PayTR payment for sending to PayTR. Returns what to send and the
-- previous attempt state so the caller can check PayTR first when an earlier attempt was interrupted.
CREATE OR REPLACE FUNCTION public.paytr_refund_begin(p_admin uuid, p_request uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v_request refund_requests%ROWTYPE;
  v_payment payments%ROWTYPE;
  v_row paytr_refunds%ROWTYPE;
  v_oid text;
  v_test boolean;
  v_previous text;
  v_already numeric(10,2);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_admin AND role = 'admin' AND NOT is_suspended AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'VEYRA_FORBIDDEN';
  END IF;

  SELECT * INTO v_request FROM refund_requests WHERE id = p_request FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;
  IF v_request.status <> 'pending' THEN RAISE EXCEPTION 'VEYRA_INVALID_STATE'; END IF;

  SELECT * INTO v_payment FROM payments WHERE id = v_request.payment_id FOR UPDATE;
  IF v_payment.provider_payment_id LIKE 'TEST-PAYTR-%' THEN
    v_oid := substr(v_payment.provider_payment_id, 12);
    v_test := true;
  ELSIF v_payment.provider_payment_id LIKE 'PAYTR-%' THEN
    v_oid := substr(v_payment.provider_payment_id, 7);
    v_test := false;
  ELSE
    RAISE EXCEPTION 'VEYRA_INVALID_STATE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM paytr_orders WHERE merchant_oid = v_oid AND status = 'success') THEN
    RAISE EXCEPTION 'VEYRA_INVALID_STATE';
  END IF;

  -- Never refund more than was paid for this order, counting refunds already accepted by PayTR.
  SELECT coalesce(sum(amount), 0) INTO v_already FROM paytr_refunds
  WHERE merchant_oid = v_oid AND status = 'sent' AND refund_request_id <> p_request;
  IF v_request.amount <= 0 OR v_request.amount + v_already > v_payment.amount THEN
    RAISE EXCEPTION 'VEYRA_INVALID_INPUT';
  END IF;

  SELECT * INTO v_row FROM paytr_refunds WHERE refund_request_id = p_request FOR UPDATE;
  IF NOT FOUND THEN
    v_previous := 'none';
    INSERT INTO paytr_refunds (refund_request_id, merchant_oid, amount, reference_no, test_mode, requested_by)
    VALUES (p_request, v_oid, v_request.amount, 'RF' || replace(p_request::text, '-', ''), v_test, p_admin)
    RETURNING * INTO v_row;
  ELSE
    v_previous := v_row.status;
    -- Another admin is sending this refund right now.
    IF v_row.status = 'sending' AND v_row.updated_at > now() - interval '2 minutes' THEN
      RAISE EXCEPTION 'VEYRA_REFUND_IN_PROGRESS';
    END IF;
    IF v_row.status <> 'sent' THEN
      UPDATE paytr_refunds SET status = 'sending', error = NULL, requested_by = p_admin, updated_at = now()
      WHERE refund_request_id = p_request
      RETURNING * INTO v_row;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'merchant_oid', v_row.merchant_oid,
    'return_amount', to_char(v_row.amount, 'FM9999999990.00'),
    'reference_no', v_row.reference_no,
    'status', v_row.status,
    'previous_status', v_previous,
    'test_mode', v_row.test_mode
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.paytr_refund_finish(p_request uuid, p_sent boolean, p_error text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
BEGIN
  UPDATE paytr_refunds
  SET status = CASE WHEN p_sent THEN 'sent' ELSE 'failed' END,
      error = CASE WHEN p_sent THEN NULL ELSE left(coalesce(p_error, ''), 500) END,
      updated_at = now()
  WHERE refund_request_id = p_request AND status <> 'sent';
END;
$$;

-- admin_resolve_refund: a real PayTR payment can only be marked refunded after PayTR accepted the refund.
CREATE OR REPLACE FUNCTION private.admin_resolve_refund(p_request uuid, p_approve boolean, p_note text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v_r refund_requests%ROWTYPE;
  v_p payments%ROWTYPE;
  v_test boolean;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'VEYRA_FORBIDDEN'; END IF;
  IF p_approve IS NULL THEN RAISE EXCEPTION 'VEYRA_INVALID_INPUT'; END IF;
  UPDATE refund_requests SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
    admin_note = left(nullif(trim(coalesce(p_note, '')), ''), 500), resolved_by = auth.uid(), resolved_at = now()
  WHERE id = p_request AND status = 'pending'
  RETURNING * INTO v_r;
  IF v_r.id IS NULL THEN RAISE EXCEPTION 'VEYRA_INVALID_STATE'; END IF;

  SELECT * INTO v_p FROM payments WHERE id = v_r.payment_id FOR UPDATE;
  v_test := v_p.provider_payment_id IS NULL OR v_p.provider_payment_id LIKE 'TEST-%';

  IF p_approve AND v_p.provider_payment_id LIKE 'PAYTR-%'
     AND NOT EXISTS (SELECT 1 FROM paytr_refunds WHERE refund_request_id = v_r.id AND status = 'sent') THEN
    RAISE EXCEPTION 'VEYRA_REFUND_PROVIDER';
  END IF;

  IF p_approve THEN
    UPDATE payments SET status = 'refunded', refunded_amount = v_r.amount, refunded_at = now() WHERE id = v_r.payment_id;
    IF v_test THEN
      PERFORM notify(v_r.customer_id, 'refund', 'İade talebiniz onaylandı',
        to_char(v_r.amount, 'FM999G999D00') || ' ₺ kapora test modunda alındığı için kartınızdan herhangi bir tahsilat yapılmamıştı. İade kaydınız kapatıldı.',
        '/randevularim');
    ELSE
      PERFORM notify(v_r.customer_id, 'refund', 'Kapora iadeniz onaylandı',
        to_char(v_r.amount, 'FM999G999D00') || ' ₺ iadeniz kartınıza gönderildi. Bankanıza bağlı olarak hesabınıza yansıması birkaç gün sürebilir.',
        '/randevularim');
    END IF;
  ELSE
    UPDATE payments SET status = 'paid' WHERE id = v_r.payment_id AND status = 'refund_pending';
    PERFORM notify(v_r.customer_id, 'refund', 'İade talebiniz sonuçlandı',
      'İade talebiniz onaylanmadı.' || coalesce(' Not: ' || v_r.admin_note, ''), '/randevularim');
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Admin payment-mode switch
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.admin_set_payment_mode(p_mode text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'VEYRA_FORBIDDEN'; END IF;
  IF p_mode = 'test' THEN
    UPDATE platform_settings SET payment_mode = 'test', updated_at = now() WHERE id = 1;
  ELSIF p_mode = 'paytr_test' THEN
    UPDATE platform_settings SET payment_mode = 'live', payment_provider = 'paytr', paytr_test_mode = true, updated_at = now() WHERE id = 1;
  ELSIF p_mode = 'paytr_live' THEN
    UPDATE platform_settings SET payment_mode = 'live', payment_provider = 'paytr', paytr_test_mode = false, updated_at = now() WHERE id = 1;
  ELSE
    RAISE EXCEPTION 'VEYRA_INVALID_INPUT';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_payment_mode(p_mode text)
RETURNS void
LANGUAGE sql
SET search_path TO ''
AS $$ SELECT private.admin_set_payment_mode(p_mode); $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.paytr_begin_order(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.paytr_apply_callback(text, boolean, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.paytr_orders_to_check(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.paytr_refund_begin(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.paytr_refund_finish(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.paytr_begin_order(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.paytr_apply_callback(text, boolean, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.paytr_orders_to_check(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.paytr_refund_begin(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.paytr_refund_finish(uuid, boolean, text) TO service_role;

REVOKE EXECUTE ON FUNCTION private.admin_set_payment_mode(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_payment_mode(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.admin_set_payment_mode(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_payment_mode(text) TO authenticated;
