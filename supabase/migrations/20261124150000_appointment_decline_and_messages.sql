/*
  # Paid bookings: the business can decline, and both sides can message each other

  1. Declining a paid booking
     - Until now a business could only reject a request in `pending_approval`. A booking at a
       business with automatic confirmation went straight to `confirmed` after payment, so the
       business had no "I do not accept this" option.
     - New column `appointments.approved_at`: set when the business explicitly approves.
       A `confirmed` booking whose `approved_at` is NULL was confirmed automatically; the business
       can still approve it (locks it in, no new notification) or decline it until it starts.
     - Declining sets the booking to `rejected` (cancelled_by = 'business'), stores the optional
       reason as `cancellation_reason` and opens a full deposit refund, as before.
     - `business_update_appointment` gains an optional third argument `p_reason`. The two-argument
       form is replaced; existing calls with two named arguments keep working through the default.
     - Existing confirmed / finished bookings are backfilled with approved_at = created_at, so only
       bookings paid from now on get the new option.

  2. Appointment messages
     - `public.appointment_messages`: a small conversation per booking between the customer and the
       business owner. Rango admins can read it (for disputes); nobody else.
     - Writes only through `send_appointment_message(p_appointment, p_body)`:
         * only the booking's customer or the business owner, active accounts only;
         * only once the deposit is settled (status pending_approval / confirmed), and up to 7 days
           after a completed / no-show visit;
         * 1-1000 characters, at most 20 messages per minute per sender;
         * the other side gets a notification, at most one per conversation every 10 minutes.
     - `mark_appointment_messages_read(p_appointment)` marks the other side's messages as read.
     - Messages are erased with the customer's account (delete_my_account sets profiles.deleted_at)
       and 12 months after the visit by the retention job, like customer notes.
     - The table joins the realtime publication; row level security still applies.
*/

-- ---------------------------------------------------------------------------
-- 1. Explicit approval marker
-- ---------------------------------------------------------------------------
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS approved_at timestamptz;

UPDATE public.appointments SET approved_at = created_at
WHERE approved_at IS NULL AND status IN ('confirmed', 'completed', 'no_show');

DROP FUNCTION IF EXISTS public.business_update_appointment(uuid, text);
DROP FUNCTION IF EXISTS private.business_update_appointment(uuid, text);

CREATE OR REPLACE FUNCTION private.business_update_appointment(p_appointment uuid, p_action text, p_reason text DEFAULT '')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_appt appointments%ROWTYPE;
  v_business businesses%ROWTYPE;
  v_rate numeric(5,2);
  v_when text;
  v_refund boolean;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_auto boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'VEYRA_AUTH_REQUIRED'; END IF;
  PERFORM private.assert_active_member();
  IF char_length(coalesce(v_reason, '')) > 500 THEN RAISE EXCEPTION 'VEYRA_INVALID_INPUT'; END IF;
  SELECT * INTO v_appt FROM appointments WHERE id = p_appointment FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;
  SELECT * INTO v_business FROM businesses WHERE id = v_appt.business_id;
  IF NOT (owns_business(v_business.id) OR is_admin()) THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;
  v_when := to_char(v_appt.starts_at AT TIME ZONE 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI');
  -- Paid and confirmed automatically, not yet answered by the business.
  v_auto := v_appt.status = 'confirmed' AND v_appt.approved_at IS NULL AND v_appt.starts_at > now();

  IF p_action = 'approve' THEN
    IF v_auto THEN
      -- Already confirmed for the customer: only record the business's decision.
      UPDATE appointments SET approved_at = now() WHERE id = v_appt.id;
      RETURN;
    END IF;
    IF v_appt.status <> 'pending_approval' THEN RAISE EXCEPTION 'VEYRA_INVALID_STATE'; END IF;
    -- F05: a request is answered before it starts; afterwards it expires automatically.
    IF v_appt.starts_at <= now() THEN RAISE EXCEPTION 'VEYRA_INVALID_STATE'; END IF;
    UPDATE appointments SET status = 'confirmed', approved_at = now() WHERE id = v_appt.id;
    PERFORM notify(v_appt.customer_id, 'appointment_confirmed', 'Randevunuz onaylandı',
      v_business.name || ' - ' || v_appt.service_name || ', ' || v_when, '/randevularim');
  ELSIF p_action = 'reject' THEN
    IF NOT (v_appt.status = 'pending_approval' OR v_auto) THEN RAISE EXCEPTION 'VEYRA_INVALID_STATE'; END IF;
    UPDATE appointments SET status = 'rejected', cancelled_by = 'business', cancelled_at = now(),
      cancellation_reason = v_reason
    WHERE id = v_appt.id;
    v_refund := open_refund(v_appt, 'İşletme randevuyu onaylamadı' || coalesce(': ' || v_reason, ''));
    PERFORM notify(v_appt.customer_id, 'appointment_cancelled', 'Randevu talebiniz reddedildi',
      v_business.name || ' ' || v_when || ' randevunuzu onaylayamadı.'
      || CASE WHEN v_refund THEN ' Kapora iadeniz işleme alındı.' ELSE '' END, '/randevularim');
  ELSIF p_action IN ('complete','no_show') THEN
    IF v_appt.status <> 'confirmed' THEN RAISE EXCEPTION 'VEYRA_INVALID_STATE'; END IF;
    IF v_appt.starts_at > now() THEN RAISE EXCEPTION 'VEYRA_TOO_EARLY'; END IF;
    IF p_action = 'complete' THEN
      UPDATE appointments SET status = 'completed' WHERE id = v_appt.id;
      SELECT commission_rate INTO v_rate FROM platform_settings WHERE id = 1;
      INSERT INTO commission_records (appointment_id, business_id, total_amount, commission_rate, commission_amount)
      VALUES (v_appt.id, v_appt.business_id, v_appt.total_price, v_rate, round(v_appt.total_price * v_rate / 100, 2))
      ON CONFLICT (appointment_id) DO NOTHING;
      PERFORM notify(v_appt.customer_id, 'review_request', 'Deneyiminizi değerlendirin',
        v_business.name || ' ziyaretiniz nasıldı? Yorumunuzu paylaşın.', '/randevularim');
    ELSE
      UPDATE appointments SET status = 'no_show' WHERE id = v_appt.id;
    END IF;
  ELSE
    RAISE EXCEPTION 'VEYRA_INVALID_INPUT';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.business_update_appointment(p_appointment uuid, p_action text, p_reason text DEFAULT '')
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$ SELECT private.business_update_appointment(p_appointment, p_action, p_reason); $$;

REVOKE EXECUTE ON FUNCTION private.business_update_appointment(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.business_update_appointment(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.business_update_appointment(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.business_update_appointment(uuid, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Appointment messages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.appointment_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  sender_role text NOT NULL CHECK (sender_role IN ('customer', 'business')),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS appointment_messages_appt_idx ON public.appointment_messages(appointment_id, created_at);
CREATE INDEX IF NOT EXISTS appointment_messages_unread_idx ON public.appointment_messages(appointment_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS appointment_messages_sender_idx ON public.appointment_messages(sender_id, created_at);

ALTER TABLE public.appointment_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.appointment_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.appointment_messages TO authenticated;
GRANT ALL ON public.appointment_messages TO service_role;

DROP POLICY IF EXISTS "appointment_messages_select" ON public.appointment_messages;
CREATE POLICY "appointment_messages_select" ON public.appointment_messages
  FOR SELECT TO authenticated
  USING (
    (SELECT private.is_active_member())
    AND EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.id = appointment_messages.appointment_id
        AND (a.customer_id = (SELECT auth.uid())
             OR private.owns_business(a.business_id)
             OR (SELECT private.is_admin()))
    )
  );

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

  IF v_appt.customer_id = v_uid THEN v_role := 'customer';
  ELSIF v_business.owner_id = v_uid THEN v_role := 'business';
  ELSE RAISE EXCEPTION 'VEYRA_NOT_FOUND';
  END IF;

  -- Open once the deposit is settled, and for a week after the visit.
  IF NOT (v_appt.status IN ('pending_approval', 'confirmed')
          OR (v_appt.status IN ('completed', 'no_show') AND v_appt.ends_at > now() - interval '7 days')) THEN
    RAISE EXCEPTION 'VEYRA_CHAT_CLOSED';
  END IF;

  IF (SELECT count(*) FROM appointment_messages
      WHERE sender_id = v_uid AND created_at > now() - interval '1 minute') >= 20 THEN
    RAISE EXCEPTION 'VEYRA_MESSAGE_RATE';
  END IF;

  -- One notification per burst: skip it when this sender already wrote here in the last 10 minutes.
  v_recent := EXISTS (SELECT 1 FROM appointment_messages
                      WHERE appointment_id = v_appt.id AND sender_id = v_uid
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

CREATE OR REPLACE FUNCTION private.mark_appointment_messages_read(p_appointment uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'VEYRA_AUTH_REQUIRED'; END IF;
  PERFORM private.assert_active_member();
  SELECT CASE WHEN a.customer_id = v_uid THEN 'customer'
              WHEN b.owner_id = v_uid THEN 'business' END
  INTO v_role
  FROM appointments a JOIN businesses b ON b.id = a.business_id
  WHERE a.id = p_appointment;
  IF v_role IS NULL THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;

  UPDATE appointment_messages SET read_at = now()
  WHERE appointment_id = p_appointment AND read_at IS NULL AND sender_role <> v_role;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_appointment_message(p_appointment uuid, p_body text)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$ SELECT private.send_appointment_message(p_appointment, p_body); $$;

CREATE OR REPLACE FUNCTION public.mark_appointment_messages_read(p_appointment uuid)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$ SELECT private.mark_appointment_messages_read(p_appointment); $$;

REVOKE EXECUTE ON FUNCTION private.send_appointment_message(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.send_appointment_message(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION private.mark_appointment_messages_read(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_appointment_messages_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.send_appointment_message(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_appointment_message(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.mark_appointment_messages_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_appointment_messages_read(uuid) TO authenticated;

-- Erase a customer's booking conversations when their account is deleted.
CREATE OR REPLACE FUNCTION private.erase_appointment_messages_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
BEGIN
  DELETE FROM appointment_messages m USING appointments a
  WHERE m.appointment_id = a.id AND a.customer_id = NEW.id;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION private.erase_appointment_messages_on_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_erase_appointment_messages ON public.profiles;
CREATE TRIGGER profiles_erase_appointment_messages
  AFTER UPDATE OF deleted_at ON public.profiles
  FOR EACH ROW
  WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
  EXECUTE FUNCTION private.erase_appointment_messages_on_delete();

-- Retention: booking messages are cleared 12 months after the visit, like customer notes.
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
END;
$$;
REVOKE EXECUTE ON FUNCTION private.run_retention() FROM PUBLIC, anon, authenticated;

-- Deliver new messages to open conversations right away.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'appointment_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.appointment_messages;
  END IF;
END;
$$;
