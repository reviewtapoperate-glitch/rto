-- Adds one-way keyed credential hashes for owner/member access codes.
-- Existing plaintext credentials are upgraded lazily after a successful login.
-- No current customer or member rows are deleted.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS owner_code_hash text;

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS access_code_hash text;

ALTER TABLE public.members
  ALTER COLUMN access_code DROP NOT NULL;
