# RTO Release Readiness — Candidate Branch

Branch: `production-ready-candidate`
Production remains on `main`. This branch is a review candidate, not a production release.

## Candidate changes

- Extracted the existing page into `frontend/index.html`, `frontend/css/styles.css`, and `frontend/js/app.js`. Verified that the extracted CSS exactly matches the original style block in `main/index.html` (13,402 characters); no redesign was made.
- Configured Netlify to publish `frontend/`, retained `robots.txt`, and added conservative static response headers.
- Removed direct browser Supabase table and Storage mutations. The frontend now calls a same-origin Netlify Function for business data, reviews, bookings, analytics, and image operations.
- Added server-verified admin, owner, and member sign-in; signed HttpOnly/Secure/SameSite=Lax cookies; role/slug authorization; one-time access-code generation; keyed access-code hashes; and legacy-code upgrade on successful login.
- Added server-side image upload validation for JPG/PNG/WEBP/GIF, file signatures, a 3 MB size limit, and role/business path checks.
- Added server-side guards that block privileged and write actions on non-production Netlify deploy contexts.
- Added an idempotent schema baseline and six forward SQL migrations for schedule/booking fields, address/map fields, review uniqueness/indexes, access-code hashes, direct client access lockdown, and Storage bucket limits.
- Added structural checks, mocked API authentication tests, and PostgreSQL 17 migration/privilege smoke tests.

## Latest verification

GitHub Actions run [#38069291314](https://github.com/reviewtapoperate-glitch/rto/actions/runs/38069291314) passed on 2026-10-10:
- Browser JavaScript syntax: passed.
- Netlify function syntax: passed.
- Structural frontend checks: passed.
- Mocked server API checks for authentication, owner/admin authorization, review authorship, booking isolation/validation, and image upload/delete: passed.
- All six forward migrations applied twice to a disposable PostgreSQL 17 fixture: passed. The clean-install baseline plus all six migrations also passed twice on a second disposable database.
- Fixture assertions for RLS enablement, removal of direct client table privileges, retained server-role grants, and idempotent schema creation: passed.

These are meaningful automated checks, but they do not establish that the app works against the actual Supabase schema, that Supabase Storage behaves correctly after the lockdown, or that every end-to-end user journey passes.

## Mandatory release blockers

1. **Netlify secrets:** the server function needs `SUPABASE_SERVICE_ROLE_KEY` (legacy service-role JWT required by the current direct REST implementation), plus `RTO_SESSION_SECRET`, `RTO_CREDENTIAL_PEPPER`, and `RTO_ADMIN_PASSWORD` configured in Netlify's Functions environment. Keep the session secret stable to preserve active sessions; keep the separate credential pepper stable because it keys stored access-code hashes. Never commit these secrets or put them in browser code. The available connected Netlify tools do not provide a safe write operation for setting these secrets, so they have not been configured by this work.
2. **Isolated Supabase verification:** no non-production Supabase project/branch is available. The baseline and six forward migrations remain unapplied to production. The database migration history is empty. The new baseline covers the five core tables, while full reconciliation of the existing function, event trigger, storage policies, publication settings, and all production grants remains required.
3. **Production schema compatibility:** verify the baseline and all six forward migrations against a schema snapshot matching the actual project, including existing data duplicates before adding the review unique index.
4. **Storage:** candidate uploads are limited to valid JPG/PNG/WEBP/GIF images no larger than 3 MB. Verify upload/delete behavior and public image delivery in isolated Supabase before applying the storage privilege changes.
5. **End-to-end tests:** test admin login, business signup/edit/delete, owner-only edits, member signup/login/logout, review create/update/read, booking submission/status/history, image upload/delete, analytics, directory search, QR/share links, mobile layouts, and negative cross-business/member access.
6. **Contact number:** `CONTACT_WHATSAPP` remains the placeholder `254700000000`; confirm the intended number.
7. **NFC:** program physical tags and test tap/QR behavior on actual iOS and Android devices.

## Release decision

**Do not merge or deploy this candidate to production yet.** The code and migration tests have advanced, but the required Netlify secrets and isolated end-to-end verification are not complete. Merging now would either break data access after the privilege-lockdown migration or leave production on the insecure legacy path.

## Links

- [Security and implementation work order](security-implementation-plan.md)
- [Server function environment setup and limitations](../netlify/functions/README.md)
- [Supabase migration notes](../supabase/README.md)
- [Latest passing CI run](https://github.com/reviewtapoperate-glitch/rto/actions/runs/38069291314)
