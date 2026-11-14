/*
# Restore business owner access to customer contacts

1. Problem
- The public `business_customer_contacts` wrapper calls `private.business_customer_contacts`,
  but `authenticated` lost EXECUTE on the private function, so the business panel's
  customer list failed with "permission denied".

2. Security
- Grant EXECUTE on `private.business_customer_contacts(uuid)` to `authenticated` only.
- The function itself still requires sign-in and checks that the caller owns the business
  (or is an admin), so no extra data is exposed.
- `anon` and `PUBLIC` remain revoked.
*/

REVOKE EXECUTE ON FUNCTION private.business_customer_contacts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.business_customer_contacts(uuid) TO authenticated;