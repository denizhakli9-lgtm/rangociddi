/*
  # Bookings the business adds itself ("Randevu ekle") and their own-customer bookkeeping

  A business takes some customers by phone or at the door. It can now enter them in its calendar:
  the time closes for online booking exactly like a blocked slot, and the business sees what these
  customers brought in under "Kazanç & Komisyon → Kendi müşterilerim". Rango takes no commission on
  them and the amounts are never added to the Rango figures (no commission_records, no payments).

  Stored on `time_slots`, the owner-only table for blocked time, so `get_available_slots` and every
  installed app version keep treating the time as taken without any change. Only the owner (and
  admins) can read the table; anon has no grant. Older app versions ignore the new columns and show
  the `reason` text the new client also fills in.

  1. Columns: `kind` ('block' | 'booking', existing rows are blocks), the service (id, name and price
     as entered; the price is editable), the customer's name and phone (both optional), `no_show`.
     A booking counts as income once its time has passed unless it is marked `no_show`.
  2. Policies: the same as before, plus the service must belong to the same business.
  3. Retention (KVKK): the customer's name and phone, and the free-text `reason`, are cleared
     12 months after the booking, like booking notes. Service, price and time stay for bookkeeping.
*/

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.time_slots
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'block',
  ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS service_name text,
  ADD COLUMN IF NOT EXISTS price numeric(10, 2),
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS customer_phone text,
  ADD COLUMN IF NOT EXISTS no_show boolean NOT NULL DEFAULT false;

ALTER TABLE public.time_slots DROP CONSTRAINT IF EXISTS time_slots_kind_check;
ALTER TABLE public.time_slots ADD CONSTRAINT time_slots_kind_check CHECK (kind IN ('block', 'booking'));

ALTER TABLE public.time_slots DROP CONSTRAINT IF EXISTS time_slots_booking_fields_check;
ALTER TABLE public.time_slots ADD CONSTRAINT time_slots_booking_fields_check CHECK (
  (price IS NULL OR (price >= 0 AND price <= 1000000))
  AND (service_name IS NULL OR char_length(service_name) <= 120)
  AND (customer_name IS NULL OR char_length(customer_name) <= 80)
  AND (customer_phone IS NULL OR char_length(customer_phone) <= 30)
  -- Booking details only on bookings: a blocked slot stays a plain block.
  AND (kind = 'booking' OR (service_id IS NULL AND price IS NULL AND customer_name IS NULL AND customer_phone IS NULL AND NOT no_show))
);

CREATE INDEX IF NOT EXISTS time_slots_business_bookings_idx
  ON public.time_slots (business_id, starts_at DESC) WHERE kind = 'booking';
CREATE INDEX IF NOT EXISTS time_slots_service_id_idx ON public.time_slots (service_id) WHERE service_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Policies: as before, plus the service belongs to the same business
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS time_slots_insert ON public.time_slots;
CREATE POLICY time_slots_insert ON public.time_slots
  FOR INSERT TO authenticated
  WITH CHECK (
    private.owns_business(business_id)
    AND (employee_id IS NULL OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = time_slots.employee_id AND e.business_id = time_slots.business_id))
    AND (service_id IS NULL OR EXISTS (SELECT 1 FROM public.services s WHERE s.id = time_slots.service_id AND s.business_id = time_slots.business_id))
  );

DROP POLICY IF EXISTS time_slots_update ON public.time_slots;
CREATE POLICY time_slots_update ON public.time_slots
  FOR UPDATE TO authenticated
  USING (private.owns_business(business_id) AND ((SELECT auth.jwt()) ->> 'is_anonymous')::boolean IS NOT TRUE)
  WITH CHECK (
    private.owns_business(business_id)
    AND (employee_id IS NULL OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = time_slots.employee_id AND e.business_id = time_slots.business_id))
    AND (service_id IS NULL OR EXISTS (SELECT 1 FROM public.services s WHERE s.id = time_slots.service_id AND s.business_id = time_slots.business_id))
  );

-- ---------------------------------------------------------------------------
-- 3. Retention: customer details of own bookings are cleared after 12 months
--    (the rest of the function is the live definition, unchanged)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.run_retention()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'private', 'public'
AS $function$
BEGIN
  -- Free-text notes are not accounting records: cleared 12 months after the appointment.
  UPDATE appointments SET customer_note = '', cancellation_reason = NULL
  WHERE ends_at < now() - interval '12 months'
    AND (customer_note <> '' OR cancellation_reason IS NOT NULL);

  DELETE FROM appointment_messages m USING appointments a
  WHERE m.appointment_id = a.id AND a.ends_at < now() - interval '12 months';

  -- Bookings the business added itself: the customer's name, phone and the note are cleared
  -- 12 months after the booking. Service, price and time stay for the business's bookkeeping.
  UPDATE time_slots SET customer_name = NULL, customer_phone = NULL, reason = ''
  WHERE kind = 'booking' AND ends_at < now() - interval '12 months'
    AND (customer_name IS NOT NULL OR customer_phone IS NOT NULL OR reason <> '');

  -- Support correspondence: 2 years after the conversation was closed (or left with the assistant).
  DELETE FROM support_messages m USING support_threads t
  WHERE m.thread_id = t.id AND t.status IN ('resolved', 'ai') AND t.updated_at < now() - interval '2 years';
  DELETE FROM support_threads t
  WHERE t.status IN ('resolved', 'ai') AND t.updated_at < now() - interval '2 years'
    AND NOT EXISTS (SELECT 1 FROM support_messages m WHERE m.thread_id = t.id);

  -- Content reports: 2 years after the decision.
  DELETE FROM content_reports WHERE status <> 'open' AND resolved_at < now() - interval '2 years';
END;
$function$;
REVOKE EXECUTE ON FUNCTION private.run_retention() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
