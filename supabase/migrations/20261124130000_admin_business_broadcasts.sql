/*
  # Admin announcements to businesses

  Lets an administrator send an in-app notification to business owners from the admin panel:
  to every business, to businesses in one status, or to a hand-picked list.

  - `public.admin_broadcasts`: one row per announcement (who sent what to whom). Admins can read
    it; nobody writes it through the Data API.
  - `admin_notify_businesses(...)`: admin-only. Writes one `notifications` row (type
    'announcement') per distinct owner and records the announcement. Returns the number of
    owners reached. The link is limited to pages inside the business panel.
  - `notifications` joins the realtime publication so an open panel shows the notification
    right away instead of on the next poll. Row level security still applies: a session only
    receives its own rows.
*/

CREATE TABLE IF NOT EXISTS public.admin_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sent_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  audience text NOT NULL CHECK (audience IN ('all', 'approved', 'pending', 'selected')),
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  link text,
  recipient_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_broadcasts_created_idx ON public.admin_broadcasts(created_at DESC);

ALTER TABLE public.admin_broadcasts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_broadcasts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_broadcasts TO authenticated;

DROP POLICY IF EXISTS "admin_broadcasts_select_admin" ON public.admin_broadcasts;
CREATE POLICY "admin_broadcasts_select_admin" ON public.admin_broadcasts
  FOR SELECT TO authenticated USING ((SELECT private.is_admin()));

CREATE OR REPLACE FUNCTION private.admin_notify_businesses(
  p_audience text, p_business_ids uuid[], p_title text, p_body text, p_link text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_link text := nullif(btrim(coalesce(p_link, '')), '');
  v_count integer;
BEGIN
  IF NOT private.is_admin() THEN RAISE EXCEPTION 'VEYRA_FORBIDDEN'; END IF;
  IF p_audience IS NULL OR p_audience NOT IN ('all', 'approved', 'pending', 'selected') THEN
    RAISE EXCEPTION 'VEYRA_INVALID_INPUT';
  END IF;
  IF char_length(v_title) NOT BETWEEN 3 AND 80 OR char_length(v_body) > 500 THEN
    RAISE EXCEPTION 'VEYRA_INVALID_INPUT';
  END IF;
  -- Only pages of the business panel (or the support centre) can be linked.
  IF v_link IS NOT NULL AND v_link !~ '^/(isletme(/[a-z-]+)?|destek)$' THEN
    RAISE EXCEPTION 'VEYRA_INVALID_INPUT';
  END IF;
  IF p_audience = 'selected' AND coalesce(cardinality(p_business_ids), 0) = 0 THEN
    RAISE EXCEPTION 'VEYRA_INVALID_INPUT';
  END IF;

  WITH owners AS (
    SELECT DISTINCT b.owner_id
    FROM businesses b
    JOIN profiles p ON p.id = b.owner_id
    WHERE p.deleted_at IS NULL
      AND CASE p_audience
            WHEN 'all' THEN true
            WHEN 'selected' THEN b.id = ANY (p_business_ids)
            ELSE b.status = p_audience
          END
  ), sent AS (
    INSERT INTO notifications (user_id, type, title, body, link)
    SELECT owner_id, 'announcement', v_title, v_body, coalesce(v_link, '/isletme') FROM owners
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM sent;

  IF v_count = 0 THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;

  INSERT INTO admin_broadcasts (sent_by, audience, title, body, link, recipient_count)
  VALUES (auth.uid(), p_audience, v_title, v_body, v_link, v_count);

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_notify_businesses(
  p_audience text, p_business_ids uuid[], p_title text, p_body text, p_link text)
RETURNS integer
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$ SELECT private.admin_notify_businesses(p_audience, p_business_ids, p_title, p_body, p_link); $$;

REVOKE EXECUTE ON FUNCTION private.admin_notify_businesses(text, uuid[], text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_notify_businesses(text, uuid[], text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.admin_notify_businesses(text, uuid[], text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_notify_businesses(text, uuid[], text, text, text) TO authenticated;

-- Deliver new notification rows to open sessions right away.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END;
$$;
