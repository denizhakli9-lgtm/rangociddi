/*
# Satış onayı – 2. adım: onaysız ödemeyi reddet (PayTR Çerçeve Ödeme Hizmeti Sözleşmesi md. 7.2)

APPLY ONLY AFTER the frontend that calls `record_sale_consent` before `pay_deposit` is live
(web site and any distributed mobile build). Applying it earlier makes test payments from the
old frontend fail with VEYRA_CONSENT_REQUIRED.

`private.pay_deposit` is identical to 20261114200000_rango_security_hardening.sql
(verified against the live definition on 2026-11-20), plus one check: the payment is refused
unless a sale confirmation with the same amounts is on record for the appointment.
*/

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
