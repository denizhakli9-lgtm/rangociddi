/*
# VEYRA booking engine

1. `get_available_slots(service, employee, date, exclude_appointment)` - returns free start times
   (Europe/Istanbul) for one employee or for every employee who performs the service when employee is null.
   Removes past times, lead time, breaks, closed days, blocked time ranges and existing bookings.
2. `create_appointment` - validates the slot, computes price and deposit on the server from the
   business settings, creates the appointment (pending payment) and a pending deposit payment.
3. `pay_deposit` - TEST MODE payment confirmation. Only works while platform payment_mode = 'test';
   in live mode the payment provider callback (server side) confirms payments. Stores only last 4 digits.
4. `cancel_appointment`, `reschedule_appointment` - apply the business cancellation policy.
5. `business_update_appointment` - approve / reject / complete / no_show by the owner (or admin).
   Completing creates a commission record using the platform commission rate.
6. `submit_review`, `reply_review`, `generate_my_reminders`.

Security: every function derives the actor from auth.uid(), uses a fixed search_path,
and is not executable by anonymous users except the read-only slot lookup.
Errors are raised as short codes (VEYRA_*) the app translates to Turkish messages.
*/

CREATE OR REPLACE FUNCTION get_available_slots(p_service uuid, p_employee uuid, p_date date, p_exclude uuid DEFAULT NULL)
RETURNS TABLE (slot_start timestamptz, slot_employee_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_business uuid;
  v_duration int;
  v_settings platform_settings%ROWTYPE;
  v_wh working_hours%ROWTYPE;
  v_today date := (now() AT TIME ZONE 'Europe/Istanbul')::date;
  v_open int; v_close int; v_bs int; v_be int; v_t int;
  v_start timestamptz; v_end timestamptz;
  v_emp record;
BEGIN
  SELECT s.business_id, s.duration_minutes INTO v_business, v_duration
  FROM services s JOIN businesses b ON b.id = s.business_id
  WHERE s.id = p_service AND s.is_active AND b.status = 'approved';
  IF v_business IS NULL THEN RETURN; END IF;

  SELECT * INTO v_settings FROM platform_settings WHERE id = 1;
  IF p_date < v_today OR p_date > v_today + v_settings.max_booking_days THEN RETURN; END IF;

  SELECT * INTO v_wh FROM working_hours w WHERE w.business_id = v_business AND w.weekday = extract(isodow FROM p_date)::int;
  IF NOT FOUND OR v_wh.is_closed THEN RETURN; END IF;

  v_open := (extract(epoch FROM v_wh.open_time) / 60)::int;
  v_close := (extract(epoch FROM v_wh.close_time) / 60)::int;
  v_bs := CASE WHEN v_wh.break_start IS NULL OR v_wh.break_end IS NULL THEN NULL ELSE (extract(epoch FROM v_wh.break_start) / 60)::int END;
  v_be := CASE WHEN v_bs IS NULL THEN NULL ELSE (extract(epoch FROM v_wh.break_end) / 60)::int END;

  FOR v_emp IN
    SELECT e.id FROM employees e
    WHERE e.business_id = v_business AND e.is_active
      AND (p_employee IS NULL OR e.id = p_employee)
      AND EXISTS (SELECT 1 FROM employee_services es WHERE es.employee_id = e.id AND es.service_id = p_service)
    ORDER BY e.sort_order, e.full_name
  LOOP
    v_t := v_open;
    WHILE v_t + v_duration <= v_close LOOP
      v_start := (p_date::timestamp + make_interval(mins => v_t)) AT TIME ZONE 'Europe/Istanbul';
      v_end := v_start + make_interval(mins => v_duration);
      IF v_start >= now() + make_interval(mins => v_settings.min_lead_minutes)
        AND (v_bs IS NULL OR NOT (v_t < v_be AND v_t + v_duration > v_bs))
        AND NOT EXISTS (
          SELECT 1 FROM appointments a
          WHERE a.employee_id = v_emp.id
            AND (p_exclude IS NULL OR a.id <> p_exclude)
            AND a.status IN ('pending_approval','confirmed','pending_payment')
            AND (a.status <> 'pending_payment' OR a.created_at > now() - make_interval(mins => v_settings.pending_payment_minutes))
            AND tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(v_start, v_end, '[)')
        )
        AND NOT EXISTS (
          SELECT 1 FROM time_slots ts
          WHERE ts.business_id = v_business
            AND (ts.employee_id IS NULL OR ts.employee_id = v_emp.id)
            AND tstzrange(ts.starts_at, ts.ends_at, '[)') && tstzrange(v_start, v_end, '[)')
        )
      THEN
        slot_start := v_start;
        slot_employee_id := v_emp.id;
        RETURN NEXT;
      END IF;
      v_t := v_t + v_settings.slot_interval_minutes;
    END LOOP;
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION get_available_slots(uuid, uuid, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_available_slots(uuid, uuid, date, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION release_expired_holds(p_employee uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_minutes int;
BEGIN
  SELECT pending_payment_minutes INTO v_minutes FROM platform_settings WHERE id = 1;
  UPDATE payments p SET status = 'cancelled'
  FROM appointments a
  WHERE p.appointment_id = a.id AND p.status = 'pending'
    AND a.status = 'pending_payment' AND a.created_at <= now() - make_interval(mins => v_minutes)
    AND (p_employee IS NULL OR a.employee_id = p_employee);
  UPDATE appointments a SET status = 'cancelled', cancelled_by = 'system', cancelled_at = now(),
    cancellation_reason = 'Ödeme süresi doldu'
  WHERE a.status = 'pending_payment' AND a.created_at <= now() - make_interval(mins => v_minutes)
    AND (p_employee IS NULL OR a.employee_id = p_employee);
END;
$$;
REVOKE EXECUTE ON FUNCTION release_expired_holds(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION create_appointment(p_service uuid, p_employee uuid, p_starts_at timestamptz, p_note text DEFAULT '')
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_service services%ROWTYPE;
  v_business businesses%ROWTYPE;
  v_employee employees%ROWTYPE;
  v_deposit numeric(10,2);
  v_id uuid;
  v_status text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'VEYRA_AUTH_REQUIRED'; END IF;
  IF NOT has_role('customer') THEN RAISE EXCEPTION 'VEYRA_CUSTOMER_ONLY'; END IF;
  IF char_length(coalesce(p_note, '')) > 500 THEN RAISE EXCEPTION 'VEYRA_INVALID_INPUT'; END IF;

  SELECT * INTO v_service FROM services WHERE id = p_service AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;
  SELECT * INTO v_business FROM businesses WHERE id = v_service.business_id AND status = 'approved';
  IF NOT FOUND THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;
  SELECT * INTO v_employee FROM employees WHERE id = p_employee AND business_id = v_business.id AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;

  PERFORM release_expired_holds(p_employee);

  IF NOT EXISTS (
    SELECT 1 FROM get_available_slots(p_service, p_employee, (p_starts_at AT TIME ZONE 'Europe/Istanbul')::date, NULL) g
    WHERE g.slot_start = p_starts_at AND g.slot_employee_id = p_employee
  ) THEN
    RAISE EXCEPTION 'VEYRA_SLOT_TAKEN';
  END IF;

  IF v_business.deposit_type = 'percentage' THEN
    v_deposit := round(v_service.price * v_business.deposit_value / 100, 2);
  ELSE
    v_deposit := least(v_business.deposit_value, v_service.price);
  END IF;

  v_status := CASE WHEN v_deposit > 0 THEN 'pending_payment'
                   WHEN v_business.auto_confirm THEN 'confirmed' ELSE 'pending_approval' END;

  BEGIN
    INSERT INTO appointments (customer_id, business_id, service_id, employee_id, starts_at, ends_at, status,
      service_name, employee_name, duration_minutes, total_price, deposit_amount, remaining_amount, customer_note)
    VALUES (v_uid, v_business.id, v_service.id, v_employee.id, p_starts_at,
      p_starts_at + make_interval(mins => v_service.duration_minutes), v_status,
      v_service.name, v_employee.full_name, v_service.duration_minutes, v_service.price, v_deposit,
      v_service.price - v_deposit, coalesce(p_note, ''))
    RETURNING id INTO v_id;
  EXCEPTION WHEN exclusion_violation THEN
    RAISE EXCEPTION 'VEYRA_SLOT_TAKEN';
  END;

  INSERT INTO payments (appointment_id, customer_id, business_id, amount, status, provider, paid_at)
  VALUES (v_id, v_uid, v_business.id, v_deposit,
    CASE WHEN v_deposit > 0 THEN 'pending' ELSE 'paid' END,
    (SELECT payment_provider FROM platform_settings WHERE id = 1),
    CASE WHEN v_deposit > 0 THEN NULL ELSE now() END);

  IF v_status <> 'pending_payment' THEN
    UPDATE businesses SET booking_count = booking_count + 1 WHERE id = v_business.id;
    PERFORM notify(v_uid, 'appointment_confirmed',
      CASE WHEN v_status = 'confirmed' THEN 'Randevunuz onaylandı' ELSE 'Randevu talebiniz alındı' END,
      v_business.name || ' - ' || v_service.name || ', ' || to_char(p_starts_at AT TIME ZONE 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI'),
      '/randevularim');
    PERFORM notify(v_business.owner_id, 'new_booking', 'Yeni randevu',
      v_service.name || ', ' || to_char(p_starts_at AT TIME ZONE 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI'), '/isletme/randevular');
  END IF;

  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION create_appointment(uuid, uuid, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_appointment(uuid, uuid, timestamptz, text) TO authenticated;

CREATE OR REPLACE FUNCTION pay_deposit(p_appointment uuid, p_card_last4 text, p_card_brand text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_settings platform_settings%ROWTYPE;
  v_appt appointments%ROWTYPE;
  v_business businesses%ROWTYPE;
  v_new_status text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'VEYRA_AUTH_REQUIRED'; END IF;
  SELECT * INTO v_settings FROM platform_settings WHERE id = 1;
  IF v_settings.payment_mode <> 'test' THEN RAISE EXCEPTION 'VEYRA_PROVIDER_REQUIRED'; END IF;
  IF p_card_last4 IS NULL OR p_card_last4 !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'VEYRA_INVALID_INPUT'; END IF;

  SELECT * INTO v_appt FROM appointments WHERE id = p_appointment AND customer_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;
  IF v_appt.status <> 'pending_payment' THEN RAISE EXCEPTION 'VEYRA_INVALID_STATE'; END IF;
  IF v_appt.created_at <= now() - make_interval(mins => v_settings.pending_payment_minutes) THEN
    PERFORM release_expired_holds(v_appt.employee_id);
    RAISE EXCEPTION 'VEYRA_PAYMENT_EXPIRED';
  END IF;

  SELECT * INTO v_business FROM businesses WHERE id = v_appt.business_id;
  v_new_status := CASE WHEN v_business.auto_confirm THEN 'confirmed' ELSE 'pending_approval' END;

  UPDATE payments SET status = 'paid', paid_at = now(), card_last4 = p_card_last4,
    card_brand = left(coalesce(p_card_brand, ''), 20),
    provider_payment_id = 'TEST-' || upper(substr(md5(random()::text), 1, 10))
  WHERE appointment_id = v_appt.id AND status = 'pending';

  UPDATE appointments SET status = v_new_status WHERE id = v_appt.id;
  UPDATE businesses SET booking_count = booking_count + 1 WHERE id = v_business.id;

  PERFORM notify(v_uid, 'payment_confirmed', 'Kapora ödemesi alındı',
    to_char(v_appt.deposit_amount, 'FM999G999D00') || ' ₺ kapora ödemeniz başarıyla alındı.', '/randevularim');
  PERFORM notify(v_uid, 'appointment_confirmed',
    CASE WHEN v_new_status = 'confirmed' THEN 'Randevunuz onaylandı' ELSE 'Randevunuz işletme onayı bekliyor' END,
    v_business.name || ' - ' || v_appt.service_name || ', ' || to_char(v_appt.starts_at AT TIME ZONE 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI'),
    '/randevularim');
  PERFORM notify(v_business.owner_id, 'new_booking',
    CASE WHEN v_new_status = 'confirmed' THEN 'Yeni randevu' ELSE 'Onay bekleyen yeni randevu' END,
    v_appt.service_name || ' - ' || v_appt.employee_name || ', ' || to_char(v_appt.starts_at AT TIME ZONE 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI'),
    '/isletme/randevular');
  RETURN v_new_status;
END;
$$;
REVOKE EXECUTE ON FUNCTION pay_deposit(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION pay_deposit(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION open_refund(p_appt appointments, p_reason text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_payment payments%ROWTYPE;
BEGIN
  SELECT * INTO v_payment FROM payments WHERE appointment_id = p_appt.id AND status = 'paid' AND amount > 0;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE payments SET status = 'refund_pending' WHERE id = v_payment.id;
  INSERT INTO refund_requests (appointment_id, payment_id, customer_id, business_id, amount, reason)
  VALUES (p_appt.id, v_payment.id, p_appt.customer_id, p_appt.business_id, v_payment.amount, coalesce(p_reason, ''));
  RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION open_refund(appointments, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION cancel_appointment(p_appointment uuid, p_reason text DEFAULT '')
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_appt appointments%ROWTYPE;
  v_business businesses%ROWTYPE;
  v_actor text;
  v_refund boolean := false;
  v_when text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'VEYRA_AUTH_REQUIRED'; END IF;
  IF char_length(coalesce(p_reason, '')) > 500 THEN RAISE EXCEPTION 'VEYRA_INVALID_INPUT'; END IF;
  SELECT * INTO v_appt FROM appointments WHERE id = p_appointment FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;
  SELECT * INTO v_business FROM businesses WHERE id = v_appt.business_id;

  IF v_appt.customer_id = v_uid THEN v_actor := 'customer';
  ELSIF v_business.owner_id = v_uid THEN v_actor := 'business';
  ELSIF is_admin() THEN v_actor := 'admin';
  ELSE RAISE EXCEPTION 'VEYRA_NOT_FOUND';
  END IF;

  IF v_appt.status NOT IN ('pending_payment','pending_approval','confirmed') THEN RAISE EXCEPTION 'VEYRA_INVALID_STATE'; END IF;
  IF v_appt.starts_at <= now() AND v_actor = 'customer' THEN RAISE EXCEPTION 'VEYRA_INVALID_STATE'; END IF;

  v_when := to_char(v_appt.starts_at AT TIME ZONE 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI');

  IF v_appt.status = 'pending_payment' THEN
    UPDATE payments SET status = 'cancelled' WHERE appointment_id = v_appt.id AND status = 'pending';
  ELSIF v_actor <> 'customer'
     OR v_appt.status = 'pending_approval'
     OR v_appt.starts_at - now() >= make_interval(hours => v_business.cancellation_hours) THEN
    v_refund := open_refund(v_appt, 'İptal: ' || coalesce(nullif(p_reason, ''), 'belirtilmedi'));
  END IF;

  UPDATE appointments SET status = 'cancelled', cancelled_by = v_actor, cancelled_at = now(),
    cancellation_reason = nullif(p_reason, '')
  WHERE id = v_appt.id;

  IF v_actor = 'customer' THEN
    PERFORM notify(v_business.owner_id, 'appointment_cancelled', 'Randevu iptal edildi',
      v_appt.service_name || ', ' || v_when || ' randevusu müşteri tarafından iptal edildi.', '/isletme/randevular');
    PERFORM notify(v_uid, 'appointment_cancelled', 'Randevunuz iptal edildi',
      CASE WHEN v_refund THEN 'Kapora iadeniz işleme alındı.'
           WHEN v_appt.status = 'pending_payment' THEN v_business.name || ' randevunuz iptal edildi.'
           ELSE 'İptal politikası süresi geçtiği için kapora iade edilmeyecektir.' END,
      '/randevularim');
  ELSE
    PERFORM notify(v_appt.customer_id, 'appointment_cancelled', 'Randevunuz iptal edildi',
      v_business.name || ' - ' || v_appt.service_name || ', ' || v_when || ' randevunuz işletme tarafından iptal edildi.'
      || CASE WHEN v_refund THEN ' Kapora iadeniz işleme alındı.' ELSE '' END,
      '/randevularim');
  END IF;

  RETURN CASE WHEN v_refund THEN 'refund' ELSE 'no_refund' END;
END;
$$;
REVOKE EXECUTE ON FUNCTION cancel_appointment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cancel_appointment(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION reschedule_appointment(p_appointment uuid, p_employee uuid, p_starts_at timestamptz)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_appt appointments%ROWTYPE;
  v_business businesses%ROWTYPE;
  v_employee employees%ROWTYPE;
  v_max int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'VEYRA_AUTH_REQUIRED'; END IF;
  SELECT * INTO v_appt FROM appointments WHERE id = p_appointment AND customer_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;
  IF v_appt.status NOT IN ('pending_approval','confirmed') OR v_appt.service_id IS NULL THEN RAISE EXCEPTION 'VEYRA_INVALID_STATE'; END IF;
  SELECT * INTO v_business FROM businesses WHERE id = v_appt.business_id;
  SELECT max_reschedules INTO v_max FROM platform_settings WHERE id = 1;
  IF v_appt.reschedule_count >= v_max THEN RAISE EXCEPTION 'VEYRA_RESCHEDULE_LIMIT'; END IF;
  IF v_appt.starts_at - now() < make_interval(hours => v_business.cancellation_hours) THEN RAISE EXCEPTION 'VEYRA_POLICY_WINDOW'; END IF;

  SELECT * INTO v_employee FROM employees WHERE id = p_employee AND business_id = v_business.id AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;

  PERFORM release_expired_holds(p_employee);
  IF NOT EXISTS (
    SELECT 1 FROM get_available_slots(v_appt.service_id, p_employee, (p_starts_at AT TIME ZONE 'Europe/Istanbul')::date, v_appt.id) g
    WHERE g.slot_start = p_starts_at AND g.slot_employee_id = p_employee
  ) THEN
    RAISE EXCEPTION 'VEYRA_SLOT_TAKEN';
  END IF;

  BEGIN
    UPDATE appointments SET starts_at = p_starts_at,
      ends_at = p_starts_at + make_interval(mins => v_appt.duration_minutes),
      employee_id = v_employee.id, employee_name = v_employee.full_name,
      reschedule_count = reschedule_count + 1, reminder_sent = false
    WHERE id = v_appt.id;
  EXCEPTION WHEN exclusion_violation THEN
    RAISE EXCEPTION 'VEYRA_SLOT_TAKEN';
  END;

  PERFORM notify(v_uid, 'appointment_rescheduled', 'Randevunuz güncellendi',
    v_business.name || ' - yeni tarih: ' || to_char(p_starts_at AT TIME ZONE 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI'), '/randevularim');
  PERFORM notify(v_business.owner_id, 'appointment_rescheduled', 'Randevu ertelendi',
    v_appt.service_name || ': ' || to_char(v_appt.starts_at AT TIME ZONE 'Europe/Istanbul', 'DD.MM HH24:MI') || ' → '
    || to_char(p_starts_at AT TIME ZONE 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI'), '/isletme/randevular');
END;
$$;
REVOKE EXECUTE ON FUNCTION reschedule_appointment(uuid, uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION reschedule_appointment(uuid, uuid, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION business_update_appointment(p_appointment uuid, p_action text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_appt appointments%ROWTYPE;
  v_business businesses%ROWTYPE;
  v_rate numeric(5,2);
  v_when text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'VEYRA_AUTH_REQUIRED'; END IF;
  SELECT * INTO v_appt FROM appointments WHERE id = p_appointment FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;
  SELECT * INTO v_business FROM businesses WHERE id = v_appt.business_id;
  IF v_business.owner_id IS DISTINCT FROM v_uid AND NOT is_admin() THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;
  v_when := to_char(v_appt.starts_at AT TIME ZONE 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI');

  IF p_action = 'approve' THEN
    IF v_appt.status <> 'pending_approval' THEN RAISE EXCEPTION 'VEYRA_INVALID_STATE'; END IF;
    UPDATE appointments SET status = 'confirmed' WHERE id = v_appt.id;
    PERFORM notify(v_appt.customer_id, 'appointment_confirmed', 'Randevunuz onaylandı',
      v_business.name || ' - ' || v_appt.service_name || ', ' || v_when, '/randevularim');
  ELSIF p_action = 'reject' THEN
    IF v_appt.status <> 'pending_approval' THEN RAISE EXCEPTION 'VEYRA_INVALID_STATE'; END IF;
    UPDATE appointments SET status = 'rejected', cancelled_by = 'business', cancelled_at = now() WHERE id = v_appt.id;
    PERFORM open_refund(v_appt, 'İşletme randevuyu reddetti');
    PERFORM notify(v_appt.customer_id, 'appointment_cancelled', 'Randevu talebiniz reddedildi',
      v_business.name || ' ' || v_when || ' randevunuzu onaylayamadı. Kapora iadeniz işleme alındı.', '/randevularim');
  ELSIF p_action IN ('complete','no_show') THEN
    IF v_appt.status <> 'confirmed' THEN RAISE EXCEPTION 'VEYRA_INVALID_STATE'; END IF;
    IF v_appt.starts_at > now() THEN RAISE EXCEPTION 'VEYRA_TOO_EARLY'; END IF;
    IF p_action = 'complete' THEN
      UPDATE appointments SET status = 'completed' WHERE id = v_appt.id;
      SELECT commission_rate INTO v_rate FROM platform_settings WHERE id = 1;
      INSERT INTO commission_records (appointment_id, business_id, total_amount, commission_rate, commission_amount)
      VALUES (v_appt.id, v_appt.business_id, v_appt.total_price, v_rate, round(v_appt.total_price * v_rate / 100, 2))
      ON CONFLICT (appointment_id) DO NOTHING;
      PERFORM notify(v_appt.customer_id, 'review_request', 'Deneyiminizi değerlendirin',
        v_business.name || ' ziyaretiniz nasıldı? Yorumunuzu paylaşın.', '/randevularim');
    ELSE
      UPDATE appointments SET status = 'no_show' WHERE id = v_appt.id;
    END IF;
  ELSE
    RAISE EXCEPTION 'VEYRA_INVALID_INPUT';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION business_update_appointment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION business_update_appointment(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION submit_review(p_appointment uuid, p_rating int, p_comment text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_appt appointments%ROWTYPE;
  v_name text;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'VEYRA_AUTH_REQUIRED'; END IF;
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 OR char_length(coalesce(p_comment, '')) > 1000 THEN
    RAISE EXCEPTION 'VEYRA_INVALID_INPUT';
  END IF;
  SELECT * INTO v_appt FROM appointments WHERE id = p_appointment AND customer_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;
  IF v_appt.status <> 'completed' THEN RAISE EXCEPTION 'VEYRA_INVALID_STATE'; END IF;
  IF EXISTS (SELECT 1 FROM reviews WHERE appointment_id = v_appt.id) THEN RAISE EXCEPTION 'VEYRA_ALREADY_REVIEWED'; END IF;

  SELECT full_name INTO v_name FROM profiles WHERE id = v_uid;
  v_name := CASE WHEN coalesce(v_name, '') = '' THEN 'VEYRA Üyesi'
    ELSE split_part(v_name, ' ', 1) || CASE WHEN split_part(v_name, ' ', 2) <> '' THEN ' ' || left(split_part(v_name, ' ', 2), 1) || '.' ELSE '' END END;

  INSERT INTO reviews (appointment_id, business_id, customer_id, employee_id, rating, comment, reviewer_name, service_name)
  VALUES (v_appt.id, v_appt.business_id, v_uid, v_appt.employee_id, p_rating, coalesce(p_comment, ''), v_name, v_appt.service_name)
  RETURNING id INTO v_id;

  PERFORM notify((SELECT owner_id FROM businesses WHERE id = v_appt.business_id), 'new_review', 'Yeni değerlendirme',
    p_rating || ' yıldız - ' || v_appt.service_name, '/isletme/yorumlar');
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION submit_review(uuid, int, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION submit_review(uuid, int, text) TO authenticated;

CREATE OR REPLACE FUNCTION reply_review(p_review uuid, p_reply text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'VEYRA_AUTH_REQUIRED'; END IF;
  IF char_length(coalesce(p_reply, '')) > 1000 THEN RAISE EXCEPTION 'VEYRA_INVALID_INPUT'; END IF;
  UPDATE reviews r SET owner_reply = nullif(trim(p_reply), '')
  WHERE r.id = p_review AND EXISTS (SELECT 1 FROM businesses b WHERE b.id = r.business_id AND b.owner_id = auth.uid());
  IF NOT FOUND THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION reply_review(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION reply_review(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION generate_my_reminders()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row record;
  v_count int := 0;
BEGIN
  IF v_uid IS NULL THEN RETURN 0; END IF;
  FOR v_row IN
    UPDATE appointments a SET reminder_sent = true
    WHERE a.customer_id = v_uid AND a.status = 'confirmed' AND NOT a.reminder_sent
      AND a.starts_at > now() AND a.starts_at <= now() + interval '24 hours'
    RETURNING a.id, a.service_name, a.starts_at, a.business_id
  LOOP
    PERFORM notify(v_uid, 'appointment_reminder', 'Randevu hatırlatması',
      (SELECT name FROM businesses WHERE id = v_row.business_id) || ' - ' || v_row.service_name || ', '
      || to_char(v_row.starts_at AT TIME ZONE 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI'), '/randevularim');
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION generate_my_reminders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION generate_my_reminders() TO authenticated;
