/*
  # Revoke write grants that no RLS policy can satisfy

  1. Problem
     - anon held INSERT/UPDATE/DELETE on almost every table even though every
       write policy targets authenticated only, and authenticated held
       INSERT/UPDATE/DELETE on appointments, payments, refund_requests,
       commission_records and reviews, which have SELECT policies only.
     - These grants are dead today (RLS default-denies) but turn any future
       policy into an unintended direct write path.

  2. Change
     - Revoke only the verbs that no policy can reach. All domain writes already
       go through SECURITY DEFINER RPCs, and client code only SELECTs these
       tables, so no application behaviour changes.
*/

-- anon can never satisfy a write policy: every write policy is TO authenticated.
REVOKE INSERT, UPDATE, DELETE ON appointments FROM anon;
REVOKE INSERT, UPDATE, DELETE ON payments FROM anon;
REVOKE INSERT, UPDATE, DELETE ON refund_requests FROM anon;
REVOKE INSERT, UPDATE, DELETE ON commission_records FROM anon;
REVOKE INSERT, UPDATE, DELETE ON reviews FROM anon;
REVOKE INSERT, UPDATE, DELETE ON categories FROM anon;
REVOKE INSERT, UPDATE, DELETE ON services FROM anon;
REVOKE INSERT, UPDATE, DELETE ON employees FROM anon;
REVOKE INSERT, UPDATE, DELETE ON employee_services FROM anon;
REVOKE INSERT, UPDATE, DELETE ON working_hours FROM anon;
REVOKE INSERT, UPDATE, DELETE ON time_slots FROM anon;
REVOKE INSERT, UPDATE, DELETE ON favorites FROM anon;
REVOKE INSERT, UPDATE, DELETE ON notifications FROM anon;
REVOKE DELETE ON businesses FROM anon;
REVOKE DELETE ON profiles FROM anon;
REVOKE DELETE ON platform_settings FROM anon;

-- authenticated: these tables have SELECT policies only; writes run via RPCs.
REVOKE INSERT, UPDATE, DELETE ON appointments FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON payments FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON refund_requests FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON commission_records FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON reviews FROM authenticated;
REVOKE DELETE ON businesses FROM authenticated;
REVOKE DELETE ON profiles FROM authenticated;
REVOKE DELETE ON platform_settings FROM authenticated;
REVOKE UPDATE ON employee_services FROM authenticated;
