-- Reconcile the legacy one-off SQL file with versioned migration tracking.
-- Safe to apply to the observed live schema because each column is added only if absent.
-- This is NOT a complete database baseline; see supabase/README.md before using on a fresh project.

alter table public.customers
  add column if not exists schedule jsonb not null default '{}'::jsonb;

alter table public.customers
  add column if not exists booking_label text not null default 'Book a visit';

alter table public.bookings
  add column if not exists item_requested text;
