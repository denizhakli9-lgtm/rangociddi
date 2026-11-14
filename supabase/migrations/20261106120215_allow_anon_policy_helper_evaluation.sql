/*
# Allow guest visibility rules to evaluate private helper checks

1. Problem
   The SELECT rules on services, employees and categories (which apply to guests too)
   reference private.owns_business() and private.is_admin(). Postgres checks EXECUTE
   permission on every function in a rule before evaluating it, so guest (anon) reads
   of these tables failed with "permission denied".

2. Change
   - GRANT EXECUTE on private.is_admin() and private.owns_business(uuid) to anon.

3. Security notes
   1. The `private` schema is not exposed through the Data API, so guests still cannot
      call these functions directly.
   2. Both helpers key on auth.uid(), which is NULL for guests, so they always return false.
*/

GRANT EXECUTE ON FUNCTION private.is_admin() TO anon;
GRANT EXECUTE ON FUNCTION private.owns_business(uuid) TO anon;
