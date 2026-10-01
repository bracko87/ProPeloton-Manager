create table if not exists private.national_race_preparation_test_overrides (
  event_id uuid primary key references public.nations_group_events(id) on delete cascade,
  association_id uuid not null references public.national_associations(id) on delete cascade,
  enabled boolean not null default true,
  note text null,
  created_at timestamptz not null default now()
);

CREATE OR REPLACE FUNCTION private.national_race_preparation_test_override_enabled_v1(p_event_id uuid, p_association_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists(
    select 1
    from private.national_race_preparation_test_overrides o
    where o.event_id=p_event_id
      and o.association_id=p_association_id
      and o.enabled=true
  );
$function$;

insert into private.national_race_preparation_test_overrides(
  event_id,association_id,enabled,note
)
values(
  '5a1a5892-773a-47b4-9915-7327272ca0b5',
  'e8f0e27a-a203-4ed4-9c4e-ba91ea41c18f',
  true,
  'Temporary Albania Group A Day 1 Race Preparation preview requested 2026-10-01.'
)
on conflict(event_id) do update
set association_id=excluded.association_id,
    enabled=true,
    note=excluded.note;

CREATE OR REPLACE FUNCTION public._clubs_after_insert_new_team_setup_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.apply_new_club_creation_balance_v1(new.id, false);
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.preview_national_ranking_v1(p_country_code text, p_snapshot_date date)
 RETURNS TABLE(national_rank integer, rider_id uuid, club_id uuid, rider_name text, country_code text, raw_points integer, weighted_points numeric, best_weighted_result numeric, latest_result_date date, overall integer)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with cfg as (
    select *
    from public.national_championship_config
    where id = true
  ),
  award_events as (
    select
      a.rider_id,
      a.rider_points::integer as rider_points,
      coalesce(rs.stage_date, rr.end_date) as performance_date
    from public.race_ranking_point_awards a
    join public.races rr on rr.id = a.race_id
    left join public.race_stages rs on rs.id = a.stage_id
    where a.rider_id is not null
      and a.rider_points > 0

    union all

    select
      b.rider_id,
      b.points::integer,
      b.award_date
    from public.national_championship_ranking_bonus_awards b
    where b.points > 0
  ),
  perf as (
    select
      ae.rider_id,
      coalesce(sum(ae.rider_points),0)::int as raw_points,
      coalesce(sum(
        ae.rider_points::numeric *
        case
          when (p_snapshot_date - ae.performance_date) between 0 and 30 then cfg.recency_weight_days_0_30
          when (p_snapshot_date - ae.performance_date) between 31 and 60 then cfg.recency_weight_days_31_60
          when (p_snapshot_date - ae.performance_date) between 61 and 90 then cfg.recency_weight_days_61_90
          when (p_snapshot_date - ae.performance_date) between 91 and 120 then cfg.recency_weight_days_91_120
          when (p_snapshot_date - ae.performance_date) between 121 and 180 then cfg.recency_weight_days_121_180
          else 0
        end
      ),0)::numeric(14,3) as weighted_points,
      coalesce(max(
        ae.rider_points::numeric *
        case
          when (p_snapshot_date - ae.performance_date) between 0 and 30 then cfg.recency_weight_days_0_30
          when (p_snapshot_date - ae.performance_date) between 31 and 60 then cfg.recency_weight_days_31_60
          when (p_snapshot_date - ae.performance_date) between 61 and 90 then cfg.recency_weight_days_61_90
          when (p_snapshot_date - ae.performance_date) between 91 and 120 then cfg.recency_weight_days_91_120
          when (p_snapshot_date - ae.performance_date) between 121 and 180 then cfg.recency_weight_days_121_180
          else 0
        end
      ),0)::numeric(14,3) as best_weighted_result,
      max(ae.performance_date) as latest_result_date
    from award_events ae
    cross join cfg
    where ae.performance_date <= p_snapshot_date
      and ae.performance_date > p_snapshot_date - cfg.ranking_window_days
    group by ae.rider_id
  ),
  base as (
    select
      r.id as rider_id,
      club.club_id,
      coalesce(nullif(trim(r.first_name || ' ' || r.last_name),''), r.display_name, r.id::text) as rider_name,
      upper(r.country_code) as country_code,
      coalesce(perf.raw_points,0)::int as raw_points,
      coalesce(perf.weighted_points,0)::numeric(14,3) as weighted_points,
      coalesce(perf.best_weighted_result,0)::numeric(14,3) as best_weighted_result,
      perf.latest_result_date,
      coalesce(r.overall,0)::int as overall
    from public.riders r
    left join perf on perf.rider_id = r.id
    left join lateral (
      select cr.club_id
      from public.club_riders cr
      where cr.rider_id = r.id
      order by cr.created_at desc, cr.id desc
      limit 1
    ) club on true
    where upper(r.country_code) = upper(trim(p_country_code))
      and not exists (
        select 1
        from public.national_association_race_team_identities nti
        where nti.technical_club_id=club.club_id
      )
  )
  select
    row_number() over (
      order by
        weighted_points desc,
        best_weighted_result desc,
        latest_result_date desc nulls last,
        overall desc,
        rider_id
    )::int as national_rank,
    rider_id,
    club_id,
    rider_name,
    country_code,
    raw_points,
    weighted_points,
    best_weighted_result,
    latest_result_date,
    overall
  from base
  order by national_rank;
$function$;

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
          'test_override',private.national_race_preparation_test_override_enabled_v1(
            e.id,v_ctx.association_id
          ),
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

CREATE OR REPLACE FUNCTION public.submit_national_team_lineup_v1(p_squad_id uuid, p_race_day integer, p_rider_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_ctx record;
  v_squad public.national_team_squads%rowtype;
  v_event public.nations_group_events%rowtype;
  v_required integer;
  v_max_changes integer;
  v_distinct_count integer;
  v_valid_count integer;
  v_previous_lineup_id uuid;
  v_previous_count integer;
  v_shared_count integer;
  v_changes integer:=0;
  v_lineup_id uuid;
  v_race_type text;
  v_today date:=public.get_current_game_date_date();
  v_open_date date;
  v_deadline date;
  v_race_result jsonb;
  v_sync_result jsonb;
  v_test_override boolean:=false;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  if p_race_day not between 1 and 3 then
    raise exception 'National-team race day must be between 1 and 3.';
  end if;

  select * into v_ctx
  from private.current_national_coach_context_v1(v_uid);

  if v_ctx.association_id is null then
    raise exception 'Only the active National Coach can submit national-team lineups.';
  end if;

  select * into v_squad
  from public.national_team_squads
  where id=p_squad_id
  for update;

  if v_squad.id is null
     or v_squad.association_id<>v_ctx.association_id
     or v_squad.season_number<>v_ctx.season_number then
    raise exception 'National squad not found for your Association.';
  end if;

  if v_squad.status not in ('confirmed','on_duty') then
    raise exception 'The national squad must be confirmed before race lineups can be submitted.';
  end if;

  select e.*
  into v_event
  from public.nations_group_events e
  join public.nations_competition_groups g on g.id=e.group_id
  join public.nations_competition_rounds r on r.id=g.round_id
  join public.nations_competition_editions ed on ed.id=r.edition_id
  join public.nations_group_entries nge on nge.group_id=g.id
  join public.nations_competition_entries ce on ce.id=nge.competition_entry_id
  where ed.season_number=v_squad.season_number
    and ce.association_id=v_squad.association_id
    and e.cycle_key=v_squad.cycle_key
    and e.race_day=p_race_day
    and nge.status<>'withdrawn'
  limit 1;

  if v_event.id is null or v_event.event_date is null then
    raise exception 'World Nations race day was not found for this squad.';
  end if;

  v_open_date:=v_event.event_date-15;
  v_deadline:=v_event.event_date-3;
  v_test_override:=private.national_race_preparation_test_override_enabled_v1(
    v_event.id,v_ctx.association_id
  );

  if v_today<v_open_date and not v_test_override then
    raise exception 'Race preparation opens on %.',v_open_date;
  end if;

  if v_today>v_deadline then
    raise exception 'The 7-rider lineup deadline was %.',v_deadline;
  end if;

  select national_lineup_size::integer,max_lineup_changes::integer
  into v_required,v_max_changes
  from public.national_association_config
  where id=true;

  select count(distinct x)::integer
  into v_distinct_count
  from unnest(coalesce(p_rider_ids,array[]::uuid[])) x;

  if v_distinct_count<>coalesce(v_required,7) then
    raise exception 'A national-team race lineup must contain exactly % distinct riders.',coalesce(v_required,7);
  end if;

  select count(*)::integer
  into v_valid_count
  from public.national_team_squad_members m
  where m.squad_id=v_squad.id
    and m.rider_id=any(p_rider_ids);

  if v_valid_count<>coalesce(v_required,7) then
    raise exception 'Every lineup rider must belong to the confirmed 10-rider squad.';
  end if;

  if p_race_day>1 then
    select l.id
    into v_previous_lineup_id
    from public.national_team_lineups l
    where l.squad_id=v_squad.id
      and l.race_day=p_race_day-1
      and l.status in ('confirmed','locked','completed')
    limit 1;

    if v_previous_lineup_id is null then
      raise exception 'The previous race-day lineup must be confirmed first.';
    end if;

    select count(*)::integer
    into v_previous_count
    from public.national_team_lineup_members m
    where m.lineup_id=v_previous_lineup_id;

    select count(*)::integer
    into v_shared_count
    from public.national_team_lineup_members m
    where m.lineup_id=v_previous_lineup_id
      and m.rider_id=any(p_rider_ids);

    v_changes:=coalesce(v_previous_count,coalesce(v_required,7))-coalesce(v_shared_count,0);

    if v_changes>coalesce(v_max_changes,3) then
      raise exception 'A maximum of % lineup changes is allowed between consecutive race days.',coalesce(v_max_changes,3);
    end if;
  end if;

  v_race_type:=private.national_team_race_type_for_day_v1(p_race_day);

  insert into public.national_team_lineups(
    squad_id,race_day,race_type,status,
    submitted_by_user_id,submitted_on_game_date
  )
  values(
    v_squad.id,p_race_day,v_race_type,'confirmed',v_uid,v_today
  )
  on conflict(squad_id,race_day)
  do update
  set race_type=excluded.race_type,
      status='confirmed',
      submitted_by_user_id=excluded.submitted_by_user_id,
      submitted_on_game_date=excluded.submitted_on_game_date,
      updated_at=now()
  where public.national_team_lineups.status in ('draft','confirmed')
  returning id into v_lineup_id;

  if v_lineup_id is null then
    raise exception 'This race-day lineup is locked and can no longer be changed.';
  end if;

  delete from public.national_team_lineup_members
  where lineup_id=v_lineup_id;

  insert into public.national_team_lineup_members(
    lineup_id,squad_member_id,rider_id
  )
  select
    v_lineup_id,m.id,m.rider_id
  from public.national_team_squad_members m
  where m.squad_id=v_squad.id
    and m.rider_id=any(p_rider_ids);

  v_race_result:=public.ensure_nations_group_event_race_v1(v_event.id);
  v_sync_result:=public.sync_nations_group_event_participants_v1(v_event.id);

  return jsonb_build_object(
    'lineup_id',v_lineup_id,
    'squad_id',v_squad.id,
    'race_day',p_race_day,
    'race_type',v_race_type,
    'lineup_size',coalesce(v_required,7),
    'changes_from_previous_day',v_changes,
    'status','confirmed',
    'setup_window_opens_on',v_open_date,
    'lineup_deadline_on',v_deadline,
    'test_override',v_test_override,
    'race',v_race_result,
    'participant_sync',v_sync_result
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_my_national_team_race_strategy_v1(p_event_id uuid, p_team_plan text, p_rider_roles jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_ctx record;
  v_event public.nations_group_events%rowtype;
  v_squad public.national_team_squads%rowtype;
  v_lineup public.national_team_lineups%rowtype;
  v_prep_id uuid;
  v_stage_plan_id uuid;
  v_team_id uuid;
  v_today date:=public.get_current_game_date_date();
  v_allowed_plans text[];
  v_role record;
  v_rider_count integer;
  v_test_override boolean:=false;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_ctx
  from private.current_national_coach_context_v1(v_uid);

  if v_ctx.association_id is null then
    raise exception 'Only the active National Coach can save National Team race strategy.';
  end if;

  select e.*
  into v_event
  from public.nations_group_events e
  join public.nations_competition_groups g on g.id=e.group_id
  join public.nations_competition_rounds r on r.id=g.round_id
  join public.nations_competition_editions ed on ed.id=r.edition_id
  join public.nations_group_entries nge on nge.group_id=g.id
  join public.nations_competition_entries ce on ce.id=nge.competition_entry_id
  where e.id=p_event_id
    and ed.season_number=v_ctx.season_number
    and ce.association_id=v_ctx.association_id
    and nge.status<>'withdrawn'
  limit 1;

  if v_event.id is null then
    raise exception 'World Nations event not found for your Association.';
  end if;

  v_test_override:=private.national_race_preparation_test_override_enabled_v1(
    v_event.id,v_ctx.association_id
  );

  if v_today<v_event.event_date-15 and not v_test_override then
    raise exception 'Race preparation opens on %.',v_event.event_date-15;
  end if;

  if v_today>v_event.event_date-3 then
    raise exception 'Race strategy is locked after the lineup deadline on %.',v_event.event_date-3;
  end if;

  select *
  into v_squad
  from public.national_team_squads s
  where s.association_id=v_ctx.association_id
    and s.season_number=v_ctx.season_number
    and s.cycle_key=v_event.cycle_key
    and s.status in ('confirmed','on_duty')
  order by s.updated_at desc
  limit 1;

  if v_squad.id is null then
    raise exception 'Confirm the 10-rider National Team squad first.';
  end if;

  select *
  into v_lineup
  from public.national_team_lineups l
  where l.squad_id=v_squad.id
    and l.race_day=v_event.race_day
    and l.status in ('confirmed','locked')
  limit 1;

  if v_lineup.id is null then
    raise exception 'Confirm the 7-rider lineup before saving race strategy.';
  end if;

  if v_event.race_type='team_time_trial' then
    v_allowed_plans:=array['tt_balanced_pace','tt_fast_start','tt_negative_split','tt_all_out'];
  else
    v_allowed_plans:=array['balanced','aggressive','sprint_control','breakaway','gc_protection'];
  end if;

  if not (coalesce(p_team_plan,'')=any(v_allowed_plans)) then
    raise exception 'Invalid National Team race strategy.';
  end if;

  select count(*)::integer
  into v_rider_count
  from public.national_team_lineup_members lm
  where lm.lineup_id=v_lineup.id;

  if v_rider_count<>7 then
    raise exception 'The National Team lineup must contain exactly 7 riders.';
  end if;

  if jsonb_typeof(coalesce(p_rider_roles,'{}'::jsonb))<>'object' then
    raise exception 'Rider roles must be a JSON object.';
  end if;

  for v_role in
    select key,value#>>'{}' as role
    from jsonb_each(coalesce(p_rider_roles,'{}'::jsonb))
  loop
    if not exists(
      select 1
      from public.national_team_lineup_members lm
      where lm.lineup_id=v_lineup.id
        and lm.rider_id::text=v_role.key
    ) then
      raise exception 'Rider % is not in this 7-rider lineup.',v_role.key;
    end if;

    if v_role.role not in (
      'team_leader_gc','sprinter','lead_out_rider','sprint_train_rider',
      'climber','mountain_domestique','helper_domestique','breakaway_rider',
      'breakaway_chaser','rouleur','protected_rider','free_role',
      'team_time_trial_rider'
    ) then
      raise exception 'Invalid National Team rider role: %.',v_role.role;
    end if;
  end loop;

  perform public.ensure_nations_group_event_race_v1(v_event.id);
  perform public.sync_nations_group_event_participants_v1(v_event.id);

  v_team_id:=private.ensure_national_association_race_team_v1(v_ctx.association_id);

  select rp.id
  into v_prep_id
  from public.race_preparations rp
  where rp.race_id=(select race_id from public.nations_group_events where id=v_event.id)
    and rp.club_id=v_team_id
  limit 1;

  if v_prep_id is null then
    raise exception 'National Team race preparation could not be initialized.';
  end if;

  select sp.id
  into v_stage_plan_id
  from public.race_stage_plans sp
  where sp.race_preparation_id=v_prep_id
    and sp.stage_number=1
  limit 1;

  if v_stage_plan_id is null then
    raise exception 'National Team stage plan could not be initialized.';
  end if;

  update public.race_stage_plans sp
  set team_strategy=p_team_plan,
      team_tactic_json=jsonb_build_object(
        'plan',p_team_plan,
        'national_team',true,
        'race_type',v_event.race_type
      ),
      rider_roles_json=(
        select jsonb_object_agg(
          lm.rider_id::text,
          to_jsonb(coalesce(
            p_rider_roles->>lm.rider_id::text,
            case
              when v_event.race_type='team_time_trial' then 'team_time_trial_rider'
              else 'free_role'
            end
          ))
        )
        from public.national_team_lineup_members lm
        where lm.lineup_id=v_lineup.id
      ),
      engine_stage_payload_json=coalesce(sp.engine_stage_payload_json,'{}'::jsonb)
        || jsonb_build_object(
          'national_team',true,
          'team_strategy',p_team_plan,
          'rider_roles',coalesce(p_rider_roles,'{}'::jsonb)
        ),
      last_saved_at=now(),
      last_saved_game_ts=public.get_current_game_ts_local(),
      updated_at=now()
  where sp.id=v_stage_plan_id;

  update public.race_stage_plan_riders spr
  set stage_role=coalesce(
        p_rider_roles->>spr.rider_id::text,
        case
          when v_event.race_type='team_time_trial' then 'team_time_trial_rider'
          else 'free_role'
        end
      ),
      updated_at=now()
  where spr.race_stage_plan_id=v_stage_plan_id;

  return jsonb_build_object(
    'status','saved',
    'event_id',v_event.id,
    'race_id',(select race_id from public.nations_group_events where id=v_event.id),
    'race_preparation_id',v_prep_id,
    'stage_plan_id',v_stage_plan_id,
    'team_plan',p_team_plan,
    'rider_roles',coalesce(p_rider_roles,'{}'::jsonb),
    'standard_package',true,
    'system_covered',true,
    'test_override',v_test_override
  );
end;
$function$;
