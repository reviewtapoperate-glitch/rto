-- Supports the frontend's existing review upsert conflict target and common lookups.
-- Additive only: this does not delete or rewrite application data.
-- The deployment gate must verify there are no duplicate (business_slug, member_id)
-- pairs in the target database before applying this migration.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.reviews
    GROUP BY business_slug, member_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add unique review index: duplicate business_slug/member_id rows exist';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS reviews_business_slug_member_id_uidx
  ON public.reviews (business_slug, member_id);

CREATE INDEX IF NOT EXISTS bookings_business_slug_idx
  ON public.bookings (business_slug);

CREATE INDEX IF NOT EXISTS bookings_member_id_idx
  ON public.bookings (member_id);

CREATE INDEX IF NOT EXISTS page_events_slug_idx
  ON public.page_events (slug);

CREATE INDEX IF NOT EXISTS reviews_member_id_idx
  ON public.reviews (member_id);
