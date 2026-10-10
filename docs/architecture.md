# RTO Current-State Architecture and Separation Plan

**Status:** Audit/documentation only. No application code, database schema, policies, storage configuration, or production deployment was changed for this document.

## Source of truth and inspected baseline

- GitHub repository: `reviewtapoperate-glitch/rto`, production branch `main`.
- Application entry point: root `index.html` (2,187 lines in the inspected version), containing HTML, CSS, and browser JavaScript.
- Netlify project: `reviewtapoperate`; production site `https://reviewtapoperate.netlify.app`; published deploy reported ready. Production branch is `main`.
- Supabase project ref: `ptmznpjsgdkasvywufcx`, region `eu-west-1`.
- Current browser imports: Supabase JS v2 from jsDelivr, QRCodeJS from cdnjs, and Manrope/Caveat from Google Fonts.
- Root files observed on `main`: `index.html`, `robots.txt`, `ENABLE_SCHEDULE_AND_BOOKING_LABEL.sql`, `.github/workflows/keep-alive.yml`.
- No separate application server, Netlify Function, or deployed Supabase Edge Function was identified in the connected-project inspection.
- Supabase migration listing returned an empty list. This is only the state of that listing; it does not prove no SQL has been run outside its recorded migration history.

Re-check the connected services before implementation; this document is a dated snapshot, not a substitute for live verification.

## Current request/data flow

1. A visitor opens the static Netlify page. URL query parameters select the view: `?c=<slug>` for a public business page, `?edit=<slug>` for the owner-code gate, and a hidden logo interaction opens the admin gate.
2. Browser JavaScript initializes Supabase using the project's URL and public anon key embedded in `index.html`.
3. The browser queries or mutates Supabase tables directly. The database's grants and RLS policies are therefore the effective trust boundary; hiding UI elements is not authorization.
4. Images are uploaded from the browser to Supabase Storage bucket `rto-photos`; public URLs are saved in customer profile fields/JSON.
5. The public page logs events to `page_events`, reads internal RTO reviews, accepts booking requests, and subscribes to customer-row changes through Supabase Realtime.
6. QR generation is browser-side. The QR contains the page URL (optionally with a section anchor). Physical NFC chip programming is outside this web application's code.

## Existing source feature map

| Feature area | Source entry points / functions | Data dependency | Current architectural responsibility |
|---|---|---|---|
| Public business profile | `renderPublicProfile`, `renderPublicProfileData`, `setPageSeoTags` | `customers` | Frontend rendering; public profile read from Supabase |
| Links/contact | `tube`, `socialTube`, `vcard`, `sharePage` | Customer fields and JSON | Frontend presentation and external navigation |
| QR tools | `showQr`, `drawQrCanvas`, `tapLink` | Business slug/URL | Frontend-only QR generation |
| Theme selection | `THEMES`, `applyTheme`, `themeOptions` | `customers.theme` | Frontend styling; preserve all nine existing themes |
| Owner editor | `renderOwnerGate`, `checkOwnerCode`, `renderOwnerEditor`, `saveCustomer` | `customers`, Storage | UI belongs in frontend; owner authorization and writes must be secured at backend/database boundary |
| Admin tools | `renderAdminGate`, `checkPass`, `renderDashboard`, `loadCustomerList`, `deleteCustomer` | `customers`, analytics, bookings, Storage | UI belongs in frontend; administrative authority must move out of client-only checks |
| Business directory | `renderSearchPage`, `doSearch`, `renderSearchResults`, `renderComparisonView` | `customers`, `reviews` | Frontend display/search; backend should expose only intended public fields |
| Member account | `doMemberSignup`, `doMemberLogin`, `getMemberSession`, `renderMyAccountPage` | `members`, `bookings` | Frontend forms; member identity/session and data isolation require secure backend design |
| Internal reviews | `loadReviewsSection`, `submitReview` | `reviews`, `members` | Frontend interaction; enforce author/business/rating rules in database/backend |
| Booking requests | `submitBooking`, `loadBookingsInbox`, `setBookingStatus` | `bookings`, `customers`, `members` | Frontend forms/inbox; enforce business/member access and allowed status transitions at backend |
| Image management | `uploadImage`, `deleteFromStorage` | Storage bucket `rto-photos` | Frontend upload UI; storage policy and validation are backend responsibilities |
| Analytics | `logEvent`, `loadAnalyticsData` | `page_events` | Frontend sends events; server/database must constrain access and validate event ownership |
| Schedule/status | `collectScheduleFromForm`, `computeScheduledStatus`, `toggleOpenStatus` | `customers.schedule`, `is_open`, status labels | Existing display logic is frontend; persisted values need schema validation |
| Live updates | `subscribeToLiveUpdates` | Supabase Realtime on `customers` | Frontend subscription; publication membership and readable fields must be verified |

## Current live database inventory

The connected Supabase inspection reported RLS enabled on all five public tables.

| Table | Current observed purpose | Important columns/relationships |
|---|---|---|
| `customers` | Business profiles and owner codes | PK `slug`; profile, contact, links, theme, menu/portfolio JSON, `owner_code`, schedule and directory flags |
| `page_events` | Page views/link event records | `slug` FK to `customers.slug`; `event_type`, `link_label`, timestamp |
| `members` | Member profile/access code | PK `id`; unique `phone`; `access_code` |
| `reviews` | Internal RTO ratings/comments | `business_slug` FK to customers; `member_id` FK to members; rating check 1–5 |
| `bookings` | Booking/service requests | `business_slug` FK to customers; `member_id` FK to members; contact, date/time, status, `item_requested` |

Observed row counts at audit time: customers 6, page_events 0, members 2, reviews 1, bookings 0. Counts can change and should not be used as a permanent baseline.

## Verified source/schema mismatches and defects to address

### 1. Customer fields referenced by the app are absent from the live table

The source reads and writes `customers.address` and `customers.maps_url`, including in the profile form, public page, and the object sent by `saveCustomer()`. The live `customers` column inventory inspected did not include either column. Because the save uses an upsert containing both fields, the save request is expected to fail with a missing-column/schema-cache error until source and schema are reconciled. Confirm against the live schema immediately before preparing a migration.

### 2. Review upsert has no matching unique constraint in the observed schema

`submitReview()` calls `upsert(..., { onConflict: "business_slug,member_id" })`. The inspected `reviews` table had a primary key on `id`, but no unique constraint/index on `(business_slug, member_id)`. PostgreSQL/PostgREST upsert conflict targeting requires a matching unique/exclusion constraint. Review submission is therefore expected to fail unless the live constraint inventory differs from the inspection. Decide product rules first (one review per member per business versus multiple reviews) before adding a constraint.

### 3. Client-only authorization is not secure

The admin passcode is hard-coded in browser JavaScript (`ADMIN_PASSCODE`), and the sessionStorage flag only hides/shows UI. Owner code checking and member access-code comparison also happen in the browser after broad client queries. These are not trusted authentication mechanisms.

### 4. Broad RLS policies expose modification/read operations

The prior live policy inspection showed public-role policies allowing broad operations on customers (including delete/insert/update/select), members (select/insert/update), reviews (select/insert/update/delete), and bookings (select/insert/update). Exact grants and policy definitions must be re-read before remediation. RLS being enabled does not make these policies restrictive. Member access codes and private booking/contact details require particular attention.

### 5. Public Storage upload policy

The observed `rto-photos` bucket is public, with public read and insert policies for anon/authenticated roles and no configured file-size/MIME allowlist. Public image reads may be intentional; unrestricted uploads need review. Do not change the bucket until the intended public upload and read behavior is agreed.

### 6. Exposed SECURITY DEFINER function

The connected security advisor reported that `public.rls_auto_enable()` is a `SECURITY DEFINER` function executable by anon and authenticated roles through the exposed API. Its body is an event-trigger function that enables RLS on new public tables. Confirm its event-trigger attachment, execution grants, and intended exposure; do not simply delete it or change its security mode without reviewing dependencies.

### 7. Missing foreign-key indexes

The performance advisor reported four unindexed foreign keys: `bookings.business_slug`, `bookings.member_id`, `page_events.slug`, and `reviews.member_id`. Confirm existing indexes before creating any. Indexes are performance work, separate from authorization fixes.

### 8. Migration history is not reconciled

The root SQL file `ENABLE_SCHEDULE_AND_BOOKING_LABEL.sql` adds `customers.schedule`, `customers.booking_label`, and `bookings.item_requested` if absent. The live schema currently reports these columns, while the Supabase migration listing returned no records. Do not re-run the file blindly. Establish a migration baseline and document how the existing live schema will be tracked going forward.

### 9. Runtime behavior has not been end-to-end tested

Source inspection does not prove that signup, owner edit, member review, booking, uploads, analytics, realtime, QR destinations, or production SEO work correctly. The repository did not show an established npm test/lint script in the inspected tree. Verification must be introduced deliberately without adding an unneeded build system.

## Recommended separation boundary

**Keep in the frontend:** all current pages, forms, status/toast messages, themes/CSS, directory/search/comparison UI, QR generation, share/vCard actions, image previews, schedule display calculation, and client-side formatting. Preserve existing design and routes.

**Keep in Supabase/backend boundary:** authorization and ownership checks; private member and booking access; review ownership and uniqueness rules; admin-only profile deletion/management; input constraints; protected storage uploads; privileged operations; and controlled event/analytics reads. RLS, grants, constraints, and approved server-side functions must enforce this boundary. Do not expose service-role credentials to the browser.

**Possible later server-side code:** Supabase Edge Functions only where policy/database constraints cannot safely perform the required operation. None were deployed in the last inspection, so do not create them until a concrete need and contract are approved.

## Proposed repository layout (target only)

```text
/
  AGENTS.md
  frontend/
    index.html
    css/       # only after CSS extraction is approved
    js/        # split browser modules incrementally
    assets/    # only assets actually used
  supabase/
    migrations/
    functions/ # only approved Edge Functions
  docs/
    architecture.md
    verification.md
  robots.txt
  .github/workflows/keep-alive.yml
  ENABLE_SCHEDULE_AND_BOOKING_LABEL.sql  # retain until reconciled
```

This is not the current repository tree. Do not move files or change Netlify's publish directory in the same step as logic extraction. The first move should be an isolated, behavior-preserving structural change on a branch, with a deploy preview verified before any production release.

## Phased execution order

1. **Baseline:** capture current GitHub commit, Netlify published deploy/settings, database schema/policies/functions/storage/realtime configuration, and a no-change copy of the production artifact.
2. **Contract and migration inventory:** resolve `address`/`maps_url`, review uniqueness, migration tracking, current function/trigger dependencies, and data-access requirements.
3. **Security design:** specify least-privilege anonymous/member/owner/admin operations for each table and Storage. Define secure authentication/authorization before removing client-side flows.
4. **Data/API layer:** implement approved constraints/policies and any required server-side operations, with tests for allowed and denied actions. Do not mix this with visual changes.
5. **Frontend module extraction:** preserve current markup/styles and behavior; split JS/CSS incrementally, one file/feature at a time.
6. **Netlify preview verification:** confirm routing, assets, external links, public pages, and Supabase connectivity on preview.
7. **Feature regression tests:** run the checklist in `docs/verification.md`; record results and unresolved items.
8. **Release approval:** only after explicit user approval, merge the reviewed branch and verify the production deploy and live data behavior.

## Out of scope unless separately approved

- Visual redesign, changing colors/layout/typography/themes, changing public URL formats, removing existing features, replacing the static app with a framework, changing NFC hardware behavior, deleting production data, or applying production SQL/policy changes without a reviewed migration plan.
