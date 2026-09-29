-- National Team duty windows and 7-rider lineups v1.
-- Confirmed squad riders become unavailable to their clubs for the entire
-- national-team competition window, including reserves.

create table if not exists public.national_team_duties (
  id uuid primary key default gen_random_uuid(),
  squad_id uuid not null unique references public.national_team_squads(id) on delete cascade,
  association_id uuid not null references public.national_associations(id) on delete cascade,
  season_number integer not null check (season_number > 0),
  cycle_key text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'planned'
    check (status in ('planned','active','completed','cancelled')),
  label text not null default 'National Duty',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_date <= end_date)
);

create index if not exists national_team_duties_date_status_idx
  on public.national_team_duties(status,start_date,end_date);

create table if not exists public.national_team_lineups (
  id uuid primary key default gen_random_uuid(),
  squad_id uuid not null references public.national_team_squads(id) on delete cascade,
  race_day smallint not null check (race_day between 1 and 3),
  race_type text not null
    check (race_type in ('team_time_trial','flat_road_race','hilly_mountain_road_race')),
  status text not null default 'confirmed'
    check (status in ('draft','confirmed','locked','completed','cancelled')),
  submitted_by_user_id uuid not null,
  submitted_on_game_date date not null default public.get_current_game_date_date(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(squad_id,race_day)
);

create table if not exists public.national_team_lineup_members (
  id uuid primary key default gen_random_uuid(),
  lineup_id uuid not null references public.national_team_lineups(id) on delete cascade,
  squad_member_id uuid not null references public.national_team_squad_members(id) on delete restrict,
  rider_id uuid not null references public.riders(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(lineup_id,rider_id),
  unique(lineup_id,squad_member_id)
);

create index if not exists national_team_lineup_members_rider_idx
  on public.national_team_lineup_members(rider_id,lineup_id);

drop trigger if exists national_team_duties_set_updated_at
  on public.national_team_duties;
create trigger national_team_duties_set_updated_at
before update on public.national_team_duties
for each row execute function private.ppm_set_updated_at_v1();

drop trigger if exists national_team_lineups_set_updated_at
  on public.national_team_lineups;
create trigger national_team_lineups_set_updated_at
before update on public.national_team_lineups
for each row execute function private.ppm_set_updated_at_v1();

create or replace function private.national_team_race_type_for_day_v1(p_race_day integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_race_day
    when 1 then 'team_time_trial'
    when 2 then 'flat_road_race'
    when 3 then 'hilly_mountain_road_race'
    else null
  end;
$$;

create or replace function public.submit_national_team_lineup_v1(
  p_squad_id uuid,
  p_race_day integer,
  p_rider_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_ctx record;
  v_squad public.national_team_squads%rowtype;
  v_required integer;
  v_max_changes integer;
  v_distinct_count integer;
  v_valid_count integer;
  v_previous_lineup_id uuid;
  v_previous_count integer;
  v_shared_count integer;
  v_changes integer:=0;
  v_lineup_id uuid;
  v_race_type text;
  v_today date:=public.get_current_game_date_date();
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  if p_race_day not between 1 and 3 then
    raise exception 'National-team race day must be between 1 and 3.';
  end if;

  select * into v_ctx
  from private.current_national_coach_context_v1(v_uid);

  if v_ctx.association_id is null then
    raise exception 'Only the active National Coach can submit national-team lineups.';
  end if;

  select * into v_squad
  from public.national_team_squads
  where id=p_squad_id
  for update;

  if v_squad.id is null
     or v_squad.association_id<>v_ctx.association_id
     or v_squad.season_number<>v_ctx.season_number then
    raise exception 'National squad not found for your Association.';
  end if;

  if v_squad.status not in ('confirmed','on_duty') then
    raise exception 'The national squad must be confirmed before race lineups can be submitted.';
  end if;

  select national_lineup_size::integer,max_lineup_changes::integer
  into v_required,v_max_changes
  from public.national_association_config
  where id=true;

  select count(distinct x)::integer
  into v_distinct_count
  from unnest(coalesce(p_rider_ids,array[]::uuid[])) x;

  if v_distinct_count<>coalesce(v_required,7) then
    raise exception 'A national-team race lineup must contain exactly % distinct riders.',coalesce(v_required,7);
  end if;

  select count(*)::integer
  into v_valid_count
  from public.national_team_squad_members m
  where m.squad_id=v_squad.id
    and m.rider_id=any(p_rider_ids);

  if v_valid_count<>coalesce(v_required,7) then
    raise exception 'Every lineup rider must belong to the confirmed 10-rider squad.';
  end if;

  if p_race_day>1 then
    select l.id
    into v_previous_lineup_id
    from public.national_team_lineups l
    where l.squad_id=v_squad.id
      and l.race_day=p_race_day-1
      and l.status in ('confirmed','locked','completed')
    limit 1;

    if v_previous_lineup_id is null then
      raise exception 'The previous race-day lineup must be confirmed first.';
    end if;

    select count(*)::integer
    into v_previous_count
    from public.national_team_lineup_members m
    where m.lineup_id=v_previous_lineup_id;

    select count(*)::integer
    into v_shared_count
    from public.national_team_lineup_members m
    where m.lineup_id=v_previous_lineup_id
      and m.rider_id=any(p_rider_ids);

    v_changes:=coalesce(v_previous_count,coalesce(v_required,7))-coalesce(v_shared_count,0);

    if v_changes>coalesce(v_max_changes,3) then
      raise exception 'A maximum of % lineup changes is allowed between consecutive race days.',coalesce(v_max_changes,3);
    end if;
  end if;

  v_race_type:=private.national_team_race_type_for_day_v1(p_race_day);

  insert into public.national_team_lineups(
    squad_id,race_day,race_type,status,
    submitted_by_user_id,submitted_on_game_date
  )
  values(
    v_squad.id,p_race_day,v_race_type,'confirmed',v_uid,v_today
  )
  on conflict(squad_id,race_day)
  do update
  set race_type=excluded.race_type,
      status='confirmed',
      submitted_by_user_id=excluded.submitted_by_user_id,
      submitted_on_game_date=excluded.submitted_on_game_date,
      updated_at=now()
  where public.national_team_lineups.status in ('draft','confirmed')
  returning id into v_lineup_id;

  if v_lineup_id is null then
    raise exception 'This race-day lineup is locked and can no longer be changed.';
  end if;

  delete from public.national_team_lineup_members
  where lineup_id=v_lineup_id;

  insert into public.national_team_lineup_members(
    lineup_id,squad_member_id,rider_id
  )
  select
    v_lineup_id,m.id,m.rider_id
  from public.national_team_squad_members m
  where m.squad_id=v_squad.id
    and m.rider_id=any(p_rider_ids);

  return jsonb_build_object(
    'lineup_id',v_lineup_id,
    'squad_id',v_squad.id,
    'race_day',p_race_day,
    'race_type',v_race_type,
    'lineup_size',coalesce(v_required,7),
    'changes_from_previous_day',v_changes,
    'status','confirmed'
  );
end;
$$;

create or replace function public.get_my_national_team_lineups_v1(
  p_squad_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_ctx record;
  v_squad public.national_team_squads%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_ctx
  from private.current_national_coach_context_v1(v_uid);

  if v_ctx.association_id is null then
    return jsonb_build_object('allowed',false,'lineups','[]'::jsonb);
  end if;

  select * into v_squad
  from public.national_team_squads
  where id=p_squad_id
    and association_id=v_ctx.association_id
    and season_number=v_ctx.season_number;

  if v_squad.id is null then
    raise exception 'National squad not found for your Association.';
  end if;

  return jsonb_build_object(
    'allowed',true,
    'squad_id',v_squad.id,
    'lineups',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'lineup_id',l.id,
          'race_day',l.race_day,
          'race_type',l.race_type,
          'status',l.status,
          'submitted_on',l.submitted_on_game_date,
          'riders',coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'rider_id',m.rider_id,
                'rider_name',sm.rider_name_snapshot,
                'club_name',sm.club_name_snapshot
              )
              order by sm.rider_name_snapshot
            )
            from public.national_team_lineup_members m
            join public.national_team_squad_members sm
              on sm.id=m.squad_member_id
            where m.lineup_id=l.id
          ),'[]'::jsonb)
        )
        order by l.race_day
      )
      from public.national_team_lineups l
      where l.squad_id=v_squad.id
        and l.status<>'cancelled'
    ),'[]'::jsonb)
  );
end;
$$;

create or replace function public.set_national_team_duty_window_v1(
  p_squad_id uuid,
  p_start_date date,
  p_end_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_squad public.national_team_squads%rowtype;
  v_duty_id uuid;
  v_today date:=public.get_current_game_date_date();
  v_status text;
begin
  if p_start_date is null or p_end_date is null or p_start_date>p_end_date then
    raise exception 'Invalid National Duty window.';
  end if;

  select * into v_squad
  from public.national_team_squads
  where id=p_squad_id
  for update;

  if v_squad.id is null then
    raise exception 'National squad not found.';
  end if;

  if v_squad.status not in ('confirmed','on_duty') then
    raise exception 'Only a confirmed national squad can receive a National Duty window.';
  end if;

  if (
    select count(*)
    from public.national_team_squad_members m
    where m.squad_id=v_squad.id
  )<>v_squad.squad_size then
    raise exception 'National squad is incomplete.';
  end if;

  v_status:=case
    when v_today>p_end_date then 'completed'
    when v_today>=p_start_date then 'active'
    else 'planned'
  end;

  insert into public.national_team_duties(
    squad_id,association_id,season_number,cycle_key,
    start_date,end_date,status,label
  )
  values(
    v_squad.id,v_squad.association_id,v_squad.season_number,
    v_squad.cycle_key,p_start_date,p_end_date,v_status,'National Duty'
  )
  on conflict(squad_id)
  do update
  set start_date=excluded.start_date,
      end_date=excluded.end_date,
      status=excluded.status,
      updated_at=now()
  returning id into v_duty_id;

  update public.national_team_squads
  set duty_start_date=p_start_date,
      duty_end_date=p_end_date,
      status=case
        when v_status='active' then 'on_duty'
        when v_status='completed' then 'completed'
        else 'confirmed'
      end,
      updated_at=now()
  where id=v_squad.id;

  return v_duty_id;
end;
$$;

create or replace function public.refresh_national_team_duty_status_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date:=public.get_current_game_date_date();
  v_started integer:=0;
  v_completed integer:=0;
begin
  update public.national_team_duties
  set status='active',updated_at=now()
  where status='planned'
    and start_date<=v_today
    and end_date>=v_today;
  get diagnostics v_started=row_count;

  update public.national_team_squads s
  set status='on_duty',updated_at=now()
  where exists(
    select 1
    from public.national_team_duties d
    where d.squad_id=s.id
      and d.status='active'
  )
    and s.status='confirmed';

  update public.national_team_duties
  set status='completed',updated_at=now()
  where status in ('planned','active')
    and end_date<v_today;
  get diagnostics v_completed=row_count;

  update public.national_team_squads s
  set status='completed',updated_at=now()
  where exists(
    select 1
    from public.national_team_duties d
    where d.squad_id=s.id
      and d.status='completed'
  )
    and s.status in ('confirmed','on_duty');

  return jsonb_build_object(
    'game_date',v_today,
    'duties_started',v_started,
    'duties_completed',v_completed
  );
end;
$$;

-- Extend the existing generic commitment view so normal race selection and
-- overlap checks also see National Duty. All 10 squad riders are blocked,
-- including the three reserves.
create or replace view public.rider_commitment_windows as
select
  tcp.rider_id,
  b.id as source_id,
  'training_camp'::text as source_type,
  b.club_id,
  b.start_date - 1 as blocked_from,
  b.end_date + 1 as blocked_until,
  b.start_date,
  b.end_date,
  b.status
from public.training_camp_bookings b
join public.training_camp_participants tcp
  on tcp.booking_id=b.id
where b.status in ('planned','active')

union all

select
  sm.rider_id,
  d.id as source_id,
  'national_team_duty'::text as source_type,
  sm.club_id_snapshot as club_id,
  d.start_date as blocked_from,
  d.end_date as blocked_until,
  d.start_date,
  d.end_date,
  d.status
from public.national_team_duties d
join public.national_team_squad_members sm
  on sm.squad_id=d.squad_id
where d.status in ('planned','active');

alter table public.national_team_duties enable row level security;
alter table public.national_team_lineups enable row level security;
alter table public.national_team_lineup_members enable row level security;

revoke all on public.national_team_duties from anon,authenticated;
revoke all on public.national_team_lineups from anon,authenticated;
revoke all on public.national_team_lineup_members from anon,authenticated;

revoke all on function public.submit_national_team_lineup_v1(uuid,integer,uuid[])
from public,anon,authenticated;
grant execute on function public.submit_national_team_lineup_v1(uuid,integer,uuid[])
to authenticated;

revoke all on function public.get_my_national_team_lineups_v1(uuid)
from public,anon,authenticated;
grant execute on function public.get_my_national_team_lineups_v1(uuid)
to authenticated;

revoke all on function public.set_national_team_duty_window_v1(uuid,date,date)
from public,anon,authenticated;
grant execute on function public.set_national_team_duty_window_v1(uuid,date,date)
to service_role;

revoke all on function public.refresh_national_team_duty_status_v1()
from public,anon,authenticated;
grant execute on function public.refresh_national_team_duty_status_v1()
to service_role;
