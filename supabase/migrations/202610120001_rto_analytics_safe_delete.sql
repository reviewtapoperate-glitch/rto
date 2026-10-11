-- RTO analytics expansion and atomic administrator deletion.
-- Additive: no existing records are removed by applying this migration.

create or replace function public.rto_system_analytics()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'businesses', (select count(*) from public.customers),
    'listedBusinesses', (select count(*) from public.customers where listed_in_directory is distinct from false),
    'unlistedBusinesses', (select count(*) from public.customers where listed_in_directory = false),
    'members', (select count(*) from public.members),
    'bookings', (select count(*) from public.bookings),
    'pendingBookings', (select count(*) from public.bookings where status = 'pending'),
    'reviews', (select count(*) from public.reviews),
    'eventCount', (select count(*) from public.page_events),
    'views', (select count(*) from public.page_events where event_type = 'view'),
    'clicks', (select count(*) from public.page_events where event_type = 'click'),
    'sourceCounts', coalesce((
      select jsonb_object_agg(source_name, total)
      from (
        select coalesce(nullif(source, ''), 'unknown') as source_name, count(*) as total
        from public.page_events
        where event_type = 'view'
        group by coalesce(nullif(source, ''), 'unknown')
      ) sources
    ), '{}'::jsonb),
    'eventCounts', coalesce((
      select jsonb_object_agg(event_name, total)
      from (
        select coalesce(nullif(event_type, ''), 'unknown') as event_name, count(*) as total
        from public.page_events
        group by coalesce(nullif(event_type, ''), 'unknown')
      ) events
    ), '{}'::jsonb),
    'bookingStatusCounts', coalesce((
      select jsonb_object_agg(status_name, total)
      from (
        select coalesce(nullif(status, ''), 'unknown') as status_name, count(*) as total
        from public.bookings
        group by coalesce(nullif(status, ''), 'unknown')
      ) statuses
    ), '{}'::jsonb),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', activity_day::text, 'views', views, 'clicks', clicks
      ) order by activity_day)
      from (
        select created_at::date as activity_day,
          count(*) filter (where event_type = 'view') as views,
          count(*) filter (where event_type = 'click') as clicks
        from public.page_events
        where created_at >= now() - interval '29 days'
        group by created_at::date
      ) days
    ), '[]'::jsonb),
    'topBusinesses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'slug', slug, 'name', name, 'views', views, 'clicks', clicks
      ) order by views desc, clicks desc, name asc)
      from (
        select c.slug, c.name,
          count(e.id) filter (where e.event_type = 'view') as views,
          count(e.id) filter (where e.event_type = 'click') as clicks
        from public.customers c
        left join public.page_events e
          on e.slug = c.slug and e.created_at >= now() - interval '29 days'
        group by c.slug, c.name
        order by count(e.id) filter (where e.event_type = 'view') desc,
                 count(e.id) filter (where e.event_type = 'click') desc
        limit 10
      ) ranked
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.rto_system_analytics() from public, anon, authenticated;
grant execute on function public.rto_system_analytics() to service_role;

create or replace function public.rto_business_analytics(p_slug text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'businessExists', exists(select 1 from public.customers where slug = p_slug),
    'eventCount', (select count(*) from public.page_events where slug = p_slug),
    'views', (select count(*) from public.page_events where slug = p_slug and event_type = 'view'),
    'clicks', (select count(*) from public.page_events where slug = p_slug and event_type = 'click'),
    'sourceCounts', coalesce((
      select jsonb_object_agg(source_name, total)
      from (
        select coalesce(nullif(source, ''), 'unknown') as source_name, count(*) as total
        from public.page_events
        where slug = p_slug and event_type = 'view'
        group by coalesce(nullif(source, ''), 'unknown')
      ) sources
    ), '{}'::jsonb),
    'eventCounts', coalesce((
      select jsonb_object_agg(event_name, total)
      from (
        select coalesce(nullif(event_type, ''), 'unknown') as event_name, count(*) as total
        from public.page_events
        where slug = p_slug
        group by coalesce(nullif(event_type, ''), 'unknown')
      ) events
    ), '{}'::jsonb),
    'bookingStatusCounts', coalesce((
      select jsonb_object_agg(status_name, total)
      from (
        select coalesce(nullif(status, ''), 'unknown') as status_name, count(*) as total
        from public.bookings
        where business_slug = p_slug
        group by coalesce(nullif(status, ''), 'unknown')
      ) statuses
    ), '{}'::jsonb),
    'bookings', (select count(*) from public.bookings where business_slug = p_slug),
    'topLinks', coalesce((
      select jsonb_agg(jsonb_build_object('link_label', link_label, 'clicks', clicks) order by clicks desc)
      from (
        select coalesce(nullif(link_label, ''), 'Other') as link_label, count(*) as clicks
        from public.page_events
        where slug = p_slug and event_type = 'click'
        group by coalesce(nullif(link_label, ''), 'Other')
        order by count(*) desc
        limit 10
      ) links
    ), '[]'::jsonb),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', activity_day::text, 'views', views, 'clicks', clicks
      ) order by activity_day)
      from (
        select created_at::date as activity_day,
          count(*) filter (where event_type = 'view') as views,
          count(*) filter (where event_type = 'click') as clicks
        from public.page_events
        where slug = p_slug and created_at >= now() - interval '29 days'
        group by created_at::date
      ) days
    ), '[]'::jsonb),
    'recentEvents', coalesce((
      select jsonb_agg(to_jsonb(recent) order by recent.created_at desc)
      from (
        select created_at, event_type, source, link_label
        from public.page_events
        where slug = p_slug
        order by created_at desc
        limit 100
      ) recent
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.rto_business_analytics(text) from public, anon, authenticated;
grant execute on function public.rto_business_analytics(text) to service_role;

create or replace function public.rto_delete_customer(p_slug text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  if p_slug is null or p_slug !~ '^[a-z0-9-]{1,80}$' then
    raise exception 'Invalid business slug';
  end if;
  if not exists (select 1 from public.customers where slug = p_slug) then
    return false;
  end if;

  delete from public.bookings where business_slug = p_slug;
  delete from public.reviews where business_slug = p_slug;
  delete from public.page_events where slug = p_slug;
  delete from public.customers where slug = p_slug;
  get diagnostics deleted_count = row_count;
  return deleted_count = 1;
end;
$$;

revoke all on function public.rto_delete_customer(text) from public, anon, authenticated;
grant execute on function public.rto_delete_customer(text) to service_role;
