-- Automated SMS-based customer access-code recovery.
-- No client role can read or mutate recovery challenges; Netlify service-role requests only.
create table if not exists public.access_code_recovery_challenges (
  challenge_id uuid primary key,
  member_id uuid not null references public.members(id) on delete cascade,
  phone text not null,
  otp_hash text not null,
  status text not null default 'pending'
    check (status in ('pending','verified','completed','locked','delivery_failed')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  verified_at timestamptz,
  completed_at timestamptz
);
create index if not exists access_code_recovery_phone_created_idx
  on public.access_code_recovery_challenges (phone, created_at desc);
create index if not exists access_code_recovery_expiry_idx
  on public.access_code_recovery_challenges (expires_at);
alter table public.access_code_recovery_challenges enable row level security;
revoke all on table public.access_code_recovery_challenges from public, anon, authenticated;
grant all on table public.access_code_recovery_challenges to service_role;

create or replace function public.rto_complete_sms_access_recovery(
  p_challenge_id uuid,
  p_code_hash text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
begin
  if p_code_hash is null or p_code_hash !~ '^hmac-sha256:[A-Za-z0-9_-]{43}$' then
    return false;
  end if;
  select member_id into v_member_id
    from public.access_code_recovery_challenges
    where challenge_id = p_challenge_id
      and status = 'verified'
      and expires_at > now()
    for update;
  if v_member_id is null then
    return false;
  end if;
  update public.members
    set access_code_hash = p_code_hash, access_code = null
    where id = v_member_id;
  if not found then
    return false;
  end if;
  update public.access_code_recovery_challenges
    set status = 'completed', completed_at = now()
    where challenge_id = p_challenge_id and status = 'verified';
  if not found then
    return false;
  end if;
  return true;
end;
$$;
revoke all on function public.rto_complete_sms_access_recovery(uuid, text) from public, anon, authenticated;
grant execute on function public.rto_complete_sms_access_recovery(uuid, text) to service_role;
