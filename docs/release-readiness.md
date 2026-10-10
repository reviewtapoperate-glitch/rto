# RTO Release Readiness — Candidate Branch

Branch: `production-ready-candidate`
Production remains on `main`. This branch is a review candidate, not a production release.

## Changes in this candidate

- Extracts the existing page into `frontend/index.html`, `frontend/css/styles.css`, and `frontend/js/app.js` without intentionally changing the CSS rules or application logic.
- Configures Netlify to publish `frontend/`.
- Copies `robots.txt` into the published frontend.
- Adds conservative response headers without introducing a restrictive CSP that might break existing inline handlers or third-party dependencies.
- Detects Netlify deploy previews and blocks admin/owner screens, member sign-in/sign-up, review/booking submissions, customer writes/deletion, uploads, storage deletion, and analytics event writes there. This is a UI safety guard, not a substitute for fixing the production database's permissive RLS policies.
- Adds Node syntax and structural smoke checks.
- Adds versioned, additive SQL files for the existing schedule/booking fields and the missing `address` and `maps_url` fields.
- Documents that current migration history is not a full database baseline.

## Mandatory blockers before production approval

These are not solved by a file split and must not be treated as passed:

1. **Authorization/security:** the current live RLS policies and grants are overly permissive. The frontend contains a hard-coded admin passcode and client-side owner/member code checks. Access-code and booking data may be exposed through broad public reads. A backend authentication/authorization redesign is required before production use with real customer data.
2. **Database baseline:** no migration records were returned by the connected Supabase project. The included migrations are not a fresh-install schema. Capture and reconcile the actual schema before relying on a clean environment.
3. **Apply/test schema migrations:** the two SQL migrations are staged only. Apply them to a non-production database, inspect results, and run profile save tests. They have not been applied here.
4. **Contact number:** `CONTACT_WHATSAPP` is still the source's placeholder `254700000000`; confirm the correct contact number before release.
5. **Storage:** public uploads currently lack file-size and MIME restrictions. Agree and test the intended rules.
6. **Runtime/end-to-end tests:** syntax and static checks do not prove login, owner editing, admin operations, bookings, reviews, uploads, analytics, Realtime, QR destinations, mobile layouts, or SEO behavior work.
7. **NFC:** actual NFC tag programming and physical-device testing must be done outside the web app.

## Verification record

- Source used: production `main` `index.html` at blob SHA `66a892c7c6b733dd6ded598e2686ac2fef0ae5bd`.
- Visual CSS rules were extracted as-is; no redesign was requested or introduced.
- The app remains a static frontend using the existing Supabase JS and QRCodeJS CDN dependencies.
- GitHub Actions checks are included in this branch; report actual workflow state rather than assuming it passed.
- No production database, production deployment, or `main` branch code was changed by the candidate creation.
