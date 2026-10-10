#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must point to an empty disposable PostgreSQL database}"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $;
SQL

migrations=(
  supabase/migrations/202610100000_rto_schema_baseline.sql
  supabase/migrations/202610100001_ensure_schedule_booking_fields.sql
  supabase/migrations/202610100002_add_customer_address_maps.sql
  supabase/migrations/202610100003_add_review_uniqueness_and_query_indexes.sql
  supabase/migrations/202610100004_hash_access_codes.sql
  supabase/migrations/202610100005_lock_direct_client_data_access.sql
  supabase/migrations/202610100006_rto_storage_limits.sql
)

for migration in "${migrations[@]}"; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration"
done

# Re-apply the entire baseline + forward chain to verify safe repeatability.
for migration in "${migrations[@]}"; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration"
done

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  required_table text;
BEGIN
  FOREACH required_table IN ARRAY ARRAY['customers','members','reviews','bookings','page_events']
  LOOP
    IF to_regclass('public.' || required_table) IS NULL THEN
      RAISE EXCEPTION 'Missing required RTO table: %', required_table;
    END IF;
    IF NOT (SELECT rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename=required_table) THEN
      RAISE EXCEPTION 'RLS is not enabled on public.%', required_table;
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='customers' AND column_name='address') THEN
    RAISE EXCEPTION 'customers.address missing after baseline chain';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='customers' AND column_name='maps_url') THEN
    RAISE EXCEPTION 'customers.maps_url missing after baseline chain';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='customers' AND column_name='owner_code_hash') THEN
    RAISE EXCEPTION 'customers.owner_code_hash missing after baseline chain';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='members' AND column_name='access_code_hash') THEN
    RAISE EXCEPTION 'members.access_code_hash missing after baseline chain';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='reviews'
      AND indexdef ILIKE 'CREATE UNIQUE INDEX% (business_slug, member_id)%'
  ) THEN
    RAISE EXCEPTION 'Review upsert unique key missing after baseline chain';
  END IF;
  IF has_table_privilege('anon','public.customers','SELECT')
     OR has_table_privilege('authenticated','public.bookings','UPDATE') THEN
    RAISE EXCEPTION 'Direct client table privileges remain after baseline chain';
  END IF;
  IF NOT has_table_privilege('service_role','public.customers','SELECT')
     OR NOT has_table_privilege('service_role','public.bookings','INSERT') THEN
    RAISE EXCEPTION 'Server service_role privileges missing after baseline chain';
  END IF;
  RAISE NOTICE 'RTO clean-install baseline smoke tests passed';
END $$;
SQL

echo "RTO clean-install baseline smoke tests passed."
