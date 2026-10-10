# Supabase database change notes

Project ref: `ptmznpjsgdkasvywufcx`.

## Important: migration history is not a baseline

The connected project inspection on 2026-10-10 returned an empty migration listing even though the live database contains the application's tables, policies, indexes, function, event trigger, storage bucket, and Realtime publication. The new idempotent baseline creates the five core RTO tables for a clean install. The existing project's functions, event trigger, storage policies, publication settings, grants, and any schema drift still require full reconciliation before release.

Before any database release:
1. Capture and review a complete schema snapshot from the connected Supabase project, including tables, constraints, indexes, RLS policies, grants, functions, triggers, storage policies, and publication membership.
2. Reconcile that baseline with the root-level `ENABLE_SCHEDULE_AND_BOOKING_LABEL.sql`.
3. Verify the target project, existing data, duplicate review rows, and migration status.
4. Apply the forward migrations to an isolated Supabase environment.
5. Test positive and negative authorization cases through the Netlify API and confirm public bucket images still load.
6. Apply to production only after reviewing the exact SQL and test results and confirming a rollback/backup plan.

## Included baseline and forward migrations

- `202610100000_rto_schema_baseline.sql`: creates the five core RTO tables with observed columns/constraints and enables RLS; it does not drop or rewrite existing tables.
- `202610100001_ensure_schedule_booking_fields.sql`: schedule/booking fields.
- `202610100002_add_customer_address_maps.sql`: missing customer address and map URL fields.
- `202610100003_add_review_uniqueness_and_query_indexes.sql`: review upsert uniqueness and common query indexes; aborts if duplicate business/member reviews exist.
- `202610100004_hash_access_codes.sql`: owner/member credential-hash columns and nullable legacy member code.
- `202610100005_lock_direct_client_data_access.sql`: removes broad direct client table grants/policies and direct Storage mutations. This migration depends on the matching server API being configured and deployed.
- `202610100006_rto_storage_limits.sql`: sets the public image bucket's allowed MIME types and 3 MB file-size limit.

None of these migrations has been applied to the connected production project by this candidate work. Migration 005 deliberately removes direct client data access; do not apply it to production before the server-only API is configured and tested.

## Free CI checks

GitHub Actions run [#38069291314](https://github.com/reviewtapoperate-glitch/rto/actions/runs/38069291314) passed on 2026-10-10. The workflow runs:
- Browser and Netlify function syntax checks.
- Structural frontend checks and mocked API tests covering authentication, owner/admin authorization, review authorship, booking validation/isolation, and image upload/delete.
- All six forward migrations twice against a disposable PostgreSQL 17 fixture, plus the baseline and complete chain twice on a second clean database.
- Assertions for expected columns, indexes, RLS enablement, revoked direct client privileges, retained service-role grants, and clean-install idempotency.

**Scope limitation:** the PostgreSQL fixture is deliberately minimal. It does not reproduce the full RTO schema, Supabase Auth, Storage, production constraints, the live project, or complete browser workflows. The mocked API test uses no live database. These checks do not replace isolated Supabase integration tests.
