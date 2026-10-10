# RTO Release Readiness — Candidate Branch

Branch: `production-ready-candidate`
Production remains on `main`. This branch is a review candidate, not a production release.

## Changes in this candidate

- Extracts the existing page into `frontend/index.html`, `frontend/css/styles.css`, and `frontend/js/app.js` without intentionally changing the CSS rules or application logic.
- Configures Netlify to publish `frontend/`.
- Copies `robots.txt` into the published frontend.
- Adds conservative response headers without introducing a restrictive CSP that might break existing inline handlers or third-party dependencies.
- Detects Netlify deploy previews and blocks admin/owner screens, member sign-in/sign-up, review/booking submissions, customer writes/deletion, uploads, storage deletion, and analytics event writes there. This is a UI safety guard, not a substitute for fixing the production database's permissive RLS policies.
- Adds Node syntax and structural smoke checks, including assertions that browser code no longer contains the admin passcode and that sign-in routes through the server API.
- Adds a GitHub Actions PostgreSQL 17 service-container test for the three additive SQL migrations. The test uses minimal fixture tables, applies migrations twice, and checks expected columns/types/defaults and indexes.
- Adds versioned SQL migrations for schedule/booking fields, missing `address` and `maps_url` fields, review uniqueness/query indexes, access-code hash columns, and a staged lockdown of direct client database/storage mutation privileges.
- Adds a Netlify server-side API for public business data, admin/owner/member sign-in, business CRUD, bookings, reviews, analytics, and image upload/delete. Admin/owner/member sessions use signed HttpOnly cookies. Browser-side direct Supabase table operations and storage mutations have been removed from the candidate code. Required server-only secrets and migration limitations are documented.
- Documents that current migration history is not a full database baseline.

## Mandatory blockers before production approval

These are not solved by a file split and must not be treated as passed:

1. **Authorization/security:** the current live RLS policies and grants are overly permissive. The hard-coded admin passcode has been removed from browser code and the candidate sign-in flows now call a server function, but direct browser database operations and permissive production policies remain. Access-code and booking data may be exposed through broad public reads. Complete API/RLS authorization work is still required before production use with real customer data.
2. **Database baseline:** no migration records were returned by the connected Supabase project. The included migrations are not a fresh-install schema. Capture and reconcile the actual schema before relying on a clean environment.
3. **Migration verification:** CI now tests the additive migration files on minimal disposable PostgreSQL fixture tables, including reapplication/idempotency. This does **not** verify the complete production schema, Supabase-specific behavior, or the actual live project. The migrations remain unapplied to production; profile save behavior and review upsert behavior still need non-production end-to-end verification.
4. **Contact number:** `CONTACT_WHATSAPP` is still the source's placeholder `254700000000`; confirm the correct contact number before release.
5. **Storage:** public uploads currently lack file-size and MIME restrictions. Agree and test the intended rules.
6. **Runtime/end-to-end tests:** the server API and frontend have been wired together in the candidate, but syntax and fixture migration checks do not prove runtime behavior. Test login, owner editing, admin operations, bookings, reviews, uploads, analytics, profile refresh, QR destinations, mobile layouts, and SEO in an isolated environment.
7. **NFC:** actual NFC tag programming and physical-device testing must be done outside the web app.

## Security and implementation work order

See [`docs/security-implementation-plan.md`](security-implementation-plan.md) for the complete ordered plan, access-control requirements, functional test matrix, and release gates. The plan explicitly preserves the existing styling and keeps production changes blocked until the replacement authorization flows are verified.

## Verification record

- Source used: production `main` `index.html` at blob SHA `66a892c7c6b733dd6ded598e2686ac2fef0ae5bd`.
- Visual CSS rules were extracted as-is; no redesign was requested or introduced.
- The app remains a static frontend using the existing Supabase JS and QRCodeJS CDN dependencies.
- GitHub Actions run [#38065594371](https://github.com/reviewtapoperate-glitch/rto/actions/runs/38065594371) completed successfully on 2026-10-10: `static-checks` passed (Node syntax and structural smoke checks), and `database-migration-smoke` passed (PostgreSQL 17 fixture, all three migrations applied twice, expected schema assertions passed). This validates only the checks described above; it is not a full application or production-schema test.
- No production database, production deployment, or `main` branch code was changed by the candidate work.
