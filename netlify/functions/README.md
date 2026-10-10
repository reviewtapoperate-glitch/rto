# RTO server-side authentication configuration

The `rto-api` Netlify Function is now used for admin, owner-code, and member sign-in. It fails closed if the server-only configuration is missing.

## Required Netlify environment variables

Configure these in the Netlify UI for the **candidate deploy context first**. Do not put any of these secrets in frontend files, GitHub source, `netlify.toml`, or a public `VITE_`/`NEXT_PUBLIC_` variable.

- `SUPABASE_SERVICE_ROLE_KEY`: the service-role secret for the RTO Supabase project. This is highly privileged and must only be available to Netlify Functions.
- `RTO_SESSION_SECRET`: a cryptographically random secret of at least 32 characters used to sign session cookies.
- `RTO_ADMIN_PASSWORD`: the replacement admin passcode, at least 16 characters. It is stored as a Netlify secret, not in browser code.
- `SUPABASE_URL`: optional override; defaults to the existing RTO Supabase project URL.

Scope the secret variables to Functions runtime. After configuring them, trigger a new deploy because function environment values are frozen per deploy.

## Current endpoint actions

- `admin-login`: verifies the admin password server-side and issues a signed, HttpOnly, Secure, SameSite=Lax cookie.
- `owner-info`: returns the business page without the legacy `owner_code` field.
- `owner-login`: verifies the owner code server-side and issues a signed cookie scoped to one business slug.
- `member-signup` / `member-login`: verify member access codes server-side and issue a signed cookie.
- `session` / `logout`: inspect or clear the signed session cookie.

The endpoint has an IP rate-limit configuration. No CORS wildcard is added; it is intended to be called same-origin by the site.

## Important incomplete migration boundary

This is the first authentication implementation stage, not the finished authorization migration. The existing browser code still performs some direct Supabase data operations, and the live database currently has overly permissive policies. Until every privileged read/write has been moved behind authorization-checked endpoints (or properly scoped RLS), and the policies/grants are tightened and tested in a non-production database, this function alone does **not** make the database secure.

The legacy `members.access_code` and `customers.owner_code` columns are still plaintext in the current schema. Do not treat the endpoint as production-ready until the credential-hashing migration and the authorization/policy work are complete.

Never configure a service-role key for a public browser environment. Do not apply security-policy migrations directly to production before the full end-to-end migration plan passes.
