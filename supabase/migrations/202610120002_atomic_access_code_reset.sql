-- Atomic administrator processing for member access-code reset requests.
-- Additive function only: this does not update existing records.
create or replace function public.rto_resolve_access_code_reset(
  p_request_id bigint,
  p_code_hash text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  reset_request public.access_code_reset_requests%rowtype;
  affected integer;
begin
  if p_request_id is null
     or p_code_hash is null
     or p_code_hash !~ '^hmac-sha256:[A-Za-z0-9_-]{43}$' then
    raise exception 'Invalid access-code reset input';
  end if;

  select *
    into reset_request
    from public.access_code_reset_requests
   where id = p_request_id
     and status = 'pending'
   for update;

  if not found or reset_request.member_id is null then
    return false;
  end if;

  update public.members
     set access_code = null,
         access_code_hash = p_code_hash
   where id = reset_request.member_id;

  get diagnostics affected = row_count;
  if affected <> 1 then
    return false;
  end if;

  update public.access_code_reset_requests
     set status = 'resolved',
         resolved_at = now()
   where id = p_request_id
     and status = 'pending';

  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Access-code reset request changed during processing';
  end if;

  return true;
end;
$$;

revoke all on function public.rto_resolve_access_code_reset(bigint, text) from public, anon, authenticated;
grant execute on function public.rto_resolve_access_code_reset(bigint, text) to service_role;
