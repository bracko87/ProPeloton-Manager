create or replace function public.get_admin_nations_operations_v1()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_season integer;
  v_today date;
  v_edition public.nations_competition_editions%rowtype;
  v_health jsonb;
begin
  if not public.is_app_admin_v1() then
    raise exception 'Administrator access required.';
  end if;

  select
    gs.season_number,
    public.game_date_from_parts(gs.season_number,gs.month_number,gs.day_number)
  into v_season,v_today
  from public.game_state gs
  where gs.id=true;

  select *
  into v_edition
  from public.nations_competition_editions e
  where e.season_number=v_season
  limit 1;

  v_health:=public.check_nations_operations_health_v1();

  return jsonb_build_object(
    'season_number',v_season,
    'game_date',v_today,
    'health',v_health,
    'edition',case
      when v_edition.id is null then null
      else jsonb_build_object(
        'id',v_edition.id,
        'status',v_edition.status,
        'active_association_count',v_edition.active_association_count,
        'finalist_target',v_edition.finalist_target,
        'host_country_code',v_edition.host_country_code,
        'champion_country_code',v_edition.champion_country_code,
        'created_on_game_date',v_edition.created_on_game_date,
        'completed_on_game_date',v_edition.completed_on_game_date
      )
    end,
    'rounds',case
      when v_edition.id is null then '[]'::jsonb
      else coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'round_id',r.id,
            'round_index',r.round_index,
            'round_type',r.round_type,
            'round_label',r.round_label,
            'status',r.status,
            'starts_on',r.starts_on_game_date,
            'ends_on',r.ends_on_game_date,
            'entrants_target',r.entrants_target,
            'advance_target',r.advance_target,
            'group_count',r.group_count,
            'groups',coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'group_id',g.id,
                  'group_number',g.group_number,
                  'group_label',g.group_label,
                  'status',g.status,
                  'planned_entrant_count',g.planned_entrant_count,
                  'planned_advance_count',g.planned_advance_count,
                  'entry_count',(select count(*) from public.nations_group_entries nge where nge.group_id=g.id),
                  'scored_entry_count',(select count(*) from public.nations_group_entries nge where nge.group_id=g.id and nge.total_points is not null),
                  'event_count',(select count(*) from public.nations_group_events e where e.group_id=g.id),
                  'scheduled_event_count',(select count(*) from public.nations_group_events e where e.group_id=g.id and e.event_date is not null),
                  'overdue_event_count',(select count(*) from public.nations_group_events e where e.group_id=g.id and e.event_date<v_today and e.status in ('planned','scheduled','ready')),
                  'events',coalesce((
                    select jsonb_agg(
                      jsonb_build_object(
                        'event_id',e.id,
                        'race_day',e.race_day,
                        'race_type',e.race_type,
                        'event_date',e.event_date,
                        'status',e.status,
                        'race_id',e.race_id,
                        'stage_id',e.stage_id
                      )
                      order by e.race_day
                    )
                    from public.nations_group_events e
                    where e.group_id=g.id
                  ),'[]'::jsonb)
                )
                order by g.group_number
              )
              from public.nations_competition_groups g
              where g.round_id=r.id
            ),'[]'::jsonb)
          )
          order by r.round_index
        )
        from public.nations_competition_rounds r
        where r.edition_id=v_edition.id
      ),'[]'::jsonb)
    end,
    'team_checks',jsonb_build_object(
      'nations_squads',(select count(*) from public.national_team_squads s where s.season_number=v_season and s.cycle_key like 'nations:%'),
      'confirmed_squads',(select count(*) from public.national_team_squads s where s.season_number=v_season and s.cycle_key like 'nations:%' and s.status in ('confirmed','on_duty','completed')),
      'invalid_squads',(select count(*) from public.national_team_squads s where s.season_number=v_season and s.cycle_key like 'nations:%' and s.status in ('confirmed','on_duty') and (select count(*) from public.national_team_squad_members sm where sm.squad_id=s.id)<>10),
      'confirmed_lineups',(select count(*) from public.national_team_lineups l join public.national_team_squads s on s.id=l.squad_id where s.season_number=v_season and s.cycle_key like 'nations:%' and l.status in ('confirmed','locked','completed')),
      'invalid_lineups',(select count(*) from public.national_team_lineups l join public.national_team_squads s on s.id=l.squad_id where s.season_number=v_season and s.cycle_key like 'nations:%' and l.status in ('confirmed','locked','completed') and (select count(*) from public.national_team_lineup_members lm where lm.lineup_id=l.id)<>7)
    )
  );
end;
$function$;

revoke all on function public.get_admin_nations_operations_v1() from public,anon;
grant execute on function public.get_admin_nations_operations_v1() to authenticated;

create or replace function public.run_admin_nations_runtime_v1()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
begin
  if not public.is_app_admin_v1() then
    raise exception 'Administrator access required.';
  end if;

  return public.process_national_association_nations_runtime_v3();
end;
$function$;

revoke all on function public.run_admin_nations_runtime_v1() from public,anon;
grant execute on function public.run_admin_nations_runtime_v1() to authenticated;
