/*
  # Restrict platform settings reads to signed-in users

  1. Problem
     - The SELECT policy on public.platform_settings used `USING (true)` for both
       anon and authenticated, publishing commission_rate, payment_mode and
       payment_provider to any unauthenticated caller of the Data API.
  2. Change
     - Recreate the SELECT policy for `authenticated` only and revoke SELECT from anon.
  3. Notes
     - Every client reader (booking wizard, deposit payment, admin settings) runs on a
       signed-in route, so no public screen loses data.
*/

DROP POLICY IF EXISTS "platform_settings_read" ON public.platform_settings;

CREATE POLICY "platform_settings_read"
  ON public.platform_settings FOR SELECT TO authenticated USING (true);

REVOKE SELECT ON public.platform_settings FROM anon;
