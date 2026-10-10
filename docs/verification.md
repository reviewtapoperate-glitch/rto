# RTO Verification Checklist

**Purpose:** Repeatable checks for the current app and the planned frontend/backend separation. A checkbox is not marked passed until the test has actually been executed and its result recorded.

## Before testing

- [ ] Record GitHub branch and commit SHA.
- [ ] Record Netlify production deploy ID, state, branch, commit SHA, build/publish settings, and deploy URL.
- [ ] Confirm Supabase project ref and inspect current schema, constraints, indexes, RLS policies, grants, storage policies, functions, triggers, and Realtime publication. Latest read-only audit (2026-10-10) confirmed broad unconditional public policies/grants, public storage inserts without size/MIME limits, `customers` in `supabase_realtime`, and callable execute ACL entries on `rls_auto_enable()`; see `docs/architecture.md`.
- [ ] Confirm no production writes/migrations are part of the test unless explicitly approved.
- [ ] Use a preview/staging project and test accounts where possible; do not use real customer data for destructive tests.

## Schema and migration checks

- [ ] Compare every field written by `saveCustomer()` with `public.customers`; currently observed mismatches include `address` and `maps_url`.
- [ ] Preserve the currently verified unique index `reviews_business_slug_member_id_key` on `(business_slug, member_id)`; test review submission end to end before calling it working.
- [ ] Reconcile `ENABLE_SCHEDULE_AND_BOOKING_LABEL.sql` with the live schema and migration listing; do not run it blindly.
- [ ] For every approved migration, verify preconditions, apply only to the intended environment, inspect the resulting columns/constraints/indexes/policies, and record the result.
- [ ] Test migration recovery/rollback approach before a production migration; do not invent a rollback that loses user data.
- [ ] Current live index inventory shows no leading indexes for `bookings.business_slug`, `bookings.member_id`, `page_events.slug`, or `reviews.member_id`. Recheck before any index migration; note that the unique index on `reviews(business_slug, member_id)` does not lead with `member_id`.

## Security tests — test both allow and deny

- [ ] Anonymous visitor can read only intended public business profile fields.
- [ ] Anonymous visitor cannot list owner codes or member access codes.
- [ ] Anonymous visitor cannot read private member details or other businesses' booking inboxes.
- [ ] Anonymous visitor cannot update/delete customer profiles, reviews, bookings, or members unless a specific operation is intentionally permitted by an approved policy.
- [ ] A member can access only their own account and bookings, and cannot impersonate another member by changing browser storage.
- [ ] A business owner can edit only the assigned business and cannot read or update another business's private data.
- [ ] Only an authorized administrator can create/delete businesses or change privileged settings.
- [ ] Booking status changes are limited to authorized business/admin actors and approved status values.
- [ ] Review author/business association and rating range are enforced at the backend/database.
- [ ] Storage upload and delete actions obey approved bucket, owner, content-type, and size rules.
- [ ] Public image reads continue to work where intended.
- [ ] `public.rls_auto_enable()` cannot be invoked by untrusted roles unless explicitly intended and reviewed.
- [ ] No service-role key or other privileged secret is shipped to browser code.

## Feature smoke tests

### Public profile and navigation
- [ ] Valid `?c=<slug>` loads the expected business.
- [ ] Missing/invalid slug displays a safe not-found state.
- [ ] Optional profile fields can be empty without breaking the page.
- [ ] WhatsApp, Google review, social, map, payment/till, contact/vCard, and share links point to the intended destinations.
- [ ] All nine existing themes render as before; no styling/layout changes introduced.
- [ ] Menu, portfolio, image lightbox, status badge, and schedule work on desktop and mobile.
- [ ] SEO title/description update to the correct business; inspect actual deployed output and crawlability rather than assuming runtime DOM changes guarantee search indexing.

### Owner and admin
- [ ] New business signup creates the expected row and owner access.
- [ ] Valid owner access works only for the intended business; invalid code fails safely.
- [ ] Owner profile changes persist after reload and update the public page.
- [ ] Profile save includes only columns that exist in the current schema.
- [ ] Image upload, replacement, and removal work without orphaned files.
- [ ] Directory visibility and schedule/manual status behave as intended.
- [ ] Admin authorization is enforced outside client-only JavaScript before production use.
- [ ] Delete behavior and dependent records/storage cleanup are tested only in disposable test data.

### Members, reviews, and bookings
- [ ] Member signup handles duplicate phone numbers.
- [ ] Member authentication cannot be bypassed by reading public rows or editing sessionStorage.
- [ ] Review submission succeeds for the intended one-review/multiple-review product rule.
- [ ] Review rating and text validation work and data is linked to the correct member/business.
- [ ] Booking submission validates required inputs and stores expected fields.
- [ ] Booking inbox is limited to the correct business/admin.
- [ ] Confirm/decline status updates are authorized and reflected in the member view.
- [ ] Calendar export and WhatsApp notification link use the correct booking data.
- [ ] Empty review/booking lists and network errors show a safe, understandable state.

### Analytics, realtime, QR, and storage
- [ ] Page views/link clicks create intended events; errors do not break the visitor page.
- [ ] Analytics counts are scoped to the correct business and are not publicly enumerable.
- [ ] Public page receives customer updates only for its own slug and handles reconnects/errors.
- [ ] QR destination exactly matches the intended public page and optional section anchor.
- [ ] Scan QR with multiple phone/browser types. Test NFC separately by reading the physical chip and confirming its encoded URL.
- [ ] Storage URLs remain valid after upload and removal; file validation is enforced by trusted rules.

## Static source checks

- [ ] Search all Supabase table/column references and compare them with live schema.
- [ ] Search all `.rpc()` calls and database functions; map every invocation to a deployed function.
- [ ] Search all Storage bucket operations and compare with bucket policies.
- [ ] Search all Realtime subscriptions and confirm publication/table policy setup.
- [ ] Confirm every async database/storage call handles returned errors.
- [ ] Do not assume test/lint/build scripts exist. Only run scripts present in the repository or introduce approved, minimal tests as part of the plan.

## Refactor/Netlify preview checks

- [ ] Preview deploy uses the intended branch and commit.
- [ ] Root/public routes and `?c=`/`?edit=` query-string behavior still work.
- [ ] CSS, fonts, QR library, Supabase client, images, and external links load correctly.
- [ ] No changed styling, colors, typography, spacing, or page composition.
- [ ] No new console errors or failed network requests in browser checks.
- [ ] All smoke tests are repeated after each structural extraction.
- [ ] Compare preview against production visually and functionally before requesting release approval.

## Results log

For each run, record date/time, branch/commit, deploy ID/URL, environment, exact test performed, expected result, actual result, evidence, and follow-up issue. Keep **Not run**, **Passed**, **Failed**, and **Blocked** distinct; do not convert an untested item into a pass.
