/*
  # Validate platform settings ranges

  private.admin_update_settings wrote every parameter straight into
  platform_settings with no bounds, so a negative commission or a zero slot
  interval would corrupt commission records and slot generation. Values are now
  range-checked and rejected with VEYRA_INVALID_INPUT.
*/

CREATE OR REPLACE FUNCTION private.admin_update_settings(
  p_commission_rate numeric,
  p_pending_minutes integer,
  p_slot_interval integer,
  p_min_lead integer,
  p_max_days integer,
  p_max_reschedules integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'VEYRA_FORBIDDEN'; END IF;

  IF p_commission_rate IS NULL OR p_commission_rate < 0 OR p_commission_rate > 100
     OR p_pending_minutes IS NULL OR p_pending_minutes < 1 OR p_pending_minutes > 1440
     OR p_slot_interval IS NULL OR p_slot_interval < 5 OR p_slot_interval > 240
     OR p_min_lead IS NULL OR p_min_lead < 0 OR p_min_lead > 10080
     OR p_max_days IS NULL OR p_max_days < 1 OR p_max_days > 365
     OR p_max_reschedules IS NULL OR p_max_reschedules < 0 OR p_max_reschedules > 10 THEN
    RAISE EXCEPTION 'VEYRA_INVALID_INPUT';
  END IF;

  UPDATE platform_settings SET
    commission_rate = p_commission_rate,
    pending_payment_minutes = p_pending_minutes,
    slot_interval_minutes = p_slot_interval,
    min_lead_minutes = p_min_lead,
    max_booking_days = p_max_days,
    max_reschedules = p_max_reschedules,
    updated_at = now()
  WHERE id = 1;
END;
$$;
