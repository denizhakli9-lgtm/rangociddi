/*
# Explicit anonymous exclusion for denied support writes
1. Policy changes
Replace the INSERT, UPDATE and DELETE policies on all four support tables. Direct browser writes remain unconditionally denied; each predicate additionally states that anonymous sign-in sessions are excluded.
2. Security
This makes the permanent-user requirement explicit for every CRUD policy, not only SELECT. Existing RPC authorization and read-only browser grants remain unchanged.
3. Data safety
No records, assignments, settings, grants or table structures are changed.
*/
DO $$ DECLARE t text; BEGIN
FOREACH t IN ARRAY ARRAY['support_agents','support_config','support_messages','support_threads'] LOOP
EXECUTE format('DROP POLICY IF EXISTS support_insert ON public.%I',t);
EXECUTE format('CREATE POLICY support_insert ON public.%I FOR INSERT TO authenticated WITH CHECK ((((SELECT auth.jwt())->>''is_anonymous'')::boolean IS NOT TRUE) AND false)',t);
EXECUTE format('DROP POLICY IF EXISTS support_update ON public.%I',t);
EXECUTE format('CREATE POLICY support_update ON public.%I FOR UPDATE TO authenticated USING ((((SELECT auth.jwt())->>''is_anonymous'')::boolean IS NOT TRUE) AND false) WITH CHECK ((((SELECT auth.jwt())->>''is_anonymous'')::boolean IS NOT TRUE) AND false)',t);
EXECUTE format('DROP POLICY IF EXISTS support_delete ON public.%I',t);
EXECUTE format('CREATE POLICY support_delete ON public.%I FOR DELETE TO authenticated USING ((((SELECT auth.jwt())->>''is_anonymous'')::boolean IS NOT TRUE) AND false)',t);
END LOOP; END $$;