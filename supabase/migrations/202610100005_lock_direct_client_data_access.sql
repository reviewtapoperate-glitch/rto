-- RTO now routes application data operations through the same-origin Netlify API.
-- That API uses the server-only service-role key and verifies its signed session.
-- This migration removes direct anonymous/authenticated table access; it must only
-- be applied after the matching candidate frontend/function is deployed and the
-- required Netlify Function secrets are configured.
--
-- This is a forward security migration, not a fresh-install schema baseline.

DO $$
DECLARE
  table_name text;
  policy_row record;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['customers', 'members', 'reviews', 'bookings', 'page_events']
  LOOP
    IF to_regclass('public.' || table_name) IS NULL THEN
      RAISE EXCEPTION 'Required RTO table public.% is missing', table_name;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);

    FOR policy_row IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = table_name
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', policy_row.policyname, table_name);
    END LOOP;

    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated', table_name);
  END LOOP;
END $$;

REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

-- The browser no longer uploads or deletes directly. Public bucket object URLs
-- remain usable for image display, while all mutations go through the API.
DO $$
DECLARE
  policy_row record;
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    FOR policy_row IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'storage'
        AND tablename = 'objects'
        AND (
          COALESCE(qual, '') ILIKE '%rto-photos%'
          OR COALESCE(with_check, '') ILIKE '%rto-photos%'
          OR policyname ILIKE '%rto-photos%'
        )
        AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
    LOOP
      EXECUTE format('DROP POLICY %I ON storage.objects', policy_row.policyname);
    END LOOP;
    REVOKE INSERT, UPDATE, DELETE ON TABLE storage.objects FROM PUBLIC, anon, authenticated;
    GRANT SELECT ON TABLE storage.objects TO anon, authenticated;
  END IF;

  IF to_regclass('storage.buckets') IS NOT NULL THEN
    REVOKE INSERT, UPDATE, DELETE ON TABLE storage.buckets FROM PUBLIC, anon, authenticated;
    GRANT SELECT ON TABLE storage.buckets TO anon, authenticated;
  END IF;
END $$;
