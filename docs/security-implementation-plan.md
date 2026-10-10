# RTO Security and Release Work Order

## Non-negotiable constraints

- Preserve the existing visual design, CSS, layout, copy, themes, and responsive behavior. Security work must change behavior and data access only unless a UI change is essential to make an access state understandable.
- Keep all development on `production-ready-candidate` until the verification gates below pass.
- Do not apply database policy changes to production as an experiment. Do not merge or deploy while a migration or authorization change could lock out the owner or break a core flow.
- Do not use real customer data in functional tests. Preview deploys currently point at the production Supabase project and are not a safe functional-test environment.
- Never represent a code-level check as proof that a complete user journey works.

## Verified baseline risks

1. The frontend contains a hard-coded admin passcode and client-side owner/member access-code checks.
2. Public RLS policies allow broad read/write access to business/customer, member, review, booking, and analytics data.
3. The exposed `public.rls_auto_enable()` SECURITY DEFINER function has EXECUTE granted to `anon` and `authenticated`.
4. The browser upserts reviews on `business_slug,member_id`, but the required matching unique constraint was not found in the schema audit.
5. The frontend writes `customers.address` and `customers.maps_url`, but those columns were absent from the live schema inventory.
6. `CONTACT_WHATSAPP` is still the placeholder `254700000000`.
7. Storage uploads have no verified size/MIME restrictions.
8. Supabase migration history is empty, so the two additive migration files are not a complete database baseline.
9. Existing successful checks cover JavaScript syntax, structural smoke checks, and the two additive migrations on minimal PostgreSQL fixtures only.

## Work order

### 1. Establish a trustworthy staging target

- Use a disposable PostgreSQL service in CI for generic migration tests.
- Add a full schema baseline derived from inspected schema definitions, not guessed from the frontend.
- Use a separate non-production Supabase project only if one is already available; do not create a paid branch or project without cost approval.
- Keep preview write guards in place until functional testing no longer points at production data.

### 2. Define and implement authorization

- Replace the hard-coded admin passcode with a server-verified administrator identity and session.
- Replace client-trusted owner access with a server-verified owner identity/session scoped to one business slug.
- Replace plaintext member access-code comparison with a server-verified, safely stored credential or Supabase Auth identity. Existing credentials must not be exposed by public SELECT policies.
- Keep public business profile reads limited to fields needed to render public pages.
- Allow public booking/review submission only through validated, rate-limited server-side operations; never allow public clients to update or delete arbitrary records.
- Make member review reads/writes scoped to the authenticated member. Prevent a client from choosing another member ID or spoofing a member name.
- Scope owner edits to the authenticated owner's business. Scope admin actions to an administrator.
- Review every table grant, RLS policy, storage policy, RPC, and SECURITY DEFINER function. Revoke unnecessary anonymous/authenticated table privileges and public execution grants only after the replacement flows are implemented and tested together.
- Do not use the anon key as a secret; it is public by design. Any service-role key must remain server-side in a managed secret.

### 3. Reconcile the schema

- Create a reviewed baseline for `customers`, `members`, `reviews`, `bookings`, `page_events`, storage policies, constraints, indexes, and required functions.
- Add and test `customers.address` and `customers.maps_url` before enabling profile saves that write them.
- Add a unique constraint/index matching the review upsert conflict target after checking for duplicates and defining the intended one-review-per-member-per-business rule.
- Add indexes for verified foreign-key/query patterns where useful.
- Make migration files repeatable where practical and test both a clean database install and an upgrade from the observed baseline.
- Never drop or overwrite existing business/customer data as part of baseline reconciliation.

### 4. Validate uploads and public inputs

- Define allowed image MIME types, file-size limit, storage path conventions, and who can upload/delete.
- Validate and normalize phone numbers, slugs, ratings, dates/times, URLs, booking status, and submitted text on the trusted server side.
- Add basic rate limiting and safe error responses to public submission endpoints.
- Ensure secrets, access codes, and private customer details are never returned by public queries.

### 5. Verify complete application journeys

Run in an isolated non-production environment with seeded test data:
- Homepage, directory/search, business page by `?c=slug`, theme rendering, responsive layouts.
- Public links, phone, WhatsApp, Google Maps, social links, menus, portfolio/gallery, QR and share links.
- Admin sign-in, list/create/edit/delete business operations, owner invitation and owner-only editing.
- Member signup/login, session persistence/logout, review create/update/read, and cross-member access denial.
- Booking submission, required-guideline validation, owner/admin booking status management, WhatsApp/calendar export.
- Photo/menu/background upload, invalid MIME/oversize rejection, deletion authorization, and public image loading.
- Analytics event recording and dashboard aggregation.
- Missing/invalid slugs, empty fields, duplicate phone, network failures, unauthorized requests, and expired sessions.
- SEO title/description, robots behavior, and no broken CDN dependencies.
- Physical NFC tag programming and tap/QR tests on real iOS and Android devices remain a separate manual release check.

### 6. Release gates

- CI static checks and full migration tests pass.
- Security policies and grants are reviewed from a read-only audit after applying them to the isolated environment.
- Automated integration/browser tests pass for the journeys above, including negative authorization tests.
- No hard-coded admin credential or browser-only privilege checks remain as security boundaries.
- Correct business contact number is confirmed.
- Preview deploy is verified visually against the existing design; no intended CSS/layout/theme changes.
- Release-readiness document lists any remaining limitations plainly.
- Only then merge to `main`; deploy production and apply production migrations in a coordinated, reversible sequence after checking backups and confirming the exact migration set.

## Current status

- [x] Candidate frontend extraction and Netlify publish configuration.
- [x] Preview-only write/access guards.
- [x] JavaScript syntax and structural smoke tests.
- [x] PostgreSQL 17 CI migration smoke test against minimal fixture tables (both migrations applied twice).
- [ ] Isolated environment for full application tests.
- [ ] Trusted admin/owner/member authentication and server-side authorization.
- [ ] Complete schema baseline and reviewed migration path.
- [ ] Tightened RLS, grants, storage policies, and function execution permissions.
- [ ] End-to-end tests for all critical user journeys and authorization denials.
- [ ] Confirm production WhatsApp number.
- [ ] Visual regression review.
- [ ] Production merge/deploy and coordinated production schema migration.

## Design preservation checklist

- No CSS rules intentionally redesigned.
- No theme palette/layout replacement.
- No public business-page content rearrangement intended.
- Any new login/error copy should reuse existing classes and visual patterns.
- Compare candidate screenshots at desktop and mobile widths before release.
