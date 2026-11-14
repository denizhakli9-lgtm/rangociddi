/*
# Harden support API and anonymous access
1. Privileged implementations
Move five support SECURITY DEFINER implementations to the existing non-exposed private schema, following the application's established RPC pattern. Preserve server-side ownership, agent assignment, suspension, administrator and anonymous-session checks.
2. Public API
Replace the five public functions with SECURITY INVOKER wrappers with unchanged signatures and defaults. Revoke default PUBLIC/anon execution and grant only authenticated/service_role. Private implementations retain explicit execute grants required by wrappers and policies, not REST exposure.
3. Policies
Replace SELECT policies on support_agents, support_threads, support_messages and support_config with explicit anonymous-session exclusion, plus their existing ownership/agent checks. Write policies and column restrictions remain unchanged.
4. Data safety
No rows, roles, assignments, messages or settings are changed. Moves are conditional and safe to replay; no tables or columns are removed.
*/
DO $$ DECLARE sig text; definition text; BEGIN
FOREACH sig IN ARRAY ARRAY['support_action(text,uuid,text)','support_admin_config(boolean,text,text,boolean)','support_get_config()','support_is_admin()','support_is_agent()'] LOOP
IF to_regprocedure('public.'||sig) IS NOT NULL AND (SELECT prosecdef FROM pg_proc WHERE oid=to_regprocedure('public.'||sig)) THEN
EXECUTE format('ALTER FUNCTION public.%s SET SCHEMA private',sig);
END IF;
IF to_regprocedure('private.'||sig) IS NOT NULL THEN
SELECT pg_get_functiondef(to_regprocedure('private.'||sig)) INTO definition;
definition:=replace(replace(definition,'public.support_is_admin()', 'private.support_is_admin()'),'public.support_is_agent()', 'private.support_is_agent()');
EXECUTE definition;
EXECUTE format('ALTER FUNCTION private.%s SET search_path = public, pg_temp',sig);
EXECUTE format('REVOKE EXECUTE ON FUNCTION private.%s FROM PUBLIC, anon',sig);
EXECUTE format('GRANT EXECUTE ON FUNCTION private.%s TO authenticated, service_role',sig);
END IF;
END LOOP; END $$;
CREATE OR REPLACE FUNCTION public.support_action(p_action text,p_thread uuid DEFAULT NULL,p_text text DEFAULT '') RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.support_action(p_action,p_thread,p_text) $$;
CREATE OR REPLACE FUNCTION public.support_admin_config(p_online boolean,p_knowledge text DEFAULT NULL,p_email text DEFAULT NULL,p_remove boolean DEFAULT false) RETURNS text LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.support_admin_config(p_online,p_knowledge,p_email,p_remove) $$;
CREATE OR REPLACE FUNCTION public.support_get_config() RETURNS text LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.support_get_config() $$;
CREATE OR REPLACE FUNCTION public.support_is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT private.support_is_admin() $$;
CREATE OR REPLACE FUNCTION public.support_is_agent() RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT private.support_is_agent() $$;
REVOKE EXECUTE ON FUNCTION public.support_action(text,uuid,text),public.support_admin_config(boolean,text,text,boolean),public.support_get_config(),public.support_is_admin(),public.support_is_agent() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.support_action(text,uuid,text),public.support_admin_config(boolean,text,text,boolean),public.support_get_config(),public.support_is_admin(),public.support_is_agent() TO authenticated,service_role;
DROP POLICY IF EXISTS support_read ON public.support_agents;
CREATE POLICY support_read ON public.support_agents FOR SELECT TO authenticated USING(((SELECT auth.jwt())->>'is_anonymous')::boolean IS NOT TRUE AND (user_id=(SELECT auth.uid()) OR (SELECT private.support_is_admin())));
DROP POLICY IF EXISTS support_read ON public.support_threads;
CREATE POLICY support_read ON public.support_threads FOR SELECT TO authenticated USING(((SELECT auth.jwt())->>'is_anonymous')::boolean IS NOT TRUE AND (user_id=(SELECT auth.uid()) OR (SELECT private.support_is_agent())));
DROP POLICY IF EXISTS support_read ON public.support_messages;
CREATE POLICY support_read ON public.support_messages FOR SELECT TO authenticated USING(((SELECT auth.jwt())->>'is_anonymous')::boolean IS NOT TRUE AND EXISTS(SELECT 1 FROM public.support_threads t WHERE t.id=thread_id AND (t.user_id=(SELECT auth.uid()) OR (SELECT private.support_is_agent()))));
DROP POLICY IF EXISTS support_read ON public.support_config;
CREATE POLICY support_read ON public.support_config FOR SELECT TO authenticated USING((SELECT auth.uid()) IS NOT NULL AND ((SELECT auth.jwt())->>'is_anonymous')::boolean IS NOT TRUE);
NOTIFY pgrst,'reload schema';