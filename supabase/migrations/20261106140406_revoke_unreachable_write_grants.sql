/*
  # Remove unreachable write grants

  1. Context
     - `public.profiles` has no INSERT policy and `public.platform_settings` has no
       INSERT or UPDATE policy, so these grants are already denied by row level
       security. They are removed so a future policy cannot silently widen access to
       privilege columns.
  2. Change
     - Revoke INSERT on profiles and INSERT/UPDATE on platform_settings from the
       client roles. Rows are created by the `handle_new_user` trigger and settings
       are written through the admin function, both of which run with definer rights.
*/

REVOKE INSERT ON public.profiles FROM anon, authenticated;
REVOKE INSERT, UPDATE ON public.platform_settings FROM anon, authenticated;
