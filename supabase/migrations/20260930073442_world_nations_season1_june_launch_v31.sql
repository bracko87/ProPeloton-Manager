-- World Nations Season 1 launch adjustment.
-- Season 1 is intentionally delayed so National Associations have time to form.
-- The Season 1 field is snapshotted only from Associations that are active when
-- the June generation gate is reached. Season 2+ keeps the normal schedule.

alter table public.nations_competition_schedule_config
  add column if not exists generation_month integer not null default 1
    check (generation_month between 1 and 12),
  add column if not exists generation_day integer not null default 28
    check (generation_day between 1 and 31),
  add column if not exists season1_generation_month integer not null default 6
    check (season1_generation_month between 1 and 12),
  add column if not exists season1_generation_day integer not null default 1
    check (season1_generation_day between 1 and 31),
  add column if not exists season1_earliest_preliminary_month integer not null default 6
    check (season1_earliest_preliminary_month between 1 and 12),
  add column if not exists season1_earliest_preliminary_day integer not null default 1
    check (season1_earliest_preliminary_day between 1 and 31);

update public.nations_competition_schedule_config
set generation_month = 1,
    generation_day = 28,
    season1_generation_month = 6,
    season1_generation_day = 1,
    season1_earliest_preliminary_month = 6,
    season1_earliest_preliminary_day = 1,
    updated_at = now()
where id = true;

create or replace function public.nations_generation_gate_v1(
  p_season_number integer default null
)
returns date
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_season integer;
  v_cfg public.nations_competition_schedule_config%rowtype;
begin
  v_season := p_season_number;

  if v_season is null then
    select season_number into v_season
    from public.game_state
    where id = true;
  end if;

  select * into v_cfg
  from public.nations_competition_schedule_config
  where id = true;

  if v_season = 1 then
    return public.game_date_from_parts(
      v_season,
      coalesce(v_cfg.season1_generation_month, 6),
      coalesce(v_cfg.season1_generation_day, 1)
    );
  end if;

  return public.game_date_from_parts(
    v_season,
    coalesce(v_cfg.generation_month, 1),
    coalesce(v_cfg.generation_day, 28)
  );
end;
$function$;

create or replace function public.nations_earliest_preliminary_date_v1(
  p_season_number integer
)
returns date
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_cfg public.nations_competition_schedule_config%rowtype;
begin
  select * into v_cfg
  from public.nations_competition_schedule_config
  where id = true;

  if p_season_number = 1 then
    return public.game_date_from_parts(
      p_season_number,
      coalesce(v_cfg.season1_earliest_preliminary_month, 6),
      coalesce(v_cfg.season1_earliest_preliminary_day, 1)
    );
  end if;

  return public.game_date_from_parts(
    p_season_number,
    coalesce(v_cfg.earliest_preliminary_month, 2),
    coalesce(v_cfg.earliest_preliminary_day, 15)
  );
end;
$function$;

create or replace function public.process_nations_competition_planning_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_season integer;
  v_today date;
  v_generation_gate date;
  v_active_count integer;
  v_create jsonb;
  v_edition_id uuid;
  v_round_id uuid;
  v_round_status text;
  v_draw jsonb := null;
begin
  select
    gs.season_number,
    public.game_date_from_parts(gs.season_number, gs.month_number, gs.day_number)
  into v_season, v_today
  from public.game_state gs
  where gs.id = true;

  v_generation_gate := public.nations_generation_gate_v1(v_season);

  if v_today < v_generation_gate then
    return jsonb_build_object(
      'status',
        case
          when v_season = 1 then 'waiting_for_season1_june_launch'
          else 'waiting_for_january_election_window'
        end,
      'season_number', v_season,
      'generation_gate', v_generation_gate
    );
  end if;

  select count(*)::integer
  into v_active_count
  from public.national_associations a
  where a.status = 'active'
    and private.national_association_active_member_count_v1(a.id) >= (
      select minimum_active_members
      from public.national_association_config
      where id = true
    );

  if v_active_count = 0 then
    return jsonb_build_object(
      'status', 'waiting_for_active_associations',
      'season_number', v_season,
      'generation_gate', v_generation_gate,
      'active_associations', 0
    );
  end if;

  -- create_nations_competition_edition_v1 snapshots only currently-active
  -- Associations into nations_competition_entries, so Associations activated
  -- after the gate wait until the next season.
  v_create := public.create_nations_competition_edition_v1(v_season);
  v_edition_id := nullif(v_create->>'edition_id', '')::uuid;

  if v_edition_id is null then
    select id into v_edition_id
    from public.nations_competition_editions
    where season_number = v_season
    limit 1;
  end if;

  if v_edition_id is null then
    return coalesce(v_create, '{}'::jsonb)
      || jsonb_build_object('status', 'edition_not_available');
  end if;

  select id, status
  into v_round_id, v_round_status
  from public.nations_competition_rounds
  where edition_id = v_edition_id
    and round_index = 1
  limit 1;

  if v_round_id is not null
     and v_round_status = 'planned'
     and not exists (
       select 1
       from public.nations_group_entries nge
       join public.nations_competition_groups g on g.id = nge.group_id
       where g.round_id = v_round_id
     )
  then
    v_draw := public.draw_nations_round_v1(v_round_id);

    update public.nations_competition_editions
    set status = 'qualification',
        updated_at = now()
    where id = v_edition_id
      and status = 'planned';
  end if;

  return jsonb_build_object(
    'status', 'ready',
    'season_number', v_season,
    'generation_gate', v_generation_gate,
    'edition_id', v_edition_id,
    'active_associations', v_active_count,
    'edition_creation', v_create,
    'first_round_draw', v_draw
  );
end;
$function$;

create or replace function public.schedule_nations_edition_v1(
  p_edition_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_edition public.nations_competition_editions%rowtype;
  v_cfg public.nations_competition_schedule_config%rowtype;
  v_final_date date;
  v_final_qual_date date;
  v_first_allowed date;
  v_prelim_count integer := 0;
  v_effective_gap integer;
  v_round record;
  v_group record;
  v_prelims_after integer;
  v_start date;
  v_scheduled_groups integer := 0;
  v_schedule jsonb := '[]'::jsonb;
begin
  select * into v_edition
  from public.nations_competition_editions
  where id = p_edition_id;

  if v_edition.id is null then
    raise exception 'World Nations edition not found.';
  end if;

  select * into v_cfg
  from public.nations_competition_schedule_config
  where id = true;

  v_final_date := public.game_date_from_parts(
    v_edition.season_number,
    coalesce(v_cfg.final_month, 11),
    coalesce(v_cfg.final_day, 24)
  );

  v_final_qual_date :=
    v_final_date - coalesce(v_cfg.final_qualification_gap_days, 42);

  v_first_allowed :=
    public.nations_earliest_preliminary_date_v1(v_edition.season_number);

  select count(*)::integer
  into v_prelim_count
  from public.nations_competition_rounds
  where edition_id = v_edition.id
    and round_type = 'preliminary';

  if v_prelim_count > 0 then
    v_effective_gap := least(
      coalesce(v_cfg.preliminary_gap_days, 49)::integer,
      greatest(
        21,
        floor(
          ((v_final_qual_date - v_first_allowed)::numeric)
          / (v_prelim_count + 1)
        )::integer
      )
    );

    if v_final_qual_date - (v_effective_gap * v_prelim_count) < v_first_allowed then
      raise exception
        'Not enough season space to schedule % preliminary Nations rounds safely.',
        v_prelim_count;
    end if;
  else
    v_effective_gap := coalesce(v_cfg.preliminary_gap_days, 49);
  end if;

  for v_round in
    select *
    from public.nations_competition_rounds
    where edition_id = v_edition.id
    order by round_index
  loop
    if v_round.round_type = 'world_final' then
      v_start := v_final_date;
    elsif v_round.round_type = 'final_qualification' then
      v_start := v_final_qual_date;
    else
      select count(*)::integer
      into v_prelims_after
      from public.nations_competition_rounds r2
      where r2.edition_id = v_edition.id
        and r2.round_type = 'preliminary'
        and r2.round_index > v_round.round_index;

      v_start :=
        v_final_qual_date - (v_effective_gap * (v_prelims_after + 1));
    end if;

    if v_start < v_first_allowed then
      raise exception
        'World Nations round % would start before the allowed season launch date %.',
        v_round.round_index,
        v_first_allowed;
    end if;

    for v_group in
      select id
      from public.nations_competition_groups
      where round_id = v_round.id
      order by group_number
    loop
      perform public.set_nations_group_schedule_v1(v_group.id, v_start);
      v_scheduled_groups := v_scheduled_groups + 1;
    end loop;

    v_schedule := v_schedule || jsonb_build_array(jsonb_build_object(
      'round_id', v_round.id,
      'round_index', v_round.round_index,
      'round_type', v_round.round_type,
      'round_label', v_round.round_label,
      'day1_date', v_start,
      'day2_date', v_start + 1,
      'day3_date', v_start + 2
    ));
  end loop;

  return jsonb_build_object(
    'edition_id', v_edition.id,
    'season_number', v_edition.season_number,
    'earliest_allowed_date', v_first_allowed,
    'scheduled_groups', v_scheduled_groups,
    'preliminary_gap_days', v_effective_gap,
    'rounds', v_schedule
  );
end;
$function$;

create or replace function public.check_nations_operations_health_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_today date := public.get_current_game_date_date();
  v_season integer;
  v_generation_gate date;
  v_active_associations integer := 0;
  v_edition_id uuid;
  v_unscheduled integer := 0;
  v_drawn_empty integer := 0;
  v_overdue_events integer := 0;
  v_bad_squads integer := 0;
  v_bad_lineups integer := 0;
  v_lineup_blocked integer := 0;
  v_unsafe_races integer := 0;
  v_issue_count integer := 0;
  v_details jsonb;
  v_summary text;
begin
  select season_number into v_season
  from public.game_state
  where id = true;

  v_generation_gate := public.nations_generation_gate_v1(v_season);

  select count(*)::integer
  into v_active_associations
  from public.national_associations a
  where a.status = 'active'
    and private.national_association_active_member_count_v1(a.id) >= (
      select minimum_active_members
      from public.national_association_config
      where id = true
    );

  select id into v_edition_id
  from public.nations_competition_editions
  where season_number = v_season
  limit 1;

  if v_edition_id is not null then
    select count(*)::integer
    into v_unscheduled
    from public.nations_competition_groups g
    join public.nations_competition_rounds r on r.id = g.round_id
    where r.edition_id = v_edition_id
      and (
        r.starts_on_game_date is null
        or r.ends_on_game_date is null
        or (
          select count(*)
          from public.nations_group_events e
          where e.group_id = g.id
            and e.event_date is not null
        ) <> 3
      );

    select count(*)::integer
    into v_drawn_empty
    from public.nations_competition_groups g
    join public.nations_competition_rounds r on r.id = g.round_id
    where r.edition_id = v_edition_id
      and r.status in ('drawn', 'active', 'in_progress')
      and g.status in ('drawn', 'active', 'in_progress')
      and not exists (
        select 1
        from public.nations_group_entries nge
        where nge.group_id = g.id
      );

    select count(*)::integer
    into v_overdue_events
    from public.nations_group_events e
    join public.nations_competition_groups g on g.id = e.group_id
    join public.nations_competition_rounds r on r.id = g.round_id
    where r.edition_id = v_edition_id
      and e.event_date < v_today
      and e.status in ('planned', 'scheduled', 'ready', 'waiting_for_lineups');

    select count(*)::integer
    into v_lineup_blocked
    from public.nations_group_events e
    join public.nations_competition_groups g on g.id = e.group_id
    join public.nations_competition_rounds r on r.id = g.round_id
    where r.edition_id = v_edition_id
      and e.event_date between v_today and v_today + 3
      and e.status not in ('completed', 'cancelled', 'running')
      and (
        e.race_id is null
        or (
          select count(*)
          from (
            select rpr.team_id
            from public.race_participant_riders rpr
            where rpr.race_id = e.race_id
              and rpr.team_id is not null
            group by rpr.team_id
            having count(*) = 7
          ) ready_teams
        ) < (
          select count(*)
          from public.nations_group_entries nge
          where nge.group_id = e.group_id
            and nge.status <> 'withdrawn'
        )
      );

    select count(*)::integer
    into v_unsafe_races
    from public.nations_group_events e
    join public.nations_competition_groups g on g.id = e.group_id
    join public.nations_competition_rounds r on r.id = g.round_id
    join public.races rr on rr.id = e.race_id
    where r.edition_id = v_edition_id
      and rr.status in ('scheduled', 'active')
      and e.status not in ('completed', 'cancelled', 'running')
      and (
        select count(*)
        from (
          select rpr.team_id
          from public.race_participant_riders rpr
          where rpr.race_id = e.race_id
            and rpr.team_id is not null
          group by rpr.team_id
          having count(*) = 7
        ) ready_teams
      ) < (
        select count(*)
        from public.nations_group_entries nge
        where nge.group_id = e.group_id
          and nge.status <> 'withdrawn'
      );
  end if;

  select count(*)::integer
  into v_bad_squads
  from public.national_team_squads s
  where s.season_number = v_season
    and s.cycle_key like 'nations:%'
    and s.status in ('confirmed', 'on_duty')
    and (
      select count(*)
      from public.national_team_squad_members sm
      where sm.squad_id = s.id
    ) <> 10;

  select count(*)::integer
  into v_bad_lineups
  from public.national_team_lineups l
  join public.national_team_squads s on s.id = l.squad_id
  where s.season_number = v_season
    and s.cycle_key like 'nations:%'
    and l.status in ('confirmed', 'locked', 'completed')
    and (
      select count(*)
      from public.national_team_lineup_members lm
      where lm.lineup_id = l.id
    ) <> 7;

  v_issue_count :=
    case
      when v_today >= v_generation_gate
       and v_active_associations > 0
       and v_edition_id is null
      then 1
      else 0
    end
    + v_unscheduled
    + v_drawn_empty
    + v_overdue_events
    + v_bad_squads
    + v_bad_lineups
    + v_lineup_blocked
    + v_unsafe_races;

  v_details := jsonb_build_object(
    'game_date', v_today,
    'season_number', v_season,
    'generation_gate', v_generation_gate,
    'season1_delayed_launch', v_season = 1,
    'active_associations', v_active_associations,
    'edition_id', v_edition_id,
    'edition_missing_after_gate',
      v_today >= v_generation_gate
      and v_active_associations > 0
      and v_edition_id is null,
    'unscheduled_groups', v_unscheduled,
    'drawn_groups_without_entries', v_drawn_empty,
    'overdue_events', v_overdue_events,
    'invalid_confirmed_squads', v_bad_squads,
    'invalid_lineups', v_bad_lineups,
    'lineup_blocked_events_next_3_days', v_lineup_blocked,
    'unsafe_scheduled_events', v_unsafe_races
  );

  v_summary := case
    when v_issue_count = 0 then
      case
        when v_today < v_generation_gate and v_season = 1
          then 'World Nations operations are healthy; Season 1 generation is intentionally waiting for the June launch window.'
        when v_today < v_generation_gate
          then 'World Nations operations are healthy; seasonal generation is waiting for the January election window.'
        when v_active_associations = 0
          then 'World Nations operations are healthy; no active National Associations are currently eligible.'
        else 'World Nations operations are healthy.'
      end
    else format('%s World Nations operational issue(s) detected.', v_issue_count)
  end;

  perform public.log_system_business_check_v1(
    'check:nations_operations',
    case when v_issue_count > 0 then 'error' else 'success' end,
    v_summary,
    v_details
  );

  if v_issue_count > 0 then
    perform public.raise_system_incident_v1(
      'check:nations_operations',
      'critical',
      'World Nations operations require attention',
      v_summary,
      'business:nations-operations',
      v_details
    );
  else
    perform public.resolve_system_incident_by_dedupe_v1(
      'business:nations-operations',
      'World Nations operations are healthy.'
    );
  end if;

  return jsonb_build_object(
    'status', case when v_issue_count > 0 then 'error' else 'success' end,
    'issues', v_issue_count,
    'summary', v_summary,
    'details', v_details
  );
end;
$function$;

grant execute on function public.nations_generation_gate_v1(integer) to authenticated;
grant execute on function public.nations_earliest_preliminary_date_v1(integer) to authenticated;
