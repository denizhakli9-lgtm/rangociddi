/*
# Optimize access rules and indexes for higher traffic

1. Access rule evaluation (no behavior change)
   - Every row level security policy in the public schema that calls auth.uid(), auth.jwt(),
     auth.role(), private.is_admin() or private.has_role('...') is rewritten so the call is
     wrapped in a scalar sub-select: (select auth.uid()).
   - Postgres then evaluates these once per query instead of once per row.
   - The logical conditions, roles and commands of every policy stay exactly the same.
   - The rewrite is idempotent: already wrapped calls are unwrapped first, then wrapped once.

2. New indexes (covering foreign keys and hot paths)
   - appointments(service_id), appointments(employee_id, starts_at)
   - business_payout_accounts(updated_by), business_payout_accounts(verified_by)
   - favorites(business_id)
   - payout_account_changes(actor_id)
   - refund_requests(appointment_id, business_id, customer_id, resolved_by)
   - reviews(customer_id), reviews(employee_id)
   - time_slots(employee_id)
   - notifications(user_id) partial index for unread rows (badge counter)
   - businesses(status, city, district) for discovery filtering

3. Security
   - No grants, policies' predicates or roles are loosened. Nothing is dropped.
*/

DO $$
DECLARE
  r record;
  new_qual text;
  new_check text;
  stmt text;
  unwrap_re constant text := '\( SELECT ((auth\.(uid|jwt|role)|private\.is_admin)\(\)|private\.has_role\(''[a-z_]+''::text\)) AS [a-z_]+\)';
  wrap_re constant text := '(auth\.(uid|jwt|role)\(\)|private\.is_admin\(\)|private\.has_role\(''[a-z_]+''::text\))';
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    new_qual := r.qual;
    new_check := r.with_check;
    IF new_qual IS NOT NULL THEN
      new_qual := regexp_replace(new_qual, unwrap_re, '\1', 'g');
      new_qual := regexp_replace(new_qual, wrap_re, '(select \1)', 'g');
    END IF;
    IF new_check IS NOT NULL THEN
      new_check := regexp_replace(new_check, unwrap_re, '\1', 'g');
      new_check := regexp_replace(new_check, wrap_re, '(select \1)', 'g');
    END IF;
    IF new_qual IS DISTINCT FROM r.qual OR new_check IS DISTINCT FROM r.with_check THEN
      stmt := format('ALTER POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
      IF new_qual IS NOT NULL THEN
        stmt := stmt || ' USING (' || new_qual || ')';
      END IF;
      IF new_check IS NOT NULL THEN
        stmt := stmt || ' WITH CHECK (' || new_check || ')';
      END IF;
      EXECUTE stmt;
    END IF;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS appointments_service_idx ON public.appointments (service_id);
CREATE INDEX IF NOT EXISTS appointments_employee_idx ON public.appointments (employee_id, starts_at);
CREATE INDEX IF NOT EXISTS payout_accounts_updated_by_idx ON public.business_payout_accounts (updated_by);
CREATE INDEX IF NOT EXISTS payout_accounts_verified_by_idx ON public.business_payout_accounts (verified_by);
CREATE INDEX IF NOT EXISTS favorites_business_idx ON public.favorites (business_id);
CREATE INDEX IF NOT EXISTS payout_changes_actor_idx ON public.payout_account_changes (actor_id);
CREATE INDEX IF NOT EXISTS refund_requests_appointment_idx ON public.refund_requests (appointment_id);
CREATE INDEX IF NOT EXISTS refund_requests_business_idx ON public.refund_requests (business_id);
CREATE INDEX IF NOT EXISTS refund_requests_customer_idx ON public.refund_requests (customer_id);
CREATE INDEX IF NOT EXISTS refund_requests_resolved_by_idx ON public.refund_requests (resolved_by);
CREATE INDEX IF NOT EXISTS reviews_customer_idx ON public.reviews (customer_id);
CREATE INDEX IF NOT EXISTS reviews_employee_idx ON public.reviews (employee_id);
CREATE INDEX IF NOT EXISTS time_slots_employee_idx ON public.time_slots (employee_id);
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON public.notifications (user_id) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS businesses_discovery_idx ON public.businesses (status, city, district);
