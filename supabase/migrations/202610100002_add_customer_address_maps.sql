-- The current frontend saves and displays these fields, but they were absent
-- from the live public.customers column inventory during the 2026-10-10 audit.
-- Additive and idempotent. Review the live schema immediately before applying.

alter table public.customers
  add column if not exists address text;

alter table public.customers
  add column if not exists maps_url text;
