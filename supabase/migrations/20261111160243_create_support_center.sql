/*
# Rango support center
1. Tables: support_agents assigns support-only access; support_threads stores owner, subject, status, assignment and dates; support_messages stores immutable text and server-derived sender; support_config stores approved knowledge and team online status (initially offline).
2. Security: RLS on every table, separate CRUD policies, scoped reads and caller-checked mutations only. Anonymous and suspended users cannot act. No profile roles changed. AI completion is service-only.
3. Reliability: locks serialize claims and replies; latest-message checks stop stale AI output. Human replies notify the customer. Indexes support owner, queue and conversation queries.
*/
CREATE TABLE IF NOT EXISTS public.support_agents(user_id uuid PRIMARY KEY REFERENCES public.profiles(id),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.support_threads(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),subject text NOT NULL CHECK(char_length(subject) BETWEEN 3 AND 120),status text NOT NULL DEFAULT 'ai' CHECK(status IN ('ai','waiting','human','resolved')),assigned_to uuid REFERENCES public.profiles(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.support_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),thread_id uuid NOT NULL REFERENCES public.support_threads(id),author_id uuid REFERENCES public.profiles(id),sender text NOT NULL CHECK(sender IN ('user','agent','ai')),body text NOT NULL CHECK(char_length(body) BETWEEN 1 AND 4000),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.support_config(id integer PRIMARY KEY CHECK(id=1),live_online boolean NOT NULL DEFAULT false,knowledge text NOT NULL DEFAULT '' CHECK(char_length(knowledge)<=20000));
INSERT INTO public.support_config(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE INDEX IF NOT EXISTS support_threads_owner ON public.support_threads(user_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS support_threads_queue ON public.support_threads(status,updated_at DESC);
CREATE INDEX IF NOT EXISTS support_messages_thread ON public.support_messages(thread_id,created_at);
CREATE OR REPLACE FUNCTION public.support_is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin' AND NOT is_suspended) AND NOT coalesce((auth.jwt()->>'is_anonymous')::boolean,false) $$;
CREATE OR REPLACE FUNCTION public.support_is_agent() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.support_is_admin() OR (EXISTS(SELECT 1 FROM public.support_agents WHERE user_id=auth.uid()) AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND NOT is_suspended) AND NOT coalesce((auth.jwt()->>'is_anonymous')::boolean,false)) $$;
REVOKE EXECUTE ON FUNCTION public.support_is_admin(),public.support_is_agent() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.support_is_admin(),public.support_is_agent() TO authenticated,service_role;
ALTER TABLE public.support_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_config ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.support_agents,public.support_threads,public.support_messages TO authenticated;
GRANT SELECT(id,live_online) ON public.support_config TO authenticated;
GRANT ALL ON public.support_agents,public.support_threads,public.support_messages,public.support_config TO service_role;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['support_agents','support_threads','support_messages','support_config'] LOOP
EXECUTE format('DROP POLICY IF EXISTS support_insert ON public.%I',t); EXECUTE format('CREATE POLICY support_insert ON public.%I FOR INSERT TO authenticated WITH CHECK(false)',t);
EXECUTE format('DROP POLICY IF EXISTS support_update ON public.%I',t); EXECUTE format('CREATE POLICY support_update ON public.%I FOR UPDATE TO authenticated USING(false) WITH CHECK(false)',t);
EXECUTE format('DROP POLICY IF EXISTS support_delete ON public.%I',t); EXECUTE format('CREATE POLICY support_delete ON public.%I FOR DELETE TO authenticated USING(false)',t);
END LOOP; END $$;
DROP POLICY IF EXISTS support_read ON public.support_agents;
CREATE POLICY support_read ON public.support_agents FOR SELECT TO authenticated USING(user_id=auth.uid() OR public.support_is_admin());
DROP POLICY IF EXISTS support_read ON public.support_threads;
CREATE POLICY support_read ON public.support_threads FOR SELECT TO authenticated USING(user_id=auth.uid() OR public.support_is_agent());
DROP POLICY IF EXISTS support_read ON public.support_messages;
CREATE POLICY support_read ON public.support_messages FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.support_threads t WHERE t.id=thread_id AND (t.user_id=auth.uid() OR public.support_is_agent())));
DROP POLICY IF EXISTS support_read ON public.support_config;
CREATE POLICY support_read ON public.support_config FOR SELECT TO authenticated USING(auth.uid() IS NOT NULL);
CREATE OR REPLACE FUNCTION public.support_action(p_action text,p_thread uuid DEFAULT NULL,p_text text DEFAULT '') RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE t public.support_threads; v uuid; a boolean; BEGIN
IF auth.uid() IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND NOT is_suspended) THEN RAISE EXCEPTION 'Not authorized'; END IF;
a:=public.support_is_agent();
IF p_action='create' THEN
IF char_length(btrim(p_text)) NOT BETWEEN 3 AND 120 OR (SELECT count(*) FROM public.support_threads WHERE user_id=auth.uid() AND status<>'resolved')>=5 THEN RAISE EXCEPTION 'Invalid request'; END IF;
INSERT INTO public.support_threads(subject) VALUES(btrim(p_text)) RETURNING id INTO v; RETURN v; END IF;
SELECT * INTO t FROM public.support_threads WHERE id=p_thread FOR UPDATE;
IF NOT FOUND OR NOT(t.user_id=auth.uid() OR a) THEN RAISE EXCEPTION 'Not authorized'; END IF;
IF p_action='handoff' AND t.user_id=auth.uid() AND t.status='ai' THEN UPDATE public.support_threads SET status='waiting',updated_at=now() WHERE id=t.id;
ELSIF p_action='claim' AND a AND t.status='waiting' THEN UPDATE public.support_threads SET status='human',assigned_to=auth.uid(),updated_at=now() WHERE id=t.id;
ELSIF p_action='resolve' AND a AND t.assigned_to=auth.uid() AND t.status='human' THEN UPDATE public.support_threads SET status='resolved',updated_at=now() WHERE id=t.id;
ELSIF p_action='send' AND t.status<>'resolved' THEN
IF char_length(btrim(p_text)) NOT BETWEEN 1 AND 4000 OR (SELECT count(*) FROM public.support_messages WHERE author_id=auth.uid() AND created_at>now()-interval '1 minute')>=15 THEN RAISE EXCEPTION 'Invalid request'; END IF;
IF t.user_id=auth.uid() THEN INSERT INTO public.support_messages(thread_id,author_id,sender,body) VALUES(t.id,auth.uid(),'user',btrim(p_text));
ELSIF a AND t.assigned_to=auth.uid() AND t.status='human' THEN
INSERT INTO public.support_messages(thread_id,author_id,sender,body) VALUES(t.id,auth.uid(),'agent',btrim(p_text));
INSERT INTO public.notifications(user_id,type,title,body,link) VALUES(t.user_id,'support','Destek ekibinden yeni yanıt','Destek konuşmana yeni bir yanıt geldi.','/destek');
ELSE RAISE EXCEPTION 'Not authorized'; END IF;
UPDATE public.support_threads SET updated_at=now() WHERE id=t.id;
ELSE RAISE EXCEPTION 'Invalid transition'; END IF;
RETURN t.id; END $$;
REVOKE EXECUTE ON FUNCTION public.support_action(text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.support_action(text,uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.support_admin_config(p_online boolean,p_knowledge text DEFAULT NULL,p_email text DEFAULT NULL,p_remove boolean DEFAULT false) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE v uuid; BEGIN
IF NOT public.support_is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
UPDATE public.support_config SET live_online=p_online,knowledge=coalesce(p_knowledge,knowledge) WHERE id=1;
IF nullif(btrim(p_email),'') IS NOT NULL THEN SELECT id INTO v FROM public.profiles WHERE lower(email)=lower(btrim(p_email)); IF v IS NULL THEN RAISE EXCEPTION 'Invalid request'; END IF;
IF p_remove THEN DELETE FROM public.support_agents WHERE user_id=v; ELSE INSERT INTO public.support_agents(user_id) VALUES(v) ON CONFLICT DO NOTHING; END IF; END IF; RETURN 'ok'; END $$;
REVOKE EXECUTE ON FUNCTION public.support_admin_config(boolean,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.support_admin_config(boolean,text,text,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.support_finish_ai(p_thread uuid,p_message uuid,p_body text,p_handoff boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE t public.support_threads; v uuid; BEGIN
SELECT * INTO t FROM public.support_threads WHERE id=p_thread FOR UPDATE;
IF NOT FOUND OR t.status<>'ai' THEN RETURN; END IF;
SELECT id INTO v FROM public.support_messages WHERE thread_id=p_thread ORDER BY created_at DESC,id DESC LIMIT 1;
IF v IS DISTINCT FROM p_message THEN RETURN; END IF;
IF NOT p_handoff THEN INSERT INTO public.support_messages(thread_id,sender,body) VALUES(p_thread,'ai',p_body); END IF;
UPDATE public.support_threads SET status=CASE WHEN p_handoff THEN 'waiting' ELSE 'ai' END,updated_at=now() WHERE id=p_thread;
END $$;
REVOKE EXECUTE ON FUNCTION public.support_finish_ai(uuid,uuid,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.support_finish_ai(uuid,uuid,text,boolean) TO service_role;