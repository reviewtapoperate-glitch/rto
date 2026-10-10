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

Neither migration has been applied to the connected production project by this change.
