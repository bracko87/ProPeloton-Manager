-- SAT-01 / SAT-08: fail-closed *draft* transactional test-club creation.
-- Do not deploy alone. Requires the 14-day lifecycle migration and completed
-- Auth/RLS/finance/race/Premium review. Never changes the regular create_club RPC.
-- A client cannot turn on the rollout, set capacity, or edit the test term.

create table if not exists private.saturn_test_club_rollout_v1 (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  verified_at timestamptz,
  reason text not null default 'All gameplay RPCs and expiry enforcement must pass before activation',
  constraint saturn_club_rollout_requires_verification
    check (not enabled or verified_at is not null)
);
insert into private.saturn_test_club_rollout_v1(id,enabled)
values(true,false) on conflict(id) do nothing;
alter table private.saturn_test_club_rollout_v1 enable row level security;
revoke all on private.saturn_test_club_rollout_v1 from public, anon, authenticated;

-- Admin-reviewed official regional league capacities, not arbitrary client
-- parameters. No rows are prepopulated; missing capacity blocks creation.
create table if not exists private.saturn_test_division_capacity_v1 (
  world_tier smallint not null check (world_tier between 1 and 10),
  amateur_division text not null,
  max_teams integer not null check (max_teams > 0),
  approved_at timestamptz not null,
  primary key (world_tier, amateur_division)
);
alter table private.saturn_test_division_capacity_v1 enable row level security;
revoke all on private.saturn_test_division_capacity_v1 from public, anon, authenticated;

create or replace function public.saturn_create_test_club_v1(
  p_nickname text,
  p_name text,
  p_country_code text,
  p_primary_color text,
  p_secondary_color text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_country text := upper(btrim(coalesce(p_country_code,'')));
  v_nickname text := btrim(coalesce(p_nickname,''));
  v_name text := btrim(coalesce(p_name,''));
  v_primary text := btrim(coalesce(p_primary_color,''));
  v_secondary text := btrim(coalesce(p_secondary_color,''));
  v_division text;
  v_tier smallint;
  v_max_teams integer;
  v_current integer;
  v_club uuid;
  v_money numeric;
  v_start timestamptz;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  -- No unaudited enablement: BOTH the existing anonymous Auth signup gate
  -- and a separate explicit game-wide test-club rollout gate must be open.
  if not exists(
    select 1 from private.ppm_guest_auth_gate_v1 g
    where g.id and g.enabled and g.verified_at is not null
  ) or not exists(
    select 1 from private.saturn_test_club_rollout_v1 g
    where g.id and g.enabled and g.verified_at is not null
  ) then
    raise exception 'Test-team creation is not enabled';
  end if;

  -- Source of truth is auth.users, NOT self-editable user metadata.
  if not exists (
    select 1 from auth.users u
    where u.id = v_user and u.is_anonymous is true
  ) then
    raise exception 'Only verified temporary Auth identities can create a test team';
  end if;

  -- Serialize a user's parallel form submits and regional division allocation.
  perform pg_advisory_xact_lock(hashtextextended('saturn-test-user:'||v_user::text, 11));

  if exists(select 1 from public.saturn_test_accounts_v1 t where t.user_id=v_user)
    or exists(select 1 from public.clubs c where c.owner_user_id=v_user)
  then
    raise exception 'This player already has a team';
  end if;

  if length(v_nickname) < 3 or length(v_nickname)>24
    or length(v_name)<3 or length(v_name)>40
    or v_primary !~ '^#[0-9a-fA-F]{6}$'
    or v_secondary !~ '^#[0-9a-fA-F]{6}$'
    or lower(v_primary)=lower(v_secondary)
  then
    raise exception 'Invalid nickname, team name or kit colors';
  end if;

  if not exists(select 1 from public.countries c
                where c.code=v_country and c.is_selectable is true)
  then
    raise exception 'Unknown or unavailable country';
  end if;

  v_division := public.safe_get_amateur_division_for_country(v_country);
  if v_division is null or v_division='' then
    raise exception 'No eligible amateur division for this country';
  end if;

  -- Choose the bottom ACTIVE amateur tier based on existing configuration,
  -- not user input or a guessed division. Must be backed by approved capacity.
  select max(c.world_tier) into v_tier from public.clubs c
    where c.club_tier='amateur'::public.club_tier and c.is_active is true;
  if v_tier is null then
    raise exception 'No active amateur tier';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('saturn-test-division:'||v_tier::text||':'||v_division, 23)
  );

  select max_teams into v_max_teams
  from private.saturn_test_division_capacity_v1
  where world_tier=v_tier and amateur_division=v_division
    and approved_at is not null;

  if v_max_teams is null then
    raise exception 'Test-team capacity has not been approved for this division';
  end if;

  select count(*) into v_current
  from public.clubs c
  where c.world_tier=v_tier and c.club_tier='amateur'::public.club_tier
    and c.amateur_division=v_division and c.is_active is true;
  if v_current>=v_max_teams then
    raise exception 'No free team slot in the lowest eligible division';
  end if;

  -- This is the same official club schema and setup used by registered players.
  -- Every statement participates in this one transaction: rollback on failure.
  select now() into v_start;
  insert into public.clubs(
    owner_user_id,name,country_code,primary_color,secondary_color,
    world_tier,club_tier,amateur_division,reputation,is_ai,is_active,club_type
  ) values (
    v_user,v_name,v_country,v_primary,v_secondary,
    v_tier,'amateur'::public.club_tier,v_division,0,false,true,'main'
  ) returning id into v_club;

  -- Live clubs carry an AFTER INSERT AI-slot assignment trigger which can
  -- replace world_tier/club_tier/division. Never silently accept a promoted
  -- temporary team or a mismatched region. A mismatch aborts the ENTIRE
  -- transaction, rolling back both the player insert and AI-slot movement.
  if not exists(
    select 1 from public.clubs c
    where c.id=v_club and c.owner_user_id=v_user
      and c.world_tier=v_tier
      and c.club_tier='amateur'::public.club_tier
      and c.amateur_division=v_division
      and c.is_ai is false
  ) then
    raise exception 'Automatic AI-slot assignment did not preserve the lowest eligible league; test-team creation cancelled';
  end if;

  insert into public.club_memberships(club_id,user_id,role)
    values(v_club,v_user,'owner');
  insert into public.club_settings(club_id) values(v_club)
    on conflict(club_id) do nothing;

  if to_regprocedure('public.finance_setup_new_club(uuid)') is not null then
    perform public.finance_setup_new_club(v_club);
  end if;
  perform public.apply_new_club_creation_balance_v1(v_club,true);
  select coalesce(c.cash_balance,0) into v_money
    from public.clubs c where c.id=v_club;
  insert into public.club_finance_summary(club_id,current_balance)
    values(v_club,v_money)
    on conflict(club_id) do update set current_balance=excluded.current_balance;

  update public.profiles
    set username=v_nickname,has_created_club=true
    where id=v_user;
  if not found then
    raise exception 'Manager profile could not be initialized';
  end if;

  insert into public.saturn_test_accounts_v1(
    user_id,club_id,started_at,premium_ends_at,expires_at
  ) values (
    v_user,v_club,v_start,v_start+interval '168 hours',
    v_start+interval '336 hours'
  );

  -- No automatic Premium or welcome-coin grant here: existing entitlement
  -- system must first be integrated and anti-farming reviewed separately.
  return v_club;
end;
$$;

-- Even if this migration is deployed for review, the function has NO
-- anonymous/authenticated execution rights. A future audited release must
-- grant EXECUTE together with its full backend authorization changes.
revoke all on function public.saturn_create_test_club_v1(text,text,text,text,text)
  from public, anon, authenticated;
