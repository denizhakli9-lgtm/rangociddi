/*
# Exclude anonymous sign-in sessions from member policies

1. Purpose
- Supabase "anonymous sign-in" sessions run as the `authenticated` role. VEYRA does not
  use anonymous sign-ins, but the policies below did not explicitly reject such sessions.
- Each listed policy's USING clause is now ANDed with a check that the session JWT is not
  anonymous, so only real registered accounts satisfy them.

2. Modified policies (USING clause only; WITH CHECK unchanged)
- public: appointments_select, businesses_select_auth, businesses_update_owner,
  categories_delete_admin, categories_update_admin, commission_select,
  employee_services_delete, employees_delete, employees_update, favorites_delete_own,
  favorites_select_own, notifications_delete_own, notifications_select_own,
  notifications_update_own, payments_select, platform_settings_read, profiles_select,
  profiles_update_own, refunds_select, reviews_select_auth, services_delete,
  services_update, time_slots_delete, time_slots_select, time_slots_update,
  working_hours_delete, working_hours_update
- storage.objects: business_media_delete_owner, business_media_update_owner

3. Notes
1. Idempotent: a policy already containing the is_anonymous check is skipped.
2. Logged-out visitors (anon role) keep their separate public read policies unchanged.
*/

DO $$
DECLARE
  r record;
  targets text[] := ARRAY[
    'public.appointments.appointments_select',
    'public.businesses.businesses_select_auth',
    'public.businesses.businesses_update_owner',
    'public.categories.categories_delete_admin',
    'public.categories.categories_update_admin',
    'public.commission_records.commission_select',
    'public.employee_services.employee_services_delete',
    'public.employees.employees_delete',
    'public.employees.employees_update',
    'public.favorites.favorites_delete_own',
    'public.favorites.favorites_select_own',
    'public.notifications.notifications_delete_own',
    'public.notifications.notifications_select_own',
    'public.notifications.notifications_update_own',
    'public.payments.payments_select',
    'public.platform_settings.platform_settings_read',
    'public.profiles.profiles_select',
    'public.profiles.profiles_update_own',
    'public.refund_requests.refunds_select',
    'public.reviews.reviews_select_auth',
    'public.services.services_delete',
    'public.services.services_update',
    'public.time_slots.time_slots_delete',
    'public.time_slots.time_slots_select',
    'public.time_slots.time_slots_update',
    'public.working_hours.working_hours_delete',
    'public.working_hours.working_hours_update',
    'storage.objects.business_media_delete_owner',
    'storage.objects.business_media_update_owner'
  ];
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual
    FROM pg_policies
    WHERE schemaname || '.' || tablename || '.' || policyname = ANY (targets)
      AND qual IS NOT NULL
      AND qual NOT ILIKE '%is_anonymous%'
  LOOP
    EXECUTE format(
      'ALTER POLICY %I ON %I.%I USING ((%s) AND ((auth.jwt() ->> ''is_anonymous'')::boolean IS NOT TRUE))',
      r.policyname, r.schemaname, r.tablename, r.qual
    );
  END LOOP;
END $$;