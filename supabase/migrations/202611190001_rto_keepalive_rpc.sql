CREATE OR REPLACE FUNCTION public.rto_keepalive()
RETURNS timestamptz
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT pg_catalog.now();
$function$;

REVOKE ALL ON FUNCTION public.rto_keepalive() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rto_keepalive() TO anon;
GRANT EXECUTE ON FUNCTION public.rto_keepalive() TO service_role;
