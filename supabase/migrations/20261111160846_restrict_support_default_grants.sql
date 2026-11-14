/*
# Restrict inherited support permissions
1. Security: remove platform-inherited broad browser grants from the four new support tables, then restore only scoped SELECT. RLS continues to enforce ownership and agent membership. AI knowledge is not readable by customers.
2. Add admin-only configuration retrieval for editing existing approved knowledge. The caller is validated inside the function.
3. Agent removal now requeues their open conversations so another authorized representative can take over. No messages or conversations are deleted.
*/
REVOKE ALL ON public.support_agents,public.support_threads,public.support_messages,public.support_config FROM anon,authenticated;
GRANT SELECT ON public.support_agents,public.support_threads,public.support_messages TO authenticated;
GRANT SELECT(id,live_online) ON public.support_config TO authenticated;
CREATE OR REPLACE FUNCTION public.support_get_config() RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE v text; BEGIN IF NOT public.support_is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF; SELECT knowledge INTO v FROM public.support_config WHERE id=1; RETURN v; END $$;
REVOKE EXECUTE ON FUNCTION public.support_get_config() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.support_get_config() TO authenticated;
CREATE OR REPLACE FUNCTION public.support_admin_config(p_online boolean,p_knowledge text DEFAULT NULL,p_email text DEFAULT NULL,p_remove boolean DEFAULT false) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE v uuid; BEGIN
IF NOT public.support_is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
UPDATE public.support_config SET live_online=p_online,knowledge=coalesce(p_knowledge,knowledge) WHERE id=1;
IF nullif(btrim(p_email),'') IS NOT NULL THEN SELECT id INTO v FROM public.profiles WHERE lower(email)=lower(btrim(p_email)); IF v IS NULL THEN RAISE EXCEPTION 'Invalid request'; END IF;
IF p_remove THEN
UPDATE public.support_threads SET status='waiting',assigned_to=NULL,updated_at=now() WHERE assigned_to=v AND status='human';
DELETE FROM public.support_agents WHERE user_id=v;
ELSE INSERT INTO public.support_agents(user_id) VALUES(v) ON CONFLICT DO NOTHING; END IF; END IF; RETURN 'ok'; END $$;
REVOKE EXECUTE ON FUNCTION public.support_admin_config(boolean,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.support_admin_config(boolean,text,text,boolean) TO authenticated;