/*
# Single-use AI requests
1. Add ai_requested to support_messages to persist request claims across function instances.
2. A service-only function atomically claims the latest user message while locking its thread. It rejects already claimed messages and conversations transferred to humans.
3. Browser privileges remain read-only; no existing customer data is modified.
*/
ALTER TABLE public.support_messages ADD COLUMN IF NOT EXISTS ai_requested boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.support_claim_ai(p_thread uuid,p_message uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE v uuid; s text; BEGIN
SELECT status INTO s FROM public.support_threads WHERE id=p_thread FOR UPDATE;
IF s IS DISTINCT FROM 'ai' THEN RETURN false; END IF;
SELECT id INTO v FROM public.support_messages WHERE thread_id=p_thread ORDER BY created_at DESC,id DESC LIMIT 1;
IF v IS DISTINCT FROM p_message THEN RETURN false; END IF;
UPDATE public.support_messages SET ai_requested=true WHERE id=p_message AND thread_id=p_thread AND sender='user' AND NOT ai_requested;
RETURN FOUND; END $$;
REVOKE EXECUTE ON FUNCTION public.support_claim_ai(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.support_claim_ai(uuid,uuid) TO service_role;