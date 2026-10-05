-- Run in Supabase SQL Editor

alter table customers add column if not exists schedule jsonb default '{}';
alter table customers add column if not exists booking_label text default 'Book a visit';
alter table bookings add column if not exists item_requested text;
