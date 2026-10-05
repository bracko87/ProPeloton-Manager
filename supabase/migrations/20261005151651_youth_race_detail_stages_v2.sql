create or replace function public.get_my_youth_race_detail_v1(p_race_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,private,auth,pg_temp
as $function$
declare
  v_user uuid:=auth.uid();
  v_academy_id uuid;
  v_entry public.youth_race_entries%rowtype;
  v_race public.youth_races%rowtype;
  v_game_date date:=public.get_current_game_date_date();
  v_squad_decider text;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  select a.id,coalesce(s.race_squad_decider,'u16_head_coach')
  into v_academy_id,v_squad_decider
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  left join private.youth_effective_settings_v1 s on s.academy_id=a.id
  where c.owner_user_id=v_user and c.deleted_at is null and a.is_active=true
  limit 1;

  if v_academy_id is null then raise exception 'Youth Academy is not activated'; end if;

  select * into v_entry
  from public.youth_race_entries e
  where e.race_id=p_race_id and e.academy_id=v_academy_id and e.status in ('entered','completed')
  limit 1;

  if v_entry.id is null then
    raise exception 'This Youth race page is available only for races your Academy participates in.';
  end if;

  select * into v_race from public.youth_races where id=p_race_id;
  if v_race.id is null then raise exception 'Youth race not found'; end if;

  return jsonb_build_object(
    'game_date',v_game_date,
    'race',jsonb_build_object(
      'id',v_race.id,'season_number',v_race.season_number,'race_name',v_race.race_name,
      'race_date',v_race.race_date,'race_end_date',coalesce(v_race.race_end_date,v_race.race_date),
      'race_days',v_race.race_days,'competition_class',v_race.competition_class,
      'division_code',v_race.division_code,'host_city',v_race.host_city,
      'host_country_code',v_race.host_country_code,'terrain_type',v_race.terrain_type,
      'distance_km',v_race.distance_km,'entry_cost',v_race.entry_cost,
      'prize_fund_cash',v_race.prize_fund_cash,'lineup_size',v_race.lineup_size,
      'team_limit',v_race.team_limit,
      'entries_count',(select count(*) from public.youth_race_entries e where e.race_id=v_race.id and e.status in ('entered','completed')),
      'status',v_race.status,'results_published_at',v_race.results_published_at,
      'start_time_region_code',v_race.start_time_region_code,
      'planned_start_time_label',v_race.planned_start_time_label
    ),
    'my_entry',jsonb_build_object(
      'id',v_entry.id,'status',v_entry.status,'entered_on',v_entry.entered_on,
      'entered_by',v_entry.entered_by,'strategy',v_entry.strategy,'race_squad_decider',v_squad_decider
    ),
    'stages',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',s.id,'stage_number',s.stage_number,'stage_date',s.stage_date,
        'stage_type',s.stage_type,'distance_km',s.distance_km,
        'planned_start_time_label',s.planned_start_time_label,
        'start_time_region_code',s.start_time_region_code,
        'sprint_points_total',s.sprint_points_total,
        'mountain_points_total',s.mountain_points_total,
        'time_trial_points_total',s.time_trial_points_total,
        'status',s.status,
        'results',case when s.status='completed' then coalesce((
          select jsonb_agg(jsonb_build_object(
            'position',sr.finish_position,'rider_id',yr.id,'rider_name',yr.display_name,
            'country_code',yr.country_code,'academy_id',sr.academy_id,'academy_name',c.name,
            'result_status',sr.result_status,'gap_seconds',sr.gap_seconds,'time_seconds',sr.time_seconds,
            'sprint_points',sr.sprint_points,'mountain_points',sr.mountain_points,'time_trial_points',sr.time_trial_points
          ) order by sr.finish_position nulls last,yr.display_name)
          from public.youth_race_stage_results sr
          join public.youth_riders yr on yr.id=sr.youth_rider_id
          join public.youth_academies a on a.id=sr.academy_id
          join public.clubs c on c.id=a.club_id
          where sr.race_id=v_race.id and sr.stage_number=s.stage_number
        ),'[]'::jsonb) else '[]'::jsonb end
      ) order by s.stage_number)
      from public.youth_race_stages s where s.race_id=v_race.id
    ),'[]'::jsonb),
    'teams',coalesce((
      select jsonb_agg(jsonb_build_object(
        'academy_id',e.academy_id,'club_name',c.name,'country_code',c.country_code,
        'logo_path',c.logo_path,'is_ai',coalesce(c.is_ai,false),'entry_status',e.status,
        'lineup_count',(select count(*) from public.youth_race_lineups l where l.entry_id=e.id),
        'is_mine',e.academy_id=v_academy_id,'team_position',p.team_position,'prize_cash',coalesce(p.prize_cash,0)
      ) order by coalesce(p.team_position,9999),c.name)
      from public.youth_race_entries e
      join public.youth_academies a on a.id=e.academy_id
      join public.clubs c on c.id=a.club_id
      left join public.youth_race_team_prizes p on p.race_id=e.race_id and p.academy_id=e.academy_id
      where e.race_id=v_race.id and e.status in ('entered','completed')
    ),'[]'::jsonb),
    'my_lineup',coalesce((
      select jsonb_agg(jsonb_build_object(
        'rider_id',yr.id,'name',yr.display_name,'country_code',yr.country_code,
        'role',yr.role,'readiness',yr.readiness,'fatigue',yr.fatigue
      ) order by l.slot_no)
      from public.youth_race_lineups l
      join public.youth_riders yr on yr.id=l.youth_rider_id
      where l.entry_id=v_entry.id
    ),'[]'::jsonb),
    'eligible_riders',case when v_entry.status='entered' and v_race.status='scheduled' then coalesce((
      select jsonb_agg(jsonb_build_object(
        'rider_id',yr.id,'name',yr.display_name,'country_code',yr.country_code,
        'role',yr.role,'readiness',yr.readiness,'fatigue',yr.fatigue,
        'eligible',private.youth_rider_available_for_race_v1(yr.id,v_race.id)
      ) order by yr.display_name)
      from public.youth_riders yr
      where yr.academy_id=v_academy_id and yr.status='academy'
    ),'[]'::jsonb) else '[]'::jsonb end,
    'rider_results',case when v_race.status='completed' then coalesce((
      select jsonb_agg(jsonb_build_object(
        'position',rr.finish_position,'rider_id',yr.id,'rider_name',yr.display_name,
        'country_code',yr.country_code,'academy_id',rr.academy_id,'academy_name',c.name,
        'result_status',rr.result_status,'gap_seconds',rr.gap_seconds,
        'general_points',rr.general_points,'sprint_points',rr.sprint_points,
        'mountain_points',rr.mountain_points,'time_trial_points',rr.time_trial_points,
        'ranking_points',rr.ranking_points
      ) order by rr.finish_position nulls last,yr.display_name)
      from public.youth_race_results rr
      join public.youth_riders yr on yr.id=rr.youth_rider_id
      join public.youth_academies a on a.id=rr.academy_id
      join public.clubs c on c.id=a.club_id
      where rr.race_id=v_race.id
    ),'[]'::jsonb) else '[]'::jsonb end,
    'classifications',jsonb_build_object(
      'sprint',coalesce((
        select jsonb_agg(z.item order by z.points desc,z.rider_name)
        from (
          select yr.display_name rider_name,sum(sr.sprint_points) points,
            jsonb_build_object('rider_id',yr.id,'rider_name',yr.display_name,'country_code',yr.country_code,
              'academy_name',c.name,'points',sum(sr.sprint_points)) item
          from public.youth_race_stage_results sr
          join public.youth_riders yr on yr.id=sr.youth_rider_id
          join public.youth_academies a on a.id=sr.academy_id
          join public.clubs c on c.id=a.club_id
          where sr.race_id=v_race.id
          group by yr.id,yr.display_name,yr.country_code,c.name
          having sum(sr.sprint_points)>0
        ) z
      ),'[]'::jsonb),
      'mountain',coalesce((
        select jsonb_agg(z.item order by z.points desc,z.rider_name)
        from (
          select yr.display_name rider_name,sum(sr.mountain_points) points,
            jsonb_build_object('rider_id',yr.id,'rider_name',yr.display_name,'country_code',yr.country_code,
              'academy_name',c.name,'points',sum(sr.mountain_points)) item
          from public.youth_race_stage_results sr
          join public.youth_riders yr on yr.id=sr.youth_rider_id
          join public.youth_academies a on a.id=sr.academy_id
          join public.clubs c on c.id=a.club_id
          where sr.race_id=v_race.id
          group by yr.id,yr.display_name,yr.country_code,c.name
          having sum(sr.mountain_points)>0
        ) z
      ),'[]'::jsonb),
      'time_trial',coalesce((
        select jsonb_agg(z.item order by z.points desc,z.rider_name)
        from (
          select yr.display_name rider_name,sum(sr.time_trial_points) points,
            jsonb_build_object('rider_id',yr.id,'rider_name',yr.display_name,'country_code',yr.country_code,
              'academy_name',c.name,'points',sum(sr.time_trial_points)) item
          from public.youth_race_stage_results sr
          join public.youth_riders yr on yr.id=sr.youth_rider_id
          join public.youth_academies a on a.id=sr.academy_id
          join public.clubs c on c.id=a.club_id
          where sr.race_id=v_race.id
          group by yr.id,yr.display_name,yr.country_code,c.name
          having sum(sr.time_trial_points)>0
        ) z
      ),'[]'::jsonb)
    ),
    'team_results',case when v_race.status='completed' then coalesce((
      select jsonb_agg(jsonb_build_object(
        'team_position',p.team_position,'academy_id',p.academy_id,'academy_name',c.name,
        'country_code',c.country_code,'logo_path',c.logo_path,'prize_cash',p.prize_cash,
        'is_mine',p.academy_id=v_academy_id
      ) order by p.team_position)
      from public.youth_race_team_prizes p
      join public.youth_academies a on a.id=p.academy_id
      join public.clubs c on c.id=a.club_id
      where p.race_id=v_race.id
    ),'[]'::jsonb) else '[]'::jsonb end
  );
end;
$function$;
