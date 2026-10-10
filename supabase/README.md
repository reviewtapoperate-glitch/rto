# Supabase database change notes

Project ref: `ptmznpjsgdkasvywufcx`.

## Important: migration history is not a baseline

The connected project inspection on 2026-10-10 returned an empty migration listing even though the live database contains the application's tables, policies, indexes, function, event trigger, storage bucket, and Realtime publication. These migration files are therefore a **forward-change record**, not a complete fresh-install schema.

Do not point a fresh Supabase project at this migrations directory and assume it will create the whole application. Before any database release:

1. Capture and review a complete schema baseline from the connected Supabase project, including tables, constraints, indexes, RLS policies, grants, functions, triggers, storage policies, and publication membership.
2. Reconcile that baseline with the live schema and existing root-level `ENABLE_SCHEDULE_AND_BOOKING_LABEL.sql`.
3. Verify the target project and current migration status.
4. Apply the additive migrations to a non-production database first.
5. Run positive and negative authorization tests against the actual API roles.
6. Apply to production only after the owner reviews and approves the exact SQL and test results.

## Included forward migrations

- `202610100001_ensure_schedule_booking_fields.sql`: brings the legacy schedule/booking-label SQL into versioned form using idempotent additions.
- `202610100002_add_customer_address_maps.sql`: adds the two customer profile fields currently used by the frontend but absent from the observed live schema.
- `202610100003_add_review_uniqueness_and_query_indexes.sql`: adds the review upsert unique index and common query indexes, aborting if duplicate member/business reviews exist.
- `202610100004_hash_access_codes.sql`: adds keyed-hash columns and allows legacy member codes to be cleared after successful login.
- `202610100005_lock_direct_client_data_access.sql`: removes broad direct client grants/policies from RTO data tables and storage mutations. It must only be applied after the matching server API is configured and deployed.

None of these migrations has been applied to the connected production project by this candidate work.

## Free CI migration smoke test

GitHub Actions runs `tests/sql/migration-smoke.sh` against a disposable PostgreSQL 17 service container. The script creates only minimal `customers` and `bookings` fixture tables, applies all five forward migrations, reapplies them to check idempotency, and asserts expected columns/types/nullability/defaults/indexes and credential-hash columns.

**Scope limitation:** this is a migration syntax/contract smoke test, not a copy of the RTO production schema. It does not test Supabase Auth, Storage, RLS policies, grants, production constraints, or application end-to-end behavior. The fixture must not be mistaken for the missing full database baseline. None of these migrations has been applied to the connected production project by the candidate work.


## Current CI coverage

GitHub Actions run [#38067037973](https://github.com/reviewtapoperate-glitch/rto/actions/runs/38067037973) passed on 2026-10-10 for the earlier candidate state. It does not cover the later server API, credential-hash migration, or client-access lockdown migration; the updated workflow must pass again before this candidate is considered verified. This remains a small-fixture test; it is not a complete production schema baseline, Supabase RLS/security test, or browser end-to-end suite.
