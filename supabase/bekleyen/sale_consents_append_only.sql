/*
# Satış onayı – 1b: her onay ayrı kayıt + gösterilen onay cümlesi (PayTR Çerçeve Ödeme Hizmeti Sözleşmesi md. 7.2)

1. adım (20261120155246_record_sale_consent) canlıda; bu dosya onu bağımsız incelemenin bulgularına göre
günceller. Canlıdaki ön yüzle (3 parametreli çağrı) ve yeni ön yüzle (p_wording) uyumludur; ön yüzden ÖNCE
uygulanmalıdır: yeni ön yüz p_wording gönderir ve bu güncelleme olmadan satış onayı (dolayısıyla ödeme) kaydedilemez.

1. `sale_consents` yalnızca ekleme yapılan bir tablo olur: her onay ayrı satırdır (yeni `id` birincil anahtar).
   Önceden aynı randevu için yeniden onay (tekrar deneme, PayTR sayfasını yeniden açma) eski kaydın üzerine
   yazıyordu; kartı çekilen PayTR siparişinden önceki onay kaybolabiliyordu.
2. `consent_wording`: sayfanın gösterdiği onay cümlesi ('test' = SALE_CONSENT_TEXT_TEST, 'live' = SALE_CONSENT_TEXT).
   Platform test modunda değilse 'test' cümlesi onaylanamaz. Mevcut satırlar payment_mode'dan doldurulur.
3. `record_sale_consent(p_appointment, p_version, p_locale, p_wording DEFAULT NULL)`: 3 parametreli eski tanım
   kaldırılır (aynı adla iki tanım PostgREST'te belirsizlik yaratırdı); eski çağrılar varsayılanla çalışır.
*/

ALTER TABLE public.sale_consents DROP CONSTRAINT IF EXISTS sale_consents_pkey;
ALTER TABLE public.sale_consents ADD COLUMN IF NOT EXISTS id bigint GENERATED ALWAYS AS IDENTITY;
ALTER TABLE public.sale_consents ADD PRIMARY KEY (id);
CREATE INDEX IF NOT EXISTS sale_consents_appointment_idx ON public.sale_consents(appointment_id, accepted_at);

ALTER TABLE public.sale_consents ADD COLUMN IF NOT EXISTS consent_wording text;
UPDATE public.sale_consents SET consent_wording = CASE WHEN payment_mode = 'test' THEN 'test' ELSE 'live' END
WHERE consent_wording IS NULL;
ALTER TABLE public.sale_consents ALTER COLUMN consent_wording SET NOT NULL;
ALTER TABLE public.sale_consents DROP CONSTRAINT IF EXISTS sale_consents_consent_wording_check;
ALTER TABLE public.sale_consents ADD CONSTRAINT sale_consents_consent_wording_check CHECK (consent_wording IN ('test', 'live'));

DROP FUNCTION IF EXISTS public.record_sale_consent(uuid, text, text);
DROP FUNCTION IF EXISTS private.record_sale_consent(uuid, text, text);

CREATE OR REPLACE FUNCTION private.record_sale_consent(p_appointment uuid, p_version text, p_locale text DEFAULT 'tr', p_wording text DEFAULT NULL)
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
  v_wording text;
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
  -- The sentence the page showed. Without it (older clients) it follows the platform mode.
  v_wording := coalesce(p_wording, CASE WHEN v_settings.payment_mode = 'test' THEN 'test' ELSE 'live' END);
  IF v_wording NOT IN ('test', 'live') THEN RAISE EXCEPTION 'VEYRA_INVALID_INPUT'; END IF;
  -- "Nothing is charged" may only be confirmed while nothing can be charged; the page reloads and asks again.
  IF v_wording = 'test' AND v_settings.payment_mode <> 'test' THEN RAISE EXCEPTION 'VEYRA_INVALID_STATE'; END IF;

  SELECT * INTO v_appt FROM appointments WHERE id = p_appointment AND customer_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;
  IF v_appt.status <> 'pending_payment' THEN RAISE EXCEPTION 'VEYRA_INVALID_STATE'; END IF;
  SELECT * INTO v_business FROM businesses WHERE id = v_appt.business_id;

  INSERT INTO sale_consents (
    appointment_id, customer_id, business_id, sale_terms_version, consent_locale, consent_wording, payment_provider,
    payment_mode, business_name, business_address, service_name, employee_name, starts_at, duration_minutes,
    total_price, deposit_amount, pay_at_business, cancellation_hours, accepted_at
  ) VALUES (
    v_appt.id, v_uid, v_appt.business_id, p_version, p_locale, v_wording, 'PAYTR',
    v_settings.payment_mode, coalesce(v_business.name, ''),
    concat_ws(', ', nullif(v_business.address, ''), nullif(v_business.district, ''), nullif(v_business.city, '')),
    v_appt.service_name, coalesce(v_appt.employee_name, ''), v_appt.starts_at, v_appt.duration_minutes,
    v_appt.total_price, v_appt.deposit_amount,
    -- What the payment page shows as "İşletmede ödenecek": the full price with the test wording, the rest otherwise.
    CASE WHEN v_wording = 'test' THEN v_appt.total_price ELSE v_appt.remaining_amount END,
    coalesce(v_appt.cancellation_hours, v_business.cancellation_hours), now()
  )
  RETURNING accepted_at INTO v_at;

  RETURN v_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.record_sale_consent(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.record_sale_consent(uuid, text, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_sale_consent(p_appointment uuid, p_version text, p_locale text DEFAULT 'tr', p_wording text DEFAULT NULL)
RETURNS timestamptz
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.record_sale_consent(p_appointment, p_version, p_locale, p_wording); $$;

REVOKE EXECUTE ON FUNCTION public.record_sale_consent(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_sale_consent(uuid, text, text, text) TO authenticated;
