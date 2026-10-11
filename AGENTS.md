# AGENTS.md — ReviewTapOperate (RTO)

## Project identity

This repository is ReviewTapOperate (RTO), a static web app for business landing pages, tap/QR links, a business directory, internal reviews, bookings, and business management. It is not a React Native/Expo project.

## Non-negotiable rules

- Preserve the current styling, colors, typography, layout, and user experience. Do not redesign the app.
- Base project facts on the connected GitHub repository, connected Netlify project, and connected Supabase project. Re-check those sources before major work.
- Inspect the exact source and live configuration before changing anything. A function or screen existing in source does not prove it works end to end.
- Do not rewrite unrelated code, add a framework, add dependencies, or create placeholder files just to make the structure look conventional.
- Do not apply SQL, alter RLS/storage policies, delete or transform data, or deploy to production without explicit user approval.
- Work on a non-production branch first. Keep the production branch and deployment unchanged until the user approves a tested release.
- Report what was checked, changed, tested, and not verified. Never claim a test passed unless it was run.

## Verified architecture baseline — re-check before relying on it

- GitHub repository: `reviewtapoperate-glitch/rto`.
- Production `main` baseline: a single static root `index.html` containing HTML, CSS, and browser JavaScript. The `production-ready-candidate` branch extracts these into `frontend/index.html`, `frontend/css/styles.css`, and `frontend/js/app.js` while preserving the existing CSS and browser logic.
- Browser dependencies currently include Supabase JS v2 via jsDelivr, QRCodeJS via cdnjs, and Manrope/Caveat via Google Fonts.
- Netlify project: `reviewtapoperate`; public site: https://reviewtapoperate.netlify.app; production branch: `main`. It serves the current static site.
- Supabase project ref: `ptmznpjsgdkasvywufcx`, region `eu-west-1`.
- Public tables currently observed: `customers`, `page_events`, `members`, `reviews`, `bookings`. RLS is enabled on these tables.
- Storage bucket currently observed: `rto-photos`.
- The source uses Supabase Realtime for customer updates.
- No deployed Supabase Edge Functions were listed in the last inspection.
- The Supabase migration listing returned no migration records in the last inspection. This does not prove that SQL was never applied.
- Existing root files observed: `index.html`, `robots.txt`, `ENABLE_SCHEDULE_AND_BOOKING_LABEL.sql`, and `.github/workflows/keep-alive.yml`. No package manifest or npm scripts were verified in the inspected tree.

Re-check GitHub, Netlify, and Supabase before relying on any item above; connected services can change.

## Existing features to preserve

The source contains UI/client logic for:
- Public business pages using `?c=business-slug`.
- Owner editor using `?edit=business-slug`.
- Business profiles, contact and WhatsApp actions, Google Review links, social/location links, till/payment details, menus, portfolio, images, open/closed status, schedules, and booking labels.
- Nine built-in visual themes.
- QR generation, sharing, and vCard/contact actions.
- Admin dashboard for business profiles, preview, owner access, analytics, bookings, QR tools, and profile deletion.
- Business directory, search, and comparison.
- Member sign-up/sign-in, internal RTO reviews, bookings/service requests, booking status, WhatsApp follow-up, calendar export, and booking history.
- Page-event analytics and customer realtime updates.

Treat these as source-observed features, not proof of successful production behavior. Before refactoring, map each feature to its source entry point, data dependencies, permissions, error behavior, and tests. Do not silently remove or rename a feature.

## Frontend/backend boundary

### Frontend
The browser owns the public pages, directory/search/comparison UI, owner/admin screens, forms and usability validation, status messages, existing CSS/themes, QR presentation/generation, sharing, vCard generation, and calls to approved APIs using public client configuration.

Browser code is public. A hidden screen, JavaScript passcode, query parameter, or client-side validation is not authorization. Never put service-role keys, database passwords, private API keys, or other secrets in frontend code.

### Backend and trusted services
In the current architecture, the trusted backend boundary is primarily Supabase Postgres, RLS, Storage policies, and any explicitly approved server-side function. Do not assume a separate application server exists.

Enforce authorization, ownership, data validation, private-data access, administrative actions, upload restrictions, and privileged integrations at the database/server boundary. Keep legitimate public business-profile reads available where required, while protecting private management and member data. Use an Edge Function only when a specific server-side need is identified and the user approves it; none were listed in the last live inspection.

Before moving a feature, document its current entry point, tables/columns read or written, current policies, target responsibility, failure behavior, and test cases. Preserve public URLs and business slugs unless a compatibility plan is explicitly approved.

## Proposed target structure — not the current tree

```text
/
  AGENTS.md
  frontend/
    index.html        # move only in an approved, tested change
    css/              # optional incremental extraction, no visual change
    js/               # optional incremental extraction
    assets/           # only for assets actually used
  supabase/
    migrations/       # ordered, timestamped, reviewed SQL migrations
    functions/        # only approved server functions; none currently listed
  docs/
    architecture.md
    verification.md
  robots.txt
  .github/workflows/keep-alive.yml
  ENABLE_SCHEDULE_AND_BOOKING_LABEL.sql  # retain until migration status is reconciled
```

This is a proposal, not a claim that these folders exist. Do not move `index.html`, split CSS/JS, create a backend framework, or change Netlify publish settings until the separation plan is approved and a deploy preview can be checked. Do not add React, TypeScript, a bundler, or npm tooling without a demonstrated need and user approval.

## Database and migration rules

Before any migration:
1. Inspect live columns, types, defaults, constraints, indexes, foreign keys, RLS, grants, and policies in connected Supabase.
2. Compare live schema with all SQL files in GitHub and the Supabase migration listing. A filename alone does not prove that a migration ran.
3. Identify data, permission, downtime, and rollback risks.
4. After approval, use uniquely timestamped SQL files in `supabase/migrations/`, one logical change per migration, and review the SQL before applying it.
5. Do not drop/rename columns, delete data, reset the database, disable RLS, or broaden access as a shortcut.
6. Verify preconditions and postconditions. If an apply result is uncertain or fails, inspect the actual database state before retrying.

The existing root SQL file adds `customers.schedule`, `customers.booking_label`, and `bookings.item_requested` if absent. Verify their exact live definitions and migration status before deciding whether to retain, track, or replace that script. Never run it blindly.

## Security review notes

The last connected-project inspection reported broadly permissive public policies on several tables, public read/insert access for `rto-photos`, a callable `SECURITY DEFINER` function named `public.rls_auto_enable()`, and four foreign keys without indexes. Re-check before acting. These are audit items, not permission to modify production.

Review policies and grants together. Map anonymous, authenticated, owner, and administrator permissions to actual product needs; test both allowed and denied operations. Protect owner/member codes and private records. Restrict upload file types and sizes according to approved requirements. Never expose service-role credentials in browser code.

## End-to-end verification

Test relevant paths, not just screen rendering:
- Public pages: valid/missing slug, optional fields, external links, and mobile layout.
- Owner/admin: authorization, invalid codes, editing another business, persistence after reload, and safe failure.
- Directory/search/comparison: listed/unlisted records, empty results, missing optional data.
- Reviews/members: validation, persistence, rating bounds, and access isolation.
- Bookings: submission, inbox, status changes, associations, and invalid input.
- Images: upload/display/removal, invalid types, file size, and permissions.
- QR/NFC: QR must target the correct stable business URL; physical NFC behavior must be checked separately.
- Analytics/realtime: writes, aggregation, permissions, and connection failures.
- Migrations: preconditions, postconditions, constraints, policies, and recovery plan.

Only use test/lint commands that actually exist in the repository. Do not claim `npm test`, `npm run lint`, or `npm run typecheck` exists unless the corresponding scripts are present and have been run.

## Required workflow

1. Read this file and inspect the exact source files.
2. Confirm current GitHub branch/commit and Netlify production branch/deploy.
3. Inspect Supabase schema/policies/storage/functions/migration history when relevant.
4. Provide a concise plan of files, behavior, dependencies, risks, and tests.
5. Separate verified facts from assumptions and unknowns.
6. Get explicit approval before architecture changes, live data/permission changes, or production deployment.
7. Make the smallest focused change on a non-production branch.
8. Review the diff for accidental design, behavior, schema, or unrelated changes.
9. Run available checks and report exact outcomes.
10. Verify the deploy preview and relevant Supabase behavior before proposing release.

## Current separation project scope

The user has approved building a complete verification candidate in a non-production branch. Current candidate work includes a behavior-preserving frontend file extraction, Netlify preview configuration, static checks, and staged additive SQL files. Do not merge this candidate, apply migrations, change live policies/grants/storage, or deploy production until the user verifies the preview and explicitly approves the release.

The frontend/backend security separation is **not complete** in this candidate. The app still performs direct Supabase queries, has client-side admin/owner/member authorization, and the live RLS/grants are overly permissive. Treat these as release blockers, not future optional cleanup. Do not claim the candidate is production-ready until a secure backend boundary is implemented, a complete database baseline is reconciled, and positive/negative end-to-end tests pass against an isolated staging database.

Netlify deploy previews are connected to the production Supabase URL embedded in the frontend. Preview-specific UI guards block privileged screens and known write actions, but they are not a security boundary against direct API calls. Use the preview for limited visual/static verification only. Do not enter test data, run write workflows, or treat the preview as an isolated staging environment.

Next work must complete the remaining security architecture on a non-production branch: design owner/member/admin authentication, enforce least-privilege database and Storage access, move sensitive operations behind trusted server-side/database authorization, test the exact migrations against a separate staging database, then rerun all UI and end-to-end checks. If creating a Supabase branch incurs cost, obtain the required cost confirmation first. Keep styling and existing routes unchanged.
