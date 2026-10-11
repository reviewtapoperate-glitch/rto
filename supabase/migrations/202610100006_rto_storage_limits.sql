-- Defense-in-depth Storage limits matching the server-side upload validator.
-- The RTO bucket remains public for direct display of existing business images;
-- writes are performed only by the server API after authorization.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN
    RAISE NOTICE 'Supabase Storage schema not available; skipping bucket configuration in generic PostgreSQL tests';
  ELSE
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'rto-photos',
      'rto-photos',
      true,
      3145728,
      ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
    )
    ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name,
          public = true,
          file_size_limit = EXCLUDED.file_size_limit,
          allowed_mime_types = EXCLUDED.allowed_mime_types;
  END IF;
END $$;
