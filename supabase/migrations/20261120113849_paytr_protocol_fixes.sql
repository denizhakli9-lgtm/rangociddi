/*
  # PayTR protocol review fixes

  1. A payment PayTR processed as a test transaction for an order sent as live (the PayTR store is not live yet
     although "PayTR canlı" was chosen) no longer confirms the booking: the attempt is recorded as failed, the
     customer's hold stays, and admins are told. Nothing is booked without a real deposit.
  2. Notification health: each order records whether PayTR's notification arrived (notified_at) and how it was
     confirmed (confirmed_via). The pg_cron job rango-paytr-notification-health warns admins when a payment was
     confirmed only by the status query and PayTR's notification has not arrived for 15 minutes. Without that
     notification PayTR keeps the payment "Devam Ediyor", does not pay it out and refuses refunds (error 007).
  3. paytr_begin_order: at least 4 minutes of the hold must be left, so PayTR's page stays open for at least
     3 minutes (card entry and 3-D Secure).
*/

ALTER TABLE private.paytr_orders ADD COLUMN IF NOT EXISTS notified_at timestamptz;
ALTER TABLE private.paytr_orders ADD COLUMN IF NOT EXISTS confirmed_via text CHECK (confirmed_via IN ('bildirim', 'durum-sorgu'));
ALTER TABLE private.paytr_orders ADD COLUMN IF NOT EXISTS notification_alert_sent boolean NOT NULL DEFAULT false;

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
  -- Notification health: remember that PayTR's own notification arrived (also for repeats).
  IF coalesce(p_reason, '') <> 'durum-sorgu' THEN
    UPDATE paytr_orders SET notified_at = coalesce(notified_at, now()) WHERE merchant_oid = p_oid;
  END IF;
  IF v_order.status = 'success' OR v_order.result = 'test_in_live' THEN RETURN 'duplicate'; END IF;

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

  -- An order sent as live that PayTR processed as a test transaction (the PayTR store is not live yet):
  -- no real money, so the booking is not confirmed; the attempt fails and admins are told.
  IF coalesce(p_test, false) AND NOT v_order.test_mode THEN
    UPDATE paytr_orders SET status = 'failed', result = 'test_in_live', completed_at = now(),
      failed_reason = 'Ödeme alınamadı: ödeme altyapısı henüz canlı modda değil. Lütfen daha sonra tekrar deneyin.'
    WHERE merchant_oid = p_oid;
    PERFORM notify(p.id, 'payment_alert', 'PayTR mağazası canlı modda değil',
      'PayTR sipariş ' || p_oid || ' canlı ödeme olarak açıldı ancak PayTR bunu test işlemi olarak işledi; randevu onaylanmadı. PayTR mağazanız canlıya alınana kadar Ayarlar → Ödeme altyapısı → PayTR test modunu kullanın.',
      '/yonetim/ayarlar')
    FROM profiles p WHERE p.role = 'admin' AND NOT p.is_suspended;
    RETURN 'test_in_live';
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
    UPDATE paytr_orders SET status = 'success', result = 'paid', callback_amount_kurus = p_amount_kurus, failed_reason = NULL,
      confirmed_via = CASE WHEN p_reason = 'durum-sorgu' THEN 'durum-sorgu' ELSE 'bildirim' END, completed_at = now()
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

  UPDATE paytr_orders SET status = 'success', result = 'refund_queued', callback_amount_kurus = p_amount_kurus,
    confirmed_via = CASE WHEN p_reason = 'durum-sorgu' THEN 'durum-sorgu' ELSE 'bildirim' END, completed_at = now()
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
  -- Leave enough time for card entry and 3D Secure: PayTR's page then stays open for at least 3 minutes.
  IF v_left < 240 THEN RAISE EXCEPTION 'VEYRA_PAYMENT_TOO_LATE'; END IF;

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

CREATE OR REPLACE FUNCTION private.paytr_notification_health()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v_count integer := 0;
  v_oid text;
BEGIN
  FOR v_oid IN
    SELECT o.merchant_oid FROM paytr_orders o
    WHERE o.status = 'success' AND o.notified_at IS NULL AND NOT o.notification_alert_sent
      AND o.completed_at < now() - interval '15 minutes'
    ORDER BY o.completed_at
    LIMIT 50
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE paytr_orders SET notification_alert_sent = true WHERE merchant_oid = v_oid;
    v_count := v_count + 1;
  END LOOP;

  IF v_count > 0 THEN
    PERFORM notify(p.id, 'payment_alert', 'PayTR bildirimi ulaşmıyor',
      v_count || ' PayTR ödemesi yalnızca durum sorgusuyla onaylandı; PayTR''nin bildirimi 15 dakikadır gelmedi. '
      || 'PayTR panelinde Destek & Kurulum → Ayarlar → Bildirim URL''yi kontrol edin ve İşlemler → Mağaza Bildirimleri bölümünden '
      || 'duran bildirimleri yeniden başlatın. Bildirim tamamlanmadan PayTR bu ödemeleri hesabınıza aktarmaz ve iadeleri reddeder.',
      '/yonetim/ayarlar')
    FROM profiles p WHERE p.role = 'admin' AND NOT p.is_suspended;
  END IF;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.paytr_apply_callback(text, boolean, integer, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.paytr_begin_order(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.paytr_notification_health() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.paytr_apply_callback(text, boolean, integer, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.paytr_begin_order(uuid, uuid, text) TO service_role;

SELECT cron.schedule('rango-paytr-notification-health', '*/10 * * * *', $cron$SELECT private.paytr_notification_health()$cron$);
