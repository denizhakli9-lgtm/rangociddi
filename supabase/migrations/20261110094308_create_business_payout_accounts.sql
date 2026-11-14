/*
# Business payout accounts (IBAN)

Stores the bank account each business is paid to. Kept out of the public
`businesses` table so customers, other businesses and visitors can never read it.

1. New Tables
- `business_payout_accounts` (one row per business)
  - `business_id` (uuid, PK, FK businesses)
  - `iban` (text, normalized TR IBAN, 26 chars)
  - `account_holder` (text), `bank_name` (text)
  - `status` (pending | verified | rejected), `rejection_reason` (text)
  - `verified_by`, `verified_at`, `updated_by`, `created_at`, `updated_at`
- `payout_account_changes` (audit log; stores only a masked IBAN)
  - `id`, `business_id`, `actor_id`, `action` (saved | verified | rejected), `iban_masked`, `note`, `created_at`

2. Security
- RLS enabled on both tables. SELECT only for the business owner or an admin (not anonymous sessions).
- No direct INSERT/UPDATE/DELETE for any client role; writes only through functions.
- `save_payout_account`: owner only; validates TR IBAN incl. mod-97 checksum; every save resets status to pending.
- `review_payout_account`: admin only; sets verified or rejected (reason required for reject).
- Functions live in `private` with thin public wrappers; EXECUTE revoked from PUBLIC/anon.

3. Notes
1. Any IBAN change requires admin re-approval.
2. Admins are notified on save; the owner is notified on review.
*/

CREATE TABLE IF NOT EXISTS public.business_payout_accounts (
  business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  iban text NOT NULL CHECK (iban ~ '^TR[0-9]{24}$'),
  account_holder text NOT NULL CHECK (char_length(account_holder) BETWEEN 3 AND 120),
  bank_name text NOT NULL DEFAULT '' CHECK (char_length(bank_name) <= 80),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','rejected')),
  rejection_reason text,
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at timestamptz,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payout_account_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('saved','verified','rejected')),
  iban_masked text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payout_account_changes_business_idx ON public.payout_account_changes (business_id, created_at DESC);

ALTER TABLE public.business_payout_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_account_changes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.business_payout_accounts FROM anon, authenticated;
REVOKE ALL ON public.payout_account_changes FROM anon, authenticated;
GRANT SELECT ON public.business_payout_accounts TO authenticated;
GRANT SELECT ON public.payout_account_changes TO authenticated;

DROP POLICY IF EXISTS "payout_select_owner_or_admin" ON public.business_payout_accounts;
CREATE POLICY "payout_select_owner_or_admin" ON public.business_payout_accounts FOR SELECT
TO authenticated
USING ((private.owns_business(business_id) OR private.is_admin()) AND ((auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE));

DROP POLICY IF EXISTS "payout_changes_select_owner_or_admin" ON public.payout_account_changes;
CREATE POLICY "payout_changes_select_owner_or_admin" ON public.payout_account_changes FOR SELECT
TO authenticated
USING ((private.owns_business(business_id) OR private.is_admin()) AND ((auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE));

CREATE OR REPLACE FUNCTION private.valid_tr_iban(p_iban text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = private, public
AS $$
DECLARE
  v_rearranged text;
  v_digits text := '';
  v_ch text;
  v_rem integer := 0;
  i integer;
BEGIN
  IF p_iban IS NULL OR p_iban !~ '^TR[0-9]{24}$' THEN RETURN false; END IF;
  v_rearranged := substr(p_iban, 5) || substr(p_iban, 1, 4);
  FOR i IN 1..length(v_rearranged) LOOP
    v_ch := substr(v_rearranged, i, 1);
    IF v_ch ~ '[A-Z]' THEN
      v_digits := v_digits || (ascii(v_ch) - 55)::text;
    ELSE
      v_digits := v_digits || v_ch;
    END IF;
  END LOOP;
  FOR i IN 1..length(v_digits) LOOP
    v_rem := (v_rem * 10 + substr(v_digits, i, 1)::integer) % 97;
  END LOOP;
  RETURN v_rem = 1;
END;
$$;

CREATE OR REPLACE FUNCTION private.mask_iban(p_iban text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = private, public
AS $$ SELECT 'TR** **** **** **** **** **' || right(p_iban, 2) || ' ' || '(' || right(p_iban, 4) || ')'; $$;

CREATE OR REPLACE FUNCTION private.save_payout_account(p_business uuid, p_iban text, p_holder text, p_bank text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v_iban text := upper(regexp_replace(coalesce(p_iban, ''), '\s', '', 'g'));
  v_holder text := btrim(coalesce(p_holder, ''));
  v_bank text := btrim(coalesce(p_bank, ''));
  v_name text;
  v_admin uuid;
BEGIN
  IF auth.uid() IS NULL OR (auth.jwt() ->> 'is_anonymous')::boolean IS TRUE THEN RAISE EXCEPTION 'VEYRA_FORBIDDEN'; END IF;
  IF NOT owns_business(p_business) THEN RAISE EXCEPTION 'VEYRA_FORBIDDEN'; END IF;
  IF NOT valid_tr_iban(v_iban) THEN RAISE EXCEPTION 'VEYRA_INVALID_IBAN'; END IF;
  IF char_length(v_holder) < 3 OR char_length(v_holder) > 120 OR char_length(v_bank) > 80 THEN
    RAISE EXCEPTION 'VEYRA_INVALID_INPUT';
  END IF;

  INSERT INTO business_payout_accounts (business_id, iban, account_holder, bank_name, status, rejection_reason, verified_by, verified_at, updated_by, updated_at)
  VALUES (p_business, v_iban, v_holder, v_bank, 'pending', NULL, NULL, NULL, auth.uid(), now())
  ON CONFLICT (business_id) DO UPDATE SET
    iban = EXCLUDED.iban, account_holder = EXCLUDED.account_holder, bank_name = EXCLUDED.bank_name,
    status = 'pending', rejection_reason = NULL, verified_by = NULL, verified_at = NULL,
    updated_by = auth.uid(), updated_at = now();

  INSERT INTO payout_account_changes (business_id, actor_id, action, iban_masked)
  VALUES (p_business, auth.uid(), 'saved', mask_iban(v_iban));

  SELECT name INTO v_name FROM businesses WHERE id = p_business;
  FOR v_admin IN SELECT id FROM profiles WHERE role = 'admin' AND NOT is_suspended LOOP
    PERFORM notify(v_admin, 'payout_account', 'IBAN onay bekliyor',
      coalesce(v_name, 'Bir işletme') || ' banka hesabı bilgilerini güncelledi.', '/yonetim/isletmeler');
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION private.review_payout_account(p_business uuid, p_approve boolean, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v_acc business_payout_accounts%ROWTYPE;
  v_owner uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'VEYRA_FORBIDDEN'; END IF;
  IF p_approve IS NULL THEN RAISE EXCEPTION 'VEYRA_INVALID_INPUT'; END IF;
  IF NOT p_approve AND (v_reason IS NULL OR char_length(v_reason) > 300) THEN RAISE EXCEPTION 'VEYRA_INVALID_INPUT'; END IF;

  SELECT * INTO v_acc FROM business_payout_accounts WHERE business_id = p_business FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;

  UPDATE business_payout_accounts SET
    status = CASE WHEN p_approve THEN 'verified' ELSE 'rejected' END,
    rejection_reason = CASE WHEN p_approve THEN NULL ELSE v_reason END,
    verified_by = CASE WHEN p_approve THEN auth.uid() ELSE NULL END,
    verified_at = CASE WHEN p_approve THEN now() ELSE NULL END,
    updated_at = now()
  WHERE business_id = p_business;

  INSERT INTO payout_account_changes (business_id, actor_id, action, iban_masked, note)
  VALUES (p_business, auth.uid(), CASE WHEN p_approve THEN 'verified' ELSE 'rejected' END, mask_iban(v_acc.iban), v_reason);

  SELECT owner_id INTO v_owner FROM businesses WHERE id = p_business;
  PERFORM notify(v_owner, 'payout_account',
    CASE WHEN p_approve THEN 'IBAN bilginiz onaylandı' ELSE 'IBAN bilginiz reddedildi' END,
    CASE WHEN p_approve THEN 'Ödemeleriniz bu hesaba gönderilecek.' ELSE 'Sebep: ' || v_reason END,
    '/isletme/profil');
END;
$$;

CREATE OR REPLACE FUNCTION public.save_payout_account(p_business uuid, p_iban text, p_holder text, p_bank text)
RETURNS void LANGUAGE sql SET search_path = ''
AS $$ SELECT private.save_payout_account(p_business, p_iban, p_holder, p_bank); $$;

CREATE OR REPLACE FUNCTION public.review_payout_account(p_business uuid, p_approve boolean, p_reason text)
RETURNS void LANGUAGE sql SET search_path = ''
AS $$ SELECT private.review_payout_account(p_business, p_approve, p_reason); $$;

REVOKE EXECUTE ON FUNCTION private.valid_tr_iban(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.mask_iban(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.save_payout_account(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION private.review_payout_account(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.save_payout_account(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.review_payout_account(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.save_payout_account(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.review_payout_account(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_payout_account(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_payout_account(uuid, boolean, text) TO authenticated;