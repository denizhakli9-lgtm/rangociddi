/*
  # Reporting objectionable content and blocking in booking chats (App Review guideline 1.2)

  Additive only: the deployed website keeps working unchanged. New objects are used by the new
  "Şikâyet et / Report" and "Engelle / Block" controls.

  1. Content reports
     - `public.content_reports`: one row per reporter and target (review, owner reply, booking
       message or business page). Reason from a fixed list, optional note, and a server-side
       snapshot of the reported text so the admin sees what was reported even if it changes.
     - No direct client writes. Admins read the table (RLS); nobody else does, so reporters never
       see other people's reports.
     - `report_content(p_target_type, p_target_id, p_reason, p_note)`: signed-in, non-anonymous,
       active accounts only; the target must be visible to the reporter; own content cannot be
       reported (VEYRA_REPORT_OWN). Duplicates are merged (one row per reporter and target; a
       closed report is reopened when the content changed after the decision, or when actioned
       content is visible again). At most 20 new or reopened reports per reporter per 24 hours.
       Active admins get a notification for every new or reopened report.
     - `admin_resolve_content_report(p_report, p_action, p_note)`: `remove` takes the content down
       (review hidden, owner reply removed, message hidden, business suspended), `dismiss` closes
       without change, `resolve` closes as handled elsewhere (for example a suspended account).
       Every open report on the same target is closed together.
     - Nothing is hidden automatically: a business or a competitor cannot suppress reviews by
       reporting them; an admin decides (commitment: within 24 hours).

  2. Blocking in booking chats
     - `public.user_blocks` (blocker, blocked). Users read only their own blocks.
     - `set_appointment_chat_block(p_appointment, p_blocked)` blocks / unblocks the other party
       of a booking (the business owner for the customer, the customer for the business).
       `appointment_chat_blocked(p_appointment)` says whether the caller blocked them.
     - `send_appointment_message` refuses messages between two users when either blocked the
       other (VEYRA_CHAT_BLOCKED). Bookings, payments and status changes are not affected.
     - The select policy of `appointment_messages` no longer returns messages from a user the
       reader blocked (also over realtime), nor messages an admin hid. Admins still see all.

  3. Retention: closed reports are deleted 2 years after the decision.
*/

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.content_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('review', 'review_reply', 'message', 'business')),
  target_id uuid NOT NULL,
  business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  reported_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason text NOT NULL CHECK (reason IN ('spam', 'harassment', 'inappropriate', 'fake', 'other')),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 500),
  content_snapshot text NOT NULL DEFAULT '' CHECK (char_length(content_snapshot) <= 2000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'actioned', 'dismissed')),
  admin_note text CHECK (admin_note IS NULL OR char_length(admin_note) <= 500),
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reporter_id, target_type, target_id)
);
-- True when the admin removed the content; a closed report reopens only if that removal was undone.
ALTER TABLE public.content_reports ADD COLUMN IF NOT EXISTS content_removed boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS content_reports_open_idx ON public.content_reports (created_at) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS content_reports_target_idx ON public.content_reports (target_type, target_id);
CREATE INDEX IF NOT EXISTS content_reports_reporter_idx ON public.content_reports (reporter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS content_reports_business_idx ON public.content_reports (business_id);
CREATE INDEX IF NOT EXISTS content_reports_reported_user_idx ON public.content_reports (reported_user_id);
CREATE INDEX IF NOT EXISTS content_reports_resolved_by_idx ON public.content_reports (resolved_by);

ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.content_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.content_reports TO authenticated;
GRANT ALL ON public.content_reports TO service_role;

DROP POLICY IF EXISTS "content_reports_select_admin" ON public.content_reports;
CREATE POLICY "content_reports_select_admin" ON public.content_reports
  FOR SELECT TO authenticated
  USING (
    ((SELECT auth.jwt()) ->> 'is_anonymous')::boolean IS NOT TRUE
    AND (SELECT private.is_active_member())
    AND (SELECT private.is_admin())
  );

CREATE TABLE IF NOT EXISTS public.user_blocks (
  blocker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX IF NOT EXISTS user_blocks_blocked_idx ON public.user_blocks (blocked_id);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_blocks FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.user_blocks TO authenticated;
GRANT ALL ON public.user_blocks TO service_role;

DROP POLICY IF EXISTS "user_blocks_select_own" ON public.user_blocks;
CREATE POLICY "user_blocks_select_own" ON public.user_blocks
  FOR SELECT TO authenticated
  USING (
    ((SELECT auth.jwt()) ->> 'is_anonymous')::boolean IS NOT TRUE
    AND blocker_id = (SELECT auth.uid())
  );

-- Messages an admin took down after a report.
ALTER TABLE public.appointment_messages ADD COLUMN IF NOT EXISTS hidden_at timestamptz;

-- Same policy as 20261124151000, plus: participants do not get hidden messages or messages
-- from a user they blocked. Admins (disputes, reports) still read everything.
DROP POLICY IF EXISTS "appointment_messages_select" ON public.appointment_messages;
CREATE POLICY "appointment_messages_select" ON public.appointment_messages
  FOR SELECT TO authenticated
  USING (
    ((SELECT auth.jwt()) ->> 'is_anonymous')::boolean IS NOT TRUE
    AND (SELECT private.is_active_member())
    AND (
      (SELECT private.is_admin())
      OR (
        appointment_messages.hidden_at IS NULL
        AND EXISTS (
          SELECT 1 FROM public.appointments a
          WHERE a.id = appointment_messages.appointment_id
            AND (a.customer_id = (SELECT auth.uid()) OR private.owns_business(a.business_id))
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.user_blocks ub
          WHERE ub.blocker_id = (SELECT auth.uid()) AND ub.blocked_id = appointment_messages.sender_id
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Reporting
-- ---------------------------------------------------------------------------

-- At most 20 new (or reopened) reports per reporter per 24 hours.
CREATE OR REPLACE FUNCTION private.content_report_rate_exceeded(p_reporter uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, public
AS $$
  SELECT count(*) >= 20 FROM public.content_reports
  WHERE reporter_id = p_reporter AND created_at > now() - interval '24 hours';
$$;
REVOKE EXECUTE ON FUNCTION private.content_report_rate_exceeded(uuid) FROM PUBLIC, anon, authenticated;

-- Tells every active admin that a report is waiting (new or reopened).
CREATE OR REPLACE FUNCTION private.notify_admins_of_report(p_target_type text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v_admin uuid;
  v_label text := CASE p_target_type
    WHEN 'review' THEN 'Bir yorum'
    WHEN 'review_reply' THEN 'Bir işletme yanıtı'
    WHEN 'message' THEN 'Bir randevu mesajı'
    ELSE 'Bir işletme sayfası' END;
BEGIN
  FOR v_admin IN
    SELECT p.id FROM profiles p WHERE p.role = 'admin' AND NOT p.is_suspended AND p.deleted_at IS NULL
  LOOP
    PERFORM notify(v_admin, 'content_report', 'Yeni şikâyet',
      v_label || ' şikâyet edildi. 24 saat içinde inceleyin.', '/yonetim/sikayetler');
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION private.notify_admins_of_report(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.report_content(p_target_type text, p_target_id uuid, p_reason text, p_note text DEFAULT '')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_note text := btrim(coalesce(p_note, ''));
  v_snapshot text;
  v_business uuid;
  v_reported uuid;
  v_hidden boolean := false;
  v_existing content_reports%ROWTYPE;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'VEYRA_AUTH_REQUIRED'; END IF;
  PERFORM private.assert_active_member();
  IF p_target_type IS NULL OR p_target_type NOT IN ('review', 'review_reply', 'message', 'business')
     OR p_reason IS NULL OR p_reason NOT IN ('spam', 'harassment', 'inappropriate', 'fake', 'other')
     OR p_target_id IS NULL OR char_length(v_note) > 500 THEN
    RAISE EXCEPTION 'VEYRA_INVALID_INPUT';
  END IF;

  -- Resolve the target. Only content the reporter can see; never their own.
  IF p_target_type IN ('review', 'review_reply') THEN
    SELECT CASE WHEN p_target_type = 'review' THEN r.rating || '/5 · ' || coalesce(r.comment, '') ELSE r.owner_reply END,
           r.business_id,
           CASE WHEN p_target_type = 'review' THEN r.customer_id ELSE b.owner_id END,
           r.is_hidden
    INTO v_snapshot, v_business, v_reported, v_hidden
    FROM reviews r JOIN businesses b ON b.id = r.business_id
    WHERE r.id = p_target_id
      AND (NOT r.is_hidden OR r.customer_id = v_uid OR private.owns_business(r.business_id))
      AND (p_target_type = 'review' OR r.owner_reply IS NOT NULL);
  ELSIF p_target_type = 'message' THEN
    SELECT m.body, a.business_id, m.sender_id
    INTO v_snapshot, v_business, v_reported
    FROM appointment_messages m
    JOIN appointments a ON a.id = m.appointment_id
    JOIN businesses b ON b.id = a.business_id
    WHERE m.id = p_target_id AND m.hidden_at IS NULL
      AND (a.customer_id = v_uid OR b.owner_id = v_uid);
  ELSE
    SELECT b.name || coalesce(E'\n' || nullif(b.description, ''), ''), b.id, b.owner_id
    INTO v_snapshot, v_business, v_reported
    FROM businesses b
    WHERE b.id = p_target_id AND b.status = 'approved';
  END IF;

  IF v_business IS NULL THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;
  IF v_reported = v_uid THEN RAISE EXCEPTION 'VEYRA_REPORT_OWN'; END IF;
  v_snapshot := left(coalesce(v_snapshot, ''), 2000);

  SELECT * INTO v_existing FROM content_reports
  WHERE reporter_id = v_uid AND target_type = p_target_type AND target_id = p_target_id
  FOR UPDATE;

  IF FOUND THEN
    -- Still open: refresh the reason and note.
    IF v_existing.status = 'open' THEN
      UPDATE content_reports SET reason = p_reason, note = v_note, content_snapshot = v_snapshot
      WHERE id = v_existing.id;
    -- Closed: reopen when the content changed, or when it was actioned and is visible again
    -- (the target resolved above, so a removal was undone, e.g. a reply posted again).
    ELSIF v_existing.content_snapshot IS DISTINCT FROM v_snapshot
       OR (v_existing.status = 'actioned' AND v_existing.content_removed AND NOT coalesce(v_hidden, false)) THEN
      IF private.content_report_rate_exceeded(v_uid) THEN RAISE EXCEPTION 'VEYRA_REPORT_RATE'; END IF;
      UPDATE content_reports
      SET reason = p_reason, note = v_note, content_snapshot = v_snapshot, status = 'open', content_removed = false,
          admin_note = NULL, resolved_by = NULL, resolved_at = NULL, created_at = now()
      WHERE id = v_existing.id;
      PERFORM private.notify_admins_of_report(p_target_type);
    END IF;
    RETURN v_existing.id;
  END IF;

  IF private.content_report_rate_exceeded(v_uid) THEN RAISE EXCEPTION 'VEYRA_REPORT_RATE'; END IF;

  -- A concurrent first report by the same reporter on the same target wins; this one returns it.
  INSERT INTO content_reports (reporter_id, target_type, target_id, business_id, reported_user_id, reason, note, content_snapshot)
  VALUES (v_uid, p_target_type, p_target_id, v_business, v_reported, p_reason, v_note, v_snapshot)
  ON CONFLICT (reporter_id, target_type, target_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM content_reports
    WHERE reporter_id = v_uid AND target_type = p_target_type AND target_id = p_target_id;
    RETURN v_id;
  END IF;

  PERFORM private.notify_admins_of_report(p_target_type);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION private.admin_resolve_content_report(p_report uuid, p_action text, p_note text DEFAULT '')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_r content_reports%ROWTYPE;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_status text;
  v_owner uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'VEYRA_AUTH_REQUIRED'; END IF;
  PERFORM private.assert_active_member();
  IF NOT private.is_admin() THEN RAISE EXCEPTION 'VEYRA_FORBIDDEN'; END IF;
  IF p_action IS NULL OR p_action NOT IN ('remove', 'resolve', 'dismiss') OR char_length(coalesce(v_note, '')) > 500 THEN
    RAISE EXCEPTION 'VEYRA_INVALID_INPUT';
  END IF;

  SELECT * INTO v_r FROM content_reports WHERE id = p_report FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;

  IF p_action = 'remove' THEN
    IF v_r.target_type = 'review' THEN
      UPDATE reviews SET is_hidden = true WHERE id = v_r.target_id;
    ELSIF v_r.target_type = 'review_reply' THEN
      UPDATE reviews SET owner_reply = NULL WHERE id = v_r.target_id AND owner_reply IS NOT NULL
      RETURNING (SELECT b.owner_id FROM businesses b WHERE b.id = reviews.business_id) INTO v_owner;
      IF v_owner IS NOT NULL THEN
        PERFORM notify(v_owner, 'content_removed', 'Yorum yanıtınız kaldırıldı',
          'Bir yoruma verdiğiniz yanıt, kullanım koşullarına aykırı bulunduğu için yayından kaldırıldı.', '/isletme/yorumlar');
      END IF;
    ELSIF v_r.target_type = 'message' THEN
      UPDATE appointment_messages SET hidden_at = now() WHERE id = v_r.target_id AND hidden_at IS NULL;
    ELSE
      -- Reuses the existing moderation path (status change and owner notification).
      PERFORM private.admin_set_business_status(v_r.target_id, 'suspended', NULL, NULL);
    END IF;
    v_status := 'actioned';
  ELSIF p_action = 'resolve' THEN
    v_status := 'actioned';
  ELSE
    v_status := 'dismissed';
  END IF;

  UPDATE content_reports
  SET status = v_status, content_removed = (p_action = 'remove'), admin_note = v_note, resolved_by = v_uid, resolved_at = now()
  WHERE target_type = v_r.target_type AND target_id = v_r.target_id AND (status = 'open' OR id = v_r.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.report_content(p_target_type text, p_target_id uuid, p_reason text, p_note text DEFAULT '')
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$ SELECT private.report_content(p_target_type, p_target_id, p_reason, p_note); $$;

CREATE OR REPLACE FUNCTION public.admin_resolve_content_report(p_report uuid, p_action text, p_note text DEFAULT '')
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$ SELECT private.admin_resolve_content_report(p_report, p_action, p_note); $$;

REVOKE EXECUTE ON FUNCTION private.report_content(text, uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.report_content(text, uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION private.admin_resolve_content_report(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_resolve_content_report(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.report_content(text, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_content(text, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.admin_resolve_content_report(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resolve_content_report(uuid, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Blocking in booking chats
-- ---------------------------------------------------------------------------

-- The other participant of a booking chat for the caller, or NULL when the caller takes no part.
CREATE OR REPLACE FUNCTION private.appointment_chat_other_party(p_appointment uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, public
AS $$
  SELECT CASE WHEN a.customer_id = auth.uid() THEN b.owner_id
              WHEN b.owner_id = auth.uid() THEN a.customer_id END
  FROM public.appointments a JOIN public.businesses b ON b.id = a.business_id
  WHERE a.id = p_appointment;
$$;
REVOKE EXECUTE ON FUNCTION private.appointment_chat_other_party(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.set_appointment_chat_block(p_appointment uuid, p_blocked boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_other uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'VEYRA_AUTH_REQUIRED'; END IF;
  PERFORM private.assert_active_member();
  v_other := private.appointment_chat_other_party(p_appointment);
  IF v_other IS NULL OR v_other = v_uid THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;

  IF coalesce(p_blocked, false) THEN
    INSERT INTO user_blocks (blocker_id, blocked_id) VALUES (v_uid, v_other)
    ON CONFLICT (blocker_id, blocked_id) DO NOTHING;
  ELSE
    DELETE FROM user_blocks WHERE blocker_id = v_uid AND blocked_id = v_other;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.appointment_chat_blocked(p_appointment uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_other uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'VEYRA_AUTH_REQUIRED'; END IF;
  IF NOT private.is_active_member() THEN RAISE EXCEPTION 'VEYRA_FORBIDDEN'; END IF;
  v_other := private.appointment_chat_other_party(p_appointment);
  IF v_other IS NULL THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;
  RETURN EXISTS (SELECT 1 FROM user_blocks WHERE blocker_id = v_uid AND blocked_id = v_other);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_appointment_chat_block(p_appointment uuid, p_blocked boolean)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$ SELECT private.set_appointment_chat_block(p_appointment, p_blocked); $$;

CREATE OR REPLACE FUNCTION public.appointment_chat_blocked(p_appointment uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$ SELECT private.appointment_chat_blocked(p_appointment); $$;

REVOKE EXECUTE ON FUNCTION private.set_appointment_chat_block(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_appointment_chat_block(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION private.appointment_chat_blocked(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.appointment_chat_blocked(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.set_appointment_chat_block(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_appointment_chat_block(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.appointment_chat_blocked(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.appointment_chat_blocked(uuid) TO authenticated, service_role;

-- Same as 20261124180000_field_agents_review_fixes.sql, plus the block check before the insert.
CREATE OR REPLACE FUNCTION private.send_appointment_message(p_appointment uuid, p_body text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_appt appointments%ROWTYPE;
  v_business businesses%ROWTYPE;
  v_role text;
  v_other uuid;
  v_id uuid;
  v_recent boolean;
  v_when text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'VEYRA_AUTH_REQUIRED'; END IF;
  PERFORM private.assert_active_member();
  IF char_length(v_body) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'VEYRA_INVALID_INPUT'; END IF;

  SELECT * INTO v_appt FROM appointments WHERE id = p_appointment FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;
  SELECT * INTO v_business FROM businesses WHERE id = v_appt.business_id;

  IF v_appt.customer_id = v_uid THEN v_role := 'customer'; v_other := v_business.owner_id;
  ELSIF v_business.owner_id = v_uid THEN v_role := 'business'; v_other := v_appt.customer_id;
  ELSE RAISE EXCEPTION 'VEYRA_NOT_FOUND';
  END IF;

  -- Open once the deposit is settled, and for a week after the visit.
  IF NOT (v_appt.status IN ('pending_approval', 'confirmed')
          OR (v_appt.status IN ('completed', 'no_show') AND v_appt.ends_at > now() - interval '7 days')) THEN
    RAISE EXCEPTION 'VEYRA_CHAT_CLOSED';
  END IF;

  -- Either side blocked the other: nothing is delivered (and nobody is notified).
  IF EXISTS (SELECT 1 FROM user_blocks
             WHERE (blocker_id = v_uid AND blocked_id = v_other)
                OR (blocker_id = v_other AND blocked_id = v_uid)) THEN
    RAISE EXCEPTION 'VEYRA_CHAT_BLOCKED';
  END IF;

  IF (SELECT count(*) FROM appointment_messages
      WHERE sender_id = v_uid AND created_at > now() - interval '1 minute') >= 20 THEN
    RAISE EXCEPTION 'VEYRA_MESSAGE_RATE';
  END IF;

  -- Announced unless the other side already has an unread message from this sender from the
  -- last 10 minutes (they were notified and have not looked yet).
  v_recent := EXISTS (SELECT 1 FROM appointment_messages
                      WHERE appointment_id = v_appt.id AND sender_id = v_uid AND read_at IS NULL
                        AND created_at > now() - interval '10 minutes');

  INSERT INTO appointment_messages (appointment_id, sender_id, sender_role, body)
  VALUES (v_appt.id, v_uid, v_role, v_body)
  RETURNING id INTO v_id;

  IF NOT v_recent THEN
    v_when := to_char(v_appt.starts_at AT TIME ZONE 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI');
    IF v_role = 'customer' THEN
      PERFORM notify(v_business.owner_id, 'appointment_message', 'Müşteriden yeni mesaj',
        v_appt.service_name || ', ' || v_when || ' randevusu için yeni bir mesajınız var.', '/isletme/randevular');
    ELSE
      PERFORM notify(v_appt.customer_id, 'appointment_message', 'İşletmeden yeni mesaj',
        v_business.name || ', ' || v_when || ' randevunuz için yeni bir mesajınız var.', '/randevularim');
    END IF;
  END IF;

  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Retention: same as 20261124150000, plus closed reports after 2 years.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.run_retention()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
BEGIN
  -- Free-text notes are not accounting records: cleared 12 months after the appointment.
  UPDATE appointments SET customer_note = '', cancellation_reason = NULL
  WHERE ends_at < now() - interval '12 months'
    AND (customer_note <> '' OR cancellation_reason IS NOT NULL);

  DELETE FROM appointment_messages m USING appointments a
  WHERE m.appointment_id = a.id AND a.ends_at < now() - interval '12 months';

  -- Support correspondence: 2 years after the conversation was closed (or left with the assistant).
  DELETE FROM support_messages m USING support_threads t
  WHERE m.thread_id = t.id AND t.status IN ('resolved', 'ai') AND t.updated_at < now() - interval '2 years';
  DELETE FROM support_threads t
  WHERE t.status IN ('resolved', 'ai') AND t.updated_at < now() - interval '2 years'
    AND NOT EXISTS (SELECT 1 FROM support_messages m WHERE m.thread_id = t.id);

  -- Content reports: 2 years after the decision.
  DELETE FROM content_reports WHERE status <> 'open' AND resolved_at < now() - interval '2 years';
END;
$$;
REVOKE EXECUTE ON FUNCTION private.run_retention() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- A block also covers the free-text fields of a booking between the two people (the chat screen
-- promises that neither side can write to the other): the booking note, and the reason given when
-- cancelling or declining, are dropped while a block exists. The booking itself is unaffected.
CREATE OR REPLACE FUNCTION private.strip_text_between_blocked_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT b.owner_id INTO v_owner FROM businesses b WHERE b.id = NEW.business_id;
  IF v_owner IS NOT NULL AND EXISTS (
    SELECT 1 FROM user_blocks ub
    WHERE (ub.blocker_id = v_owner AND ub.blocked_id = NEW.customer_id)
       OR (ub.blocker_id = NEW.customer_id AND ub.blocked_id = v_owner)
  ) THEN
    IF TG_OP = 'INSERT' OR NEW.customer_note IS DISTINCT FROM OLD.customer_note THEN
      NEW.customer_note := '';
    END IF;
    IF NEW.cancelled_by IN ('customer', 'business')
       AND (TG_OP = 'INSERT' OR NEW.cancellation_reason IS DISTINCT FROM OLD.cancellation_reason) THEN
      NEW.cancellation_reason := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION private.strip_text_between_blocked_users() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS appointments_strip_blocked_text ON public.appointments;
CREATE TRIGGER appointments_strip_blocked_text
  BEFORE INSERT OR UPDATE OF customer_note, cancellation_reason ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION private.strip_text_between_blocked_users();
