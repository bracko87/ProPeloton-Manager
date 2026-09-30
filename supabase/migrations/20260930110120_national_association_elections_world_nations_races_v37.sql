-- National Association governance + World Nations race presentation.
-- 1) First Association coach is always elected (no automatic caretaker assignment).
-- 2) Active Associations are automatically enrolled in World Nations when the field is still open.
-- 3) World Nations uses a different host/location for each race by assigning source stages per event.
-- 4) Dedicated World Nations event-page RPC exposes team-level participants/results.
-- 5) Selected National Team riders with no club reply are auto-accepted at the deadline.

alter table public.nations_group_events
  add column if not exists host_association_id uuid
    references public.national_associations(id) on delete set null,
  add column if not exists host_country_code text;

create index if not exists idx_nations_group_events_host_country
  on public.nations_group_events(host_country_code);

create or replace function public.ensure_national_coach_election_v1(
  p_association_id uuid,
  p_season_number integer default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_assoc public.national_associations%rowtype;
  v_cfg public.national_association_config%rowtype;
  v_current_season integer;
  v_season integer;
  v_today date:=public.get_current_game_date_date();
  v_existing uuid;
  v_any_previous boolean:=false;
  v_kind text;
  v_reason text;
  v_registration_open date;
  v_registration_close date;
  v_round1_open date;
  v_round1_close date;
  v_id uuid;
begin
  select * into v_assoc
  from public.national_associations
  where id=p_association_id;

  if v_assoc.id is null or v_assoc.status<>'active' then
    return null;
  end if;

  select season_number into v_current_season
  from public.game_state
  where id=true;

  if v_current_season is null then
    raise exception 'Game season is unavailable.';
  end if;

  v_season:=coalesce(p_season_number,v_current_season);

  if v_season<>v_current_season then
    raise exception 'National Coach elections can only be created for the current season.';
  end if;

  select * into v_cfg
  from public.national_association_config
  where id=true;

  select id into v_existing
  from public.national_coach_elections
  where association_id=p_association_id
    and season_number=v_season
    and status in ('candidate_registration','voting','runoff','completed')
  order by created_at desc
  limit 1;

  if v_existing is not null then
    return v_existing;
  end if;

  select exists(
    select 1
    from public.national_coach_elections
    where association_id=p_association_id
  )
  into v_any_previous;

  perform public.carry_forward_national_coach_v1(p_association_id,v_season);

  -- A newly activated Association never receives an automatically appointed
  -- National Coach. Its first coach is chosen through a full activation election
  -- beginning on the activation/current game date.
  if not v_any_previous then
    v_kind:='activation';
    v_reason:='first_association_coach_election';
    v_registration_open:=v_today;
    v_registration_close:=v_today+coalesce(v_cfg.activation_registration_days,10);
    v_round1_open:=v_registration_close;
    v_round1_close:=v_round1_open+coalesce(v_cfg.activation_voting_days,10);
  else
    v_registration_open:=public.game_date_from_parts(
      v_season,v_cfg.annual_registration_start_month,v_cfg.annual_registration_start_day
    );
    v_registration_close:=public.game_date_from_parts(
      v_season,v_cfg.annual_registration_close_month,v_cfg.annual_registration_close_day
    );
    v_round1_open:=v_registration_close;
    v_round1_close:=public.game_date_from_parts(
      v_season,v_cfg.annual_round1_close_month,v_cfg.annual_round1_close_day
    );

    if v_today<v_registration_close then
      v_kind:='annual';
      v_reason:='annual_january_election';
    else
      v_kind:='replacement';
      v_reason:='missing_coach_recovery';
      v_registration_open:=v_today;
      v_registration_close:=v_today+coalesce(v_cfg.activation_registration_days,10);
      v_round1_open:=v_registration_close;
      v_round1_close:=v_round1_open+coalesce(v_cfg.activation_voting_days,10);
    end if;
  end if;

  insert into public.national_coach_elections(
    association_id,season_number,election_kind,reason,status,
    registration_open_date,registration_close_date,
    round1_open_date,round1_close_date,
    current_round,current_round_open_date,current_round_close_date,
    runoff_registration_open
  )
  values(
    p_association_id,v_season,v_kind,v_reason,'candidate_registration',
    v_registration_open,v_registration_close,
    v_round1_open,v_round1_close,
    1,v_round1_open,v_round1_close,false
  )
  returning id into v_id;

  return v_id;
end;
$function$;

create or replace function private.rebuild_planned_nations_structure_v1(
  p_edition_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_edition public.nations_competition_editions%rowtype;
  v_count integer;
  v_plan jsonb;
  v_round_json jsonb;
  v_round_id uuid;
  v_group_plan jsonb;
  v_group_json jsonb;
begin
  select * into v_edition
  from public.nations_competition_editions
  where id=p_edition_id
  for update;

  if v_edition.id is null then
    raise exception 'World Nations edition not found.';
  end if;

  if v_edition.status<>'planned' then
    return jsonb_build_object('status','locked','edition_id',v_edition.id);
  end if;

  if exists(
    select 1
    from public.nations_group_entries nge
    join public.nations_competition_groups g on g.id=nge.group_id
    join public.nations_competition_rounds r on r.id=g.round_id
    where r.edition_id=v_edition.id
  ) then
    return jsonb_build_object('status','draw_already_started','edition_id',v_edition.id);
  end if;

  select count(*)::integer
  into v_count
  from public.nations_competition_entries
  where edition_id=v_edition.id
    and status<>'withdrawn';

  if v_count<1 then
    return jsonb_build_object('status','no_entries','edition_id',v_edition.id);
  end if;

  v_plan:=public.nations_qualification_plan_v1(v_count);

  delete from public.nations_competition_rounds
  where edition_id=v_edition.id;

  update public.nations_competition_editions
  set active_association_count=v_count,
      finalist_target=least(16,v_count),
      updated_at=now()
  where id=v_edition.id;

  for v_round_json in
    select value from jsonb_array_elements(v_plan->'rounds')
  loop
    insert into public.nations_competition_rounds(
      edition_id,round_index,round_type,round_label,
      entrants_target,advance_target,group_count,
      group_size_min,group_size_max,status
    )
    values(
      v_edition.id,
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
      select value from jsonb_array_elements(v_group_plan)
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
    'status','rebuilt',
    'edition_id',v_edition.id,
    'active_associations',v_count,
    'plan',v_plan
  );
end;
$function$;

revoke all on function private.rebuild_planned_nations_structure_v1(uuid)
from public,anon,authenticated;

create or replace function private.auto_enroll_national_association_in_nations_v1(
  p_association_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_assoc public.national_associations%rowtype;
  v_season integer;
  v_edition public.nations_competition_editions%rowtype;
  v_minimum integer:=5;
  v_inserted integer:=0;
  v_rebuild jsonb:=null;
begin
  select * into v_assoc
  from public.national_associations
  where id=p_association_id;

  if v_assoc.id is null or v_assoc.status<>'active' then
    return jsonb_build_object('status','not_active');
  end if;

  select minimum_active_members::integer
  into v_minimum
  from public.national_association_config
  where id=true;

  if private.national_association_active_member_count_v1(v_assoc.id)<coalesce(v_minimum,5) then
    return jsonb_build_object('status','not_eligible_yet');
  end if;

  select season_number into v_season
  from public.game_state where id=true;

  select * into v_edition
  from public.nations_competition_editions
  where season_number=v_season
  limit 1;

  if v_edition.id is null then
    return jsonb_build_object(
      'status','queued_for_automatic_generation',
      'season_number',v_season
    );
  end if;

  if v_edition.status<>'planned'
     or exists(
       select 1
       from public.nations_group_entries nge
       join public.nations_competition_groups g on g.id=nge.group_id
       join public.nations_competition_rounds r on r.id=g.round_id
       where r.edition_id=v_edition.id
     )
  then
    return jsonb_build_object(
      'status','current_draw_locked_next_season_automatic',
      'edition_id',v_edition.id,
      'season_number',v_season
    );
  end if;

  insert into public.nations_competition_entries(
    edition_id,association_id,country_code,seed_score,status
  )
  values(v_edition.id,v_assoc.id,v_assoc.country_code,0,'entered')
  on conflict(edition_id,association_id) do nothing;

  get diagnostics v_inserted=row_count;

  if v_inserted>0 then
    v_rebuild:=private.rebuild_planned_nations_structure_v1(v_edition.id);
  end if;

  return jsonb_build_object(
    'status',case when v_inserted>0 then 'automatically_entered' else 'already_entered' end,
    'edition_id',v_edition.id,
    'season_number',v_season,
    'structure',v_rebuild
  );
end;
$function$;

revoke all on function private.auto_enroll_national_association_in_nations_v1(uuid)
from public,anon,authenticated;

create or replace function private.national_association_auto_nations_entry_trg_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.status='active' and (tg_op='INSERT' or old.status is distinct from new.status) then
    perform private.auto_enroll_national_association_in_nations_v1(new.id);
  end if;
  return new;
end;
$function$;

drop trigger if exists national_association_auto_nations_entry_v1
on public.national_associations;

create trigger national_association_auto_nations_entry_v1
after insert or update of status
on public.national_associations
for each row
execute function private.national_association_auto_nations_entry_trg_v1();

create or replace function public.assign_nations_event_hosts_v1(
  p_edition_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_edition public.nations_competition_editions%rowtype;
  v_event record;
  v_stage_id uuid;
  v_host_code text;
  v_host_association uuid;
  v_previous_host text:=null;
  v_used_hosts text[]:='{}'::text[];
  v_assigned integer:=0;
begin
  select * into v_edition
  from public.nations_competition_editions
  where id=p_edition_id;

  if v_edition.id is null then
    raise exception 'World Nations edition not found.';
  end if;

  -- Hosting is race-specific. The old edition-wide host is no longer used.
  update public.nations_competition_editions
  set host_association_id=null,
      host_country_code=null,
      updated_at=now()
  where id=v_edition.id
    and (host_association_id is not null or host_country_code is not null);

  for v_event in
    select
      e.id,
      e.race_type,
      e.source_stage_id,
      e.host_country_code,
      r.round_index,
      g.group_number,
      e.race_day
    from public.nations_competition_rounds r
    join public.nations_competition_groups g on g.round_id=r.id
    join public.nations_group_events e on e.group_id=g.id
    where r.edition_id=v_edition.id
    order by r.round_index,g.group_number,e.race_day
  loop
    if v_event.source_stage_id is not null and v_event.host_country_code is not null then
      v_previous_host:=upper(v_event.host_country_code);
      if not (v_previous_host=any(v_used_hosts)) then
        v_used_hosts:=array_append(v_used_hosts,v_previous_host);
      end if;
      continue;
    end if;

    select
      s.id,
      upper(coalesce(nullif(s.host_country_code,''),nullif(sr.country_code,'')))
    into v_stage_id,v_host_code
    from public.race_stages s
    join public.races sr on sr.id=s.race_id
    where
      coalesce((sr.metadata->>'nations_competition')::boolean,false)=false
      and coalesce((sr.metadata->>'national_championship')::boolean,false)=false
      and coalesce((sr.metadata->>'world_road_championship')::boolean,false)=false
      and coalesce(nullif(s.host_country_code,''),nullif(sr.country_code,'')) is not null
      and case
        when v_event.race_type='team_time_trial' then
          s.stage_format='team_time_trial'
          and s.distance_km between 18 and 48
        when v_event.race_type='flat_road_race' then
          s.stage_format='road_race'
          and s.terrain_type='flat'
          and s.distance_km between 140 and 220
        when v_event.race_type='hilly_mountain_road_race' then
          s.stage_format='road_race'
          and s.terrain_type in ('hilly','mountain')
          and s.distance_km between 135 and 220
        else false
      end
    order by
      case
        when upper(coalesce(nullif(s.host_country_code,''),nullif(sr.country_code,'')))=v_previous_host
          then 1 else 0
      end,
      case
        when upper(coalesce(nullif(s.host_country_code,''),nullif(sr.country_code,'')))=any(v_used_hosts)
          then 1 else 0
      end,
      md5(v_edition.id::text||':'||v_event.id::text||':'||s.id::text)
    limit 1;

    if v_stage_id is null or v_host_code is null then
      raise exception 'No suitable World Nations host stage is available for event %.',v_event.id;
    end if;

    select ce.association_id
    into v_host_association
    from public.nations_competition_entries ce
    where ce.edition_id=v_edition.id
      and upper(ce.country_code)=v_host_code
    limit 1;

    update public.nations_group_events
    set source_stage_id=v_stage_id,
        host_country_code=v_host_code,
        host_association_id=v_host_association,
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'race_specific_host',true,
          'host_country_code',v_host_code,
          'host_association_id',v_host_association,
          'host_source_stage_id',v_stage_id
        ),
        updated_at=now()
    where id=v_event.id;

    v_previous_host:=v_host_code;
    if not (v_host_code=any(v_used_hosts)) then
      v_used_hosts:=array_append(v_used_hosts,v_host_code);
    end if;
    v_assigned:=v_assigned+1;
  end loop;

  return jsonb_build_object(
    'edition_id',v_edition.id,
    'race_specific_hosts',true,
    'assigned_events',v_assigned
  );
end;
$function$;

revoke all on function public.assign_nations_event_hosts_v1(uuid)
from public,anon,authenticated;

create or replace function public.get_nations_competition_event_schedule_v1(
  p_edition_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'round_id',r.id,
        'round_index',r.round_index,
        'round_type',r.round_type,
        'round_label',r.round_label,
        'group_id',g.id,
        'group_number',g.group_number,
        'group_label',g.group_label,
        'event_id',e.id,
        'race_day',e.race_day,
        'race_type',e.race_type,
        'cycle_key',e.cycle_key,
        'event_date',e.event_date,
        'race_id',e.race_id,
        'stage_id',e.stage_id,
        'source_stage_id',e.source_stage_id,
        'host_association_id',e.host_association_id,
        'host_country_code',e.host_country_code,
        'status',e.status
      )
      order by r.round_index,g.group_number,e.race_day
    ),
    '[]'::jsonb
  )
  from public.nations_competition_rounds r
  join public.nations_competition_groups g on g.round_id=r.id
  join public.nations_group_events e on e.group_id=g.id
  where r.edition_id=p_edition_id;
$function$;

create or replace function public.expire_national_team_callups_v1()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_today date:=public.get_current_game_date_date();
  v_count integer:=0;
  v_auto integer:=0;
  v_expired integer:=0;
begin
  -- A locked National Team selection treats silence as acceptance.
  update public.national_team_callups c
  set status='auto_accepted',
      responded_on_game_date=v_today,
      response_note='No club response before deadline; National Team duty auto-accepted.',
      updated_at=now()
  where c.status='pending'
    and c.response_deadline is not null
    and c.response_deadline<v_today
    and exists(
      select 1
      from public.national_team_selection_cycles sc
      where sc.association_id=c.association_id
        and sc.season_number=c.season_number
        and sc.cycle_key=c.cycle_key
        and sc.status in ('awaiting_responses','needs_replacement','ready_to_confirm')
        and c.rider_id=any(sc.selected_rider_ids)
    );

  get diagnostics v_auto=row_count;

  -- Legacy/unlinked provisional call-ups can still expire normally.
  update public.national_team_callups c
  set status='expired',
      responded_on_game_date=v_today,
      response_note='No club response before deadline.',
      updated_at=now()
  where c.status='pending'
    and c.response_deadline is not null
    and c.response_deadline<v_today;

  get diagnostics v_expired=row_count;

  v_count:=v_auto+v_expired;
  return v_count;
end;
$function$;

create or replace function public.process_national_association_nations_runtime_v1()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_today date:=public.get_current_game_date_date();
  v_status jsonb;
  v_elections jsonb;
  v_expired integer;
  v_duties jsonb;
  v_plan jsonb;
  v_edition_id uuid;
  v_schedule jsonb:=null;
  v_hosts jsonb:=null;
  v_next_round record;
  v_draw jsonb:=null;
begin
  v_status:=public.refresh_national_association_statuses_v1();
  v_elections:=public.process_national_coach_elections_v1();
  v_expired:=public.expire_national_team_callups_v1();
  v_duties:=public.refresh_national_team_duty_status_v1();
  v_plan:=public.process_nations_competition_planning_v1();

  v_edition_id:=nullif(v_plan->>'edition_id','')::uuid;

  if v_edition_id is null then
    select id into v_edition_id
    from public.nations_competition_editions
    where season_number=(select season_number from public.game_state where id=true)
    limit 1;
  end if;

  if v_edition_id is not null then
    v_schedule:=public.schedule_nations_edition_v1(v_edition_id);
    v_hosts:=public.assign_nations_event_hosts_v1(v_edition_id);

    select r.id,r.round_type
    into v_next_round
    from public.nations_competition_rounds r
    where r.edition_id=v_edition_id
      and r.status='planned'
      and (
        r.round_index=1
        or exists(
          select 1
          from public.nations_competition_rounds prev
          where prev.edition_id=r.edition_id
            and prev.round_index=r.round_index-1
            and prev.status='completed'
        )
      )
    order by r.round_index
    limit 1;

    if v_next_round.id is not null then
      v_draw:=public.draw_nations_round_v1(v_next_round.id);

      update public.nations_competition_editions
      set status=case
          when v_next_round.round_type='world_final' then 'world_final'
          else 'qualification'
        end,
        updated_at=now()
      where id=v_edition_id
        and status<>'completed';
    end if;
  end if;

  return jsonb_build_object(
    'game_date',v_today,
    'association_statuses',v_status,
    'coach_elections',v_elections,
    'expired_or_auto_accepted_callups',v_expired,
    'national_duties',v_duties,
    'nations_planning',v_plan,
    'nations_schedule',v_schedule,
    'race_hosts',v_hosts,
    'next_round_draw',v_draw
  );
end;
$function$;

create or replace function public.get_nations_competition_event_page_v1(
  p_event_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_event public.nations_group_events%rowtype;
  v_group public.nations_competition_groups%rowtype;
  v_round public.nations_competition_rounds%rowtype;
  v_edition public.nations_competition_editions%rowtype;
  v_stage public.race_stages%rowtype;
  v_profile public.race_stage_profile_details%rowtype;
  v_stage_id uuid;
  v_host_name text;
  v_viewer_has_participant boolean:=false;
  v_results jsonb:='[]'::jsonb;
  v_participants jsonb:='[]'::jsonb;
begin
  select * into v_event
  from public.nations_group_events
  where id=p_event_id;

  if v_event.id is null then
    raise exception 'World Nations race not found.';
  end if;

  select * into v_group
  from public.nations_competition_groups
  where id=v_event.group_id;

  select * into v_round
  from public.nations_competition_rounds
  where id=v_group.round_id;

  select * into v_edition
  from public.nations_competition_editions
  where id=v_round.edition_id;

  v_stage_id:=coalesce(v_event.stage_id,v_event.source_stage_id);

  if v_stage_id is not null then
    select * into v_stage
    from public.race_stages
    where id=v_stage_id;

    select * into v_profile
    from public.race_stage_profile_details
    where stage_id=v_stage_id
    limit 1;
  end if;

  select coalesce(c.name,v_event.host_country_code,'International')
  into v_host_name
  from public.countries c
  where upper(c.code)=upper(v_event.host_country_code)
  limit 1;

  v_host_name:=coalesce(v_host_name,v_event.host_country_code,'International');

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'group_entry_id',nge.id,
      'competition_entry_id',ce.id,
      'association_id',ce.association_id,
      'association_name',a.name,
      'country_code',ce.country_code,
      'seed_position',nge.seed_position,
      'status',nge.status,
      'team_id',ti.technical_club_id,
      'flag_url','https://flagcdn.com/w160/'||lower(ce.country_code)||'.png'
    )
    order by nge.seed_position nulls last,ce.country_code
  ),'[]'::jsonb)
  into v_participants
  from public.nations_group_entries nge
  join public.nations_competition_entries ce on ce.id=nge.competition_entry_id
  join public.national_associations a on a.id=ce.association_id
  left join public.national_association_race_team_identities ti
    on ti.association_id=ce.association_id
  where nge.group_id=v_group.id
    and nge.status<>'withdrawn';

  if v_uid is not null then
    select exists(
      select 1
      from public.nations_group_entries nge
      join public.nations_competition_entries ce on ce.id=nge.competition_entry_id
      join public.national_association_memberships m
        on m.association_id=ce.association_id
       and m.user_id=v_uid
       and m.status='active'
      where nge.group_id=v_group.id
        and nge.status<>'withdrawn'
    )
    into v_viewer_has_participant;
  end if;

  if v_event.stage_id is not null then
    if v_event.race_type='team_time_trial' then
      with raw as (
        select
          ce.association_id,
          a.name as association_name,
          ce.country_code,
          ts.team_rank as rank,
          ts.team_finish_time_seconds as elapsed_seconds,
          public.nations_ttt_points_v1(coalesce(ts.team_rank,999)) as points
        from public.nations_group_entries nge
        join public.nations_competition_entries ce on ce.id=nge.competition_entry_id
        join public.national_associations a on a.id=ce.association_id
        left join public.national_association_race_team_identities ti
          on ti.association_id=ce.association_id
        left join lateral (
          select x.team_rank,x.team_finish_time_seconds
          from public.race_stage_team_states x
          join public.race_stage_simulation_runs sr on sr.id=x.simulation_run_id
          where x.stage_id=v_event.stage_id
            and x.team_id=ti.technical_club_id
            and sr.status='completed'
          order by sr.created_at desc
          limit 1
        ) ts on true
        where nge.group_id=v_group.id
          and nge.status<>'withdrawn'
      ),
      timed as (
        select raw.*,
          case
            when elapsed_seconds is null then null
            else elapsed_seconds-min(elapsed_seconds) over()
          end as gap_seconds
        from raw
      )
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'rank',rank,
          'association_id',association_id,
          'association_name',association_name,
          'country_code',country_code,
          'points',points,
          'elapsed_seconds',elapsed_seconds,
          'gap_seconds',gap_seconds,
          'best_rider_rank',null
        )
        order by rank nulls last,country_code
      ),'[]'::jsonb)
      into v_results
      from timed
      where rank is not null;
    else
      with positions as (
        select
          ce.association_id,
          a.name as association_name,
          ce.country_code,
          coalesce(array_agg(rr.rank order by rr.rank)
            filter(where rr.rank is not null),'{}'::integer[]) as finish_positions
        from public.nations_group_entries nge
        join public.nations_competition_entries ce on ce.id=nge.competition_entry_id
        join public.national_associations a on a.id=ce.association_id
        left join public.national_association_race_team_identities ti
          on ti.association_id=ce.association_id
        left join public.race_stage_results rr
          on rr.stage_id=v_event.stage_id
         and rr.team_id=ti.technical_club_id
         and rr.status='finished'
        where nge.group_id=v_group.id
          and nge.status<>'withdrawn'
        group by ce.association_id,a.name,ce.country_code
      ),
      scored as (
        select
          p.*,
          public.calculate_nation_road_race_points_v1(p.finish_positions) as points,
          (select min(x) from unnest(p.finish_positions) x) as best_rider_rank
        from positions p
      ),
      ranked as (
        select
          s.*,
          row_number() over(
            order by s.points desc,s.best_rider_rank asc nulls last,s.country_code
          )::integer as rank
        from scored s
        where cardinality(s.finish_positions)>0
      )
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'rank',rank,
          'association_id',association_id,
          'association_name',association_name,
          'country_code',country_code,
          'points',points,
          'elapsed_seconds',null,
          'gap_seconds',null,
          'best_rider_rank',best_rider_rank
        )
        order by rank
      ),'[]'::jsonb)
      into v_results
      from ranked;
    end if;
  end if;

  return jsonb_build_object(
    'event_id',v_event.id,
    'edition_id',v_edition.id,
    'season_number',v_edition.season_number,
    'competition_name',v_edition.competition_name,
    'round_id',v_round.id,
    'round_index',v_round.round_index,
    'round_type',v_round.round_type,
    'round_label',v_round.round_label,
    'group_id',v_group.id,
    'group_number',v_group.group_number,
    'group_label',v_group.group_label,
    'race_day',v_event.race_day,
    'race_type',v_event.race_type,
    'event_date',v_event.event_date,
    'status',v_event.status,
    'race_id',v_event.race_id,
    'generated_stage_id',v_event.stage_id,
    'source_stage_id',v_event.source_stage_id,
    'host_association_id',v_event.host_association_id,
    'host_country_code',v_event.host_country_code,
    'host_country_name',v_host_name,
    'host_flag_url',
      case
        when v_event.host_country_code is null then null
        else 'https://flagcdn.com/w320/'||lower(v_event.host_country_code)||'.png'
      end,
    'team_count',jsonb_array_length(v_participants),
    'advancing_places',v_group.planned_advance_count,
    'participants',v_participants,
    'participants_known',jsonb_array_length(v_participants)>0,
    'results',v_results,
    'viewer_has_participant',v_viewer_has_participant,
    'start_time_label',coalesce(v_stage.planned_start_time_label,null),
    'expected_max_temp_c',
      case
        when jsonb_typeof(coalesce(v_stage.weather_snapshot,'{}'::jsonb))='object'
          and (v_stage.weather_snapshot ? 'avg_max_temp_c')
        then nullif(v_stage.weather_snapshot->>'avg_max_temp_c','')::numeric
        else null
      end,
    'route',jsonb_build_object(
      'stage_id',v_stage_id,
      'route_label',coalesce(
        v_profile.route_label,
        concat_ws(' → ',
          nullif(coalesce(v_stage.start_city_name,v_stage.start_city),''),
          nullif(coalesce(v_stage.finish_city_name,v_stage.finish_city),'')
        )
      ),
      'start_city',coalesce(v_stage.start_city_name,v_stage.start_city,'—'),
      'finish_city',coalesce(v_stage.finish_city_name,v_stage.finish_city,'—'),
      'host_city',coalesce(v_stage.host_city,v_stage.start_city_name,v_stage.start_city,v_host_name),
      'distance_km',coalesce(v_profile.distance_km,v_stage.distance_km),
      'terrain_type',coalesce(v_profile.terrain_type,v_stage.terrain_type),
      'profile_type',coalesce(v_profile.profile_type,v_stage.profile_type),
      'elevation_gain_m',coalesce(v_profile.elevation_gain_m,v_stage.elevation_gain_m,0),
      'flat_pct',v_stage.flat_pct,
      'hilly_pct',v_stage.hilly_pct,
      'mountain_pct',v_stage.mountain_pct,
      'cobbled_pct',v_stage.cobbled_pct,
      'summary',coalesce(v_profile.stage_summary,v_stage.notes),
      'profile_points',coalesce(v_profile.profile_points,'[]'::jsonb),
      'route_markers',coalesce(v_profile.route_markers,'[]'::jsonb),
      'weather_snapshot',coalesce(v_stage.weather_snapshot,'{}'::jsonb),
      'weather_summary',v_profile.weather_summary
    )
  );
end;
$function$;

revoke all on function public.get_nations_competition_event_page_v1(uuid)
from public,anon;
grant execute on function public.get_nations_competition_event_page_v1(uuid)
to authenticated;

-- Correct the temporary Albania test state: the Association remains active with
-- five members, but there is no appointed caretaker coach. Members elect the first
-- coach through the already-open election.
delete from public.national_coach_terms t
using public.national_associations a, public.game_state gs
where t.association_id=a.id
  and a.country_code='AL'
  and gs.id=true
  and t.season_number=gs.season_number
  and t.status='active'
  and t.term_kind='caretaker'
  and t.election_id is null;

update public.national_coach_elections e
set election_kind='activation',
    reason='first_association_coach_election',
    updated_at=now()
from public.national_associations a, public.game_state gs
where e.association_id=a.id
  and a.country_code='AL'
  and gs.id=true
  and e.season_number=gs.season_number
  and e.status='candidate_registration'
  and e.reason='association_activated_after_january_registration'
  and not exists(
    select 1 from public.national_coach_candidates c where c.election_id=e.id
  );

-- If an edition is already open and not drawn, enroll all currently eligible
-- Associations immediately. Otherwise edition generation will include them later.
do $block$
declare
  v_assoc record;
begin
  for v_assoc in
    select a.id
    from public.national_associations a
    where a.status='active'
  loop
    perform private.auto_enroll_national_association_in_nations_v1(v_assoc.id);
  end loop;
end;
$block$;
