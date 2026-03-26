-- Allow authenticated users to insert their own entitlement row (lazy init when trigger has not run yet).
-- Mutations from triggers remain SECURITY DEFINER; this only enables client-side ensure.

DROP POLICY IF EXISTS "users_insert_own_entitlements" ON public.user_entitlements;
CREATE POLICY "users_insert_own_entitlements"
  ON public.user_entitlements FOR INSERT
  WITH CHECK (user_id = auth.uid());
