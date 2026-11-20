/*
# Satış onayı – 2. adım: onaysız ödemeyi reddet (PayTR Çerçeve Ödeme Hizmeti Sözleşmesi md. 7.2)

BU DOSYA HENÜZ UYGULANMADI. Bu klasör (`supabase/bekleyen`) bilerek `supabase/migrations` dışında
tutulur, böylece bekleyen dosyaların hepsini birden uygulayan bir araç (ör. `supabase db push`)
bu adımı erken çalıştıramaz. Uyguladıktan sonra dosyayı, Supabase'in kaydettiği sürüm numarasıyla
`supabase/migrations/<sürüm>_require_sale_consent_for_payment.sql` olarak taşıyın.

APPLY ONLY AFTER the frontend that calls `record_sale_consent` before `pay_deposit` and before the
PayTR checkout (`paytr-token`) is live: the web site and every distributed mobile build. Applying it
earlier makes payments started from the old frontend fail with VEYRA_CONSENT_REQUIRED.

1. `private.pay_deposit` (test payments) is identical to 20261114200000_rango_security_hardening.sql
   (verified against the live definition on 2026-11-20), plus one check: the payment is refused
   unless a sale confirmation with the same amounts is on record for the appointment.
2. PayTR payments: a BEFORE INSERT trigger on `private.paytr_orders` refuses to start a PayTR order
   (so no PayTR payment page is ever opened) without the same confirmation. It is a trigger on
   purpose: `paytr_begin_order` can be rewritten later without losing the check. The PayTR
   notification (`paytr_apply_callback`) is never blocked, because money already taken must always
   be recorded.

Re-running 20261114200000_rango_security_hardening.sql restores pay_deposit WITHOUT the check; run
this file again right after it. Check (must return true):
  SELECT position('VEYRA_CONSENT_REQUIRED' in pg_get_functiondef('private.pay_deposit(uuid,text,text)'::regprocedure)) > 0
     AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'paytr_orders_require_sale_consent');

Rollback (only if the site must go back to a frontend without the satış onayı): run the
private.pay_deposit definition from 20261114200000_rango_security_hardening.sql (lines 502-558) and
  DROP TRIGGER IF EXISTS paytr_orders_require_sale_consent ON private.paytr_orders;
*/

-- Step 1 must be in place, otherwise every payment would fail with "relation does not exist".
DO $$
BEGIN
  IF to_regclass('public.sale_consents') IS NULL
     OR to_regprocedure('public.record_sale_consent(uuid,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Önce 1. adım (record_sale_consent) uygulanmalı';
  END IF;
  IF to_regclass('private.paytr_orders') IS NULL THEN
    RAISE EXCEPTION 'private.paytr_orders bulunamadı: önce PayTR güncellemeleri uygulanmalı';
  END IF;
END $$;


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

  -- PayTR md. 7.2: the customer's sale confirmation must be on record before the payment.
  IF NOT EXISTS (
    SELECT 1 FROM sale_consents c
    WHERE c.appointment_id = v_appt.id AND c.customer_id = v_uid
      AND c.deposit_amount = v_appt.deposit_amount AND c.total_price = v_appt.total_price
  ) THEN
    RAISE EXCEPTION 'VEYRA_CONSENT_REQUIRED';
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

-- ---------------------------------------------------------------------------
-- PayTR: no order (and so no PayTR payment page) without a sale confirmation.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.require_sale_consent_for_paytr_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM sale_consents c
    JOIN appointments a ON a.id = c.appointment_id
    WHERE c.appointment_id = NEW.appointment_id AND c.customer_id = NEW.customer_id
      AND c.deposit_amount = a.deposit_amount AND c.total_price = a.total_price
  ) THEN
    RAISE EXCEPTION 'VEYRA_CONSENT_REQUIRED';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.require_sale_consent_for_paytr_order() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS paytr_orders_require_sale_consent ON private.paytr_orders;
CREATE TRIGGER paytr_orders_require_sale_consent
  BEFORE INSERT ON private.paytr_orders
  FOR EACH ROW EXECUTE FUNCTION private.require_sale_consent_for_paytr_order();
