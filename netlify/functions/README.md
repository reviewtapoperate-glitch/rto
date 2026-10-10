# RTO server-side authentication configuration

The `rto-auth` Netlify Function routes admin, owner-code, and member sign-in through a stricter IP rate limit. It delegates to the shared handler in `rto-api.mjs`; ordinary data operations use `rto-api`. It fails closed if the server-only configuration is missing.

## Required Netlify environment variables

Configure these in the Netlify UI for the **candidate deploy context first**. Do not put any of these secrets in frontend files, GitHub source, `netlify.toml`, or a public `VITE_`/`NEXT_PUBLIC_` variable.

- `SUPABASE_SECRET_KEY` (preferred) or `SUPABASE_SERVICE_ROLE_KEY` (legacy compatibility): the server-only elevated key for the RTO Supabase project. This is highly privileged and must only be available to Netlify Functions. If both are set, `SUPABASE_SECRET_KEY` takes precedence.
- `RTO_SESSION_SECRET`: a cryptographically random secret of at least 32 characters used to sign session cookies and key credential hashes. Keep it stable; changing it invalidates sessions and hashes for credentials already upgraded.
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

## Important incomplete migration boundary

This is the first authentication implementation stage, not the finished authorization migration. The existing browser code still performs some direct Supabase data operations, and the live database currently has overly permissive policies. Until every privileged read/write has been moved behind authorization-checked endpoints (or properly scoped RLS), and the policies/grants are tightened and tested in a non-production database, this function alone does **not** make the database secure.

Migration `202610100004_hash_access_codes.sql` adds hash columns and allows the legacy member code to be cleared after successful login. Existing plaintext codes are upgraded lazily when a user signs in. The migration has not been applied to production. Do not treat the endpoint as production-ready until the migration and full authorization/policy work are complete.

Never configure a service-role key for a public browser environment. Do not apply security-policy migrations directly to production before the full end-to-end migration plan passes.
