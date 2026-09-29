create or replace function public.generate_race_ranking_point_awards_v1(
  p_race_id uuid,
  p_after_stage_id uuid default null::uuid,
  p_is_final boolean default false
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_race_class_code text;
  v_race_format text;
  v_stage_id uuid;
begin
  select
    coalesce(rer.race_class_code::text, r.category::text),
    coalesce(
      rcr.race_format::text,
      case when r.category::text like '2.%' then 'stage_race' else 'one_day' end
    )
  into v_race_class_code, v_race_format
  from public.races r
  left join public.race_entry_rules rer on rer.race_id = r.id
  left join public.race_category_rules rcr
    on rcr.race_class_code = coalesce(rer.race_class_code::text, r.category::text)
  where r.id = p_race_id;

  if v_race_class_code is null then
    raise exception 'Cannot generate ranking awards: race % has no class/category rule.', p_race_id;
  end if;

  if not exists (
    select 1 from public.race_ranking_point_rules rr
    where rr.race_class_code = v_race_class_code
  ) then
    raise exception 'Cannot generate ranking awards: missing race_ranking_point_rules for class %.', v_race_class_code;
  end if;

  if p_after_stage_id is not null then
    select s.id into v_stage_id
    from public.race_stages s
    where s.id = p_after_stage_id and s.race_id = p_race_id;

    if v_stage_id is null then
      raise exception 'Stage % does not belong to race %.', p_after_stage_id, p_race_id;
    end if;
  else
    select s.id into v_stage_id
    from public.race_stages s
    where s.race_id = p_race_id
    order by s.stage_number desc nulls last, s.stage_date desc nulls last, s.id
    limit 1;
  end if;

  if v_stage_id is null then
    raise exception 'Cannot generate ranking awards: race % has no stage.', p_race_id;
  end if;

  delete from public.race_ranking_point_awards a
  where a.race_id = p_race_id
    and a.stage_id = v_stage_id
    and a.source_type in ('stage_finish', 'leader_day', 'oneday_finish');

  if p_is_final then
    delete from public.race_ranking_point_awards a
    where a.race_id = p_race_id
      and a.source_type = 'final_gc';
  end if;

  if v_race_format = 'stage_race' then
    insert into public.race_ranking_point_awards (
      race_id, stage_id, source_type, classification_type, rank,
      rider_id, team_id, rider_points, team_points,
      display_name_snapshot, team_name_snapshot
    )
    select
      p_race_id, v_stage_id, 'stage_finish', null, sr.rank,
      sr.rider_id, sr.team_id, rr.points, rr.points,
      coalesce(sr.rider_name_snapshot, rd.display_name, sr.rider_id::text),
      coalesce(sr.team_name_snapshot, c.name, sr.team_id::text)
    from public.race_stage_results sr
    join public.race_ranking_point_rules rr
      on rr.race_class_code = v_race_class_code
     and rr.source_type = 'stage_finish'
     and rr.rank = sr.rank
    left join public.riders rd on rd.id = sr.rider_id
    left join public.clubs c on c.id = sr.team_id
    where sr.stage_id = v_stage_id
      and sr.rider_id is not null
      and sr.rank is not null
      and coalesce(lower(to_jsonb(sr)->>'status'), 'finished') not in (
        'dnf','dns','dsq','otl','abandoned','did_not_finish','did_not_start','disqualified'
      );

    insert into public.race_ranking_point_awards (
      race_id, stage_id, source_type, classification_type, rank,
      rider_id, team_id, rider_points, team_points,
      display_name_snapshot, team_name_snapshot
    )
    select
      p_race_id, v_stage_id, 'leader_day', 'general', cs.rank,
      cs.rider_id, cs.team_id, rr.points, rr.points,
      coalesce(cs.display_name_snapshot, rd.display_name, cs.rider_id::text),
      coalesce(cs.team_name_snapshot, c.name, cs.team_id::text)
    from public.race_classification_standings cs
    join public.race_ranking_point_rules rr
      on rr.race_class_code = v_race_class_code
     and rr.source_type = 'leader_day'
     and rr.rank = cs.rank
    left join public.riders rd on rd.id = cs.rider_id
    left join public.clubs c on c.id = cs.team_id
    where cs.race_id = p_race_id
      and cs.after_stage_id = v_stage_id
      and cs.rider_id is not null
      and coalesce(cs.entity_type::text, 'rider') = 'rider'
      and lower(cs.classification_type::text) in ('general','gc','overall')
      and cs.rank = 1;

    if p_is_final then
      insert into public.race_ranking_point_awards (
        race_id, stage_id, source_type, classification_type, rank,
        rider_id, team_id, rider_points, team_points,
        display_name_snapshot, team_name_snapshot
      )
      select
        p_race_id, v_stage_id, 'final_gc', 'general', cs.rank,
        cs.rider_id, cs.team_id, rr.points, rr.points,
        coalesce(cs.display_name_snapshot, rd.display_name, cs.rider_id::text),
        coalesce(cs.team_name_snapshot, c.name, cs.team_id::text)
      from public.race_classification_standings cs
      join public.race_ranking_point_rules rr
        on rr.race_class_code = v_race_class_code
       and rr.source_type = 'final_gc'
       and rr.rank = cs.rank
      left join public.riders rd on rd.id = cs.rider_id
      left join public.clubs c on c.id = cs.team_id
      where cs.race_id = p_race_id
        and cs.after_stage_id = v_stage_id
        and cs.rider_id is not null
        and coalesce(cs.entity_type::text, 'rider') = 'rider'
        and lower(cs.classification_type::text) in ('general','gc','overall')
        and cs.rank is not null;
    end if;
  else
    insert into public.race_ranking_point_awards (
      race_id, stage_id, source_type, classification_type, rank,
      rider_id, team_id, rider_points, team_points,
      display_name_snapshot, team_name_snapshot
    )
    select
      p_race_id, v_stage_id, 'oneday_finish', null, sr.rank,
      sr.rider_id, sr.team_id, rr.points, rr.points,
      coalesce(sr.rider_name_snapshot, rd.display_name, sr.rider_id::text),
      coalesce(sr.team_name_snapshot, c.name, sr.team_id::text)
    from public.race_stage_results sr
    join public.race_ranking_point_rules rr
      on rr.race_class_code = v_race_class_code
     and rr.source_type = 'oneday_finish'
     and rr.rank = sr.rank
    left join public.riders rd on rd.id = sr.rider_id
    left join public.clubs c on c.id = sr.team_id
    where sr.stage_id = v_stage_id
      and sr.rider_id is not null
      and sr.rank is not null
      and coalesce(lower(to_jsonb(sr)->>'status'), 'finished') not in (
        'dnf','dns','dsq','otl','abandoned','did_not_finish','did_not_start','disqualified'
      );
  end if;
end;
$function$;

create or replace view public.rider_statistics_page_international_v1 as
with current_season as (
  select public.team_ranking_get_current_season_year_v1() as season_year
),
current_rider_club as (
  select distinct on (cr.rider_id)
    cr.rider_id,
    cr.club_id
  from public.club_riders cr
  join public.clubs c1 on c1.id = cr.club_id
  where c1.deleted_at is null
  order by cr.rider_id, cr.created_at desc nulls last, cr.club_id
)
select
  r.id,
  r.id as rider_id,
  cs.season_year,
  coalesce(nullif(concat_ws(' ', nullif(r.first_name,''), nullif(r.last_name,'')),''), nullif(r.display_name,''), r.id::text) as display_name,
  r.country_code,
  coalesce(r.role::text,'—') as role,
  r.overall,
  r.potential,
  r.sprint,
  r.climbing,
  r.time_trial,
  r.endurance,
  r.flat,
  r.recovery,
  r.resistance,
  r.race_iq,
  r.teamwork,
  r.morale,
  r.birth_date,
  r.market_value,
  r.salary,
  r.contract_expires_season,
  r.availability_status,
  r.fatigue,
  r.image_url,
  c.id as club_id,
  public.club_current_display_name_v1(c.id,c.name) as club_name,
  c.country_code as club_country_code,
  c.club_tier::text as club_tier,
  c.is_ai as club_is_ai,
  c.is_active as club_is_active,
  coalesce(v.points,0::numeric) as international_points,
  coalesce(v.points,0::numeric) as season_points_overall,
  coalesce(v.stage_finish_points,0::numeric) as season_points_sprint,
  coalesce(v.final_gc_points,0::numeric) + coalesce(v.oneday_finish_points,0::numeric) + coalesce(v.leader_day_points,0::numeric) as season_points_climbing,
  coalesce(v.podiums,0) as podiums,
  coalesce(v.jerseys,0) as jerseys,
  coalesce(v.stage_wins,0) as stage_wins,
  coalesce(v.final_jerseys,0) as final_jerseys,
  coalesce(v.oneday_finish_points,0::numeric) as oneday_finish_points,
  coalesce(v.stage_finish_points,0::numeric) as stage_finish_points,
  coalesce(v.leader_day_points,0::numeric) as leader_day_points,
  coalesce(v.final_gc_points,0::numeric) as final_gc_points
from public.riders r
cross join current_season cs
left join public.rider_season_overview_v1 v
  on v.rider_id=r.id and v.season_year=cs.season_year
left join current_rider_club crc on crc.rider_id=r.id
left join public.clubs c on c.id=crc.club_id
order by coalesce(v.points,0::numeric) desc, r.id;
