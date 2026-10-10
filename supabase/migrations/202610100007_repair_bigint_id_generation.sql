-- Repair bigint ID generation on existing RTO installs.
-- The current production tables have bigint primary keys without identity/default
-- generators, so inserts that omit id (reviews, bookings, page_events) can fail.
-- Fresh installs use identity columns from the baseline and are left unchanged.
DO $$
DECLARE
  table_name text;
  sequence_name text;
  max_id bigint;
  is_identity_column text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['reviews', 'bookings', 'page_events']
  LOOP
    SELECT c.is_identity
      INTO is_identity_column
      FROM information_schema.columns c
     WHERE c.table_schema = 'public'
       AND c.table_name = table_name
       AND c.column_name = 'id';

    IF is_identity_column IS NULL THEN
      RAISE EXCEPTION 'Expected public.%.id column does not exist', table_name;
    END IF;

    IF is_identity_column = 'YES' THEN
      CONTINUE;
    END IF;

    sequence_name := 'rto_' || table_name || '_id_seq';
    EXECUTE format('CREATE SEQUENCE IF NOT EXISTS public.%I', sequence_name);
    EXECUTE format('ALTER SEQUENCE public.%I OWNED BY public.%I.id', sequence_name, table_name);
    EXECUTE format('SELECT COALESCE(MAX(id), 0) FROM public.%I', table_name) INTO max_id;

    PERFORM setval(
      to_regclass(format('public.%I', sequence_name)),
      GREATEST(max_id, 1),
      max_id > 0
    );

    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN id SET DEFAULT nextval(%L::regclass)',
      table_name,
      'public.' || sequence_name
    );
  END LOOP;
END $$;

GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
