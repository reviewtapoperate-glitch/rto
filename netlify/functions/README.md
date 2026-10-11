# RTO server-side authentication configuration

The `rto-auth` Netlify Function routes admin, owner-code, and member sign-in through a stricter IP rate limit. It delegates to the shared handler in `rto-api.mjs`; ordinary data operations use `rto-api`. It fails closed if the server-only configuration is missing.

## Required Netlify environment variables

Configure these in the Netlify UI for the **candidate deploy context first**. Do not put any of these secrets in frontend files, GitHub source, `netlify.toml`, or a public `VITE_`/`NEXT_PUBLIC_` variable.

- `SUPABASE_SERVICE_ROLE_KEY`: the legacy service-role JWT for the RTO Supabase project. This is highly privileged and must only be available to Netlify Functions. The current direct REST API implementation requires this compatible server-side key; do not substitute a publishable/anon key.
- `RTO_SESSION_SECRET`: a cryptographically random secret of at least 32 characters used to sign session cookies. Rotating it invalidates active sessions.
- `RTO_CREDENTIAL_PEPPER`: a separate cryptographically random secret of at least 32 characters used to key access-code hashes. Keep it stable; changing it invalidates access codes already upgraded to hashes.
- `RTO_ADMIN_PASSWORD`: the replacement admin passcode, at least 16 characters. It is stored as a Netlify secret, not in browser code.
- `SUPABASE_URL`: optional override; defaults to the existing RTO Supabase project URL.

Scope the secret variables to Functions runtime. After configuring them, trigger a new deploy because function environment values are frozen per deploy.

## Current endpoint actions

- `admin-login`: verifies the admin password server-side and issues a signed, HttpOnly, Secure, SameSite=Lax cookie.
- `owner-info`: returns the business page without legacy or hashed credential fields.
- `business-signup`: creates a business with a hashed owner code and starts an owner session; the code is returned once.
- `owner-login-by-code`: securely verifies the general business login code.
- `admin-owner-code`: issues/rotates an owner code after verifying the admin session; the new code is returned once.
- `owner-login`: verifies the owner code server-side and issues a signed cookie scoped to one business slug.
- `member-signup` / `member-login`: verify member access codes server-side and issue a signed cookie.
- `session` / `logout`: inspect or clear the signed session cookie.

The endpoint has an IP rate-limit configuration. Non-production deploy contexts block privileged and write actions server-side; preview UI guards alone are not relied on. No CORS wildcard is added; it is intended to be called same-origin by the site.

## Production migration and authorization boundary

The candidate browser code routes table reads and writes through the same-origin Netlify API; it must not use a Supabase service-role key or query tables directly from the browser. The live Supabase database has historically permissive public policies, so the API layer alone is not sufficient until the forward security migration is applied and verified.

Release order matters:
1. Apply and verify the additive schema/credential migrations against the current live schema, preserving all existing customer/member/review rows.
2. Deploy this API and frontend to production and verify public profiles, owner/admin/member sign-in, profile edits, reviews, bookings, analytics, and image upload/delete.
3. Only then apply `202610100005_lock_direct_client_data_access.sql`, which removes direct client table writes and old permissive policies. Verify server-role access and public profile/image reads immediately afterwards.
4. Run Supabase security advisors and the production smoke checks. Do not claim the database is secured until the grants, policies, and function privileges are verified.

Migration `202610100004_hash_access_codes.sql` adds keyed-hash columns and allows legacy member codes to be cleared after a successful login. Existing credentials are upgraded lazily, so this migration must be applied before member signup/login flows are relied on in production. The legacy `rls_auto_enable()` event-trigger function must not be callable through the exposed API; the security migration revokes its execution from public client roles.

Never configure a service-role key for a public browser environment. Never run the security migration before the server-backed production deployment is live and verified.
