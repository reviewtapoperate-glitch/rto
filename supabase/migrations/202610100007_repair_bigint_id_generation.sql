-- Repair bigint ID generation on existing RTO installs.
-- The connected production tables have bigint IDs without identity/default
-- generators, so inserts that omit id (reviews, bookings, page_events) can fail.
-- Fresh installs use identity columns from the baseline and are left unchanged.
DO $$
DECLARE
  target_table text;
  sequence_name text;
  max_id bigint;
  identity_column text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY['reviews', 'bookings', 'page_events']
  LOOP
    SELECT c.is_identity
      INTO identity_column
      FROM information_schema.columns AS c
     WHERE c.table_schema = 'public'
       AND c.table_name = target_table
       AND c.column_name = 'id';

    IF identity_column IS NULL THEN
      RAISE EXCEPTION 'Expected public.%.id column does not exist', target_table;
    END IF;

    IF identity_column = 'YES' THEN
      CONTINUE;
    END IF;

    sequence_name := 'rto_' || target_table || '_id_seq';
    EXECUTE format('CREATE SEQUENCE IF NOT EXISTS public.%I', sequence_name);
    EXECUTE format('ALTER SEQUENCE public.%I OWNED BY public.%I.id', sequence_name, target_table);
    EXECUTE format('SELECT COALESCE(MAX(id), 0) FROM public.%I', target_table) INTO max_id;

    PERFORM setval(
      to_regclass(format('public.%I', sequence_name)),
      GREATEST(max_id, 1),
      max_id > 0
    );

    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN id SET DEFAULT nextval(%L::regclass)',
      target_table,
      'public.' || sequence_name
    );
  END LOOP;
END $$;

GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
