/*
  # Restrict business column inserts

  1. Problem
     - The INSERT policy validates owner and role only, while the table-wide INSERT
       grant let a new row be created with `status='approved'`, `is_verified=true`,
       `is_featured=true` or forged rating/booking metrics.
  2. Change
     - Revoke table-wide INSERT, re-grant only the owner-supplied columns.
  3. Notes
     - `owner_id` defaults to `auth.uid()`, `status` to 'pending', metrics to 0, so
       omitting them from the grant keeps business creation working unchanged.
*/

REVOKE INSERT ON public.businesses FROM anon, authenticated;

GRANT INSERT (
  category_id, name, slug, description, phone, email, address,
  district, city, latitude, longitude, logo_url, cover_url, gallery,
  gender_focus, deposit_type, deposit_value, cancellation_hours, auto_confirm
) ON public.businesses TO authenticated;
