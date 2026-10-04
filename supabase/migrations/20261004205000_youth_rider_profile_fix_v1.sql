
create or replace function public.get_my_youth_rider_profile_v1(
  p_youth_rider_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,private,auth,pg_temp
as $function$
declare
  v_user uuid:=auth.uid();
  v_rider public.youth_riders%rowtype;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  select yr.*
  into v_rider
  from public.youth_riders yr
  join public.youth_academies ya on ya.id=yr.academy_id
  join public.clubs c on c.id=ya.club_id
  where yr.id=p_youth_rider_id
    and c.owner_user_id=v_user
    and c.deleted_at is null
  limit 1;

  if v_rider.id is null then
    raise exception 'Youth Rider not found in your Academy.';
  end if;

  return jsonb_build_object(
    'id',v_rider.id,
    'display_name',v_rider.display_name,
    'country_code',v_rider.country_code,
    'birth_date',v_rider.birth_date,
    'age',private.youth_academy_age_v1(v_rider.birth_date),
    'role',v_rider.role,
    'assessment_band',private.youth_potential_band_v1(v_rider.hidden_potential),
    'development_focus',v_rider.development_focus,
    'workload',v_rider.workload,
    'readiness',v_rider.readiness,
    'fatigue',v_rider.fatigue,
    'status',v_rider.status,
    'joined_game_date',v_rider.joined_game_date,
    'joined_season',v_rider.joined_season,
    'is_starter_rider',v_rider.is_starter_rider,
    'attributes',jsonb_build_object(
      'sprint',v_rider.sprint,
      'climbing',v_rider.climbing,
      'time_trial',v_rider.time_trial,
      'endurance',v_rider.endurance,
      'flat',v_rider.flat,
      'recovery',v_rider.recovery,
      'resistance',v_rider.resistance,
      'race_iq',v_rider.race_iq,
      'teamwork',v_rider.teamwork
    ),
    'agreement',coalesce((
      select jsonb_build_object(
        'stipend_weekly',a.stipend_weekly,
        'accommodation_weekly',a.accommodation_weekly,
        'starts_on',a.starts_on,
        'ends_on',a.ends_on,
        'status',a.status
      )
      from public.youth_rider_agreements a
      where a.youth_rider_id=v_rider.id
      order by (a.status='active') desc,a.updated_at desc
      limit 1
    ),'{}'::jsonb),
    'race_summary',jsonb_build_object(
      'starts',(
        select count(distinct rr.race_id)
        from public.youth_race_results rr
        where rr.youth_rider_id=v_rider.id
          and rr.result_status in ('finished','dnf')
      ),
      'wins',(
        select count(*)
        from public.youth_race_results rr
        where rr.youth_rider_id=v_rider.id and rr.finish_position=1
      ),
      'podiums',(
        select count(*)
        from public.youth_race_results rr
        where rr.youth_rider_id=v_rider.id
          and rr.finish_position between 1 and 3
      ),
      'regional_points',coalesce((
        select sum(rr.regional_points)
        from public.youth_race_results rr
        where rr.youth_rider_id=v_rider.id
      ),0),
      'world_points',coalesce((
        select sum(rr.world_points)
        from public.youth_race_results rr
        where rr.youth_rider_id=v_rider.id
      ),0)
    ),
    'recent_results',coalesce((
      select jsonb_agg(jsonb_build_object(
        'race_id',x.race_id,
        'race_name',x.race_name,
        'race_date',x.race_date,
        'competition_class',x.competition_class,
        'result_status',x.result_status,
        'finish_position',x.finish_position,
        'regional_points',x.regional_points,
        'world_points',x.world_points
      ) order by x.race_date desc)
      from (
        select
          rr.race_id,r.race_name,r.race_date,r.competition_class,
          rr.result_status,rr.finish_position,
          rr.regional_points,rr.world_points
        from public.youth_race_results rr
        join public.youth_races r on r.id=rr.race_id
        where rr.youth_rider_id=v_rider.id
        order by r.race_date desc
        limit 10
      ) x
    ),'[]'::jsonb)
  );
end;
$function$;

revoke all on function public.get_my_youth_rider_profile_v1(uuid)
from public,anon;
grant execute on function public.get_my_youth_rider_profile_v1(uuid)
to authenticated;
