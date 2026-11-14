/*
  # Scope opening hours and staff-service reads

  1. Problem
     - `working_hours` and `employee_services` both had SELECT policies with
       `USING (true)` for anon, exposing the schedules and staff/service mapping of
       businesses that are still pending or were rejected.
     - `platform_settings` kept a second permissive policy named `settings_select`.
  2. Change
     - Recreate both SELECT policies scoped to approved businesses, with owner and
       admin access preserved, matching the existing `services_select` pattern.
     - Drop the leftover permissive settings policy.
*/

DROP POLICY IF EXISTS "settings_select" ON public.platform_settings;

DROP POLICY IF EXISTS "working_hours_select" ON public.working_hours;

CREATE POLICY "working_hours_select"
  ON public.working_hours FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = working_hours.business_id AND b.status = 'approved'
    )
    OR (
      auth.role() = 'authenticated'
      AND (private.owns_business(business_id) OR private.is_admin())
    )
  );

DROP POLICY IF EXISTS "employee_services_select" ON public.employee_services;

CREATE POLICY "employee_services_select"
  ON public.employee_services FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN public.businesses b ON b.id = e.business_id
      WHERE e.id = employee_services.employee_id AND b.status = 'approved'
    )
    OR (
      auth.role() = 'authenticated'
      AND EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = employee_services.employee_id
          AND (private.owns_business(e.business_id) OR private.is_admin())
      )
    )
  );
