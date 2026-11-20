/*
  # PayTR review fixes

  1. Overpayments: a second successful PayTR payment for an already paid booking is stored with
     payments.payment_type = 'overpayment', so screens and totals can tell it from the deposit, and an
     admin cannot reject its refund (the money is not the business's).
  2. paytr_apply_callback(…, p_test): PayTR's own test flag (notification / status query) can only turn a
     payment into a test payment, never the other way round. The customer and admin messages of a queued
     refund now give the real cause (second payment, hold expired, booking cancelled, lower amount).
     The old 4-argument signature stays as a thin wrapper.
  3. paytr_begin_order: a new PayTR order is refused for 20 seconds after the previous one (double clicks),
     and the attempt cap has its own error code (VEYRA_PAYMENT_ATTEMPTS).
  4. release_pending_hold: the payment page's "release the held time" button and the cancel dialog of an
     unpaid hold only cancel a booking that is still unpaid, so a payment confirmed a moment earlier can
     never be cancelled (and its deposit forfeited) by that button.
  5. admin_resolve_refund: a refund that is being sent to, or was accepted by, PayTR cannot be rejected.
  6. release_expired_holds: locks the expired holds first and skips rows another transaction holds (a PayTR
     notification being applied), removing a lock-order deadlock with paytr_apply_callback.
  7. admin_stats: test payments (provider id TEST-…) are no longer counted as collected or refunded money.
  8. paytr_attempt_status: the customer's payment page can show the result of its latest PayTR attempt.
*/

-- ---------------------------------------------------------------------------
-- 1. Overpayment rows
-- ---------------------------------------------------------------------------
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_payment_type_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_payment_type_check CHECK (payment_type IN ('deposit', 'overpayment'));

-- ---------------------------------------------------------------------------
-- 2. Applying a PayTR result
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.paytr_apply_callback(p_oid text, p_success boolean, p_amount_kurus integer, p_reason text, p_test boolean)
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
  v_test boolean;
  v_provider_id text;
  v_new_status text;
  v_refund_payment uuid;
  v_amount numeric(10,2);
  v_when text;
  v_duplicate boolean;
  v_cause text;
  v_customer_text text;
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

  -- PayTR's own test flag can only downgrade a payment to a test payment.
  v_test := v_order.test_mode OR coalesce(p_test, false);
  v_provider_id := CASE WHEN v_test THEN 'TEST-PAYTR-' ELSE 'PAYTR-' END || p_oid;
  SELECT * INTO v_appt FROM appointments WHERE id = v_order.appointment_id FOR UPDATE;
  SELECT * INTO v_payment FROM payments WHERE id = v_order.payment_id FOR UPDATE;
  SELECT * INTO v_business FROM businesses WHERE id = v_appt.business_id;
  v_when := to_char(v_appt.starts_at AT TIME ZONE 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI');

  IF coalesce(p_test, false) AND NOT v_order.test_mode THEN
    PERFORM notify(p.id, 'payment_confirmed', 'PayTR test işlemi bildirdi',
      'PayTR sipariş ' || p_oid || ' canlı modda açıldı ancak PayTR bunu test işlemi olarak bildirdi; ödeme test olarak kaydedildi. PayTR mağazanız canlı moda alınmış mı kontrol edin.',
      '/yonetim/ayarlar')
    FROM profiles p WHERE p.role = 'admin' AND NOT p.is_suspended;
  END IF;

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
      failed_reason = CASE WHEN p_reason = 'durum-sorgu' THEN 'durum-sorgu ile doğrulandı' ELSE NULL END, completed_at = now()
    WHERE merchant_oid = p_oid;

    IF v_test THEN
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

  -- Money was taken but cannot confirm the booking: keep it on record and queue a refund for an admin.
  v_amount := round(coalesce(p_amount_kurus, v_order.amount_kurus) / 100.0, 2);
  v_duplicate := v_appt.status IN ('pending_approval', 'confirmed', 'completed', 'no_show')
              OR v_payment.status IN ('paid', 'refund_pending', 'refunded');
  IF v_payment.status IN ('pending', 'cancelled', 'failed') AND NOT v_duplicate THEN
    UPDATE payments SET status = 'refund_pending', paid_at = now(), provider = 'paytr', provider_payment_id = v_provider_id, amount = v_amount
    WHERE id = v_payment.id;
    v_refund_payment := v_payment.id;
  ELSE
    INSERT INTO payments (appointment_id, customer_id, business_id, amount, payment_type, status, provider, provider_payment_id, paid_at)
    VALUES (v_appt.id, v_appt.customer_id, v_appt.business_id, v_amount, 'overpayment', 'refund_pending', 'paytr', v_provider_id, now())
    RETURNING id INTO v_refund_payment;
  END IF;

  IF v_duplicate THEN
    v_cause := 'aynı randevu için ikinci ödeme (fazla ödeme)';
    v_customer_text := 'Randevunuz geçerlidir. Aynı randevu için ikinci kez ödeme alındı; fazladan ödenen '
      || to_char(v_amount, 'FM999G999D00') || ' ₺ kartınıza iade edilecek.';
  ELSIF v_appt.status = 'cancelled' AND v_appt.cancelled_by = 'system' THEN
    v_cause := 'ödeme süresi dolduktan sonra ödeme alındı';
    v_customer_text := to_char(v_amount, 'FM999G999D00') || ' ₺ ödemeniz alındı ancak randevu için ayrılan süre dolduğundan randevu onaylanamadı. Tutar kartınıza iade edilecek.';
  ELSIF v_appt.status IN ('cancelled', 'rejected') THEN
    v_cause := 'randevu iptal edildikten sonra ödeme alındı';
    v_customer_text := to_char(v_amount, 'FM999G999D00') || ' ₺ ödemeniz, randevu iptal edildikten sonra alındı. Tutar kartınıza iade edilecek.';
  ELSE
    v_cause := 'ödeme tutarı kapora tutarından düşük';
    v_customer_text := to_char(v_amount, 'FM999G999D00') || ' ₺ ödemeniz kapora tutarıyla eşleşmediği için randevu onaylanamadı. Tutar kartınıza iade edilecek.';
  END IF;

  INSERT INTO refund_requests (appointment_id, payment_id, customer_id, business_id, amount, reason)
  VALUES (v_appt.id, v_refund_payment, v_appt.customer_id, v_appt.business_id, v_amount,
    'Otomatik: ' || v_cause || '. PayTR sipariş no: ' || p_oid);

  UPDATE paytr_orders SET status = 'success', result = 'refund_queued', callback_amount_kurus = p_amount_kurus, completed_at = now()
  WHERE merchant_oid = p_oid;

  PERFORM notify(v_appt.customer_id, 'refund', CASE WHEN v_duplicate THEN 'Fazla ödemeniz iade edilecek' ELSE 'Ödemeniz iade edilecek' END,
    CASE WHEN v_test THEN 'PayTR test ödemesi randevuya bağlanamadı (' || v_cause || '). Test modunda kartınızdan tahsilat yapılmadı.'
         ELSE v_customer_text END,
    '/randevularim');
  PERFORM notify(p.id, 'refund', 'İade bekleyen PayTR ödemesi',
    'PayTR sipariş ' || p_oid || ': ' || v_cause || '. İade taleplerini kontrol edin.', '/yonetim/iadeler')
  FROM profiles p WHERE p.role = 'admin' AND NOT p.is_suspended;
  RETURN 'refund_queued';
END;
$$;

-- The previous signature, used by deployed functions until they pass p_test.
CREATE OR REPLACE FUNCTION public.paytr_apply_callback(p_oid text, p_success boolean, p_amount_kurus integer, p_reason text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = private, public
AS $$ SELECT public.paytr_apply_callback(p_oid, p_success, p_amount_kurus, p_reason, false); $$;

-- ---------------------------------------------------------------------------
-- 3. Starting a PayTR order
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

-- ---------------------------------------------------------------------------
-- 4. Releasing an unpaid hold (payment page / cancel dialog of an unpaid booking)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.release_pending_hold(p_appointment uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_status text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'VEYRA_AUTH_REQUIRED'; END IF;
  -- The row lock is held until the end of the transaction, so a PayTR result applied concurrently either
  -- happens first (and this raises) or after (and is then refunded automatically as a late payment).
  SELECT status INTO v_status FROM appointments WHERE id = p_appointment AND customer_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;
  IF v_status IN ('pending_approval', 'confirmed') THEN RAISE EXCEPTION 'VEYRA_ALREADY_PAID'; END IF;
  IF v_status <> 'pending_payment' THEN RAISE EXCEPTION 'VEYRA_INVALID_STATE'; END IF;
  RETURN private.cancel_appointment(p_appointment, '');
END;
$$;

CREATE OR REPLACE FUNCTION public.release_pending_hold(p_appointment uuid)
RETURNS text
LANGUAGE sql
SET search_path TO ''
AS $$ SELECT private.release_pending_hold(p_appointment); $$;

-- ---------------------------------------------------------------------------
-- 5. Refund decisions
-- ---------------------------------------------------------------------------
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
  v_paytr_status text;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'VEYRA_FORBIDDEN'; END IF;
  IF p_approve IS NULL THEN RAISE EXCEPTION 'VEYRA_INVALID_INPUT'; END IF;

  SELECT * INTO v_r FROM refund_requests WHERE id = p_request FOR UPDATE;
  IF NOT FOUND OR v_r.status <> 'pending' THEN RAISE EXCEPTION 'VEYRA_INVALID_STATE'; END IF;
  SELECT * INTO v_p FROM payments WHERE id = v_r.payment_id FOR UPDATE;
  SELECT status INTO v_paytr_status FROM paytr_refunds WHERE refund_request_id = p_request FOR UPDATE;
  v_test := v_p.provider_payment_id IS NULL OR v_p.provider_payment_id LIKE 'TEST-%';

  IF p_approve THEN
    -- A real PayTR payment is only marked refunded after PayTR accepted the refund (paytr-refund).
    IF v_p.provider_payment_id LIKE 'PAYTR-%' AND v_paytr_status IS DISTINCT FROM 'sent' THEN
      RAISE EXCEPTION 'VEYRA_REFUND_PROVIDER';
    END IF;
  ELSE
    -- A refund being sent to, or already accepted by, PayTR cannot be rejected.
    IF v_paytr_status = 'sending' THEN RAISE EXCEPTION 'VEYRA_REFUND_IN_PROGRESS'; END IF;
    IF v_paytr_status = 'sent' THEN RAISE EXCEPTION 'VEYRA_REFUND_ALREADY_SENT'; END IF;
    -- An overpayment is not the business's money: it is always refunded.
    IF v_p.payment_type = 'overpayment' THEN RAISE EXCEPTION 'VEYRA_INVALID_STATE'; END IF;
  END IF;

  UPDATE refund_requests SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
    admin_note = left(nullif(trim(coalesce(p_note, '')), ''), 500), resolved_by = auth.uid(), resolved_at = now()
  WHERE id = p_request
  RETURNING * INTO v_r;

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
-- 6. Expired holds: lock the holds first, skip the ones another transaction is working on
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_expired_holds(p_employee uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_minutes int;
  v_ids uuid[];
  v_appt appointments%ROWTYPE;
BEGIN
  SELECT pending_payment_minutes INTO v_minutes FROM platform_settings WHERE id = 1;

  SELECT array_agg(s.id) INTO v_ids FROM (
    SELECT a.id FROM appointments a
    WHERE a.status = 'pending_payment' AND a.created_at <= now() - make_interval(mins => v_minutes)
      AND (p_employee IS NULL OR a.employee_id = p_employee)
    FOR UPDATE SKIP LOCKED
  ) s;
  IF v_ids IS NOT NULL THEN
    UPDATE payments p SET status = 'cancelled'
    WHERE p.appointment_id = ANY (v_ids) AND p.status = 'pending';
    UPDATE appointments a SET status = 'cancelled', cancelled_by = 'system', cancelled_at = now(),
      cancellation_reason = 'Ödeme süresi doldu'
    WHERE a.id = ANY (v_ids);
  END IF;

  -- BL-08: requests the business never answered expire at their start time (platform-wide,
  -- bounded per call, rows locked by another transaction are skipped).
  FOR v_appt IN
    SELECT * FROM appointments a
    WHERE a.status = 'pending_approval' AND a.starts_at <= now()
    ORDER BY a.starts_at
    LIMIT 200
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM private.expire_stale_approval(v_appt);
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Admin overview totals without test payments
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.admin_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'private', 'public'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'VEYRA_FORBIDDEN'; END IF;
  SELECT jsonb_build_object(
    'customers', (SELECT count(*) FROM profiles WHERE role = 'customer'),
    'business_owners', (SELECT count(*) FROM profiles WHERE role = 'business'),
    'businesses', (SELECT count(*) FROM businesses),
    'businesses_pending', (SELECT count(*) FROM businesses WHERE status = 'pending'),
    'appointments', (SELECT count(*) FROM appointments WHERE status <> 'pending_payment'),
    'appointments_completed', (SELECT count(*) FROM appointments WHERE status = 'completed'),
    'appointments_upcoming', (SELECT count(*) FROM appointments WHERE status IN ('confirmed','pending_approval') AND starts_at > now()),
    'deposits_collected', (SELECT coalesce(sum(amount), 0) FROM payments
                           WHERE status IN ('paid','refund_pending') AND coalesce(provider_payment_id, '') NOT LIKE 'TEST-%'),
    'refunded_total', (SELECT coalesce(sum(refunded_amount), 0) FROM payments
                       WHERE status = 'refunded' AND coalesce(provider_payment_id, '') NOT LIKE 'TEST-%'),
    'test_deposits', (SELECT coalesce(sum(amount), 0) FROM payments
                      WHERE status IN ('paid','refund_pending','refunded') AND provider_payment_id LIKE 'TEST-%'),
    'commission_total', (SELECT coalesce(sum(commission_amount), 0) FROM commission_records),
    'commission_pending', (SELECT coalesce(sum(commission_amount), 0) FROM commission_records WHERE status <> 'paid'),
    'gross_volume', (SELECT coalesce(sum(total_amount), 0) FROM commission_records),
    'refunds_pending', (SELECT count(*) FROM refund_requests WHERE status = 'pending'),
    'monthly', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('month', to_char(m.month, 'YYYY-MM'), 'appointments', m.appts, 'commission', m.comm) ORDER BY m.month), '[]'::jsonb)
      FROM (
        SELECT gs.month,
          (SELECT count(*) FROM appointments a WHERE date_trunc('month', a.starts_at) = gs.month AND a.status IN ('confirmed','completed','pending_approval')) AS appts,
          (SELECT coalesce(sum(c.commission_amount), 0) FROM commission_records c WHERE date_trunc('month', c.created_at) = gs.month) AS comm
        FROM generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') AS gs(month)
      ) m
    )
  ) INTO v_result;
  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Latest PayTR attempt of the caller's own booking
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.paytr_attempt_status(p_appointment uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v_order paytr_orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'VEYRA_AUTH_REQUIRED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM appointments WHERE id = p_appointment AND customer_id = auth.uid()) THEN
    RAISE EXCEPTION 'VEYRA_NOT_FOUND';
  END IF;
  SELECT * INTO v_order FROM paytr_orders WHERE appointment_id = p_appointment ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('status', v_order.status, 'reason', v_order.failed_reason, 'created_at', v_order.created_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.paytr_attempt_status(p_appointment uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$ SELECT private.paytr_attempt_status(p_appointment); $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.paytr_apply_callback(text, boolean, integer, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.paytr_apply_callback(text, boolean, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.paytr_begin_order(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.paytr_apply_callback(text, boolean, integer, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.paytr_apply_callback(text, boolean, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.paytr_begin_order(uuid, uuid, text) TO service_role;

REVOKE EXECUTE ON FUNCTION private.release_pending_hold(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.release_pending_hold(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.release_pending_hold(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_pending_hold(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION private.paytr_attempt_status(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.paytr_attempt_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.paytr_attempt_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.paytr_attempt_status(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.release_expired_holds(uuid) FROM PUBLIC, anon, authenticated;
