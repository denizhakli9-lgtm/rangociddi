/*
  # Restrict profile column writes

  1. Problem
     - `profiles UPDATE` policy only checks `id = auth.uid()`, while table-level
       UPDATE covers every column, so a user could write `role` or `is_suspended`.
  2. Change
     - Revoke table-wide UPDATE from anon/authenticated.
     - Re-grant UPDATE only on the columns the app legitimately edits.
  3. Notes
     - `role`, `email`, `is_suspended`, `id`, `created_at`, `updated_at` stay
       writable only by SECURITY DEFINER routines (signup trigger, admin RPCs).
*/

REVOKE UPDATE ON public.profiles FROM anon, authenticated;

GRANT UPDATE (
  full_name, phone, gender, city, district, latitude, longitude,
  avatar_url, locale, push_token, onboarding_done
) ON public.profiles TO authenticated;
