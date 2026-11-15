/*
# Restore the explicit anonymous-session check on policies recreated by the hardening migration

1. Purpose
- 20261114200000_rango_security_hardening recreated these policies. They already reject anonymous
  sessions through private.is_active_member() / private.owns_business(), but the Supabase security
  advisor (lint 0012) only recognises the check when it is written in the policy itself.
- Same check as 20261106145638, in the (SELECT auth.jwt()) form of 20261110100030 so it is
  evaluated once per statement, not once per row (performance lint 0003).

2. Modified policies (USING clause only; WITH CHECK unchanged)
- public.businesses: businesses_update_owner
- storage.objects: business_media_read_owner, business_media_update_owner, business_media_delete_owner

3. Notes
- Idempotent: a policy that already has the check is left as it is; a check written without
  (SELECT ...) is wrapped.
- Run it again after re-running 20261114200000 (that file recreates the policies without the check).
*/

DO $$
DECLARE
  r record;
  v_qual text;
  targets text[] := ARRAY[
    'public.businesses.businesses_update_owner',
    'storage.objects.business_media_read_owner',
    'storage.objects.business_media_update_owner',
    'storage.objects.business_media_delete_owner'
  ];
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual
    FROM pg_policies
    WHERE schemaname || '.' || tablename || '.' || policyname = ANY (targets)
      AND qual IS NOT NULL
  LOOP
    IF r.qual NOT ILIKE '%is_anonymous%' THEN
      v_qual := '(' || r.qual || ') AND ((((SELECT auth.jwt()) ->> ''is_anonymous''))::boolean IS NOT TRUE)';
    ELSE
      v_qual := replace(r.qual, '(auth.jwt() ->> ''is_anonymous''::text)', '(( SELECT auth.jwt() AS jwt) ->> ''is_anonymous''::text)');
    END IF;
    IF v_qual IS DISTINCT FROM r.qual THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s)', r.policyname, r.schemaname, r.tablename, v_qual);
    END IF;
  END LOOP;
END $$;
