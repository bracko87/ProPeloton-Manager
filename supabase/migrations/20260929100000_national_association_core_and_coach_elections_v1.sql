-- National Associations / National Coach elections v1
-- Design decisions:
-- - No Association treasury, Coin balance, travel cost, staff payroll, or paid equipment.
-- - One active/forming Association per country.
-- - Activation requires 5 eligible human main-club managers from that country.
-- - One member = one vote.
-- - Annual coach election: registration Jan 1-10, voting Jan 10-20,
--   first runoff Jan 20-27, then repeated 7-day runoffs until a unique winner.
-- - Votes are immutable and secret while an election is open.
-- - The previous coach carries over as caretaker until a unique winner exists.
-- - First activation outside the annual January window uses the Tennis-style
--   10-day registration + 10-day vote, then 7-day runoffs.
-- - No finance/treasury tables are created by this migration.

create schema if not exists private;
revoke all on schema private from public;

create table if not exists public.national_association_config (
  id boolean primary key default true check (id = true),
  minimum_active_members smallint not null default 5
    check (minimum_active_members between 2 and 50),
  annual_registration_start_month smallint not null default 1
    check (annual_registration_start_month between 1 and 12),
  annual_registration_start_day smallint not null default 1
    check (annual_registration_start_day between 1 and 31),
  annual_registration_close_month smallint not null default 1
    check (annual_registration_close_month between 1 and 12),
  annual_registration_close_day smallint not null default 10
    check (annual_registration_close_day between 1 and 31),
  annual_round1_close_month smallint not null default 1
    check (annual_round1_close_month between 1 and 12),
  annual_round1_close_day smallint not null default 20
    check (annual_round1_close_day between 1 and 31),
  annual_round2_close_month smallint not null default 1
    check (annual_round2_close_month between 1 and 12),
  annual_round2_close_day smallint not null default 27
    check (annual_round2_close_day between 1 and 31),
  activation_registration_days smallint not null default 10
    check (activation_registration_days between 1 and 30),
  activation_voting_days smallint not null default 10
    check (activation_voting_days between 1 and 30),
  repeated_runoff_days smallint not null default 7
    check (repeated_runoff_days between 1 and 30),
  national_squad_size smallint not null default 10
    check (national_squad_size between 7 and 20),
  national_lineup_size smallint not null default 7
    check (national_lineup_size between 1 and 20),
  max_lineup_changes smallint not null default 3
    check (max_lineup_changes between 0 and 20),
  masked_overall_span smallint not null default 3
    check (masked_overall_span between 1 and 10),
  updated_at timestamptz not null default now(),
  check (national_lineup_size <= national_squad_size)
);

insert into public.national_association_config(id)
values (true)
on conflict (id) do nothing;

create table if not exists public.national_associations (
  id uuid primary key default gen_random_uuid(),
  country_code text not null,
  name text not null,
  status text not null default 'forming'
    check (status in ('forming','active','inactive')),
  created_by_user_id uuid,
  created_on_game_date date not null default public.get_current_game_date_date(),
  activated_on_game_date date,
  inactive_on_game_date date,
  last_status_change_on_game_date date not null default public.get_current_game_date_date(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(country_code),
  check (country_code = upper(country_code))
);

create table if not exists public.national_association_memberships (
  id uuid primary key default gen_random_uuid(),
  association_id uuid not null references public.national_associations(id) on delete cascade,
  user_id uuid not null,
  club_id uuid not null references public.clubs(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active','left','ineligible')),
  coach_eligible boolean not null default true,
  joined_on_game_date date not null default public.get_current_game_date_date(),
  left_on_game_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(association_id,user_id)
);

create unique index if not exists national_association_memberships_one_active_per_user_idx
  on public.national_association_memberships(user_id)
  where status='active';

create index if not exists national_association_memberships_assoc_status_idx
  on public.national_association_memberships(association_id,status);

create table if not exists public.national_coach_elections (
  id uuid primary key default gen_random_uuid(),
  association_id uuid not null references public.national_associations(id) on delete cascade,
  season_number integer not null check (season_number > 0),
  election_kind text not null default 'annual'
    check (election_kind in ('annual','activation','replacement')),
  reason text,
  status text not null default 'candidate_registration'
    check (status in ('candidate_registration','voting','runoff','completed','cancelled')),
  registration_open_date date not null,
  registration_close_date date not null,
  round1_open_date date not null,
  round1_close_date date not null,
  current_round integer not null default 1 check (current_round >= 1),
  current_round_open_date date,
  current_round_close_date date,
  runoff_registration_open boolean not null default false,
  winning_candidate_id uuid,
  completed_on_game_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(association_id,season_number,election_kind),
  check (registration_open_date < registration_close_date),
  check (registration_close_date <= round1_open_date),
  check (round1_open_date < round1_close_date)
);

create index if not exists national_coach_elections_assoc_status_idx
  on public.national_coach_elections(association_id,status);

create table if not exists public.national_coach_candidates (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references public.national_coach_elections(id) on delete cascade,
  membership_id uuid not null references public.national_association_memberships(id) on delete cascade,
  user_id uuid not null,
  club_id uuid not null references public.clubs(id) on delete cascade,
  manifesto text not null check (char_length(manifesto) between 10 and 1000),
  status text not null default 'active'
    check (status in ('active','withdrawn','ineligible')),
  registered_on_game_date date not null default public.get_current_game_date_date(),
  withdrawn_on_game_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(election_id,user_id)
);

create table if not exists public.national_coach_runoff_candidates (
  election_id uuid not null references public.national_coach_elections(id) on delete cascade,
  round_number integer not null check (round_number >= 2),
  candidate_id uuid not null references public.national_coach_candidates(id) on delete cascade,
  primary key(election_id,round_number,candidate_id)
);

create table if not exists public.national_coach_votes (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references public.national_coach_elections(id) on delete cascade,
  round_number integer not null check (round_number >= 1),
  membership_id uuid not null references public.national_association_memberships(id) on delete cascade,
  voter_user_id uuid not null,
  candidate_id uuid not null references public.national_coach_candidates(id) on delete cascade,
  cast_on_game_date date not null default public.get_current_game_date_date(),
  created_at timestamptz not null default now(),
  unique(election_id,round_number,voter_user_id)
);

create index if not exists national_coach_votes_election_round_candidate_idx
  on public.national_coach_votes(election_id,round_number,candidate_id);

create table if not exists public.national_coach_terms (
  id uuid primary key default gen_random_uuid(),
  association_id uuid not null references public.national_associations(id) on delete cascade,
  election_id uuid references public.national_coach_elections(id) on delete set null,
  candidate_id uuid references public.national_coach_candidates(id) on delete set null,
  membership_id uuid not null references public.national_association_memberships(id) on delete restrict,
  user_id uuid not null,
  club_id uuid not null references public.clubs(id) on delete restrict,
  season_number integer not null check (season_number > 0),
  term_start_game_date date not null,
  term_end_game_date date not null,
  status text not null default 'active'
    check (status in ('active','completed','resigned','ineligible')),
  term_kind text not null default 'elected'
    check (term_kind in ('elected','caretaker','replacement')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (term_start_game_date <= term_end_game_date)
);

create unique index if not exists national_coach_terms_one_active_per_association_idx
  on public.national_coach_terms(association_id)
  where status='active';

create index if not exists national_coach_terms_assoc_season_idx
  on public.national_coach_terms(association_id,season_number desc);

create or replace function private.ppm_set_updated_at_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists national_association_config_set_updated_at
  on public.national_association_config;
create trigger national_association_config_set_updated_at
before update on public.national_association_config
for each row execute function private.ppm_set_updated_at_v1();

drop trigger if exists national_associations_set_updated_at
  on public.national_associations;
create trigger national_associations_set_updated_at
before update on public.national_associations
for each row execute function private.ppm_set_updated_at_v1();

drop trigger if exists national_association_memberships_set_updated_at
  on public.national_association_memberships;
create trigger national_association_memberships_set_updated_at
before update on public.national_association_memberships
for each row execute function private.ppm_set_updated_at_v1();

drop trigger if exists national_coach_elections_set_updated_at
  on public.national_coach_elections;
create trigger national_coach_elections_set_updated_at
before update on public.national_coach_elections
for each row execute function private.ppm_set_updated_at_v1();

drop trigger if exists national_coach_candidates_set_updated_at
  on public.national_coach_candidates;
create trigger national_coach_candidates_set_updated_at
before update on public.national_coach_candidates
for each row execute function private.ppm_set_updated_at_v1();

drop trigger if exists national_coach_terms_set_updated_at
  on public.national_coach_terms;
create trigger national_coach_terms_set_updated_at
before update on public.national_coach_terms
for each row execute function private.ppm_set_updated_at_v1();

create or replace function private.national_association_eligible_main_club_v1(p_user_id uuid)
returns table(club_id uuid,country_code text,club_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id,upper(c.country_code),c.name
  from public.clubs c
  where c.owner_user_id=p_user_id
    and c.club_type='main'
    and coalesce(c.is_ai,false)=false
    and coalesce(c.is_active,true)=true
    and c.deleted_at is null
    and coalesce(c.inactivity_status,'active')='active'
  order by c.created_at asc,c.id
  limit 1;
$$;

create or replace function private.national_association_member_is_eligible_v1(
  p_association_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1
    from public.national_associations a
    join public.national_association_memberships m
      on m.association_id=a.id
     and m.user_id=p_user_id
     and m.status='active'
    join public.clubs c
      on c.id=m.club_id
     and c.owner_user_id=p_user_id
     and c.club_type='main'
     and coalesce(c.is_ai,false)=false
     and coalesce(c.is_active,true)=true
     and c.deleted_at is null
     and coalesce(c.inactivity_status,'active')='active'
    where a.id=p_association_id
      and upper(c.country_code)=a.country_code
  );
$$;

create or replace function private.national_association_active_member_count_v1(
  p_association_id uuid
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.national_association_memberships m
  join public.national_associations a on a.id=m.association_id
  join public.clubs c
    on c.id=m.club_id
   and c.owner_user_id=m.user_id
   and c.club_type='main'
   and coalesce(c.is_ai,false)=false
   and coalesce(c.is_active,true)=true
   and c.deleted_at is null
   and coalesce(c.inactivity_status,'active')='active'
  where m.association_id=p_association_id
    and m.status='active'
    and upper(c.country_code)=a.country_code;
$$;

create or replace function private.national_coach_masked_overall_bounds_v1(
  p_rider_id uuid,
  p_overall integer,
  p_season_number integer
)
returns int4range
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_span integer;
  v_offset integer;
  v_low integer;
  v_high integer;
  v_hash bigint;
begin
  if p_overall is null then
    return null;
  end if;

  select masked_overall_span::integer
  into v_span
  from public.national_association_config
  where id=true;

  v_span:=greatest(1,coalesce(v_span,3));

  -- Deterministic by rider + season: refreshing cannot reveal the true value.
  v_hash:=('x'||substr(md5(p_rider_id::text||':'||p_season_number::text),1,8))::bit(32)::bigint;
  v_offset:=(v_hash % (v_span+1))::integer;

  v_low:=greatest(1,p_overall-v_offset);
  v_high:=least(99,v_low+v_span);

  if p_overall>v_high then
    v_high:=least(99,p_overall);
    v_low:=greatest(1,v_high-v_span);
  elsif p_overall<v_low then
    v_low:=greatest(1,p_overall);
    v_high:=least(99,v_low+v_span);
  end if;

  return int4range(v_low,v_high+1,'[)');
end;
$$;

create or replace function public.join_my_national_association_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_club record;
  v_assoc public.national_associations%rowtype;
  v_country_name text;
  v_membership_id uuid;
  v_member_count integer;
  v_minimum integer;
  v_today date:=public.get_current_game_date_date();
  v_activated boolean:=false;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_club
  from private.national_association_eligible_main_club_v1(v_uid);

  if v_club.club_id is null then
    raise exception 'Your active human main club is not eligible for a National Association.';
  end if;

  select c.name into v_country_name
  from public.countries c
  where upper(c.code)=v_club.country_code
  limit 1;

  insert into public.national_associations(
    country_code,name,status,created_by_user_id,created_on_game_date,last_status_change_on_game_date
  )
  values(
    v_club.country_code,
    coalesce(v_country_name,v_club.country_code)||' National Association',
    'forming',
    v_uid,
    v_today,
    v_today
  )
  on conflict(country_code) do update
    set updated_at=now()
  returning * into v_assoc;

  -- A user may be active in only one Association. Because eligibility is tied
  -- to the current main-club country, terminate any stale membership first.
  update public.national_association_memberships
  set status='left',
      left_on_game_date=v_today,
      updated_at=now()
  where user_id=v_uid
    and status='active'
    and association_id<>v_assoc.id;

  insert into public.national_association_memberships(
    association_id,user_id,club_id,status,coach_eligible,joined_on_game_date,left_on_game_date
  )
  values(
    v_assoc.id,v_uid,v_club.club_id,'active',true,v_today,null
  )
  on conflict(association_id,user_id) do update
    set club_id=excluded.club_id,
        status='active',
        coach_eligible=true,
        joined_on_game_date=
          case
            when public.national_association_memberships.status='active'
              then public.national_association_memberships.joined_on_game_date
            else excluded.joined_on_game_date
          end,
        left_on_game_date=null,
        updated_at=now()
  returning id into v_membership_id;

  select minimum_active_members::integer
  into v_minimum
  from public.national_association_config
  where id=true;

  v_member_count:=private.national_association_active_member_count_v1(v_assoc.id);

  if v_member_count>=coalesce(v_minimum,5)
     and v_assoc.status<>'active' then
    update public.national_associations
    set status='active',
        activated_on_game_date=coalesce(activated_on_game_date,v_today),
        inactive_on_game_date=null,
        last_status_change_on_game_date=v_today,
        updated_at=now()
    where id=v_assoc.id;

    v_activated:=true;
  end if;

  return jsonb_build_object(
    'association_id',v_assoc.id,
    'association_name',v_assoc.name,
    'country_code',v_assoc.country_code,
    'membership_id',v_membership_id,
    'member_count',v_member_count,
    'minimum_members',coalesce(v_minimum,5),
    'association_status',
      case
        when v_activated then 'active'
        else (select status from public.national_associations where id=v_assoc.id)
      end,
    'activated_now',v_activated,
    'has_treasury',false
  );
end;
$$;

create or replace function public.leave_my_national_association_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_membership public.national_association_memberships%rowtype;
  v_today date:=public.get_current_game_date_date();
  v_count integer;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_membership
  from public.national_association_memberships
  where user_id=v_uid
    and status='active'
  order by created_at desc
  limit 1
  for update;

  if v_membership.id is null then
    return jsonb_build_object('status','not_member');
  end if;

  if exists(
    select 1
    from public.national_coach_terms t
    where t.association_id=v_membership.association_id
      and t.user_id=v_uid
      and t.status='active'
  ) then
    raise exception 'The active National Coach must resign or be replaced before leaving the Association.';
  end if;

  update public.national_association_memberships
  set status='left',left_on_game_date=v_today,updated_at=now()
  where id=v_membership.id;

  v_count:=private.national_association_active_member_count_v1(v_membership.association_id);

  -- Active Associations are not immediately dissolved when membership drops
  -- below five. Seasonal lifecycle validation will handle future inactivity.
  return jsonb_build_object(
    'status','left',
    'association_id',v_membership.association_id,
    'remaining_eligible_members',v_count
  );
end;
$$;

create or replace function public.carry_forward_national_coach_v1(
  p_association_id uuid,
  p_season_number integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous public.national_coach_terms%rowtype;
  v_new_id uuid;
  v_start date:=public.game_date_from_parts(p_season_number,1,1);
  v_end date:=public.game_date_from_parts(p_season_number,12,31);
begin
  if exists(
    select 1
    from public.national_coach_terms
    where association_id=p_association_id
      and season_number=p_season_number
      and status='active'
  ) then
    return null;
  end if;

  select t.*
  into v_previous
  from public.national_coach_terms t
  join public.national_association_memberships m
    on m.id=t.membership_id
   and m.status='active'
  join public.clubs c
    on c.id=t.club_id
   and c.owner_user_id=t.user_id
   and c.club_type='main'
   and coalesce(c.is_ai,false)=false
   and coalesce(c.is_active,true)=true
   and c.deleted_at is null
   and coalesce(c.inactivity_status,'active')='active'
  where t.association_id=p_association_id
    and t.season_number<p_season_number
    and t.status in ('active','completed')
  order by t.season_number desc,t.term_start_game_date desc,t.created_at desc
  limit 1;

  if v_previous.id is null then
    return null;
  end if;

  insert into public.national_coach_terms(
    association_id,election_id,candidate_id,membership_id,user_id,club_id,
    season_number,term_start_game_date,term_end_game_date,status,term_kind
  )
  values(
    p_association_id,v_previous.election_id,v_previous.candidate_id,
    v_previous.membership_id,v_previous.user_id,v_previous.club_id,
    p_season_number,v_start,v_end,'active','caretaker'
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

create or replace function public.ensure_national_coach_election_v1(
  p_association_id uuid,
  p_season_number integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assoc public.national_associations%rowtype;
  v_cfg public.national_association_config%rowtype;
  v_season integer;
  v_today date:=public.get_current_game_date_date();
  v_existing uuid;
  v_kind text;
  v_reason text;
  v_registration_open date;
  v_registration_close date;
  v_round1_open date;
  v_round1_close date;
  v_id uuid;
begin
  select * into v_assoc
  from public.national_associations
  where id=p_association_id;

  if v_assoc.id is null or v_assoc.status<>'active' then
    return null;
  end if;

  select season_number into v_season
  from public.game_state
  where id=true;

  v_season:=coalesce(p_season_number,v_season);

  if v_season is null then
    raise exception 'Game season is unavailable.';
  end if;

  select * into v_cfg
  from public.national_association_config
  where id=true;

  select id into v_existing
  from public.national_coach_elections
  where association_id=p_association_id
    and season_number=v_season
    and status in ('candidate_registration','voting','runoff','completed')
  order by created_at desc
  limit 1;

  if v_existing is not null then
    return v_existing;
  end if;

  perform public.carry_forward_national_coach_v1(p_association_id,v_season);

  if extract(month from v_today)=1
     or v_assoc.activated_on_game_date <= public.game_date_from_parts(v_season,1,1) then
    v_kind:='annual';
    v_reason:='annual_january_election';
    v_registration_open:=public.game_date_from_parts(
      v_season,v_cfg.annual_registration_start_month,v_cfg.annual_registration_start_day
    );
    v_registration_close:=public.game_date_from_parts(
      v_season,v_cfg.annual_registration_close_month,v_cfg.annual_registration_close_day
    );
    v_round1_open:=v_registration_close;
    v_round1_close:=public.game_date_from_parts(
      v_season,v_cfg.annual_round1_close_month,v_cfg.annual_round1_close_day
    );

    if v_today>=v_round1_close
       and not exists(
         select 1
         from public.national_coach_terms
         where association_id=p_association_id
           and season_number=v_season
           and term_kind='elected'
       ) then
      -- Late lifecycle recovery: open a fresh Tennis-style activation/replacement
      -- election rather than creating an already-expired annual window.
      v_kind:='replacement';
      v_reason:='late_january_or_missing_coach_recovery';
      v_registration_open:=v_today;
      v_registration_close:=v_today+v_cfg.activation_registration_days;
      v_round1_open:=v_registration_close;
      v_round1_close:=v_round1_open+v_cfg.activation_voting_days;
    end if;
  else
    v_kind:='activation';
    v_reason:='association_activated';
    v_registration_open:=v_today;
    v_registration_close:=v_today+v_cfg.activation_registration_days;
    v_round1_open:=v_registration_close;
    v_round1_close:=v_round1_open+v_cfg.activation_voting_days;
  end if;

  insert into public.national_coach_elections(
    association_id,season_number,election_kind,reason,status,
    registration_open_date,registration_close_date,
    round1_open_date,round1_close_date,
    current_round,current_round_open_date,current_round_close_date,
    runoff_registration_open
  )
  values(
    p_association_id,v_season,v_kind,v_reason,'candidate_registration',
    v_registration_open,v_registration_close,
    v_round1_open,v_round1_close,
    1,v_round1_open,v_round1_close,false
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.register_national_coach_candidate_v1(
  p_election_id uuid,
  p_manifesto text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_today date:=public.get_current_game_date_date();
  v_e public.national_coach_elections%rowtype;
  v_membership public.national_association_memberships%rowtype;
  v_manifesto text:=btrim(coalesce(p_manifesto,''));
  v_candidate_id uuid;
  v_registration_allowed boolean:=false;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  if char_length(v_manifesto)<10 or char_length(v_manifesto)>1000 then
    raise exception 'Manifesto must contain between 10 and 1000 characters.';
  end if;

  select * into v_e
  from public.national_coach_elections
  where id=p_election_id
  for update;

  if v_e.id is null then
    raise exception 'Election not found.';
  end if;

  if v_e.status='candidate_registration'
     and v_today>=v_e.registration_open_date
     and v_today<v_e.registration_close_date then
    v_registration_allowed:=true;
  elsif v_e.status='runoff'
     and v_e.runoff_registration_open
     and v_e.current_round_close_date is not null
     and v_today>=v_e.current_round_open_date
     and v_today<v_e.current_round_close_date then
    v_registration_allowed:=true;
  end if;

  if not v_registration_allowed then
    raise exception 'Candidate registration is closed.';
  end if;

  select * into v_membership
  from public.national_association_memberships
  where association_id=v_e.association_id
    and user_id=v_uid
    and status='active'
    and coach_eligible=true
  limit 1;

  if v_membership.id is null
     or not private.national_association_member_is_eligible_v1(v_e.association_id,v_uid) then
    raise exception 'You are not eligible to stand in this National Coach election.';
  end if;

  insert into public.national_coach_candidates(
    election_id,membership_id,user_id,club_id,manifesto,status,registered_on_game_date
  )
  values(
    v_e.id,v_membership.id,v_uid,v_membership.club_id,v_manifesto,'active',v_today
  )
  on conflict(election_id,user_id) do update
    set membership_id=excluded.membership_id,
        club_id=excluded.club_id,
        manifesto=excluded.manifesto,
        status='active',
        withdrawn_on_game_date=null,
        updated_at=now()
  returning id into v_candidate_id;

  if v_e.status='runoff' and v_e.runoff_registration_open then
    insert into public.national_coach_runoff_candidates(
      election_id,round_number,candidate_id
    )
    values(v_e.id,v_e.current_round,v_candidate_id)
    on conflict do nothing;
  end if;

  return v_candidate_id;
end;
$$;

create or replace function public.withdraw_national_coach_candidate_v1(
  p_election_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_today date:=public.get_current_game_date_date();
  v_e public.national_coach_elections%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_e
  from public.national_coach_elections
  where id=p_election_id;

  if v_e.id is null then
    raise exception 'Election not found.';
  end if;

  if v_e.status<>'candidate_registration'
     or v_today>=v_e.registration_close_date then
    raise exception 'Candidature can only be withdrawn before voting begins.';
  end if;

  update public.national_coach_candidates
  set status='withdrawn',
      withdrawn_on_game_date=v_today,
      updated_at=now()
  where election_id=v_e.id
    and user_id=v_uid
    and status='active';
end;
$$;

create or replace function public.cast_national_coach_vote_v1(
  p_election_id uuid,
  p_candidate_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_today date:=public.get_current_game_date_date();
  v_e public.national_coach_elections%rowtype;
  v_membership public.national_association_memberships%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_e
  from public.national_coach_elections
  where id=p_election_id;

  if v_e.id is null then
    raise exception 'Election not found.';
  end if;

  if v_e.status not in ('voting','runoff') then
    raise exception 'Voting is not currently open.';
  end if;

  if v_today<v_e.current_round_open_date
     or v_today>=v_e.current_round_close_date then
    raise exception 'Voting is not currently open.';
  end if;

  select * into v_membership
  from public.national_association_memberships
  where association_id=v_e.association_id
    and user_id=v_uid
    and status='active'
  limit 1;

  if v_membership.id is null
     or not private.national_association_member_is_eligible_v1(v_e.association_id,v_uid) then
    raise exception 'Only active eligible Association members may vote.';
  end if;

  if exists(
    select 1
    from public.national_coach_votes
    where election_id=v_e.id
      and round_number=v_e.current_round
      and voter_user_id=v_uid
  ) then
    raise exception 'You have already voted in this round. Your vote is final.';
  end if;

  if not exists(
    select 1
    from public.national_coach_candidates c
    where c.id=p_candidate_id
      and c.election_id=v_e.id
      and c.status='active'
  ) then
    raise exception 'Candidate is not eligible in this election.';
  end if;

  if v_e.status='runoff' and not exists(
    select 1
    from public.national_coach_runoff_candidates rc
    where rc.election_id=v_e.id
      and rc.round_number=v_e.current_round
      and rc.candidate_id=p_candidate_id
  ) then
    raise exception 'Candidate is not part of the current runoff.';
  end if;

  insert into public.national_coach_votes(
    election_id,round_number,membership_id,voter_user_id,candidate_id,cast_on_game_date
  )
  values(
    v_e.id,v_e.current_round,v_membership.id,v_uid,p_candidate_id,v_today
  );
end;
$$;

create or replace function public.resolve_national_coach_election_v1(
  p_election_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e public.national_coach_elections%rowtype;
  v_cfg public.national_association_config%rowtype;
  v_today date:=public.get_current_game_date_date();
  v_candidate_count integer:=0;
  v_max_votes integer:=0;
  v_top_count integer:=0;
  v_winner uuid;
  v_winner_row public.national_coach_candidates%rowtype;
  v_next_round integer;
  v_next_open date;
  v_next_close date;
  v_open_registration boolean:=false;
begin
  select * into v_e
  from public.national_coach_elections
  where id=p_election_id
  for update;

  if v_e.id is null or v_e.status not in ('voting','runoff') then
    return jsonb_build_object('status','not_resolvable');
  end if;

  if v_today<v_e.current_round_close_date then
    return jsonb_build_object(
      'status','still_open',
      'closes_on',v_e.current_round_close_date
    );
  end if;

  select * into v_cfg
  from public.national_association_config
  where id=true;

  if v_e.status='voting' then
    select count(*)::integer
    into v_candidate_count
    from public.national_coach_candidates c
    where c.election_id=v_e.id
      and c.status='active';

    if v_candidate_count>0 then
      select coalesce(max(x.vote_count),0)::integer
      into v_max_votes
      from (
        select c.id,count(v.id)::integer as vote_count
        from public.national_coach_candidates c
        left join public.national_coach_votes v
          on v.election_id=v_e.id
         and v.round_number=v_e.current_round
         and v.candidate_id=c.id
        where c.election_id=v_e.id
          and c.status='active'
        group by c.id
      ) x;

      select count(*)::integer,min(x.candidate_id::text)::uuid
      into v_top_count,v_winner
      from (
        select c.id as candidate_id,count(v.id)::integer as vote_count
        from public.national_coach_candidates c
        left join public.national_coach_votes v
          on v.election_id=v_e.id
         and v.round_number=v_e.current_round
         and v.candidate_id=c.id
        where c.election_id=v_e.id
          and c.status='active'
        group by c.id
      ) x
      where x.vote_count=v_max_votes;
    end if;
  else
    select count(*)::integer
    into v_candidate_count
    from public.national_coach_runoff_candidates rc
    join public.national_coach_candidates c
      on c.id=rc.candidate_id
     and c.status='active'
    where rc.election_id=v_e.id
      and rc.round_number=v_e.current_round;

    if v_candidate_count>0 then
      select coalesce(max(x.vote_count),0)::integer
      into v_max_votes
      from (
        select rc.candidate_id,count(v.id)::integer as vote_count
        from public.national_coach_runoff_candidates rc
        join public.national_coach_candidates c
          on c.id=rc.candidate_id
         and c.status='active'
        left join public.national_coach_votes v
          on v.election_id=rc.election_id
         and v.round_number=rc.round_number
         and v.candidate_id=rc.candidate_id
        where rc.election_id=v_e.id
          and rc.round_number=v_e.current_round
        group by rc.candidate_id
      ) x;

      select count(*)::integer,min(x.candidate_id::text)::uuid
      into v_top_count,v_winner
      from (
        select rc.candidate_id,count(v.id)::integer as vote_count
        from public.national_coach_runoff_candidates rc
        join public.national_coach_candidates c
          on c.id=rc.candidate_id
         and c.status='active'
        left join public.national_coach_votes v
          on v.election_id=rc.election_id
         and v.round_number=rc.round_number
         and v.candidate_id=rc.candidate_id
        where rc.election_id=v_e.id
          and rc.round_number=v_e.current_round
        group by rc.candidate_id
      ) x
      where x.vote_count=v_max_votes;
    end if;
  end if;

  -- No candidate, no votes, or tied leaders -> another seven-day runoff.
  if v_candidate_count=0 or v_max_votes<=0 or v_top_count<>1 then
    v_next_round:=v_e.current_round+1;
    v_next_open:=v_today;

    -- The fixed annual second round runs Jan 20-27.
    if v_e.election_kind='annual'
       and v_e.current_round=1
       and v_today<=public.game_date_from_parts(
         v_e.season_number,
         v_cfg.annual_round1_close_month,
         v_cfg.annual_round1_close_day
       ) then
      v_next_open:=public.game_date_from_parts(
        v_e.season_number,
        v_cfg.annual_round1_close_month,
        v_cfg.annual_round1_close_day
      );
      v_next_close:=public.game_date_from_parts(
        v_e.season_number,
        v_cfg.annual_round2_close_month,
        v_cfg.annual_round2_close_day
      );
    else
      v_next_close:=v_next_open+v_cfg.repeated_runoff_days;
    end if;

    v_open_registration:=(v_candidate_count=0);

    if v_candidate_count>0 then
      if v_e.status='voting' then
        insert into public.national_coach_runoff_candidates(
          election_id,round_number,candidate_id
        )
        select v_e.id,v_next_round,c.id
        from public.national_coach_candidates c
        left join public.national_coach_votes v
          on v.election_id=v_e.id
         and v.round_number=v_e.current_round
         and v.candidate_id=c.id
        where c.election_id=v_e.id
          and c.status='active'
        group by c.id
        having
          case
            when v_max_votes<=0 then true
            else count(v.id)::integer=v_max_votes
          end
        on conflict do nothing;
      else
        insert into public.national_coach_runoff_candidates(
          election_id,round_number,candidate_id
        )
        select v_e.id,v_next_round,rc.candidate_id
        from public.national_coach_runoff_candidates rc
        join public.national_coach_candidates c
          on c.id=rc.candidate_id
         and c.status='active'
        left join public.national_coach_votes v
          on v.election_id=rc.election_id
         and v.round_number=rc.round_number
         and v.candidate_id=rc.candidate_id
        where rc.election_id=v_e.id
          and rc.round_number=v_e.current_round
        group by rc.candidate_id
        having
          case
            when v_max_votes<=0 then true
            else count(v.id)::integer=v_max_votes
          end
        on conflict do nothing;
      end if;
    end if;

    update public.national_coach_elections
    set status='runoff',
        current_round=v_next_round,
        current_round_open_date=v_next_open,
        current_round_close_date=v_next_close,
        runoff_registration_open=v_open_registration,
        updated_at=now()
    where id=v_e.id;

    return jsonb_build_object(
      'status','runoff',
      'round',v_next_round,
      'opens_on',v_next_open,
      'closes_on',v_next_close,
      'registration_open',v_open_registration,
      'reason',
        case
          when v_candidate_count=0 then 'no_candidates'
          when v_max_votes<=0 then 'no_votes'
          else 'tied_leaders'
        end
    );
  end if;

  select * into v_winner_row
  from public.national_coach_candidates
  where id=v_winner;

  if v_winner_row.id is null then
    return jsonb_build_object('status','winner_missing');
  end if;

  update public.national_coach_elections
  set status='completed',
      winning_candidate_id=v_winner_row.id,
      completed_on_game_date=v_today,
      runoff_registration_open=false,
      updated_at=now()
  where id=v_e.id;

  update public.national_coach_terms
  set status='completed',
      term_end_game_date=greatest(term_start_game_date,v_today-1),
      updated_at=now()
  where association_id=v_e.association_id
    and status='active';

  insert into public.national_coach_terms(
    association_id,election_id,candidate_id,membership_id,user_id,club_id,
    season_number,term_start_game_date,term_end_game_date,status,term_kind
  )
  values(
    v_e.association_id,v_e.id,v_winner_row.id,v_winner_row.membership_id,
    v_winner_row.user_id,v_winner_row.club_id,v_e.season_number,
    v_today,public.game_date_from_parts(v_e.season_number,12,31),
    'active',
    case when v_e.election_kind='replacement' then 'replacement' else 'elected' end
  );

  return jsonb_build_object(
    'status','completed',
    'winner_candidate_id',v_winner_row.id,
    'winner_user_id',v_winner_row.user_id,
    'winner_club_id',v_winner_row.club_id,
    'round',v_e.current_round
  );
end;
$$;

create or replace function public.process_national_coach_election_v1(
  p_election_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e public.national_coach_elections%rowtype;
  v_today date:=public.get_current_game_date_date();
begin
  select * into v_e
  from public.national_coach_elections
  where id=p_election_id
  for update;

  if v_e.id is null then
    return jsonb_build_object('status','not_found');
  end if;

  if v_e.status='candidate_registration'
     and v_today>=v_e.registration_close_date then
    update public.national_coach_elections
    set status='voting',
        current_round=1,
        current_round_open_date=v_e.round1_open_date,
        current_round_close_date=v_e.round1_close_date,
        runoff_registration_open=false,
        updated_at=now()
    where id=v_e.id;

    select * into v_e
    from public.national_coach_elections
    where id=p_election_id;
  end if;

  if v_e.status in ('voting','runoff')
     and v_today>=v_e.current_round_close_date then
    return public.resolve_national_coach_election_v1(v_e.id);
  end if;

  return jsonb_build_object(
    'status',v_e.status,
    'round',v_e.current_round,
    'opens_on',v_e.current_round_open_date,
    'closes_on',v_e.current_round_close_date
  );
end;
$$;

create or replace function public.process_national_coach_elections_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season integer;
  v_assoc record;
  v_election_id uuid;
  v_processed integer:=0;
  v_created integer:=0;
begin
  select season_number into v_season
  from public.game_state
  where id=true;

  for v_assoc in
    select id
    from public.national_associations
    where status='active'
  loop
    v_election_id:=public.ensure_national_coach_election_v1(v_assoc.id,v_season);

    if v_election_id is not null then
      if not exists(
        select 1
        from public.national_coach_elections
        where id=v_election_id
          and created_at<now()-interval '2 seconds'
      ) then
        v_created:=v_created+1;
      end if;

      perform public.process_national_coach_election_v1(v_election_id);
      v_processed:=v_processed+1;
    end if;
  end loop;

  return jsonb_build_object(
    'season_number',v_season,
    'associations_processed',v_processed,
    'elections_created_or_existing',v_created
  );
end;
$$;

create or replace function public.get_my_national_association_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_club record;
  v_assoc public.national_associations%rowtype;
  v_membership public.national_association_memberships%rowtype;
  v_member_count integer:=0;
  v_minimum integer:=5;
  v_election public.national_coach_elections%rowtype;
  v_term public.national_coach_terms%rowtype;
  v_candidates jsonb:='[]'::jsonb;
  v_my_vote_candidate_id uuid;
  v_my_candidate_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_club
  from private.national_association_eligible_main_club_v1(v_uid);

  if v_club.club_id is null then
    return jsonb_build_object(
      'eligible',false,
      'reason','no_active_human_main_club'
    );
  end if;

  select * into v_assoc
  from public.national_associations
  where country_code=v_club.country_code
  limit 1;

  select minimum_active_members::integer
  into v_minimum
  from public.national_association_config
  where id=true;

  if v_assoc.id is null then
    return jsonb_build_object(
      'eligible',true,
      'country_code',v_club.country_code,
      'club_id',v_club.club_id,
      'club_name',v_club.club_name,
      'association_exists',false,
      'is_member',false,
      'minimum_members',coalesce(v_minimum,5),
      'has_treasury',false
    );
  end if;

  select * into v_membership
  from public.national_association_memberships
  where association_id=v_assoc.id
    and user_id=v_uid
    and status='active'
  limit 1;

  v_member_count:=private.national_association_active_member_count_v1(v_assoc.id);

  select * into v_election
  from public.national_coach_elections
  where association_id=v_assoc.id
    and status in ('candidate_registration','voting','runoff','completed')
  order by season_number desc,created_at desc
  limit 1;

  select * into v_term
  from public.national_coach_terms
  where association_id=v_assoc.id
    and status='active'
  order by season_number desc,created_at desc
  limit 1;

  if v_election.id is not null then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'candidate_id',c.id,
          'club_id',c.club_id,
          'club_name',cl.name,
          'manifesto',c.manifesto,
          'status',c.status,
          'is_me',c.user_id=v_uid,
          'in_current_round',
            case
              when v_election.status='runoff' then exists(
                select 1
                from public.national_coach_runoff_candidates rc
                where rc.election_id=v_election.id
                  and rc.round_number=v_election.current_round
                  and rc.candidate_id=c.id
              )
              else c.status='active'
            end
        )
        order by c.registered_on_game_date,c.created_at
      ),
      '[]'::jsonb
    )
    into v_candidates
    from public.national_coach_candidates c
    left join public.clubs cl on cl.id=c.club_id
    where c.election_id=v_election.id;

    select c.id into v_my_candidate_id
    from public.national_coach_candidates c
    where c.election_id=v_election.id
      and c.user_id=v_uid
      and c.status='active'
    limit 1;

    select v.candidate_id into v_my_vote_candidate_id
    from public.national_coach_votes v
    where v.election_id=v_election.id
      and v.round_number=v_election.current_round
      and v.voter_user_id=v_uid
    limit 1;
  end if;

  return jsonb_build_object(
    'eligible',true,
    'country_code',v_assoc.country_code,
    'club_id',v_club.club_id,
    'club_name',v_club.club_name,
    'association_exists',true,
    'association_id',v_assoc.id,
    'association_name',v_assoc.name,
    'association_status',v_assoc.status,
    'is_member',v_membership.id is not null,
    'membership_id',v_membership.id,
    'member_count',v_member_count,
    'minimum_members',coalesce(v_minimum,5),
    'has_treasury',false,
    'coach',
      case
        when v_term.id is null then null
        else jsonb_build_object(
          'term_id',v_term.id,
          'user_id',v_term.user_id,
          'club_id',v_term.club_id,
          'club_name',(select name from public.clubs where id=v_term.club_id),
          'season_number',v_term.season_number,
          'term_kind',v_term.term_kind,
          'starts_on',v_term.term_start_game_date,
          'ends_on',v_term.term_end_game_date
        )
      end,
    'election',
      case
        when v_election.id is null then null
        else jsonb_build_object(
          'id',v_election.id,
          'season_number',v_election.season_number,
          'kind',v_election.election_kind,
          'status',v_election.status,
          'registration_open_date',v_election.registration_open_date,
          'registration_close_date',v_election.registration_close_date,
          'round1_open_date',v_election.round1_open_date,
          'round1_close_date',v_election.round1_close_date,
          'current_round',v_election.current_round,
          'current_round_open_date',v_election.current_round_open_date,
          'current_round_close_date',v_election.current_round_close_date,
          'runoff_registration_open',v_election.runoff_registration_open,
          'winning_candidate_id',v_election.winning_candidate_id,
          'my_candidate_id',v_my_candidate_id,
          'my_vote_candidate_id',v_my_vote_candidate_id,
          'candidates',v_candidates
        )
      end
  );
end;
$$;

-- RLS: users interact through tightly-scoped RPCs. Direct writes are never allowed.
alter table public.national_association_config enable row level security;
alter table public.national_associations enable row level security;
alter table public.national_association_memberships enable row level security;
alter table public.national_coach_elections enable row level security;
alter table public.national_coach_candidates enable row level security;
alter table public.national_coach_runoff_candidates enable row level security;
alter table public.national_coach_votes enable row level security;
alter table public.national_coach_terms enable row level security;

drop policy if exists national_association_config_read on public.national_association_config;
create policy national_association_config_read
on public.national_association_config
for select
to authenticated
using (true);

drop policy if exists national_associations_read on public.national_associations;
create policy national_associations_read
on public.national_associations
for select
to authenticated
using (true);

revoke all on public.national_association_config from anon,authenticated;
revoke all on public.national_associations from anon,authenticated;
revoke all on public.national_association_memberships from anon,authenticated;
revoke all on public.national_coach_elections from anon,authenticated;
revoke all on public.national_coach_candidates from anon,authenticated;
revoke all on public.national_coach_runoff_candidates from anon,authenticated;
revoke all on public.national_coach_votes from anon,authenticated;
revoke all on public.national_coach_terms from anon,authenticated;

grant select on public.national_association_config to authenticated;
grant select on public.national_associations to authenticated;

revoke all on function public.join_my_national_association_v1() from public;
revoke all on function public.leave_my_national_association_v1() from public;
revoke all on function public.carry_forward_national_coach_v1(uuid,integer) from public;
revoke all on function public.ensure_national_coach_election_v1(uuid,integer) from public;
revoke all on function public.register_national_coach_candidate_v1(uuid,text) from public;
revoke all on function public.withdraw_national_coach_candidate_v1(uuid) from public;
revoke all on function public.cast_national_coach_vote_v1(uuid,uuid) from public;
revoke all on function public.resolve_national_coach_election_v1(uuid) from public;
revoke all on function public.process_national_coach_election_v1(uuid) from public;
revoke all on function public.process_national_coach_elections_v1() from public;
revoke all on function public.get_my_national_association_v1() from public;

grant execute on function public.join_my_national_association_v1() to authenticated;
grant execute on function public.leave_my_national_association_v1() to authenticated;
grant execute on function public.ensure_national_coach_election_v1(uuid,integer) to authenticated;
grant execute on function public.register_national_coach_candidate_v1(uuid,text) to authenticated;
grant execute on function public.withdraw_national_coach_candidate_v1(uuid) to authenticated;
grant execute on function public.cast_national_coach_vote_v1(uuid,uuid) to authenticated;
grant execute on function public.get_my_national_association_v1() to authenticated;

-- The lifecycle functions are intended for the trusted game tick / admin backend.
grant execute on function public.carry_forward_national_coach_v1(uuid,integer) to service_role;
grant execute on function public.resolve_national_coach_election_v1(uuid) to service_role;
grant execute on function public.process_national_coach_election_v1(uuid) to service_role;
grant execute on function public.process_national_coach_elections_v1() to service_role;
