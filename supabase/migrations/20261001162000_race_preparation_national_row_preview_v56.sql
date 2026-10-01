CREATE OR REPLACE FUNCTION public.get_my_unified_race_preparation_special_events_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_today date:=public.get_current_game_date_date();
  v_season integer;
  v_club_id uuid;
  v_ctx record;
  v_team_events jsonb:='[]'::jsonb;
  v_individual_events jsonb:='[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select gs.season_number
  into v_season
  from public.game_state gs
  where gs.id=true;

  select c.id
  into v_club_id
  from public.clubs c
  where c.owner_user_id=v_uid
    and c.parent_club_id is null
    and (c.club_type='main' or c.club_type is null)
  order by c.created_at
  limit 1;

  select *
  into v_ctx
  from private.current_national_coach_context_v1(v_uid)
  limit 1;

  if v_ctx.association_id is not null then
    select coalesce(jsonb_agg(x.payload order by x.event_date,x.race_day),'[]'::jsonb)
    into v_team_events
    from (
      select
        e.event_date,
        e.race_day,
        jsonb_build_object(
          'kind','national_team',
          'event_id',e.id,
          'season_number',ed.season_number,
          'round_label',r.round_label,
          'round_type',r.round_type,
          'group_label',g.group_label,
          'race_day',e.race_day,
          'race_type',e.race_type,
          'event_date',e.event_date,
          'event_status',e.status,
          'race_id',e.race_id,
          'stage_id',e.stage_id,
          'host_country_code',e.host_country_code,
          'setup_window_opens_on',e.event_date-15,
          'lineup_deadline_on',e.event_date-3,
          'can_manage',true,
          'association_id',v_ctx.association_id,
          'country_code',v_ctx.country_code,
          'selection_cycle',(
            select jsonb_build_object(
              'status',sc.status,
              'selected_count',cardinality(sc.selected_rider_ids),
              'locked_on',sc.locked_on_game_date,
              'response_deadline',sc.response_deadline,
              'final_squad_deadline',sc.final_squad_deadline
            )
            from public.national_team_selection_cycles sc
            where sc.association_id=v_ctx.association_id
              and sc.season_number=ed.season_number
              and sc.cycle_key=e.cycle_key
            order by sc.updated_at desc
            limit 1
          ),
          'squad',(
            select jsonb_build_object(
              'squad_id',s.id,
              'status',s.status,
              'squad_size',s.squad_size,
              'confirmed_on',s.confirmed_on_game_date,
              'members',coalesce((
                select jsonb_agg(
                  jsonb_build_object(
                    'rider_id',sm.rider_id,
                    'rider_name',sm.rider_name_snapshot,
                    'club_name',sm.club_name_snapshot,
                    'squad_role',sm.squad_role
                  )
                  order by sm.rider_name_snapshot
                )
                from public.national_team_squad_members sm
                where sm.squad_id=s.id
              ),'[]'::jsonb)
            )
            from public.national_team_squads s
            where s.association_id=v_ctx.association_id
              and s.season_number=ed.season_number
              and s.cycle_key=e.cycle_key
              and s.status in ('confirmed','on_duty','completed')
            order by s.updated_at desc
            limit 1
          ),
          'lineup',(
            select jsonb_build_object(
              'lineup_id',l.id,
              'status',l.status,
              'submitted_on',l.submitted_on_game_date,
              'rider_ids',coalesce((
                select jsonb_agg(lm.rider_id order by sm.rider_name_snapshot)
                from public.national_team_lineup_members lm
                join public.national_team_squad_members sm
                  on sm.id=lm.squad_member_id
                where lm.lineup_id=l.id
              ),'[]'::jsonb),
              'riders',coalesce((
                select jsonb_agg(
                  jsonb_build_object(
                    'rider_id',lm.rider_id,
                    'rider_name',sm.rider_name_snapshot,
                    'club_name',sm.club_name_snapshot
                  )
                  order by sm.rider_name_snapshot
                )
                from public.national_team_lineup_members lm
                join public.national_team_squad_members sm
                  on sm.id=lm.squad_member_id
                where lm.lineup_id=l.id
              ),'[]'::jsonb)
            )
            from public.national_team_squads s
            join public.national_team_lineups l
              on l.squad_id=s.id
             and l.race_day=e.race_day
             and l.status<>'cancelled'
            where s.association_id=v_ctx.association_id
              and s.season_number=ed.season_number
              and s.cycle_key=e.cycle_key
            order by l.updated_at desc
            limit 1
          ),
          'race_preparation',(
            select jsonb_build_object(
              'race_preparation_id',rp.id,
              'status',rp.status,
              'startlist_status',rp.startlist_status,
              'stage_plan_id',sp.id,
              'team_strategy',sp.team_strategy,
              'team_tactic_json',sp.team_tactic_json,
              'rider_roles_json',sp.rider_roles_json,
              'last_saved_at',sp.last_saved_at
            )
            from public.race_preparations rp
            left join public.race_stage_plans sp
              on sp.race_preparation_id=rp.id
             and sp.stage_number=1
            where rp.race_id=e.race_id
              and rp.metadata->>'association_id'=v_ctx.association_id::text
            order by rp.updated_at desc
            limit 1
          ),
          'route',(
            select jsonb_build_object(
              'stage_name',rs.name,
              'start_city',coalesce(rs.start_city_name,rs.start_city),
              'finish_city',coalesce(rs.finish_city_name,rs.finish_city),
              'distance_km',rs.distance_km,
              'terrain_type',rs.terrain_type,
              'profile_type',rs.profile_type
            )
            from public.race_stages rs
            where rs.id=e.stage_id
          )
        ) payload
      from public.nations_competition_entries ce
      join public.nations_competition_editions ed on ed.id=ce.edition_id
      join public.nations_group_entries nge on nge.competition_entry_id=ce.id
      join public.nations_competition_groups g on g.id=nge.group_id
      join public.nations_competition_rounds r on r.id=g.round_id
      join public.nations_group_events e on e.group_id=g.id
      where ce.association_id=v_ctx.association_id
        and ed.season_number=v_season
        and ce.status<>'withdrawn'
        and nge.status<>'withdrawn'
        and e.status<>'cancelled'
        and e.event_date is not null
        and e.event_date>=v_today-3
    ) x;
  end if;

  if v_club_id is not null then
    select coalesce(jsonb_agg(x.payload order by x.event_date,x.heat_number nulls last),'[]'::jsonb)
    into v_individual_events
    from (
      select
        d.edition_id,
        d.duty_type,
        d.heat_id,
        d.duty_date as event_date,
        h.heat_number,
        jsonb_build_object(
          'kind','national_individual',
          'event_key',
            d.edition_id::text||':'||d.duty_type||':'||coalesce(d.heat_id::text,'final'),
          'edition_id',d.edition_id,
          'season_number',ed.season_number,
          'country_code',ed.country_code,
          'event_type',d.duty_type,
          'event_date',d.duty_date,
          'status',d.status,
          'heat_id',d.heat_id,
          'heat_number',h.heat_number,
          'race_id',case when d.duty_type='final' then ed.final_race_id else h.race_id end,
          'setup_window_opens_on',d.duty_date-15,
          'can_manage',false,
          'riders',jsonb_agg(
            jsonb_build_object(
              'rider_id',d.rider_id,
              'rider_name',coalesce(ne.rider_name_snapshot,ri.display_name),
              'entry_status',ne.entry_status,
              'participation_decision',ne.participation_decision,
              'final_participation_decision',ne.final_participation_decision
            )
            order by coalesce(ne.rider_name_snapshot,ri.display_name)
          )
        ) payload
      from public.national_championship_duties d
      join public.national_championship_editions ed on ed.id=d.edition_id
      left join public.national_championship_heats h on h.id=d.heat_id
      join public.national_championship_entries ne
        on ne.edition_id=d.edition_id
       and ne.rider_id=d.rider_id
      join public.riders ri on ri.id=d.rider_id
      join public.club_riders cr
        on cr.rider_id=d.rider_id
       and cr.club_id=v_club_id
      where ed.season_number=v_season
        and d.status not in ('cancelled','withdrawn')
        and d.duty_date>=v_today-3
      group by
        d.edition_id,d.duty_type,d.heat_id,d.duty_date,h.heat_number,
        ed.season_number,ed.country_code,ed.final_race_id,h.race_id,d.status
    ) x;
  end if;

  -- Temporary visual preview for the active National Coach while the real
  -- National Championship ranking freeze has not created rider duties yet.
  -- Real duties replace this automatically because it only runs when the
  -- individual-event list is empty.
  if v_ctx.association_id is not null
     and v_club_id is not null
     and jsonb_array_length(v_individual_events)=0 then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'kind','national_individual',
          'event_key',ed.id::text||':final:test-preview',
          'edition_id',ed.id,
          'season_number',ed.season_number,
          'country_code',ed.country_code,
          'event_type','final',
          'event_date',ed.final_date,
          'status','test_preview',
          'heat_id',null,
          'heat_number',null,
          'race_id',ed.final_race_id,
          'setup_window_opens_on',ed.final_date-15,
          'can_manage',false,
          'is_preview',true,
          'riders',jsonb_build_array(
            jsonb_build_object(
              'rider_id',p.rider_id,
              'rider_name',p.rider_name,
              'entry_status','preview',
              'participation_decision','preview',
              'final_participation_decision','preview'
            )
          )
        )
        order by p.national_rank
      ),
      '[]'::jsonb
    )
    into v_individual_events
    from public.national_championship_editions ed
    join lateral (
      select pr.*
      from public.preview_national_ranking_v1(ed.country_code,ed.ranking_snapshot_date) pr
      where pr.club_id=v_club_id
      order by pr.national_rank
      limit 1
    ) p on true
    where ed.season_number=v_season
      and ed.country_code=v_ctx.country_code
      and ed.final_date>=v_today
      and ed.status in ('planned','ranking_frozen','qualification_active','qualification_complete','final_ready')
    group by ed.id,ed.season_number,ed.country_code,ed.final_date,ed.final_race_id;
  end if;

  return jsonb_build_object(
    'current_game_date',v_today,
    'season_number',v_season,
    'is_national_coach',v_ctx.association_id is not null,
    'national_team_events',v_team_events,
    'national_individual_events',v_individual_events
  );
end;
$function$;
