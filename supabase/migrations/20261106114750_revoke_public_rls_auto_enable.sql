/*
# Remove public access to rls_auto_enable()

1. Summary
   `public.rls_auto_enable()` is the platform safety-net function behind the
   `ensure_rls` event trigger: whenever a table is created in `public`, it turns on
   row level security automatically. It was executable by PUBLIC, anon and
   authenticated, so it was listed as a callable RPC in the Data API.

2. Security changes
   - REVOKE EXECUTE from PUBLIC, anon, authenticated.
   - service_role and the owner (postgres) keep EXECUTE.

3. Notes
   1. Event triggers are fired by the database itself, not by the API roles, so the
      `ensure_rls` trigger keeps working after this change.
   2. No app code calls this function.
   3. Guarded with to_regprocedure so the migration is safe to re-run and safe on a
      fresh database where the function may not exist.
*/

DO $$
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
  END IF;
END $$;
