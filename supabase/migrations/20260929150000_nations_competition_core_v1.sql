-- World Nations competition core v1.
-- Separate from the existing individual World Road Championship.
-- Every active National Association enters qualification each season.
-- Prior results may seed draws but never grant a direct final berth.

create table if not exists public.nations_competition_editions (
  id uuid primary key default gen_random_uuid(),
  season_number integer not null unique check (season_number > 0),
  competition_name text not null default 'World Nations Championship',
  status text not null default 'planned'
    check (status in (
      'planned',
      'qualification',
      'final_qualification',
      'world_final',
      'completed',
      'cancelled'
    )),
  active_association_count integer not null default 0 check (active_association_count >= 0),
  finalist_target integer not null default 16 check (finalist_target between 1 and 16),
  points_curve_version integer not null default 1 check (points_curve_version > 0),
  host_association_id uuid references public.national_associations(id) on delete set null,
  host_country_code text,
  champion_association_id uuid references public.national_associations(id) on delete set null,
  champion_country_code text,
  created_on_game_date date not null default public.get_current_game_date_date(),
  completed_on_game_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nations_competition_entries (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.nations_competition_editions(id) on delete cascade,
  association_id uuid not null references public.national_associations(id) on delete restrict,
  country_code text not null,
  seed_score numeric not null default 0,
  status text not null default 'entered'
    check (status in ('entered','advanced','eliminated','finalist','champion','withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(edition_id,association_id),
  unique(edition_id,country_code)
);

create index if not exists nations_competition_entries_edition_status_idx
  on public.nations_competition_entries(edition_id,status,seed_score desc);

create table if not exists public.nations_competition_rounds (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.nations_competition_editions(id) on delete cascade,
  round_index integer not null check (round_index > 0),
  round_type text not null
    check (round_type in ('preliminary','final_qualification','world_final')),
  round_label text not null,
  entrants_target integer not null check (entrants_target > 0),
  advance_target integer not null check (advance_target > 0),
  group_count integer not null check (group_count > 0),
  group_size_min integer not null default 6 check (group_size_min > 0),
  group_size_max integer not null default 10 check (group_size_max >= group_size_min),
  status text not null default 'planned'
    check (status in ('planned','drawn','active','completed','cancelled')),
  starts_on_game_date date,
  ends_on_game_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(edition_id,round_index)
);

create table if not exists public.nations_competition_groups (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.nations_competition_rounds(id) on delete cascade,
  group_number integer not null check (group_number > 0),
  group_label text not null,
  planned_entrant_count integer not null default 0 check (planned_entrant_count >= 0),
  planned_advance_count integer not null default 0 check (planned_advance_count >= 0),
  status text not null default 'planned'
    check (status in ('planned','drawn','active','completed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(round_id,group_number)
);

create table if not exists public.nations_group_entries (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.nations_competition_groups(id) on delete cascade,
  competition_entry_id uuid not null references public.nations_competition_entries(id) on delete cascade,
  seed_position integer,
  final_group_rank integer,
  total_points integer not null default 0,
  ttt_points integer not null default 0,
  flat_points integer not null default 0,
  mountain_points integer not null default 0,
  race_wins integer not null default 0,
  podium_finishes integer not null default 0,
  ttt_rank integer,
  best_day3_rider_rank integer,
  status text not null default 'entered'
    check (status in ('entered','advanced','eliminated','winner','withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(group_id,competition_entry_id)
);

create table if not exists public.nations_host_applications (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.nations_competition_editions(id) on delete cascade,
  association_id uuid not null references public.national_associations(id) on delete cascade,
  submitted_by_user_id uuid not null,
  statement text,
  status text not null default 'submitted'
    check (status in ('submitted','eligible','selected','not_selected','withdrawn')),
  submitted_on_game_date date not null default public.get_current_game_date_date(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(edition_id,association_id)
);

create table if not exists public.nations_competition_history (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.nations_competition_editions(id) on delete cascade,
  season_number integer not null,
  association_id uuid references public.national_associations(id) on delete set null,
  country_code text not null,
  final_rank integer not null check (final_rank > 0),
  total_points integer not null default 0,
  was_host boolean not null default false,
  created_at timestamptz not null default now(),
  unique(edition_id,country_code)
);

drop trigger if exists nations_competition_editions_set_updated_at
  on public.nations_competition_editions;
create trigger nations_competition_editions_set_updated_at
before update on public.nations_competition_editions
for each row execute function private.ppm_set_updated_at_v1();

drop trigger if exists nations_competition_entries_set_updated_at
  on public.nations_competition_entries;
create trigger nations_competition_entries_set_updated_at
before update on public.nations_competition_entries
for each row execute function private.ppm_set_updated_at_v1();

drop trigger if exists nations_competition_rounds_set_updated_at
  on public.nations_competition_rounds;
create trigger nations_competition_rounds_set_updated_at
before update on public.nations_competition_rounds
for each row execute function private.ppm_set_updated_at_v1();

drop trigger if exists nations_competition_groups_set_updated_at
  on public.nations_competition_groups;
create trigger nations_competition_groups_set_updated_at
before update on public.nations_competition_groups
for each row execute function private.ppm_set_updated_at_v1();

drop trigger if exists nations_group_entries_set_updated_at
  on public.nations_group_entries;
create trigger nations_group_entries_set_updated_at
before update on public.nations_group_entries
for each row execute function private.ppm_set_updated_at_v1();

drop trigger if exists nations_host_applications_set_updated_at
  on public.nations_host_applications;
create trigger nations_host_applications_set_updated_at
before update on public.nations_host_applications
for each row execute function private.ppm_set_updated_at_v1();

create or replace function private.nations_group_count_for_field_v1(p_entrants integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select greatest(
    1,
    least(
      greatest(1,ceil(p_entrants::numeric/6.0)::integer),
      greatest(1,ceil(p_entrants::numeric/8.0)::integer)
    )
  );
$$;

create or replace function public.nations_qualification_plan_v1(
  p_active_association_count integer
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_current integer:=greatest(0,coalesce(p_active_association_count,0));
  v_initial integer:=v_current;
  v_finalists integer:=least(16,greatest(0,v_current));
  v_round integer:=0;
  v_next integer;
  v_groups integer;
  v_rounds jsonb:='[]'::jsonb;
begin
  if v_current=0 then
    return jsonb_build_object(
      'active_associations',0,
      'finalist_target',0,
      'rounds','[]'::jsonb
    );
  end if;

  -- For large fields, repeatedly reduce toward 32. Each preliminary round
  -- approximately halves the field without dropping below the 32-nation target.
  while v_current>32 loop
    v_round:=v_round+1;
    v_next:=greatest(32,ceil(v_current::numeric/2.0)::integer);
    v_groups:=greatest(1,ceil(v_current::numeric/8.0)::integer);

    v_rounds:=v_rounds||jsonb_build_array(jsonb_build_object(
      'round_index',v_round,
      'round_type','preliminary',
      'round_label','Qualification Round '||v_round,
      'entrants_target',v_current,
      'advance_target',v_next,
      'group_count',v_groups,
      'group_size_min',6,
      'group_size_max',10
    ));

    v_current:=v_next;
  end loop;

  -- Every country plays qualification. When <=16 Associations are active,
  -- all can advance from this qualifier; nobody receives a direct final berth.
  v_round:=v_round+1;
  v_groups:=case
    when v_current=32 then 4
    else greatest(1,ceil(v_current::numeric/8.0)::integer)
  end;

  v_rounds:=v_rounds||jsonb_build_array(jsonb_build_object(
    'round_index',v_round,
    'round_type','final_qualification',
    'round_label','Final Qualification',
    'entrants_target',v_current,
    'advance_target',v_finalists,
    'group_count',v_groups,
    'group_size_min',6,
    'group_size_max',10
  ));

  v_round:=v_round+1;
  v_rounds:=v_rounds||jsonb_build_array(jsonb_build_object(
    'round_index',v_round,
    'round_type','world_final',
    'round_label','World Nations Final',
    'entrants_target',v_finalists,
    'advance_target',1,
    'group_count',1,
    'group_size_min',v_finalists,
    'group_size_max',v_finalists
  ));

  return jsonb_build_object(
    'active_associations',v_initial,
    'finalist_target',v_finalists,
    'rounds',v_rounds
  );
end;
$$;

create or replace function private.nations_distribute_group_counts_v1(
  p_entrants integer,
  p_groups integer,
  p_advancers integer
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_group integer;
  v_base_size integer;
  v_size_remainder integer;
  v_base_advance integer;
  v_advance_remainder integer;
  v_arr jsonb:='[]'::jsonb;
begin
  if p_groups<=0 then
    return '[]'::jsonb;
  end if;

  v_base_size:=p_entrants/p_groups;
  v_size_remainder:=p_entrants%p_groups;
  v_base_advance:=p_advancers/p_groups;
  v_advance_remainder:=p_advancers%p_groups;

  for v_group in 1..p_groups loop
    v_arr:=v_arr||jsonb_build_array(jsonb_build_object(
      'group_number',v_group,
      'entrant_count',v_base_size+case when v_group<=v_size_remainder then 1 else 0 end,
      'advance_count',v_base_advance+case when v_group<=v_advance_remainder then 1 else 0 end
    ));
  end loop;

  return v_arr;
end;
$$;

create or replace function public.create_nations_competition_edition_v1(
  p_season_number integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_season integer;
  v_season integer;
  v_count integer;
  v_plan jsonb;
  v_edition_id uuid;
  v_round_json jsonb;
  v_round_id uuid;
  v_group_plan jsonb;
  v_group_json jsonb;
begin
  select season_number into v_current_season
  from public.game_state
  where id=true;

  v_season:=coalesce(p_season_number,v_current_season);

  if v_season is null or v_season<>v_current_season then
    raise exception 'World Nations edition can only be generated for the current season.';
  end if;

  if exists(
    select 1
    from public.nations_competition_editions e
    where e.season_number=v_season
  ) then
    select id into v_edition_id
    from public.nations_competition_editions
    where season_number=v_season;

    return jsonb_build_object(
      'status','existing',
      'edition_id',v_edition_id,
      'season_number',v_season
    );
  end if;

  select count(*)::integer
  into v_count
  from public.national_associations a
  where a.status='active'
    and private.national_association_active_member_count_v1(a.id)>=(
      select minimum_active_members
      from public.national_association_config
      where id=true
    );

  if v_count=0 then
    return jsonb_build_object(
      'status','not_created',
      'reason','no_active_associations',
      'season_number',v_season
    );
  end if;

  v_plan:=public.nations_qualification_plan_v1(v_count);

  insert into public.nations_competition_editions(
    season_number,status,active_association_count,finalist_target,points_curve_version
  )
  values(
    v_season,'planned',v_count,least(16,v_count),1
  )
  returning id into v_edition_id;

  -- Seed score is deliberately neutral in v1 until historical Nations results
  -- exist. Future seasons can populate this from prior Nations performance.
  insert into public.nations_competition_entries(
    edition_id,association_id,country_code,seed_score,status
  )
  select
    v_edition_id,a.id,a.country_code,0,'entered'
  from public.national_associations a
  where a.status='active'
    and private.national_association_active_member_count_v1(a.id)>=(
      select minimum_active_members
      from public.national_association_config
      where id=true
    )
  order by a.country_code;

  for v_round_json in
    select value
    from jsonb_array_elements(v_plan->'rounds')
  loop
    insert into public.nations_competition_rounds(
      edition_id,round_index,round_type,round_label,
      entrants_target,advance_target,group_count,
      group_size_min,group_size_max,status
    )
    values(
      v_edition_id,
      (v_round_json->>'round_index')::integer,
      v_round_json->>'round_type',
      v_round_json->>'round_label',
      (v_round_json->>'entrants_target')::integer,
      (v_round_json->>'advance_target')::integer,
      (v_round_json->>'group_count')::integer,
      (v_round_json->>'group_size_min')::integer,
      (v_round_json->>'group_size_max')::integer,
      'planned'
    )
    returning id into v_round_id;

    v_group_plan:=private.nations_distribute_group_counts_v1(
      (v_round_json->>'entrants_target')::integer,
      (v_round_json->>'group_count')::integer,
      case
        when v_round_json->>'round_type'='world_final'
          then (v_round_json->>'entrants_target')::integer
        else (v_round_json->>'advance_target')::integer
      end
    );

    for v_group_json in
      select value
      from jsonb_array_elements(v_group_plan)
    loop
      insert into public.nations_competition_groups(
        round_id,group_number,group_label,
        planned_entrant_count,planned_advance_count,status
      )
      values(
        v_round_id,
        (v_group_json->>'group_number')::integer,
        case
          when v_round_json->>'round_type'='world_final'
            then 'World Nations Final'
          else 'Group '||chr(64+(v_group_json->>'group_number')::integer)
        end,
        (v_group_json->>'entrant_count')::integer,
        case
          when v_round_json->>'round_type'='world_final' then 1
          else (v_group_json->>'advance_count')::integer
        end,
        'planned'
      );
    end loop;
  end loop;

  return jsonb_build_object(
    'status','created',
    'edition_id',v_edition_id,
    'season_number',v_season,
    'active_associations',v_count,
    'plan',v_plan
  );
end;
$$;

create or replace function public.submit_nations_host_application_v1(
  p_edition_id uuid,
  p_statement text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_ctx record;
  v_edition public.nations_competition_editions%rowtype;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_ctx
  from private.current_national_coach_context_v1(v_uid);

  if v_ctx.association_id is null then
    raise exception 'Only the active National Coach can submit a host application.';
  end if;

  select * into v_edition
  from public.nations_competition_editions
  where id=p_edition_id;

  if v_edition.id is null or v_edition.season_number<>v_ctx.season_number then
    raise exception 'World Nations edition not found for the current season.';
  end if;

  if v_edition.status not in ('planned','qualification') then
    raise exception 'Host applications are closed for this edition.';
  end if;

  insert into public.nations_host_applications(
    edition_id,association_id,submitted_by_user_id,statement,status
  )
  values(
    v_edition.id,v_ctx.association_id,v_uid,
    nullif(btrim(coalesce(p_statement,'')),''),
    'submitted'
  )
  on conflict(edition_id,association_id) do update
  set submitted_by_user_id=excluded.submitted_by_user_id,
      statement=excluded.statement,
      status='submitted',
      submitted_on_game_date=public.get_current_game_date_date(),
      updated_at=now()
  returning id into v_id;

  return v_id;
end;
$$;

alter table public.nations_competition_editions enable row level security;
alter table public.nations_competition_entries enable row level security;
alter table public.nations_competition_rounds enable row level security;
alter table public.nations_competition_groups enable row level security;
alter table public.nations_group_entries enable row level security;
alter table public.nations_host_applications enable row level security;
alter table public.nations_competition_history enable row level security;

-- Public competition structure/results are readable by authenticated users.
drop policy if exists nations_competition_editions_read on public.nations_competition_editions;
create policy nations_competition_editions_read
on public.nations_competition_editions for select to authenticated using (true);

drop policy if exists nations_competition_entries_read on public.nations_competition_entries;
create policy nations_competition_entries_read
on public.nations_competition_entries for select to authenticated using (true);

drop policy if exists nations_competition_rounds_read on public.nations_competition_rounds;
create policy nations_competition_rounds_read
on public.nations_competition_rounds for select to authenticated using (true);

drop policy if exists nations_competition_groups_read on public.nations_competition_groups;
create policy nations_competition_groups_read
on public.nations_competition_groups for select to authenticated using (true);

drop policy if exists nations_group_entries_read on public.nations_group_entries;
create policy nations_group_entries_read
on public.nations_group_entries for select to authenticated using (true);

drop policy if exists nations_competition_history_read on public.nations_competition_history;
create policy nations_competition_history_read
on public.nations_competition_history for select to authenticated using (true);

revoke all on public.nations_competition_editions from anon,authenticated;
revoke all on public.nations_competition_entries from anon,authenticated;
revoke all on public.nations_competition_rounds from anon,authenticated;
revoke all on public.nations_competition_groups from anon,authenticated;
revoke all on public.nations_group_entries from anon,authenticated;
revoke all on public.nations_host_applications from anon,authenticated;
revoke all on public.nations_competition_history from anon,authenticated;

grant select on public.nations_competition_editions to authenticated;
grant select on public.nations_competition_entries to authenticated;
grant select on public.nations_competition_rounds to authenticated;
grant select on public.nations_competition_groups to authenticated;
grant select on public.nations_group_entries to authenticated;
grant select on public.nations_competition_history to authenticated;

revoke all on function public.nations_qualification_plan_v1(integer)
from public,anon;
grant execute on function public.nations_qualification_plan_v1(integer)
to authenticated,service_role;

revoke all on function public.create_nations_competition_edition_v1(integer)
from public,anon,authenticated;
grant execute on function public.create_nations_competition_edition_v1(integer)
to service_role;

revoke all on function public.submit_nations_host_application_v1(uuid,text)
from public,anon,authenticated;
grant execute on function public.submit_nations_host_application_v1(uuid,text)
to authenticated;
