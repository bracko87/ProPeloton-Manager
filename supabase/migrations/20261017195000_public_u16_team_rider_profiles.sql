-- Public-facing U16 academy and rider profiles reveal competition facts only.
-- Hidden potential, exact attributes, finances, and private agreements remain private.
create or replace function public.get_public_youth_academy_profile_v1(p_academy_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $function$
declare
  v_record record;
  v_owner uuid := auth.uid();
begin
  if v_owner is null then raise exception 'Not authenticated'; end if;
  select a.id academy_id,a.reputation,a.capacity,c.id club_id,c.name,c.country_code,c.logo_path,
         c.owner_user_id,c.club_tier::text as club_tier
  into v_record from public.youth_academies a
    join public.clubs c on c.id=a.club_id
  where a.id=p_academy_id and a.is_active and c.deleted_at is null;
  if not found then return null; end if;

  return jsonb_build_object(
    'academy_id',v_record.academy_id,
    'club_id',v_record.club_id,'academy_name',v_record.name,
    'country_code',v_record.country_code,'logo_path',v_record.logo_path,
    'club_tier',v_record.club_tier,'reputation',v_record.reputation,
    'capacity',v_record.capacity,
    'is_mine',v_record.owner_user_id=v_owner,
    'division',(select jsonb_build_object('class',m.competition_class,'division',m.division_code)
      from public.youth_academy_competition_memberships m
      where m.academy_id=p_academy_id
      order by m.season_number desc limit 1),
    'riders',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',r.id,'name',r.display_name,'country_code',r.country_code,
        'age',private.youth_academy_age_v1(r.birth_date),'role',r.role
      ) order by r.display_name,r.id)
      from public.youth_riders r where r.academy_id=p_academy_id
        and r.status='academy'
    ),'[]'::jsonb),
    'starts',(select count(*) from public.youth_race_team_prizes p where p.academy_id=p_academy_id),
    'wins',(select count(*) from public.youth_race_team_prizes p where p.academy_id=p_academy_id and p.team_position=1)
  );
end;
$function$;

create or replace function public.get_public_youth_rider_profile_v1(p_youth_rider_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $function$
declare
  v_r record;
  v_user uuid:=auth.uid();
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  select r.id,r.display_name,r.country_code,r.birth_date,r.role,r.status,
         a.id academy_id,c.id club_id,c.name academy_name,c.owner_user_id
    into v_r
  from public.youth_riders r join public.youth_academies a on a.id=r.academy_id
    join public.clubs c on c.id=a.club_id
  where r.id=p_youth_rider_id and c.deleted_at is null;
  if not found then return null; end if;

  return jsonb_build_object(
    'id',v_r.id,'public_only',true,'academy_id',v_r.academy_id,
    'club_id',v_r.club_id,'academy_name',v_r.academy_name,
    'is_mine',v_r.owner_user_id=v_user,
    'display_name',v_r.display_name,'country_code',v_r.country_code,
    'birth_date',v_r.birth_date,'age',private.youth_academy_age_v1(v_r.birth_date),
    'role',v_r.role,'status',v_r.status,
    'race_summary',jsonb_build_object(
      'starts',(select count(distinct rr.race_id) from public.youth_race_results rr where rr.youth_rider_id=v_r.id),
      'wins',(select count(*) from public.youth_race_results rr where rr.youth_rider_id=v_r.id and rr.finish_position=1),
      'podiums',(select count(*) from public.youth_race_results rr where rr.youth_rider_id=v_r.id and rr.finish_position between 1 and 3),
      'regional_points',(select coalesce(sum(rr.regional_points),0) from public.youth_race_results rr where rr.youth_rider_id=v_r.id),
      'world_points',(select coalesce(sum(rr.world_points),0) from public.youth_race_results rr where rr.youth_rider_id=v_r.id)
    ),
    'recent_results',coalesce((
      select jsonb_agg(jsonb_build_object(
        'race_id',recent.race_id,'race_name',recent.race_name,
        'race_date',recent.race_date,'competition_class',recent.competition_class,
        'result_status',recent.result_status,'finish_position',recent.finish_position,
        'regional_points',recent.regional_points,'world_points',recent.world_points
      ) order by recent.race_date desc)
      from (select rr.race_id,r.race_name,r.race_date,r.competition_class,
        rr.result_status,rr.finish_position,rr.regional_points,rr.world_points
      from public.youth_race_results rr join public.youth_races r on r.id=rr.race_id
      where rr.youth_rider_id=v_r.id
      order by r.race_date desc limit 10) recent
    ),'[]'::jsonb),
    'scouting_report',case when v_r.owner_user_id=v_user then null else (
      select jsonb_build_object(
        'id',sr.id,
        'stipend',sr.expected_stipend_weekly,
        'accommodation',sr.suggested_accommodation_weekly,
        'compensation',sr.suggested_compensation
      )
      from public.youth_scouting_reports sr
      join public.youth_academies own on own.id=sr.academy_id
      join public.clubs ownclub on ownclub.id=own.club_id
      where ownclub.owner_user_id=v_user and sr.target_youth_rider_id=v_r.id
        and sr.expires_on>=public.get_current_game_date_date()
        and sr.status in ('new','shortlisted','approached')
      order by sr.created_at desc limit 1
    ) end
  );
end;
$function$;

revoke all on function public.get_public_youth_academy_profile_v1(uuid) from public;
revoke all on function public.get_public_youth_rider_profile_v1(uuid) from public;
grant execute on function public.get_public_youth_academy_profile_v1(uuid) to authenticated;
grant execute on function public.get_public_youth_rider_profile_v1(uuid) to authenticated;
