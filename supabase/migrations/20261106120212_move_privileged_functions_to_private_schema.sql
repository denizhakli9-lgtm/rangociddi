/*
# Move privileged functions out of the public API

1. Summary
   All SECURITY DEFINER functions that were reachable through the public Data API
   (/rest/v1/rpc/...) are moved into a new, non-exposed `private` schema. Their
   code, OIDs and permission checks are unchanged, so every RLS policy that uses
   them (is_admin, owns_business, has_role, is_customer_of_my_business) keeps working.

2. New schema
   - `private`: not exposed by the Data API. USAGE granted to anon and authenticated
     only so that policies and invoker wrappers can reference its functions.

3. Public wrappers (SECURITY INVOKER)
   The app's RPCs keep their exact names, arguments and defaults in `public`.
   Each wrapper is a thin SECURITY INVOKER pass-through to the private function, so
   the privileged code itself is no longer an exposed API object.
   - Helper checks (is_admin, owns_business, has_role, is_customer_of_my_business)
     get NO public wrapper: they are no longer callable over the API at all.

4. Grants
   - Wrappers: EXECUTE revoked from PUBLIC/anon; granted to authenticated and service_role.
   - get_available_slots wrapper additionally granted to anon (guests browse free times).
   - Private functions keep their previous EXECUTE grants (moved with the function).

5. Notes
   1. Moved functions get search_path = private, public so internal calls resolve to the
      private versions and tables resolve in public.
   2. Safe to re-run: each move only happens if the function is still in public as SECURITY DEFINER.
*/

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO anon, authenticated, service_role;

DO $$
DECLARE
  sig text;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'is_admin()',
    'owns_business(uuid)',
    'has_role(text)',
    'is_customer_of_my_business(uuid)',
    'admin_exists()',
    'claim_first_admin()',
    'admin_resolve_refund(uuid, boolean, text)',
    'admin_set_business_status(uuid, text, boolean, boolean)',
    'admin_set_commission_status(uuid, text)',
    'admin_set_review_hidden(uuid, boolean)',
    'admin_set_user_suspended(uuid, boolean)',
    'admin_stats()',
    'admin_update_settings(numeric, integer, integer, integer, integer, integer)',
    'business_update_appointment(uuid, text)',
    'cancel_appointment(uuid, text)',
    'create_appointment(uuid, uuid, timestamptz, text)',
    'generate_my_reminders()',
    'get_available_slots(uuid, uuid, date, uuid)',
    'pay_deposit(uuid, text, text)',
    'reply_review(uuid, text)',
    'reschedule_appointment(uuid, uuid, timestamptz)',
    'submit_review(uuid, integer, text)'
  ] LOOP
    IF to_regprocedure('public.' || sig) IS NOT NULL
       AND (SELECT prosecdef FROM pg_proc WHERE oid = to_regprocedure('public.' || sig)) THEN
      EXECUTE format('ALTER FUNCTION public.%s SET SCHEMA private', sig);
    END IF;
    IF to_regprocedure('private.' || sig) IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION private.%s SET search_path = private, public', sig);
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.admin_exists() RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.admin_exists(); $$;

CREATE OR REPLACE FUNCTION public.claim_first_admin() RETURNS boolean
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.claim_first_admin(); $$;

CREATE OR REPLACE FUNCTION public.admin_resolve_refund(p_request uuid, p_approve boolean, p_note text) RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.admin_resolve_refund(p_request, p_approve, p_note); $$;

CREATE OR REPLACE FUNCTION public.admin_set_business_status(p_business uuid, p_status text, p_verified boolean, p_featured boolean) RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.admin_set_business_status(p_business, p_status, p_verified, p_featured); $$;

CREATE OR REPLACE FUNCTION public.admin_set_commission_status(p_record uuid, p_status text) RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.admin_set_commission_status(p_record, p_status); $$;

CREATE OR REPLACE FUNCTION public.admin_set_review_hidden(p_review uuid, p_hidden boolean) RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.admin_set_review_hidden(p_review, p_hidden); $$;

CREATE OR REPLACE FUNCTION public.admin_set_user_suspended(p_user uuid, p_suspended boolean) RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.admin_set_user_suspended(p_user, p_suspended); $$;

CREATE OR REPLACE FUNCTION public.admin_stats() RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.admin_stats(); $$;

CREATE OR REPLACE FUNCTION public.admin_update_settings(p_commission_rate numeric, p_pending_minutes integer, p_slot_interval integer, p_min_lead integer, p_max_days integer, p_max_reschedules integer) RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.admin_update_settings(p_commission_rate, p_pending_minutes, p_slot_interval, p_min_lead, p_max_days, p_max_reschedules); $$;

CREATE OR REPLACE FUNCTION public.business_update_appointment(p_appointment uuid, p_action text) RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.business_update_appointment(p_appointment, p_action); $$;

CREATE OR REPLACE FUNCTION public.cancel_appointment(p_appointment uuid, p_reason text DEFAULT '') RETURNS text
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.cancel_appointment(p_appointment, p_reason); $$;

CREATE OR REPLACE FUNCTION public.create_appointment(p_service uuid, p_employee uuid, p_starts_at timestamptz, p_note text DEFAULT '') RETURNS uuid
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.create_appointment(p_service, p_employee, p_starts_at, p_note); $$;

CREATE OR REPLACE FUNCTION public.generate_my_reminders() RETURNS integer
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.generate_my_reminders(); $$;

CREATE OR REPLACE FUNCTION public.get_available_slots(p_service uuid, p_employee uuid, p_date date, p_exclude uuid DEFAULT NULL)
RETURNS TABLE(slot_start timestamptz, slot_employee_id uuid)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$ SELECT s.slot_start, s.slot_employee_id FROM private.get_available_slots(p_service, p_employee, p_date, p_exclude) s; $$;

CREATE OR REPLACE FUNCTION public.pay_deposit(p_appointment uuid, p_card_last4 text, p_card_brand text) RETURNS text
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.pay_deposit(p_appointment, p_card_last4, p_card_brand); $$;

CREATE OR REPLACE FUNCTION public.reply_review(p_review uuid, p_reply text) RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.reply_review(p_review, p_reply); $$;

CREATE OR REPLACE FUNCTION public.reschedule_appointment(p_appointment uuid, p_employee uuid, p_starts_at timestamptz) RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.reschedule_appointment(p_appointment, p_employee, p_starts_at); $$;

CREATE OR REPLACE FUNCTION public.submit_review(p_appointment uuid, p_rating integer, p_comment text) RETURNS uuid
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.submit_review(p_appointment, p_rating, p_comment); $$;

DO $$
DECLARE
  sig text;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'admin_exists()',
    'claim_first_admin()',
    'admin_resolve_refund(uuid, boolean, text)',
    'admin_set_business_status(uuid, text, boolean, boolean)',
    'admin_set_commission_status(uuid, text)',
    'admin_set_review_hidden(uuid, boolean)',
    'admin_set_user_suspended(uuid, boolean)',
    'admin_stats()',
    'admin_update_settings(numeric, integer, integer, integer, integer, integer)',
    'business_update_appointment(uuid, text)',
    'cancel_appointment(uuid, text)',
    'create_appointment(uuid, uuid, timestamptz, text)',
    'generate_my_reminders()',
    'get_available_slots(uuid, uuid, date, uuid)',
    'pay_deposit(uuid, text, text)',
    'reply_review(uuid, text)',
    'reschedule_appointment(uuid, uuid, timestamptz)',
    'submit_review(uuid, integer, text)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon', sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', sig);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.get_available_slots(uuid, uuid, date, uuid) TO anon;
GRANT EXECUTE ON FUNCTION private.get_available_slots(uuid, uuid, date, uuid) TO anon;
