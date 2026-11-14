/*
  # Restrict business column updates

  1. Problem
     - `businesses UPDATE` policy only checks `owner_id = auth.uid()`, so an owner
       could write `status`, `is_verified`, `is_featured` and the derived metrics.
  2. Change
     - Revoke table-wide UPDATE, re-grant only the owner-editable columns.
  3. Notes
     - `status`/`is_verified`/`is_featured` remain admin-only via admin RPCs;
       `rating_avg`, `review_count`, `booking_count`, `min_price` are maintained by
       SECURITY DEFINER triggers, which are unaffected by client grants.
*/

REVOKE UPDATE ON public.businesses FROM anon, authenticated;

GRANT UPDATE (
  category_id, name, slug, description, phone, email, address,
  district, city, latitude, longitude, logo_url, cover_url, gallery,
  gender_focus, deposit_type, deposit_value, cancellation_hours, auto_confirm
) ON public.businesses TO authenticated;
