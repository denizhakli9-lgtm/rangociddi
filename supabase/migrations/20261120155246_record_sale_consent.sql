/*
# Satış onayı kaydı – 1. adım (PayTR Çerçeve Ödeme Hizmeti Sözleşmesi md. 6.4, 7.2, 7.3)

PayTR sözleşmesine göre ödemenin müşterinin onayıyla yapıldığını ispat yükü İŞYERİ'ndedir (md. 7.2)
ve bu kayıtlar işlem tarihinden itibaren 10 yıl saklanıp talep halinde 2 iş günü içinde
sunulmalıdır (md. 6.4, 7.3). Bu güncelleme, müşterinin ödeme ekranında verdiği satış onayını
sunucu tarafında; onaylanan sözleşme sürümü, dili ve onay anındaki ön bilgilendirme bilgileriyle
birlikte kaydeder.

Rollout: this step is purely additive and safe to apply while the previous frontend is live.
The enforcement (pay_deposit and PayTR orders refuse a payment without a consent) is a separate
step (supabase/bekleyen/require_sale_consent_for_payment.sql), applied only after the frontend
that calls record_sale_consent is live; otherwise payments from the old frontend would be refused.

1. New table `public.sale_consents`
   - one row per appointment; a repeated confirmation before payment replaces the whole snapshot,
     so a row always describes a single confirmation
   - `sale_terms_version`: version of the texts the customer accepted together (Mesafeli Hizmet Satış
     Sözleşmesi, İptal ve İade Koşulları, ön bilgilendirme, onay cümlesi; LEGAL_VERSIONS.sale)
   - `consent_locale`: language of the confirmation sentence shown ('tr' or 'en')
   - `payment_mode`: 'test' means the test wording was shown (nothing charged), otherwise the real one
   - snapshot of the pre-contract information: business name and address, service, specialist,
     start time, duration, total price, deposit, amount payable at the business, cancellation window
   - no card data is ever stored here (PayTR md. 5.19)
2. RLS: the customer, the owner of the business and admins can read. No role can write directly
   (service_role included); rows are written only by `record_sale_consent`.
3. `public.record_sale_consent(p_appointment, p_version, p_locale)` (the booking's customer only,
   pending_payment only). The version must be a real publication date in `YYYY-MM-DD` (optionally
   `.2`–`.9` for a second change on the same day), not before the first sales agreement (2026-11-20)
   and not more than 31 days ahead; otherwise VEYRA_TERMS_VERSION.
4. Retention: rows are kept with the appointment (10 years, same as payment records).
*/

CREATE TABLE IF NOT EXISTS public.sale_consents (
  appointment_id uuid PRIMARY KEY REFERENCES public.appointments(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.profiles(id),
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  sale_terms_version text NOT NULL CHECK (sale_terms_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}(\.[2-9])?$'),
  consent_locale text NOT NULL DEFAULT 'tr' CHECK (consent_locale IN ('tr', 'en')),
  payment_provider text NOT NULL DEFAULT 'PAYTR',
  payment_mode text NOT NULL,
  business_name text NOT NULL,
  business_address text NOT NULL DEFAULT '',
  service_name text NOT NULL,
  employee_name text NOT NULL DEFAULT '',
  starts_at timestamptz NOT NULL,
  duration_minutes integer,
  total_price numeric(10,2) NOT NULL,
  deposit_amount numeric(10,2) NOT NULL,
  pay_at_business numeric(10,2),
  cancellation_hours integer,
  accepted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sale_consents_customer_idx ON public.sale_consents(customer_id);
CREATE INDEX IF NOT EXISTS sale_consents_business_idx ON public.sale_consents(business_id, accepted_at);

ALTER TABLE public.sale_consents ENABLE ROW LEVEL SECURITY;

-- Evidence table: nobody writes to it directly, not even with the service key.
REVOKE ALL ON public.sale_consents FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.sale_consents TO authenticated, service_role;

DROP POLICY IF EXISTS "Parties read sale consents" ON public.sale_consents;
CREATE POLICY "Parties read sale consents" ON public.sale_consents
  FOR SELECT TO authenticated
  USING (
    ((((SELECT auth.jwt()) ->> 'is_anonymous'))::boolean IS NOT TRUE)
    AND (customer_id = (SELECT auth.uid()) OR (SELECT private.is_admin()) OR private.owns_business(business_id))
  );

CREATE OR REPLACE FUNCTION private.record_sale_consent(p_appointment uuid, p_version text, p_locale text DEFAULT 'tr')
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
  v_version_date date;
  v_at timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'VEYRA_AUTH_REQUIRED'; END IF;
  PERFORM private.assert_active_member();

  -- The version is the publication date of the texts shown (src/lib/legal.ts LEGAL_VERSIONS.sale).
  IF p_version IS NULL OR p_version !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}(\.[2-9])?$' THEN RAISE EXCEPTION 'VEYRA_TERMS_VERSION'; END IF;
  BEGIN
    v_version_date := left(p_version, 10)::date;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'VEYRA_TERMS_VERSION';
  END;
  IF v_version_date < date '2026-11-20' OR v_version_date > (now() AT TIME ZONE 'Europe/Istanbul')::date + 31 THEN
    RAISE EXCEPTION 'VEYRA_TERMS_VERSION';
  END IF;
  IF p_locale IS NULL OR p_locale NOT IN ('tr', 'en') THEN RAISE EXCEPTION 'VEYRA_INVALID_INPUT'; END IF;

  SELECT * INTO v_settings FROM platform_settings WHERE id = 1;
  SELECT * INTO v_appt FROM appointments WHERE id = p_appointment AND customer_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;
  IF v_appt.status <> 'pending_payment' THEN RAISE EXCEPTION 'VEYRA_INVALID_STATE'; END IF;
  SELECT * INTO v_business FROM businesses WHERE id = v_appt.business_id;

  INSERT INTO sale_consents AS s (
    appointment_id, customer_id, business_id, sale_terms_version, consent_locale, payment_provider, payment_mode,
    business_name, business_address, service_name, employee_name, starts_at, duration_minutes,
    total_price, deposit_amount, pay_at_business, cancellation_hours, accepted_at
  ) VALUES (
    v_appt.id, v_uid, v_appt.business_id, p_version, p_locale, 'PAYTR', v_settings.payment_mode,
    coalesce(v_business.name, ''),
    concat_ws(', ', nullif(v_business.address, ''), nullif(v_business.district, ''), nullif(v_business.city, '')),
    v_appt.service_name, coalesce(v_appt.employee_name, ''), v_appt.starts_at, v_appt.duration_minutes,
    v_appt.total_price, v_appt.deposit_amount,
    -- What the payment page shows as "İşletmede ödenecek": the full price in test mode, the rest otherwise.
    CASE WHEN v_settings.payment_mode = 'test' THEN v_appt.total_price ELSE v_appt.remaining_amount END,
    coalesce(v_appt.cancellation_hours, v_business.cancellation_hours), now()
  )
  ON CONFLICT (appointment_id) DO UPDATE SET
    sale_terms_version = EXCLUDED.sale_terms_version,
    consent_locale = EXCLUDED.consent_locale,
    payment_provider = EXCLUDED.payment_provider,
    payment_mode = EXCLUDED.payment_mode,
    business_name = EXCLUDED.business_name,
    business_address = EXCLUDED.business_address,
    service_name = EXCLUDED.service_name,
    employee_name = EXCLUDED.employee_name,
    starts_at = EXCLUDED.starts_at,
    duration_minutes = EXCLUDED.duration_minutes,
    total_price = EXCLUDED.total_price,
    deposit_amount = EXCLUDED.deposit_amount,
    pay_at_business = EXCLUDED.pay_at_business,
    cancellation_hours = EXCLUDED.cancellation_hours,
    accepted_at = EXCLUDED.accepted_at
  RETURNING s.accepted_at INTO v_at;

  RETURN v_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.record_sale_consent(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.record_sale_consent(uuid, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_sale_consent(p_appointment uuid, p_version text, p_locale text DEFAULT 'tr')
RETURNS timestamptz
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.record_sale_consent(p_appointment, p_version, p_locale); $$;

REVOKE EXECUTE ON FUNCTION public.record_sale_consent(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_sale_consent(uuid, text, text) TO authenticated;
