/*
  # Explicit anonymous-session check on appointment_messages_select

  The policy from 20261124150000 already rejects anonymous sessions through
  private.is_active_member(), but the Supabase security advisor (lint 0012) only recognises the
  check when it is written in the policy itself. Same form as 20261115090000.
*/

DROP POLICY IF EXISTS "appointment_messages_select" ON public.appointment_messages;
CREATE POLICY "appointment_messages_select" ON public.appointment_messages
  FOR SELECT TO authenticated
  USING (
    ((SELECT auth.jwt()) ->> 'is_anonymous')::boolean IS NOT TRUE
    AND (SELECT private.is_active_member())
    AND EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.id = appointment_messages.appointment_id
        AND (a.customer_id = (SELECT auth.uid())
             OR private.owns_business(a.business_id)
             OR (SELECT private.is_admin()))
    )
  );
