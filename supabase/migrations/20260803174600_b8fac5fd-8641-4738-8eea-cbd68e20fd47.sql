-- 1. Remove overly permissive "always true" policy on rate_limits
DROP POLICY IF EXISTS "Service role can manage rate limits" ON public.rate_limits;

-- Only the service role (backend) may manage rate limits.
CREATE POLICY "Service role manages rate limits"
ON public.rate_limits
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Users may read only their own rate limit rows (no writes).
CREATE POLICY "Users can view their own rate limits"
ON public.rate_limits
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Remove client write access at the grant level too
REVOKE ALL ON public.rate_limits FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.rate_limits FROM authenticated;
GRANT SELECT ON public.rate_limits TO authenticated;
GRANT ALL ON public.rate_limits TO service_role;

-- 2. SECURITY DEFINER function should not be callable by app clients
REVOKE ALL ON FUNCTION public.check_rate_limit(uuid, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_rate_limit(uuid, text, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.check_rate_limit(uuid, text, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(uuid, text, integer, integer) TO service_role;