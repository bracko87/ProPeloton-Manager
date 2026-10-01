CREATE OR REPLACE FUNCTION public.get_my_national_association_overview_v2()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_base jsonb;
  v_assoc_id uuid;
  v_season integer;
  v_today date;
  v_events jsonb:='[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  v_base:=public.get_my_national_association_overview_v1();

  if coalesce((v_base->>'association_exists')::boolean,false)=false then
    return v_base||jsonb_build_object('upcoming_events','[]'::jsonb);
  end if;

  v_assoc_id:=nullif(v_base->>'association_id','')::uuid;
  v_season:=nullif(v_base->>'season_number','')::integer;
  v_today:=nullif(v_base->>'current_game_date','')::date;

  select coalesce(jsonb_agg(event_payload order by event_date,race_day),'[]'::jsonb)
  into v_events
  from (
    select
      e.event_date,
      e.race_day,
      jsonb_build_object(
        'event_id',e.id,
        'event_type','world_nations',
        'event_date',e.event_date,
        'race_day',e.race_day,
        'race_type',e.race_type,
        'round_label',r.round_label,
        'group_label',g.group_label,
        'cycle_key',e.cycle_key,
        'status',e.status,
        'host_country_code',coalesce(e.host_country_code,rs.host_country_code,src.host_country_code,rr.country_code),
        'host_city',coalesce(
          nullif(trim(rs.host_city),''),
          case when nullif(trim(rs.start_city_name),'') is distinct from 'Deutschland Tour'
            then nullif(trim(rs.start_city_name),'') end,
          case when nullif(trim(rs.start_city),'') is distinct from 'Deutschland Tour'
            then nullif(trim(rs.start_city),'') end,
          nullif(trim(src.host_city),''),
          case when nullif(trim(src.start_city_name),'') is distinct from 'Deutschland Tour'
            then nullif(trim(src.start_city_name),'') end,
          case when nullif(trim(src.start_city),'') is distinct from 'Deutschland Tour'
            then nullif(trim(src.start_city),'') end,
          nullif(trim(split_part(coalesce(src.metadata->>'official_start_finish_location',''),',',2)),''),
          nullif(trim(src.metadata->>'official_start_finish_location'),''),
          nullif(trim(rr.host_city),'')
        ),
        'lineup',(
          select jsonb_build_object(
            'lineup_id',l.id,
            'status',l.status,
            'race_day',l.race_day,
            'race_type',l.race_type,
            'riders',coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'rider_id',lm.rider_id,
                  'rider_name',sm.rider_name_snapshot,
                  'club_id',sm.club_id_snapshot,
                  'club_name',sm.club_name_snapshot,
                  'squad_role',sm.squad_role
                )
                order by sm.rider_name_snapshot
              )
              from public.national_team_lineup_members lm
              left join public.national_team_squad_members sm
                on sm.squad_id=s.id
               and sm.rider_id=lm.rider_id
              where lm.lineup_id=l.id
            ),'[]'::jsonb)
          )
          from public.national_team_squads s
          join public.national_team_lineups l
            on l.squad_id=s.id
           and l.race_day=e.race_day
          where s.association_id=v_assoc_id
            and s.season_number=v_season
            and s.cycle_key=e.cycle_key
          order by l.updated_at desc
          limit 1
        ),
        'label',
          r.round_label||' · '||g.group_label||' · '||
          case e.race_type
            when 'team_time_trial' then 'Team Time Trial'
            when 'flat_road_race' then 'Flat Road Race'
            else 'Hilly / Mountain Road Race'
          end,
        'squad',(
          select case
            when s.id is null then null
            else jsonb_build_object(
              'squad_id',s.id,
              'cycle_key',s.cycle_key,
              'status',s.status,
              'squad_size',s.squad_size,
              'confirmed_on',s.confirmed_on_game_date,
              'duty_start_date',s.duty_start_date,
              'duty_end_date',s.duty_end_date,
              'members',coalesce((
                select jsonb_agg(
                  jsonb_build_object(
                    'rider_id',sm.rider_id,
                    'rider_name',sm.rider_name_snapshot,
                    'club_id',sm.club_id_snapshot,
                    'club_name',sm.club_name_snapshot,
                    'squad_role',sm.squad_role
                  )
                  order by sm.rider_name_snapshot
                )
                from public.national_team_squad_members sm
                where sm.squad_id=s.id
              ),'[]'::jsonb)
            )
          end
          from public.national_team_squads s
          where s.association_id=v_assoc_id
            and s.season_number=v_season
            and s.cycle_key=e.cycle_key
            and s.status in ('confirmed','on_duty','completed')
          order by s.updated_at desc
          limit 1
        )
      ) as event_payload
    from public.nations_group_events e
    join public.nations_competition_groups g on g.id=e.group_id
    join public.nations_competition_rounds r on r.id=g.round_id
    join public.nations_competition_editions ed on ed.id=r.edition_id
    join public.nations_group_entries nge on nge.group_id=g.id
    join public.nations_competition_entries ce on ce.id=nge.competition_entry_id
    left join public.race_stages rs on rs.id=e.stage_id
    left join public.race_stages src on src.id=e.source_stage_id
    left join public.races rr on rr.id=e.race_id
    where ed.season_number=v_season
      and ce.association_id=v_assoc_id
      and nge.status<>'withdrawn'
      and e.event_date is not null
      and e.event_date>=v_today
  ) q;

  return v_base||jsonb_build_object(
    'upcoming_events',v_events
  );
end;
$function$;