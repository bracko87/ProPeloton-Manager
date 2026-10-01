-- Persistent National Team standing for World Nations.
-- Ranking points accumulate across seasons; there are no defending points.

create table if not exists public.nations_team_ranking_point_scale (
  phase text not null check (phase in ('qualification','world_final')),
  finishing_position integer not null check (finishing_position between 1 and 16),
  points integer not null check (points >= 0),
  version integer not null default 1,
  primary key (phase,finishing_position,version)
);

insert into public.nations_team_ranking_point_scale(phase,finishing_position,points,version)
values
  ('qualification',1,1000,1),('qualification',2,800,1),('qualification',3,650,1),('qualification',4,540,1),
  ('qualification',5,450,1),('qualification',6,375,1),('qualification',7,315,1),('qualification',8,265,1),
  ('qualification',9,220,1),('qualification',10,180,1),('qualification',11,145,1),('qualification',12,115,1),
  ('qualification',13,90,1),('qualification',14,70,1),('qualification',15,50,1),('qualification',16,35,1),
  ('world_final',1,2000,1),('world_final',2,1600,1),('world_final',3,1300,1),('world_final',4,1080,1),
  ('world_final',5,900,1),('world_final',6,750,1),('world_final',7,630,1),('world_final',8,530,1),
  ('world_final',9,440,1),('world_final',10,360,1),('world_final',11,290,1),('world_final',12,230,1),
  ('world_final',13,180,1),('world_final',14,140,1),('world_final',15,100,1),('world_final',16,70,1)
on conflict (phase,finishing_position,version) do update set points=excluded.points;

create table if not exists public.nations_team_ranking_points (
  id uuid primary key default gen_random_uuid(),
  association_id uuid not null references public.national_associations(id) on delete cascade,
  edition_id uuid not null references public.nations_competition_editions(id) on delete cascade,
  season_number integer not null check (season_number >= 1),
  round_id uuid not null references public.nations_competition_rounds(id) on delete cascade,
  group_id uuid not null references public.nations_competition_groups(id) on delete cascade,
  phase text not null check (phase in ('qualification','world_final')),
  final_group_rank integer not null check (final_group_rank between 1 and 16),
  points integer not null check (points >= 0),
  scale_version integer not null default 1,
  awarded_at timestamptz not null default now(),
  unique(group_id,association_id)
);

create index if not exists nations_team_ranking_points_assoc_season_idx
  on public.nations_team_ranking_points(association_id,season_number);
create index if not exists nations_team_ranking_points_total_idx
  on public.nations_team_ranking_points(association_id,points desc);

alter table public.nations_team_ranking_point_scale enable row level security;
alter table public.nations_team_ranking_points enable row level security;
revoke all on public.nations_team_ranking_point_scale,public.nations_team_ranking_points from anon,authenticated;

CREATE OR REPLACE FUNCTION private.award_nations_team_ranking_points_v1(p_group_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_inserted integer:=0;
begin
  insert into public.nations_team_ranking_points(
    association_id,edition_id,season_number,round_id,group_id,
    phase,final_group_rank,points,scale_version
  )
  select
    ce.association_id,
    r.edition_id,
    ed.season_number,
    r.id,
    g.id,
    case when r.round_type='world_final' then 'world_final' else 'qualification' end,
    nge.final_group_rank,
    ps.points,
    1
  from public.nations_competition_groups g
  join public.nations_competition_rounds r on r.id=g.round_id
  join public.nations_competition_editions ed on ed.id=r.edition_id
  join public.nations_group_entries nge on nge.group_id=g.id
  join public.nations_competition_entries ce on ce.id=nge.competition_entry_id
  join public.nations_team_ranking_point_scale ps
    on ps.version=1
   and ps.phase=case when r.round_type='world_final' then 'world_final' else 'qualification' end
   and ps.finishing_position=nge.final_group_rank
  where g.id=p_group_id
    and g.status='completed'
    and nge.status<>'withdrawn'
    and nge.final_group_rank between 1 and 16
  on conflict(group_id,association_id) do update
  set final_group_rank=excluded.final_group_rank,
      points=excluded.points,
      phase=excluded.phase,
      scale_version=excluded.scale_version,
      awarded_at=now();

  get diagnostics v_inserted=row_count;
  return v_inserted;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.trg_award_nations_team_ranking_points_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.status='completed'
     and old.status is distinct from new.status then
    perform private.award_nations_team_ranking_points_v1(new.id);
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_nations_team_standings_v1(p_season_number integer DEFAULT NULL::integer)
 RETURNS TABLE(standing_rank bigint, association_id uuid, association_name text, country_code text, country_name text, season_points bigint, qualification_points bigint, world_final_points bigint, all_time_points bigint, seasons_scored bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with target as (
    select coalesce(p_season_number,(select gs.season_number from public.game_state gs where gs.id=true))::integer season_number
  ),
  scored as (
    select a.id association_id,a.name association_name,a.country_code,coalesce(c.name,a.country_code) country_name,
      coalesce(sum(rp.points) filter(where rp.season_number=(select season_number from target)),0)::bigint season_points,
      coalesce(sum(rp.points) filter(where rp.season_number=(select season_number from target) and rp.phase='qualification'),0)::bigint qualification_points,
      coalesce(sum(rp.points) filter(where rp.season_number=(select season_number from target) and rp.phase='world_final'),0)::bigint world_final_points,
      coalesce(sum(rp.points),0)::bigint all_time_points,
      count(distinct rp.season_number)::bigint seasons_scored
    from public.national_associations a
    left join public.countries c on upper(c.code)=upper(a.country_code)
    left join public.nations_team_ranking_points rp on rp.association_id=a.id
    where a.status='active'
    group by a.id,a.name,a.country_code,c.name
  )
  select row_number() over(order by all_time_points desc,season_points desc,country_code) standing_rank,
    association_id,association_name,country_code,country_name,season_points,qualification_points,
    world_final_points,all_time_points,seasons_scored
  from scored
  order by standing_rank;
$function$
;

CREATE OR REPLACE FUNCTION public.get_nations_team_ranking_scale_v1()
 RETURNS TABLE(phase text, finishing_position integer, points integer, version integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select s.phase,s.finishing_position,s.points,s.version
  from public.nations_team_ranking_point_scale s
  where s.version=1
  order by case s.phase when 'qualification' then 1 else 2 end,s.finishing_position;
$function$
;

CREATE OR REPLACE FUNCTION public.create_nations_competition_edition_v1(p_season_number integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  insert into public.nations_competition_entries(
    edition_id,association_id,country_code,seed_score,status
  )
  select
    v_edition_id,
    a.id,
    a.country_code,
    case
      when v_season<=1 then 0
      else coalesce(
        (
          select sum(rp.points)::numeric
          from public.nations_team_ranking_points rp
          where rp.association_id=a.id
            and rp.season_number<v_season
        ),
        0
      )
    end,
    'entered'
  from public.national_associations a
  where a.status='active'
    and private.national_association_active_member_count_v1(a.id)>=(
      select minimum_active_members
      from public.national_association_config
      where id=true
    )
  order by
    case when v_season<=1 then 0 else coalesce((
      select sum(rp.points)
      from public.nations_team_ranking_points rp
      where rp.association_id=a.id
        and rp.season_number<v_season
    ),0) end desc,
    a.country_code;

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
$function$
;

drop trigger if exists trg_award_nations_team_ranking_points_v1 on public.nations_competition_groups;
create trigger trg_award_nations_team_ranking_points_v1
after update of status on public.nations_competition_groups
for each row execute function private.trg_award_nations_team_ranking_points_v1();

grant execute on function public.get_nations_team_standings_v1(integer) to authenticated;
grant execute on function public.get_nations_team_ranking_scale_v1() to authenticated;

do $$
declare v_group record;
begin
  for v_group in select id from public.nations_competition_groups where status='completed'
  loop
    perform private.award_nations_team_ranking_points_v1(v_group.id);
  end loop;
end $$;

update public.nations_competition_schedule_config
set generation_month=1,generation_day=10,updated_at=now()
where id=true;
