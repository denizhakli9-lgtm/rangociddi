/*
# Rango security and booking-logic hardening (audit 2026-11-14)

HOW TO RUN (English)
  0. Before running, check that an administrator exists:
       SELECT p.id, u.email FROM public.profiles p JOIN auth.users u ON u.id = p.id WHERE p.role = 'admin';
     If no row is returned, sign in as the owner and claim admin at /yonetim/kurulum first,
     or run this file again afterwards so the bootstrap RPC (claim_first_admin) is closed.
  1. Paste the WHOLE file into the Supabase SQL editor and run it once. It is wrapped in
     BEGIN ... COMMIT, so it applies completely or not at all. It is idempotent: running it
     again is safe (CREATE OR REPLACE, IF NOT EXISTS, DROP ... IF EXISTS, guarded data fixes).
     Run it AFTER every earlier migration. No function signature changes and no new overloads
     of existing RPCs, so the frontend that is already deployed keeps working before and after.
  2. If a NOTICE says pg_cron is not available / could not be enabled, enable pg_cron under
     Database > Extensions in the Supabase dashboard and run the whole file again.
  3. Verify the scheduled jobs (expected: rango-expire-stale-bookings and rango-retention):
       SELECT jobname, schedule FROM cron.job;
  4. Test public.delete_my_account() once with a throwaway CUSTOMER account (sign up, then
     delete the account from the app). Never test it with a real or an admin account.

NASIL ÇALIŞTIRILIR (Türkçe)
  0. Çalıştırmadan önce bir yönetici hesabı olduğunu kontrol edin:
       SELECT p.id, u.email FROM public.profiles p JOIN auth.users u ON u.id = p.id WHERE p.role = 'admin';
     Hiç satır dönmezse önce sahip hesabıyla giriş yapıp /yonetim/kurulum sayfasından yönetici
     yetkisini alın ya da bu dosyayı sonrasında bir kez daha çalıştırın; böylece ilk kurulum
     RPC'si (claim_first_admin) kalıcı olarak kapanır.
  1. Dosyanın TAMAMINI Supabase SQL editörüne yapıştırıp bir kez çalıştırın. Dosya
     BEGIN ... COMMIT içindedir: ya tamamen uygulanır ya hiç uygulanmaz. Tekrar çalıştırmak
     güvenlidir. Önceki tüm migration'lardan SONRA çalıştırın. Fonksiyon imzaları değişmez,
     yayındaki ön yüz uygulama öncesinde ve sonrasında çalışmaya devam eder.
  2. Bir NOTICE mesajı pg_cron'un kullanılamadığını / etkinleştirilemediğini söylerse
     Supabase panelinde Database > Extensions altından pg_cron'u etkinleştirin ve dosyanın
     tamamını yeniden çalıştırın.
  3. Zamanlanmış görevleri kontrol edin (beklenen: rango-expire-stale-bookings ve rango-retention):
       SELECT jobname, schedule FROM cron.job;
  4. public.delete_my_account() fonksiyonunu bir kez, yalnızca bu test için açılmış bir MÜŞTERİ
     hesabıyla deneyin (kayıt olun, ardından uygulamadan hesabı silin). Gerçek ya da yönetici
     hesabıyla denemeyin.

WHAT CHANGES
  1. Demo businesses (owner_id IS NULL, the 20 seeded İzmir pilot listings) stay visible but
     take no bookings: create / pay / reschedule raise VEYRA_BOOKING_CLOSED, slot lookup returns
     no free times, their active appointments are cancelled here (pending payments cancelled,
     paid deposits get a refund request), their invented phone / e-mail are removed and the
     "verified" badge is cleared. Payment holds that had already expired are closed silently
     ('Ödeme süresi doldu', cancelled_by 'system'), like release_expired_holds does.
  2. Same-day bookings (Europe/Istanbul calendar day) always need owner approval: on create,
     on (test) payment and when a booking is moved to today.
  3. pending_approval requests the owner never answered become 'rejected' (cancelled_by
     'system') at their start time and the deposit refund is opened. Runs lazily inside
     release_expired_holds (called by every booking flow) and, when pg_cron is available,
     every 5 minutes.
  4. Per-customer booking limits (advisory lock per customer): at most 2 live payment holds,
     6 future active bookings, 3 future active bookings at one business, 10 bookings created
     in 24 hours. Raises VEYRA_LIMIT.
  5. The cancellation window is snapshotted on each appointment (appointments.cancellation_hours);
     cancel / reschedule use the snapshot, so a later policy change by the owner is not retroactive.
     A customer cancel of an unanswered request is refunded only if the customer never moved
     it; a request created by moving a booking into today follows the normal window.
  6. Suspended (and anonymous-session) customers and owners are blocked inside the RPCs they use;
     owns_business() / has_role() ignore suspended accounts, so RLS write paths and the
     business-media storage policies stop working for suspended owners too.
  7. Support AI quota inside support_claim_ai (20 AI answers per user and 1500 overall per
     24 hours). Over quota, or for KVKK threads, the thread is handed to the human queue
     (status 'waiting') and the function returns false. Signature unchanged.
  8. KVKK erasure: new RPC public.delete_my_account() (customers only). The identity is
     anonymised immediately (deliberate owner choice, see section 8), and notify() no longer
     creates notifications for an erased account.
  9. claim_first_admin requires a confirmed, non-anonymous e-mail and is closed for good
     once an administrator exists.
 10. business-media bucket: anonymous visitors can no longer LIST objects (public image URLs
     keep working; owners keep SELECT on their own folder, which upload / remove need).
 11. business_customer_contacts only returns customers with a real booking (not abandoned
     payment holds or requests cancelled before the start) in the last 24 months; gender is
     no longer returned (NULL).
 12. Refund approval of a TEST payment no longer says the money was sent to the card;
     the (test-only) deposit payment no longer says money was taken.
 13. Support agents who are not admins only read conversations waiting for a human or
     assigned to them, and never KVKK conversations (subject starting with 'KVKK').
 14. Admin cancellations are announced as "Rango tarafından" and the business is notified.
 15. Longer booking codes for new appointments (VY + 10 hex characters).
 16. Retention (only when pg_cron is available): appointment notes / cancellation reasons are
     cleared 12 months after the appointment; closed and bot-only support conversations are
     deleted 2 years after their last activity (Aydınlatma Metni §7).

NEW ERROR CODES FOR THE FRONTEND (src/i18n/tr.ts errors)
  VEYRA_BOOKING_CLOSED, VEYRA_LIMIT, VEYRA_ACTIVE_APPOINTMENTS, VEYRA_OPEN_REFUND
*/

BEGIN;

-- ===========================================================================
-- 0. Schema additions (all idempotent)
-- ===========================================================================

-- BL-07 / DB-08: cancellation window agreed at booking time.
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS cancellation_hours integer;
UPDATE public.appointments a SET cancellation_hours = b.cancellation_hours
FROM public.businesses b
WHERE b.id = a.business_id AND a.cancellation_hours IS NULL;

-- G06: marks an account closed through delete_my_account.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- BL-18: 40-bit booking codes for new appointments (existing codes are kept).
ALTER TABLE public.appointments
  ALTER COLUMN booking_code SET DEFAULT ('VY' || upper(substr(md5(gen_random_uuid()::text), 1, 10)));

-- Partial indexes for the expiry sweeps and limit checks.
CREATE INDEX IF NOT EXISTS appointments_pending_approval_start_idx
  ON public.appointments (starts_at) WHERE status = 'pending_approval';
CREATE INDEX IF NOT EXISTS appointments_pending_payment_created_idx
  ON public.appointments (created_at) WHERE status = 'pending_payment';

-- SUPAI-8 / BL-10: per-author rate checks and the AI quota.
CREATE INDEX IF NOT EXISTS support_messages_author_recent
  ON public.support_messages (author_id, created_at DESC) WHERE author_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS support_messages_ai_recent
  ON public.support_messages (created_at) WHERE ai_requested;

-- ===========================================================================
-- 1. Membership helpers (BL-09 / DB-04)
-- ===========================================================================

-- True when the caller is signed in with a real (non-anonymous) account that is not suspended.
CREATE OR REPLACE FUNCTION private.is_active_member()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
     AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND NOT p.is_suspended);
$$;

CREATE OR REPLACE FUNCTION private.assert_active_member()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'VEYRA_AUTH_REQUIRED'; END IF;
  IF NOT private.is_active_member() THEN RAISE EXCEPTION 'VEYRA_FORBIDDEN'; END IF;
END;
$$;

-- Ownership ignores suspended owners and anonymous sessions. Used by RLS policies
-- (services, employees, hours, time slots, appointments, payments, payouts, storage ...).
CREATE OR REPLACE FUNCTION private.owns_business(p_business uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, public
AS $$
  SELECT coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
     AND EXISTS (
       SELECT 1
       FROM public.businesses b
       JOIN public.profiles p ON p.id = b.owner_id
       WHERE b.id = p_business
         AND b.owner_id = auth.uid()
         AND NOT p.is_suspended
     );
$$;

CREATE OR REPLACE FUNCTION private.has_role(p_role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, public
AS $$
  SELECT coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
     AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = p_role AND NOT is_suspended);
$$;

REVOKE EXECUTE ON FUNCTION private.is_active_member() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_active_member() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION private.assert_active_member() FROM PUBLIC, anon, authenticated;

-- A suspended owner can no longer edit the business row.
DROP POLICY IF EXISTS "businesses_update_owner" ON public.businesses;
CREATE POLICY "businesses_update_owner" ON public.businesses FOR UPDATE TO authenticated
  USING (owner_id = (SELECT auth.uid()) AND (SELECT private.is_active_member()))
  WITH CHECK (owner_id = (SELECT auth.uid()) AND (SELECT private.is_active_member()));

-- ===========================================================================
-- 2. Storage: business-media (DB-11, critic C3, BL-09)
--    Public object URLs of a public bucket do not consult RLS, so dropping the anonymous
--    SELECT policy only stops listing. Owners keep SELECT on their own folder (needed by
--    upload and remove).
-- ===========================================================================
DROP POLICY IF EXISTS "business_media_read" ON storage.objects;
DROP POLICY IF EXISTS "business_media_read_owner" ON storage.objects;
CREATE POLICY "business_media_read_owner" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'business-media'
    AND EXISTS (SELECT 1 FROM public.businesses b
                WHERE b.id::text = (storage.foldername(storage.objects.name))[1]
                  AND private.owns_business(b.id))
  );

DROP POLICY IF EXISTS "business_media_insert_owner" ON storage.objects;
CREATE POLICY "business_media_insert_owner" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'business-media'
    AND EXISTS (SELECT 1 FROM public.businesses b
                WHERE b.id::text = (storage.foldername(storage.objects.name))[1]
                  AND private.owns_business(b.id))
  );

DROP POLICY IF EXISTS "business_media_update_owner" ON storage.objects;
CREATE POLICY "business_media_update_owner" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'business-media'
    AND EXISTS (SELECT 1 FROM public.businesses b
                WHERE b.id::text = (storage.foldername(storage.objects.name))[1]
                  AND private.owns_business(b.id))
  )
  WITH CHECK (
    bucket_id = 'business-media'
    AND EXISTS (SELECT 1 FROM public.businesses b
                WHERE b.id::text = (storage.foldername(storage.objects.name))[1]
                  AND private.owns_business(b.id))
  );

DROP POLICY IF EXISTS "business_media_delete_owner" ON storage.objects;
CREATE POLICY "business_media_delete_owner" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'business-media'
    AND EXISTS (SELECT 1 FROM public.businesses b
                WHERE b.id::text = (storage.foldername(storage.objects.name))[1]
                  AND private.owns_business(b.id))
  );

-- ===========================================================================
-- 3. Slots, expiry of unanswered requests (BL-08 / F05), payment holds
-- ===========================================================================

-- Same as before, plus: demo businesses (no owner) have no bookable times.
CREATE OR REPLACE FUNCTION private.get_available_slots(p_service uuid, p_employee uuid, p_date date, p_exclude uuid DEFAULT NULL)
RETURNS TABLE (slot_start timestamptz, slot_employee_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = private, public
AS $$
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
  WHERE s.id = p_service AND s.is_active AND b.status = 'approved' AND b.owner_id IS NOT NULL;
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

-- Rejects one unanswered request whose start time has passed and opens the deposit refund.
-- Returns true when a refund request was opened.
CREATE OR REPLACE FUNCTION private.expire_stale_approval(p_appt public.appointments)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v_refund boolean := false;
  v_name text;
  v_owner uuid;
  v_when text := to_char(p_appt.starts_at AT TIME ZONE 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI');
BEGIN
  UPDATE appointments SET status = 'rejected', cancelled_by = 'system', cancelled_at = now(),
    cancellation_reason = 'İşletme talebi zamanında onaylamadı'
  WHERE id = p_appt.id AND status = 'pending_approval';
  IF NOT FOUND THEN RETURN false; END IF;

  v_refund := open_refund(p_appt, 'Onay süresi doldu');
  SELECT b.name, b.owner_id INTO v_name, v_owner FROM businesses b WHERE b.id = p_appt.business_id;

  PERFORM notify(p_appt.customer_id, 'appointment_cancelled', 'Randevu talebiniz zaman aşımına uğradı',
    coalesce(v_name, 'İşletme') || ' - ' || p_appt.service_name || ', ' || v_when
    || ' randevu talebiniz başlangıç saatine kadar onaylanmadığı için iptal edildi.'
    || CASE WHEN v_refund THEN ' Kapora iadeniz işleme alındı.' ELSE '' END,
    '/randevularim');
  PERFORM notify(v_owner, 'appointment_cancelled', 'Yanıtlanmayan randevu talebi iptal edildi',
    p_appt.service_name || ', ' || v_when || ' randevu talebi başlangıç saatine kadar onaylanmadığı için otomatik olarak iptal edildi.',
    '/isletme/randevular');
  RETURN v_refund;
END;
$$;

-- Same hold release as before, plus the lazy expiry of unanswered requests.
CREATE OR REPLACE FUNCTION public.release_expired_holds(p_employee uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_minutes int;
  v_appt appointments%ROWTYPE;
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

REVOKE EXECUTE ON FUNCTION public.release_expired_holds(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.expire_stale_approval(public.appointments) FROM PUBLIC, anon, authenticated;

-- ===========================================================================
-- 4. Booking RPCs (private implementations; public wrappers are unchanged)
-- ===========================================================================

CREATE OR REPLACE FUNCTION private.create_appointment(p_service uuid, p_employee uuid, p_starts_at timestamptz, p_note text DEFAULT '')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_settings platform_settings%ROWTYPE;
  v_service services%ROWTYPE;
  v_business businesses%ROWTYPE;
  v_employee employees%ROWTYPE;
  v_deposit numeric(10,2);
  v_id uuid;
  v_status text;
  v_same_day boolean;
  v_holds int;
  v_active int;
  v_recent int;
  v_here int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'VEYRA_AUTH_REQUIRED'; END IF;
  PERFORM private.assert_active_member();
  IF NOT private.has_role('customer') THEN RAISE EXCEPTION 'VEYRA_CUSTOMER_ONLY'; END IF;
  IF p_starts_at IS NULL OR char_length(coalesce(p_note, '')) > 500 THEN RAISE EXCEPTION 'VEYRA_INVALID_INPUT'; END IF;

  SELECT * INTO v_settings FROM platform_settings WHERE id = 1;
  SELECT * INTO v_service FROM services WHERE id = p_service AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;
  SELECT * INTO v_business FROM businesses WHERE id = v_service.business_id AND status = 'approved';
  IF NOT FOUND THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;
  -- Owner decision: demo businesses (no owner account) stay visible but take no bookings.
  IF v_business.owner_id IS NULL THEN RAISE EXCEPTION 'VEYRA_BOOKING_CLOSED'; END IF;
  SELECT * INTO v_employee FROM employees WHERE id = p_employee AND business_id = v_business.id AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;

  -- BL-03 / DB-03: one booking attempt at a time per customer, bounded holds and bookings.
  PERFORM pg_advisory_xact_lock(hashtextextended('rango-booking:' || v_uid::text, 0));
  SELECT
    count(*) FILTER (WHERE a.status = 'pending_payment'
                       AND a.created_at > now() - make_interval(mins => v_settings.pending_payment_minutes)),
    count(*) FILTER (WHERE a.status IN ('pending_approval', 'confirmed') AND a.starts_at > now()),
    count(*) FILTER (WHERE a.created_at > now() - interval '24 hours'),
    count(*) FILTER (WHERE a.business_id = v_business.id
                       AND a.status IN ('pending_approval', 'confirmed') AND a.starts_at > now())
  INTO v_holds, v_active, v_recent, v_here
  FROM appointments a
  WHERE a.customer_id = v_uid;
  IF v_holds >= 2 OR v_active >= 6 OR v_recent >= 10 OR v_here >= 3 THEN
    RAISE EXCEPTION 'VEYRA_LIMIT';
  END IF;

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

  -- BL-02 / F04: same-day (Istanbul) bookings always wait for the owner's approval.
  v_same_day := (p_starts_at AT TIME ZONE 'Europe/Istanbul')::date = (now() AT TIME ZONE 'Europe/Istanbul')::date;
  v_status := CASE WHEN v_deposit > 0 THEN 'pending_payment'
                   WHEN v_business.auto_confirm AND NOT v_same_day THEN 'confirmed'
                   ELSE 'pending_approval' END;

  BEGIN
    INSERT INTO appointments (customer_id, business_id, service_id, employee_id, starts_at, ends_at, status,
      service_name, employee_name, duration_minutes, total_price, deposit_amount, remaining_amount, customer_note,
      cancellation_hours)
    VALUES (v_uid, v_business.id, v_service.id, v_employee.id, p_starts_at,
      p_starts_at + make_interval(mins => v_service.duration_minutes), v_status,
      v_service.name, v_employee.full_name, v_service.duration_minutes, v_service.price, v_deposit,
      v_service.price - v_deposit, coalesce(p_note, ''), v_business.cancellation_hours)
    RETURNING id INTO v_id;
  EXCEPTION WHEN exclusion_violation THEN
    RAISE EXCEPTION 'VEYRA_SLOT_TAKEN';
  END;

  INSERT INTO payments (appointment_id, customer_id, business_id, amount, status, provider, paid_at)
  VALUES (v_id, v_uid, v_business.id, v_deposit,
    CASE WHEN v_deposit > 0 THEN 'pending' ELSE 'paid' END,
    v_settings.payment_provider,
    CASE WHEN v_deposit > 0 THEN NULL ELSE now() END);

  IF v_status <> 'pending_payment' THEN
    UPDATE businesses SET booking_count = booking_count + 1 WHERE id = v_business.id;
    PERFORM notify(v_uid, 'appointment_confirmed',
      CASE WHEN v_status = 'confirmed' THEN 'Randevunuz onaylandı' ELSE 'Randevu talebiniz alındı' END,
      v_business.name || ' - ' || v_service.name || ', ' || to_char(p_starts_at AT TIME ZONE 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI')
      || CASE WHEN v_status = 'pending_approval' THEN '. Randevunuz işletme onayından sonra kesinleşir.' ELSE '' END,
      '/randevularim');
    PERFORM notify(v_business.owner_id, 'new_booking',
      CASE WHEN v_status = 'confirmed' THEN 'Yeni randevu' ELSE 'Onay bekleyen yeni randevu' END,
      v_service.name || ', ' || to_char(p_starts_at AT TIME ZONE 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI'), '/isletme/randevular');
  END IF;

  RETURN v_id;
END;
$$;

-- TEST MODE deposit confirmation (owner decision: payments stay in test mode for now).
CREATE OR REPLACE FUNCTION private.pay_deposit(p_appointment uuid, p_card_last4 text, p_card_brand text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_settings platform_settings%ROWTYPE;
  v_appt appointments%ROWTYPE;
  v_business businesses%ROWTYPE;
  v_new_status text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'VEYRA_AUTH_REQUIRED'; END IF;
  PERFORM private.assert_active_member();
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
  IF v_business.owner_id IS NULL THEN RAISE EXCEPTION 'VEYRA_BOOKING_CLOSED'; END IF;
  -- Same-day (Istanbul) bookings, decided at payment time, wait for the owner.
  v_new_status := CASE WHEN v_business.auto_confirm
                         AND (v_appt.starts_at AT TIME ZONE 'Europe/Istanbul')::date > (now() AT TIME ZONE 'Europe/Istanbul')::date
                       THEN 'confirmed' ELSE 'pending_approval' END;

  UPDATE payments SET status = 'paid', paid_at = now(), card_last4 = p_card_last4,
    card_brand = left(coalesce(p_card_brand, ''), 20),
    provider_payment_id = 'TEST-' || upper(substr(md5(random()::text), 1, 10))
  WHERE appointment_id = v_appt.id AND status = 'pending';

  UPDATE appointments SET status = v_new_status WHERE id = v_appt.id;
  UPDATE businesses SET booking_count = booking_count + 1 WHERE id = v_business.id;

  -- Test mode: no money is taken, so the message must not say so.
  PERFORM notify(v_uid, 'payment_confirmed', 'Test ödemesi kaydedildi',
    to_char(v_appt.deposit_amount, 'FM999G999D00') || ' ₺ kapora test modunda kaydedildi. Kartınızdan herhangi bir tahsilat yapılmadı.',
    '/randevularim');
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

CREATE OR REPLACE FUNCTION private.cancel_appointment(p_appointment uuid, p_reason text DEFAULT '')
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_appt appointments%ROWTYPE;
  v_business businesses%ROWTYPE;
  v_actor text;
  v_refund boolean := false;
  v_when text;
  v_hours int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'VEYRA_AUTH_REQUIRED'; END IF;
  PERFORM private.assert_active_member();
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

  -- BL-08: an unanswered request whose start time has passed expires (refund included).
  IF v_actor = 'customer' AND v_appt.status = 'pending_approval' AND v_appt.starts_at <= now() THEN
    v_refund := expire_stale_approval(v_appt);
    RETURN CASE WHEN v_refund THEN 'refund' ELSE 'no_refund' END;
  END IF;

  IF v_appt.starts_at <= now() AND v_actor = 'customer' THEN RAISE EXCEPTION 'VEYRA_INVALID_STATE'; END IF;

  -- BL-07: the window agreed at booking time, not the business's current setting.
  v_hours := coalesce(v_appt.cancellation_hours, v_business.cancellation_hours);
  v_when := to_char(v_appt.starts_at AT TIME ZONE 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI');

  -- DB-06: a request the owner has not answered yet is refunded on a customer cancel, unless
  -- the customer moved it (reschedule_count > 0): moving a booking into today turns it into
  -- pending_approval, which must not become a way around the cancellation window. An
  -- unanswered moved request is still refunded at its start time by expire_stale_approval.
  IF v_appt.status = 'pending_payment' THEN
    UPDATE payments SET status = 'cancelled' WHERE appointment_id = v_appt.id AND status = 'pending';
  ELSIF v_actor <> 'customer'
     OR (v_appt.status = 'pending_approval' AND v_appt.reschedule_count = 0)
     OR v_appt.starts_at - now() >= make_interval(hours => v_hours) THEN
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
           WHEN v_appt.status = 'pending_payment' OR v_appt.deposit_amount = 0 THEN v_business.name || ' randevunuz iptal edildi.'
           ELSE 'İptal politikası süresi geçtiği için kapora iade edilmeyecektir.' END,
      '/randevularim');
  ELSIF v_actor = 'business' THEN
    PERFORM notify(v_appt.customer_id, 'appointment_cancelled', 'Randevunuz iptal edildi',
      v_business.name || ' - ' || v_appt.service_name || ', ' || v_when || ' randevunuz işletme tarafından iptal edildi.'
      || CASE WHEN v_refund THEN ' Kapora iadeniz işleme alındı.' ELSE '' END,
      '/randevularim');
  ELSE
    PERFORM notify(v_appt.customer_id, 'appointment_cancelled', 'Randevunuz iptal edildi',
      v_business.name || ' - ' || v_appt.service_name || ', ' || v_when || ' randevunuz Rango tarafından iptal edildi.'
      || CASE WHEN v_refund THEN ' Kapora iadeniz işleme alındı.' ELSE '' END,
      '/randevularim');
    PERFORM notify(v_business.owner_id, 'appointment_cancelled', 'Randevu iptal edildi',
      v_appt.service_name || ', ' || v_when || ' randevusu Rango tarafından iptal edildi.', '/isletme/randevular');
  END IF;

  RETURN CASE WHEN v_refund THEN 'refund' ELSE 'no_refund' END;
END;
$$;

CREATE OR REPLACE FUNCTION private.reschedule_appointment(p_appointment uuid, p_employee uuid, p_starts_at timestamptz)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_appt appointments%ROWTYPE;
  v_business businesses%ROWTYPE;
  v_employee employees%ROWTYPE;
  v_max int;
  v_new_status text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'VEYRA_AUTH_REQUIRED'; END IF;
  PERFORM private.assert_active_member();
  IF p_starts_at IS NULL THEN RAISE EXCEPTION 'VEYRA_INVALID_INPUT'; END IF;
  SELECT * INTO v_appt FROM appointments WHERE id = p_appointment AND customer_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;
  IF v_appt.status NOT IN ('pending_approval','confirmed') OR v_appt.service_id IS NULL THEN RAISE EXCEPTION 'VEYRA_INVALID_STATE'; END IF;
  SELECT * INTO v_business FROM businesses WHERE id = v_appt.business_id;
  IF v_business.owner_id IS NULL THEN RAISE EXCEPTION 'VEYRA_BOOKING_CLOSED'; END IF;
  SELECT max_reschedules INTO v_max FROM platform_settings WHERE id = 1;
  IF v_appt.reschedule_count >= v_max THEN RAISE EXCEPTION 'VEYRA_RESCHEDULE_LIMIT'; END IF;
  IF v_appt.starts_at - now() < make_interval(hours => coalesce(v_appt.cancellation_hours, v_business.cancellation_hours)) THEN
    RAISE EXCEPTION 'VEYRA_POLICY_WINDOW';
  END IF;

  SELECT * INTO v_employee FROM employees WHERE id = p_employee AND business_id = v_business.id AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;

  PERFORM release_expired_holds(p_employee);
  IF NOT EXISTS (
    SELECT 1 FROM get_available_slots(v_appt.service_id, p_employee, (p_starts_at AT TIME ZONE 'Europe/Istanbul')::date, v_appt.id) g
    WHERE g.slot_start = p_starts_at AND g.slot_employee_id = p_employee
  ) THEN
    RAISE EXCEPTION 'VEYRA_SLOT_TAKEN';
  END IF;

  -- BL-02: a booking moved to today (Istanbul) needs the owner's approval again.
  v_new_status := CASE WHEN (p_starts_at AT TIME ZONE 'Europe/Istanbul')::date = (now() AT TIME ZONE 'Europe/Istanbul')::date
                       THEN 'pending_approval' ELSE v_appt.status END;

  BEGIN
    UPDATE appointments SET starts_at = p_starts_at,
      ends_at = p_starts_at + make_interval(mins => v_appt.duration_minutes),
      employee_id = v_employee.id, employee_name = v_employee.full_name,
      status = v_new_status,
      reschedule_count = reschedule_count + 1, reminder_sent = false
    WHERE id = v_appt.id;
  EXCEPTION WHEN exclusion_violation THEN
    RAISE EXCEPTION 'VEYRA_SLOT_TAKEN';
  END;

  PERFORM notify(v_uid, 'appointment_rescheduled', 'Randevunuz güncellendi',
    v_business.name || ' - yeni tarih: ' || to_char(p_starts_at AT TIME ZONE 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI')
    || CASE WHEN v_new_status = 'pending_approval' AND v_appt.status = 'confirmed'
            THEN '. Aynı gün randevuları işletme onayından sonra kesinleşir.' ELSE '' END,
    '/randevularim');
  PERFORM notify(v_business.owner_id, 'appointment_rescheduled',
    CASE WHEN v_new_status = 'pending_approval' THEN 'Ertelenen randevu onayınızı bekliyor' ELSE 'Randevu ertelendi' END,
    v_appt.service_name || ': ' || to_char(v_appt.starts_at AT TIME ZONE 'Europe/Istanbul', 'DD.MM HH24:MI') || ' → '
    || to_char(p_starts_at AT TIME ZONE 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI'), '/isletme/randevular');
END;
$$;

CREATE OR REPLACE FUNCTION private.business_update_appointment(p_appointment uuid, p_action text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_appt appointments%ROWTYPE;
  v_business businesses%ROWTYPE;
  v_rate numeric(5,2);
  v_when text;
  v_refund boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'VEYRA_AUTH_REQUIRED'; END IF;
  PERFORM private.assert_active_member();
  SELECT * INTO v_appt FROM appointments WHERE id = p_appointment FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;
  SELECT * INTO v_business FROM businesses WHERE id = v_appt.business_id;
  IF NOT (owns_business(v_business.id) OR is_admin()) THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;
  v_when := to_char(v_appt.starts_at AT TIME ZONE 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI');

  IF p_action = 'approve' THEN
    IF v_appt.status <> 'pending_approval' THEN RAISE EXCEPTION 'VEYRA_INVALID_STATE'; END IF;
    -- F05: a request is answered before it starts; afterwards it expires automatically.
    IF v_appt.starts_at <= now() THEN RAISE EXCEPTION 'VEYRA_INVALID_STATE'; END IF;
    UPDATE appointments SET status = 'confirmed' WHERE id = v_appt.id;
    PERFORM notify(v_appt.customer_id, 'appointment_confirmed', 'Randevunuz onaylandı',
      v_business.name || ' - ' || v_appt.service_name || ', ' || v_when, '/randevularim');
  ELSIF p_action = 'reject' THEN
    IF v_appt.status <> 'pending_approval' THEN RAISE EXCEPTION 'VEYRA_INVALID_STATE'; END IF;
    UPDATE appointments SET status = 'rejected', cancelled_by = 'business', cancelled_at = now() WHERE id = v_appt.id;
    v_refund := open_refund(v_appt, 'İşletme randevuyu reddetti');
    PERFORM notify(v_appt.customer_id, 'appointment_cancelled', 'Randevu talebiniz reddedildi',
      v_business.name || ' ' || v_when || ' randevunuzu onaylayamadı.'
      || CASE WHEN v_refund THEN ' Kapora iadeniz işleme alındı.' ELSE '' END, '/randevularim');
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

CREATE OR REPLACE FUNCTION private.submit_review(p_appointment uuid, p_rating integer, p_comment text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_appt appointments%ROWTYPE;
  v_name text;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'VEYRA_AUTH_REQUIRED'; END IF;
  PERFORM private.assert_active_member();
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 OR char_length(coalesce(p_comment, '')) > 1000 THEN
    RAISE EXCEPTION 'VEYRA_INVALID_INPUT';
  END IF;
  SELECT * INTO v_appt FROM appointments WHERE id = p_appointment AND customer_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;
  IF v_appt.status <> 'completed' THEN RAISE EXCEPTION 'VEYRA_INVALID_STATE'; END IF;
  IF EXISTS (SELECT 1 FROM reviews WHERE appointment_id = v_appt.id) THEN RAISE EXCEPTION 'VEYRA_ALREADY_REVIEWED'; END IF;

  SELECT full_name INTO v_name FROM profiles WHERE id = v_uid;
  v_name := CASE WHEN coalesce(v_name, '') = '' THEN 'Rango Üyesi'
    ELSE split_part(v_name, ' ', 1) || CASE WHEN split_part(v_name, ' ', 2) <> '' THEN ' ' || left(split_part(v_name, ' ', 2), 1) || '.' ELSE '' END END;

  INSERT INTO reviews (appointment_id, business_id, customer_id, employee_id, rating, comment, reviewer_name, service_name)
  VALUES (v_appt.id, v_appt.business_id, v_uid, v_appt.employee_id, p_rating, coalesce(p_comment, ''), v_name, v_appt.service_name)
  RETURNING id INTO v_id;

  PERFORM notify((SELECT owner_id FROM businesses WHERE id = v_appt.business_id), 'new_review', 'Yeni değerlendirme',
    p_rating || ' yıldız - ' || v_appt.service_name, '/isletme/yorumlar');
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION private.reply_review(p_review uuid, p_reply text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'VEYRA_AUTH_REQUIRED'; END IF;
  PERFORM private.assert_active_member();
  IF char_length(coalesce(p_reply, '')) > 1000 THEN RAISE EXCEPTION 'VEYRA_INVALID_INPUT'; END IF;
  UPDATE reviews r SET owner_reply = nullif(trim(p_reply), '')
  WHERE r.id = p_review AND private.owns_business(r.business_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;
END;
$$;

-- DB-05 / G12: only customers with a real booking at this business in the last 24 months
-- (abandoned payment holds and requests cancelled before the start are not shared); no gender.
CREATE OR REPLACE FUNCTION private.business_customer_contacts(p_business uuid)
RETURNS TABLE (customer_id uuid, full_name text, phone text, email text, gender text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = private, public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'VEYRA_AUTH_REQUIRED'; END IF;
  IF NOT (private.is_admin() OR private.owns_business(p_business)) THEN
    RAISE EXCEPTION 'VEYRA_NOT_FOUND';
  END IF;

  RETURN QUERY
  SELECT DISTINCT p.id, p.full_name, p.phone, p.email, NULL::text
  FROM public.profiles p
  JOIN public.appointments a ON a.customer_id = p.id
  WHERE a.business_id = p_business
    AND a.starts_at >= now() - interval '24 months'
    AND (a.status IN ('pending_approval', 'confirmed', 'completed', 'no_show')
         OR (a.status = 'cancelled' AND a.cancelled_at >= a.starts_at));
END;
$$;

-- ===========================================================================
-- 5. Refunds (BL-06): a TEST payment was never charged, so do not say "sent to your card".
-- ===========================================================================
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

-- ===========================================================================
-- 6. First-admin bootstrap (BL-12 / FE-03)
-- ===========================================================================
CREATE OR REPLACE FUNCTION private.claim_first_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, auth
AS $$
DECLARE
  v_email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'VEYRA_AUTH_REQUIRED'; END IF;
  IF coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN RAISE EXCEPTION 'VEYRA_FORBIDDEN'; END IF;

  SELECT lower(u.email) INTO v_email
  FROM auth.users u
  WHERE u.id = auth.uid()
    AND u.email_confirmed_at IS NOT NULL
    AND NOT coalesce(u.is_anonymous, false);

  IF v_email IS NULL OR v_email NOT IN ('denizhakli9@gmail.com') THEN
    RAISE EXCEPTION 'VEYRA_FORBIDDEN';
  END IF;

  LOCK TABLE public.profiles IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE role = 'admin') THEN RETURN false; END IF;
  UPDATE public.profiles SET role = 'admin' WHERE id = auth.uid();
  RETURN true;
END;
$$;

-- Once an administrator exists the bootstrap RPC is closed for good
-- (the setup page calls admin_exists first and shows "zaten tanımlı").
-- If no administrator exists yet when this file runs, the RPC stays callable (allowlisted,
-- confirmed e-mail only) until the file is run again after the claim: HOW TO RUN, step 0.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE role = 'admin') THEN
    RAISE NOTICE 'No administrator yet: claim_first_admin stays open. Claim admin at /yonetim/kurulum, then run this file again to close it.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE role = 'admin') THEN
    REVOKE EXECUTE ON FUNCTION public.claim_first_admin() FROM PUBLIC, anon, authenticated;
    REVOKE EXECUTE ON FUNCTION private.claim_first_admin() FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

-- ===========================================================================
-- 7. Support: AI quota (BL-10 / SUPAI-1), KVKK need-to-know (SUPAI-3 / M7)
-- ===========================================================================

-- Contract with the support-ai edge function: same signature, returns boolean.
-- Over quota (20 AI answers per user or 1500 overall per 24 hours) and for KVKK threads the
-- conversation is handed to the human queue (status 'waiting') and false is returned.
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

  IF subj ILIKE 'kvkk%'
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

-- Same behaviour as before, plus: support agents who are not administrators cannot act on
-- KVKK conversations (subject starting with 'KVKK'); administrators handle those.
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
    INSERT INTO public.support_threads(subject) VALUES (btrim(p_text)) RETURNING id INTO v;
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
      -- Through notify(): no notification rows for an erased account (see section 8).
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

-- Agents who are not administrators read only conversations waiting for a human or assigned
-- to them, and never KVKK conversations. Customers keep reading their own; admins read all.
DROP POLICY IF EXISTS support_read ON public.support_threads;
CREATE POLICY support_read ON public.support_threads FOR SELECT TO authenticated USING (
  ((SELECT auth.jwt()) ->> 'is_anonymous')::boolean IS NOT TRUE
  AND (
    user_id = (SELECT auth.uid())
    OR (SELECT private.support_is_admin())
    OR ((SELECT private.support_is_agent())
        AND subject NOT ILIKE 'kvkk%'
        AND (status = 'waiting' OR assigned_to = (SELECT auth.uid())))
  )
);

DROP POLICY IF EXISTS support_read ON public.support_messages;
CREATE POLICY support_read ON public.support_messages FOR SELECT TO authenticated USING (
  ((SELECT auth.jwt()) ->> 'is_anonymous')::boolean IS NOT TRUE
  AND EXISTS (
    SELECT 1 FROM public.support_threads t
    WHERE t.id = support_messages.thread_id
      AND (
        t.user_id = (SELECT auth.uid())
        OR (SELECT private.support_is_admin())
        OR ((SELECT private.support_is_agent())
            AND t.subject NOT ILIKE 'kvkk%'
            AND (t.status = 'waiting' OR t.assigned_to = (SELECT auth.uid())))
      )
  )
);

-- ===========================================================================
-- 8. KVKK erasure (G06): public.delete_my_account()
--    Deletes what has no remaining legal basis, anonymises the profile and reviews, keeps
--    appointment / payment / refund rows (legal retention) linked to the anonymous profile,
--    and closes the sign-in account.
--
--    DELIBERATE CHOICE (owner decision, KVKK verifier correction C5 not followed):
--    the identity (name, e-mail, phone) is wiped IMMEDIATELY. It is NOT kept under
--    restricted access with a deleted_at flag until the retention periods end (e.g.
--    Mesafeli Sözleşmeler 3 years, KVKK md.5/2-e). Booking and payment rows are kept, but
--    without anything that identifies the person, so no identity remains for later
--    disputes. This matches the DeleteAccount.tsx copy ("kimliğinizle ilişkilendirilmeden
--    saklanır"). If legal advice changes this, copy full_name / e-mail into an admin-only
--    table (e.g. private.erased_identities) BEFORE profiles is cleared, purge it in
--    run_retention after the retention period, and reword DeleteAccount.tsx accordingly.
--    Bilinçli tercih: kimlik bilgileri saklama süresi boyunca kısıtlı erişimle tutulmaz,
--    hesap silindiği anda anonimleştirilir (C5 önerisi uygulanmadı, sahip kararı).
-- ===========================================================================
CREATE OR REPLACE FUNCTION private.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile profiles%ROWTYPE;
  v_minutes int;
  v_label constant text := 'Silinmiş kullanıcı';
  v_col text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'VEYRA_AUTH_REQUIRED'; END IF;
  IF coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN RAISE EXCEPTION 'VEYRA_FORBIDDEN'; END IF;

  SELECT * INTO v_profile FROM profiles WHERE id = v_uid FOR UPDATE;
  -- Business and admin accounts can have open payouts / duties: handled by support.
  IF NOT FOUND OR v_profile.role <> 'customer' THEN RAISE EXCEPTION 'VEYRA_FORBIDDEN'; END IF;

  SELECT pending_payment_minutes INTO v_minutes FROM platform_settings WHERE id = 1;

  -- Upcoming bookings, live payment holds and requests still waiting for the business.
  IF EXISTS (
    SELECT 1 FROM appointments a
    WHERE a.customer_id = v_uid
      AND (a.status = 'pending_approval'
           OR (a.status = 'confirmed' AND a.starts_at > now())
           OR (a.status = 'pending_payment' AND a.starts_at > now()
               AND a.created_at > now() - make_interval(mins => v_minutes)))
  ) THEN
    RAISE EXCEPTION 'VEYRA_ACTIVE_APPOINTMENTS';
  END IF;
  IF EXISTS (SELECT 1 FROM refund_requests r WHERE r.customer_id = v_uid AND r.status = 'pending') THEN
    RAISE EXCEPTION 'VEYRA_OPEN_REFUND';
  END IF;

  -- Expired payment holds of this customer.
  UPDATE payments p SET status = 'cancelled'
  FROM appointments a
  WHERE p.appointment_id = a.id AND p.status = 'pending' AND a.customer_id = v_uid AND a.status = 'pending_payment';
  UPDATE appointments SET status = 'cancelled', cancelled_by = 'system', cancelled_at = now(),
    cancellation_reason = 'Ödeme süresi doldu'
  WHERE customer_id = v_uid AND status = 'pending_payment';

  -- No remaining basis: delete now.
  DELETE FROM favorites WHERE customer_id = v_uid;
  DELETE FROM notifications WHERE user_id = v_uid;
  DELETE FROM support_messages m USING support_threads t
  WHERE m.thread_id = t.id AND t.user_id = v_uid AND t.status IN ('resolved', 'ai');
  DELETE FROM support_threads WHERE user_id = v_uid AND status IN ('resolved', 'ai');
  -- If the customer was also a support agent, their open conversations go back to the queue.
  UPDATE support_threads SET status = 'waiting', assigned_to = NULL, updated_at = now()
  WHERE assigned_to = v_uid AND status = 'human';
  DELETE FROM support_agents WHERE user_id = v_uid;

  -- Free text written by the customer on the retained bookings.
  UPDATE appointments SET customer_note = '' WHERE customer_id = v_uid AND customer_note <> '';
  UPDATE appointments SET cancellation_reason = NULL
  WHERE customer_id = v_uid AND cancelled_by = 'customer' AND cancellation_reason IS NOT NULL;

  -- Reviews stay, without the name.
  UPDATE reviews SET reviewer_name = v_label WHERE customer_id = v_uid;

  UPDATE profiles SET
    full_name = v_label, email = NULL, phone = NULL, gender = 'unspecified',
    district = NULL, latitude = NULL, longitude = NULL, avatar_url = NULL, push_token = NULL,
    is_suspended = true, deleted_at = coalesce(deleted_at, now())
  WHERE id = v_uid;

  -- Close the sign-in account: no sessions, no identities, banned, no personal data.
  DELETE FROM auth.refresh_tokens WHERE user_id = v_uid::text;
  DELETE FROM auth.sessions WHERE user_id = v_uid;
  DELETE FROM auth.identities WHERE user_id = v_uid;
  IF to_regclass('auth.mfa_factors') IS NOT NULL THEN
    EXECUTE 'DELETE FROM auth.mfa_factors WHERE user_id = $1' USING v_uid;
  END IF;
  IF to_regclass('auth.one_time_tokens') IS NOT NULL THEN
    EXECUTE 'DELETE FROM auth.one_time_tokens WHERE user_id = $1' USING v_uid;
  END IF;

  -- banned_until: a finite date far in the future (what Supabase's own ban_duration '876000h'
  -- writes). The Auth server reads this column into a Go time value, which cannot hold 'infinity'.
  UPDATE auth.users SET
    email = 'deleted+' || v_uid::text || '@deleted.invalid',
    phone = NULL,
    banned_until = now() + interval '100 years',
    raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) - ARRAY[
      'full_name', 'name', 'phone', 'gender', 'avatar_url', 'picture', 'email', 'email_verified',
      'phone_verified', 'preferred_username', 'user_name', 'nickname', 'given_name', 'family_name'],
    updated_at = now()
  WHERE id = v_uid;

  -- Pending e-mail / phone changes also hold personal data (columns differ between Auth versions).
  FOREACH v_col IN ARRAY ARRAY['email_change', 'phone_change'] LOOP
    IF EXISTS (SELECT 1 FROM pg_attribute
               WHERE attrelid = 'auth.users'::regclass AND attname = v_col AND NOT attisdropped) THEN
      EXECUTE format('UPDATE auth.users SET %I = %L WHERE id = $1', v_col, '') USING v_uid;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$ SELECT private.delete_my_account(); $$;

REVOKE EXECUTE ON FUNCTION private.delete_my_account() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION private.delete_my_account() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_my_account() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

-- Erased accounts get no new notification rows (a later 'complete', refund resolution or
-- expiry would otherwise rebuild booking context on the anonymised profile). Same signature
-- and behaviour as in 20261106115823_create_veyra_triggers.sql otherwise.
CREATE OR REPLACE FUNCTION public.notify(p_user uuid, p_type text, p_title text, p_body text, p_link text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user IS NULL
     OR EXISTS (SELECT 1 FROM profiles WHERE id = p_user AND deleted_at IS NOT NULL) THEN
    RETURN;
  END IF;
  INSERT INTO notifications (user_id, type, title, body, link) VALUES (p_user, p_type, p_title, p_body, p_link);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.notify(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;

-- ===========================================================================
-- 9. Retention (M3, Aydınlatma Metni §7) - scheduled only when pg_cron is available
-- ===========================================================================
CREATE OR REPLACE FUNCTION private.run_retention()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
BEGIN
  -- Free-text notes are not accounting records: cleared 12 months after the appointment.
  UPDATE appointments SET customer_note = '', cancellation_reason = NULL
  WHERE ends_at < now() - interval '12 months'
    AND (customer_note <> '' OR cancellation_reason IS NOT NULL);

  -- Support correspondence: 2 years after the conversation was closed (or left with the assistant).
  DELETE FROM support_messages m USING support_threads t
  WHERE m.thread_id = t.id AND t.status IN ('resolved', 'ai') AND t.updated_at < now() - interval '2 years';
  DELETE FROM support_threads t
  WHERE t.status IN ('resolved', 'ai') AND t.updated_at < now() - interval '2 years'
    AND NOT EXISTS (SELECT 1 FROM support_messages m WHERE m.thread_id = t.id);
END;
$$;
REVOKE EXECUTE ON FUNCTION private.run_retention() FROM PUBLIC, anon, authenticated;

-- ===========================================================================
-- 10. Demo businesses (owner decision 2, BL-04, G20, critic C8)
--     Direct statements: auth.uid() is NULL in the SQL editor, so the RPCs cannot be used.
-- ===========================================================================
DO $$
DECLARE
  v_appt public.appointments%ROWTYPE;
  v_refund boolean;
  v_name text;
  v_minutes int := (SELECT pending_payment_minutes FROM public.platform_settings WHERE id = 1);
BEGIN
  FOR v_appt IN
    SELECT a.* FROM public.appointments a
    JOIN public.businesses b ON b.id = a.business_id
    WHERE b.owner_id IS NULL
      AND a.status IN ('pending_payment', 'pending_approval', 'confirmed')
    ORDER BY a.starts_at
    FOR UPDATE OF a
  LOOP
    v_refund := false;
    IF v_appt.status = 'pending_payment' THEN
      UPDATE public.payments SET status = 'cancelled' WHERE appointment_id = v_appt.id AND status = 'pending';
      -- A hold whose payment time already ran out was never a booking: close it the way
      -- release_expired_holds does (system, 'Ödeme süresi doldu') and do not notify anyone.
      IF v_appt.created_at <= now() - make_interval(mins => coalesce(v_minutes, 15)) THEN
        UPDATE public.appointments SET status = 'cancelled', cancelled_by = 'system', cancelled_at = now(),
          cancellation_reason = 'Ödeme süresi doldu'
        WHERE id = v_appt.id;
        CONTINUE;
      END IF;
    ELSE
      -- paid deposit -> refund_pending + refund request (no-op for 0 ₺ deposits)
      v_refund := public.open_refund(v_appt, 'Örnek işletme - randevu kapalı');
    END IF;

    UPDATE public.appointments SET status = 'cancelled', cancelled_by = 'admin', cancelled_at = now(),
      cancellation_reason = 'Örnek işletme - randevu kapalı'
    WHERE id = v_appt.id;

    SELECT b.name INTO v_name FROM public.businesses b WHERE b.id = v_appt.business_id;
    PERFORM public.notify(v_appt.customer_id, 'appointment_cancelled', 'Randevunuz iptal edildi',
      coalesce(v_name, 'İşletme') || ' - ' || v_appt.service_name || ', '
      || to_char(v_appt.starts_at AT TIME ZONE 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI')
      || ' randevunuz iptal edildi. Bu işletme platformdaki örnek kayıtlardan biridir ve randevu kabul etmemektedir.'
      || CASE WHEN v_refund THEN ' Kapora iadeniz işleme alındı.' ELSE '' END,
      '/randevularim');
  END LOOP;

  -- Invented contact details are removed and the "verified" badge is cleared.
  UPDATE public.businesses SET phone = NULL, email = NULL, is_verified = false
  WHERE owner_id IS NULL AND (phone IS NOT NULL OR email IS NOT NULL OR is_verified);
END $$;

-- ===========================================================================
-- 11. pg_cron (optional): enabled and scheduled only when the extension is available.
--     Never fails: without pg_cron, expiry still runs lazily in release_expired_holds.
-- ===========================================================================
DO $cron$
DECLARE
  v_has boolean := EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron');
BEGIN
  IF NOT v_has AND EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    BEGIN
      CREATE EXTENSION IF NOT EXISTS pg_cron;
      v_has := true;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'pg_cron could not be enabled (%). Enable it under Database > Extensions and run this file again.', SQLERRM;
    END;
  END IF;

  IF v_has THEN
    BEGIN
      EXECUTE $q$SELECT cron.unschedule(jobid) FROM cron.job
                 WHERE jobname IN ('rango-expire-stale-bookings', 'rango-retention')$q$;
      EXECUTE $q$SELECT cron.schedule('rango-expire-stale-bookings', '*/5 * * * *',
                 'SELECT public.release_expired_holds(NULL)')$q$;
      EXECUTE $q$SELECT cron.schedule('rango-retention', '30 3 * * *',
                 'SELECT private.run_retention()')$q$;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'pg_cron jobs could not be scheduled (%). Expiry still runs inside the booking functions.', SQLERRM;
    END;
  ELSE
    RAISE NOTICE 'pg_cron is not available: unanswered requests expire lazily inside the booking functions; retention is not scheduled.';
  END IF;
END $cron$;

NOTIFY pgrst, 'reload schema';

COMMIT;
