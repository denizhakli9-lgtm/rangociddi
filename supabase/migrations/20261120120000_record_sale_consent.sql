/*
# Satış onayı kaydı – 1. adım (PayTR Çerçeve Ödeme Hizmeti Sözleşmesi md. 6.4, 7.2, 7.3)

PayTR sözleşmesine göre ödemenin müşterinin onayıyla yapıldığını ispat yükü İŞYERİ'ndedir (md. 7.2)
ve bu kayıtlar işlem tarihinden itibaren 10 yıl saklanıp talep halinde 2 iş günü içinde
sunulmalıdır (md. 6.4, 7.3). Bu güncelleme, müşterinin ödeme ekranında verdiği satış onayını
sunucu tarafında, onaylanan sözleşme sürümü ve tutarlarla birlikte kaydeder.

Rollout: this step is purely additive and safe to apply while the previous frontend is live.
The enforcement in pay_deposit is a separate migration
(20261120130000_require_sale_consent_for_payment.sql), applied only after the frontend that calls
record_sale_consent is live; otherwise test payments from the old frontend would be refused.

1. New table `public.sale_consents`
   - one row per appointment (a repeated confirmation updates the row)
   - `sale_terms_version`: version of the Mesafeli Hizmet Satış Sözleşmesi the customer accepted
   - snapshot of business name, service, start time, total price, deposit and cancellation window
   - `payment_provider`: the licensed provider named in the confirmation (PAYTR)
   - no card data is ever stored here (PayTR md. 5.19)
2. RLS: the customer, the owner of the business and admins can read; no direct writes.
   Rows are written only by `record_sale_consent`.
3. `public.record_sale_consent(p_appointment, p_version)` (the booking's customer only,
   pending_payment only).
4. Retention: rows are kept with the appointment (10 years, same as payment records).
*/

CREATE TABLE IF NOT EXISTS public.sale_consents (
  appointment_id uuid PRIMARY KEY REFERENCES public.appointments(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.profiles(id),
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  sale_terms_version text NOT NULL CHECK (sale_terms_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  payment_provider text NOT NULL DEFAULT 'PAYTR',
  business_name text NOT NULL,
  service_name text NOT NULL,
  starts_at timestamptz NOT NULL,
  total_price numeric(10,2) NOT NULL,
  deposit_amount numeric(10,2) NOT NULL,
  cancellation_hours integer,
  payment_mode text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sale_consents_customer_idx ON public.sale_consents(customer_id);
CREATE INDEX IF NOT EXISTS sale_consents_business_idx ON public.sale_consents(business_id, accepted_at);

ALTER TABLE public.sale_consents ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.sale_consents FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.sale_consents TO authenticated;

DROP POLICY IF EXISTS "Parties read sale consents" ON public.sale_consents;
CREATE POLICY "Parties read sale consents" ON public.sale_consents
  FOR SELECT TO authenticated
  USING (
    (customer_id = (SELECT auth.uid()) OR private.owns_business(business_id) OR private.is_admin())
    AND ((auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE)
  );

CREATE OR REPLACE FUNCTION private.record_sale_consent(p_appointment uuid, p_version text)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_settings platform_settings%ROWTYPE;
  v_appt appointments%ROWTYPE;
  v_business businesses%ROWTYPE;
  v_at timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'VEYRA_AUTH_REQUIRED'; END IF;
  PERFORM private.assert_active_member();
  IF p_version IS NULL OR p_version !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'VEYRA_INVALID_INPUT'; END IF;

  SELECT * INTO v_settings FROM platform_settings WHERE id = 1;
  SELECT * INTO v_appt FROM appointments WHERE id = p_appointment AND customer_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;
  IF v_appt.status <> 'pending_payment' THEN RAISE EXCEPTION 'VEYRA_INVALID_STATE'; END IF;
  SELECT * INTO v_business FROM businesses WHERE id = v_appt.business_id;

  INSERT INTO sale_consents AS s (
    appointment_id, customer_id, business_id, sale_terms_version, payment_provider,
    business_name, service_name, starts_at, total_price, deposit_amount, cancellation_hours,
    payment_mode, accepted_at
  ) VALUES (
    v_appt.id, v_uid, v_appt.business_id, p_version, 'PAYTR',
    coalesce(v_business.name, ''), v_appt.service_name, v_appt.starts_at, v_appt.total_price,
    v_appt.deposit_amount, coalesce(v_appt.cancellation_hours, v_business.cancellation_hours),
    v_settings.payment_mode, now()
  )
  ON CONFLICT (appointment_id) DO UPDATE SET
    sale_terms_version = EXCLUDED.sale_terms_version,
    total_price = EXCLUDED.total_price,
    deposit_amount = EXCLUDED.deposit_amount,
    cancellation_hours = EXCLUDED.cancellation_hours,
    payment_mode = EXCLUDED.payment_mode,
    accepted_at = EXCLUDED.accepted_at
  RETURNING s.accepted_at INTO v_at;

  RETURN v_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.record_sale_consent(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.record_sale_consent(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_sale_consent(p_appointment uuid, p_version text) RETURNS timestamptz
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.record_sale_consent(p_appointment, p_version); $$;

REVOKE EXECUTE ON FUNCTION public.record_sale_consent(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_sale_consent(uuid, text) TO authenticated;
