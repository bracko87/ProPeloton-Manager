-- Early January (Jan 1-15) rider submission deadline must use the exact
-- Stage 1 start timestamp minus 3 in-game hours across every lifecycle path.

create or replace function public.process_rider_submission_deadlines_v1()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_current record;
  v_current_game_at timestamp without time zone;
  v_today_ordinal integer;
  v_entry record;
  v_race_id uuid;
  v_fill_result jsonb;
  v_checked_entries integer := 0;
  v_missed_entries integer := 0;
  v_affected_race_ids uuid[] := '{}';
  v_ai_fill_checked_races integer := 0;
  v_ai_entries_added integer := 0;
  v_riders_added integer := 0;
  v_results jsonb := '[]'::jsonb;
  v_ai_fill_results jsonb := '[]'::jsonb;
begin
  select * into v_current from public.get_current_game_date_parts() limit 1;
  if not found then
    return jsonb_build_object('success',false,'error','current_game_date_not_found');
  end if;
  v_current_game_at := public.get_current_game_timestamp()::timestamp without time zone;
  v_today_ordinal := public.game_date_ordinal_v1(v_current.season_number,v_current.month_number,v_current.day_number);

  for v_entry in
    select r.id as race_id,r.name as race_name,rte.id as race_team_entry_id,rte.club_id,
           coalesce(rte.participating_club_id,rte.club_id) as participating_club_id,
           coalesce(rer.min_riders_per_team,4) as required_riders,
           count(rpr.id)::integer as assigned_riders,
           rer.rider_submission_deadline_game_at,
           public.game_date_display_v1(rer.rider_submission_deadline_season_number,rer.rider_submission_deadline_month_number,rer.rider_submission_deadline_day_number) as rider_submission_deadline_display
    from public.races r
    join public.race_entry_rules rer on rer.race_id=r.id
    join public.race_team_entries rte on rte.race_id=r.id
    left join public.race_participant_riders rpr on rpr.race_id=r.id and rpr.team_id=coalesce(rte.participating_club_id,rte.club_id)
    where rte.status='accepted'
      and coalesce(rte.is_ai_filler,false) is false
      and coalesce(rte.entry_source,'user') <> 'ai_fill'
      and ((rer.rider_submission_deadline_game_at is not null and v_current_game_at >= rer.rider_submission_deadline_game_at)
        or (rer.rider_submission_deadline_game_at is null and public.game_date_ordinal_v1(rer.rider_submission_deadline_season_number,rer.rider_submission_deadline_month_number,rer.rider_submission_deadline_day_number) < v_today_ordinal))
      and (r.start_date::timestamp + make_interval(
        hours=>coalesce((select rs.planned_start_hour_number from public.race_stages rs where rs.race_id=r.id order by rs.stage_number limit 1),r.planned_start_hour_number,12),
        mins=>coalesce((select rs.planned_start_minute from public.race_stages rs where rs.race_id=r.id order by rs.stage_number limit 1),r.planned_start_minute,0))) > v_current_game_at
    group by r.id,r.name,rte.id,rte.club_id,rte.participating_club_id,rer.min_riders_per_team,rer.rider_submission_deadline_game_at,
      rer.rider_submission_deadline_season_number,rer.rider_submission_deadline_month_number,rer.rider_submission_deadline_day_number
    having count(rpr.id)::integer < coalesce(rer.min_riders_per_team,4)
    order by r.start_date,r.name
  loop
    v_checked_entries := v_checked_entries + 1;
    update public.race_team_entries
    set status='missed_startlist',missed_startlist_at=now(),decision_reason=concat('Missed rider submission deadline. Required ',v_entry.required_riders,' riders, assigned ',v_entry.assigned_riders,'.'),updated_at=now()
    where id=v_entry.race_team_entry_id and status='accepted';
    if found then
      v_missed_entries := v_missed_entries + 1;
      insert into public.race_rider_submission_deadline_events(race_id,race_team_entry_id,club_id,event_type,required_riders,assigned_riders,current_game_date_display,notes)
      values(v_entry.race_id,v_entry.race_team_entry_id,v_entry.club_id,'missed_startlist',v_entry.required_riders,v_entry.assigned_riders,
        public.game_date_display_v1(v_current.season_number,v_current.month_number,v_current.day_number),
        concat('Rider submission deadline was ',coalesce(v_entry.rider_submission_deadline_game_at::text,v_entry.rider_submission_deadline_display),'. Effective participating club: ',v_entry.participating_club_id,'.'))
      on conflict (race_team_entry_id,event_type) do nothing;
      if not v_entry.race_id = any(v_affected_race_ids) then v_affected_race_ids := array_append(v_affected_race_ids,v_entry.race_id); end if;
    end if;
    v_results := v_results || jsonb_build_array(jsonb_build_object('race_id',v_entry.race_id,'race_name',v_entry.race_name,'race_team_entry_id',v_entry.race_team_entry_id,'club_id',v_entry.club_id,'participating_club_id',v_entry.participating_club_id,'required_riders',v_entry.required_riders,'assigned_riders',v_entry.assigned_riders,'rider_submission_deadline_game_at',v_entry.rider_submission_deadline_game_at,'status','missed_startlist'));
  end loop;

  for v_race_id in select distinct unnest(v_affected_race_ids)
  loop
    v_ai_fill_checked_races := v_ai_fill_checked_races + 1;
    select public.fill_race_ai_teams_v1(v_race_id) into v_fill_result;
    v_ai_entries_added := v_ai_entries_added + coalesce((v_fill_result->>'ai_entries_added')::integer,0);
    v_riders_added := v_riders_added + coalesce((v_fill_result#>>'{rider_assignment_result,riders_added}')::integer,0);
    v_ai_fill_results := v_ai_fill_results || jsonb_build_array(v_fill_result);
  end loop;

  return jsonb_build_object('success',true,'version','exact_game_timestamp_v2','current_game_at',v_current_game_at,
    'checked_entries',v_checked_entries,'missed_entries',v_missed_entries,'affected_races',coalesce(array_length(v_affected_race_ids,1),0),
    'results',v_results,'ai_fill_checked_races',v_ai_fill_checked_races,'ai_entries_added',v_ai_entries_added,'ai_riders_added',v_riders_added,'ai_fill_results',v_ai_fill_results);
end;
$function$;

create or replace function public.process_due_race_startlist_captain_finalizations_v1(p_limit integer default 20)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_current_game_at timestamp without time zone;
  v_race record;
  v_result jsonb;
  v_checked integer := 0;
  v_finalized integer := 0;
  v_failed integer := 0;
  v_results jsonb := '[]'::jsonb;
begin
  v_current_game_at := public.get_current_game_timestamp()::timestamp without time zone;
  for v_race in
    select race.id as race_id,race.name as race_name,
           coalesce(rules.rider_submission_deadline_game_at,
             coalesce(rules.rider_submission_deadline::date,
               make_date(1999+rules.rider_submission_deadline_season_number::integer,rules.rider_submission_deadline_month_number::integer,rules.rider_submission_deadline_day_number::integer),
               race.start_date::date-3)::timestamp) as rider_deadline_game_at
    from public.races race
    join public.race_entry_rules rules on rules.race_id=race.id
    where race.status='scheduled'
      and lower(coalesce(rules.applications_status,''))='closed'
      and v_current_game_at >= coalesce(rules.rider_submission_deadline_game_at,
        coalesce(rules.rider_submission_deadline::date,
          make_date(1999+rules.rider_submission_deadline_season_number::integer,rules.rider_submission_deadline_month_number::integer,rules.rider_submission_deadline_day_number::integer),
          race.start_date::date-3)::timestamp)
      and v_current_game_at < coalesce(
        (select rs.stage_date::timestamp + make_interval(hours=>coalesce(rs.planned_start_hour_number,race.planned_start_hour_number,12),mins=>coalesce(rs.planned_start_minute,race.planned_start_minute,0)) from public.race_stages rs where rs.race_id=race.id order by rs.stage_number limit 1),
        race.start_date::timestamp + make_interval(hours=>coalesce(race.planned_start_hour_number,12),mins=>coalesce(race.planned_start_minute,0)))
      and lower(coalesce(race.metadata->>'race_startlist_captains_finalized','false')) not in ('true','1','yes')
    order by race.start_date,race.name
    limit greatest(coalesce(p_limit,20),1)
  loop
    v_checked := v_checked + 1;
    begin
      select public.finalize_race_startlist_captains_v1(v_race.race_id) into v_result;
      v_finalized := v_finalized + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object('race_id',v_race.race_id,'race_name',v_race.race_name,'rider_deadline_game_at',v_race.rider_deadline_game_at,'status','finalized','result',v_result));
    exception when others then
      v_failed := v_failed + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object('race_id',v_race.race_id,'race_name',v_race.race_name,'rider_deadline_game_at',v_race.rider_deadline_game_at,'status','failed','error',sqlerrm,'will_retry',true));
    end;
  end loop;
  return jsonb_build_object('success',v_failed=0,'current_game_at',v_current_game_at,'checked_races',v_checked,'finalized_races',v_finalized,'failed_races',v_failed,'results',v_results);
end;
$function$;

create or replace function public.process_due_race_startlist_deadlines_v1()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_current_game_date date;
  v_current_game_at timestamp without time zone;
  v_row record;
  v_result jsonb;
  v_submit_result jsonb;
  v_processed jsonb := '[]'::jsonb;
  v_failed jsonb := '[]'::jsonb;
  v_owner_user_id uuid;
begin
  v_current_game_date := public.get_current_game_date_date();
  v_current_game_at := public.get_current_game_timestamp()::timestamp without time zone;
  for v_row in
    with accepted_entries as (
      select rte.id race_team_entry_id,rte.race_id,rte.club_id,rte.participating_club_id,rte.status entry_status,rte.missed_startlist_at,
             r.name race_name,r.start_date::date race_start_date,
             coalesce((select rs.stage_date::timestamp + make_interval(hours=>coalesce(rs.planned_start_hour_number,r.planned_start_hour_number,12),mins=>coalesce(rs.planned_start_minute,r.planned_start_minute,0)) from public.race_stages rs where rs.race_id=r.id order by rs.stage_number limit 1),
               r.start_date::timestamp + make_interval(hours=>coalesce(r.planned_start_hour_number,12),mins=>coalesce(r.planned_start_minute,0))) as race_start_game_at,
             rer.rider_submission_deadline_game_at as rider_deadline_game_at,
             rp.id race_preparation_id,rp.status prep_status,rp.startlist_status,
             coalesce(rp.rider_submission_deadline_on,rer.rider_submission_deadline::date,
               case when rer.rider_submission_deadline_season_number is not null then make_date(1999+rer.rider_submission_deadline_season_number::int,rer.rider_submission_deadline_month_number::int,rer.rider_submission_deadline_day_number::int) end,
               r.start_date::date-3)::date as rider_deadline,
             coalesce(rer.min_riders_per_team,0) min_riders,coalesce(rer.max_riders_per_team,999) max_riders
      from public.race_team_entries rte
      join public.races r on r.id=rte.race_id
      left join public.race_preparations rp on rp.race_id=rte.race_id and (rp.club_id=rte.club_id or rp.participating_club_id=rte.participating_club_id or rp.participating_club_id=rte.club_id)
      left join public.race_entry_rules rer on rer.race_id=rte.race_id
      where rte.status in ('accepted','confirmed') and rte.missed_startlist_at is null and coalesce(rte.is_ai_filler,false) is false and coalesce(rte.entry_source,'user')<>'ai_fill'
    ), counts as (
      select ae.*,(select count(*) from public.race_preparation_riders rpr where rpr.race_preparation_id=ae.race_preparation_id)::integer saved_riders from accepted_entries ae
    )
    select * from counts
    where rider_deadline is not null
      and ((rider_deadline_game_at is not null and v_current_game_at>=rider_deadline_game_at) or (rider_deadline_game_at is null and v_current_game_date>=rider_deadline))
      and coalesce(prep_status,'draft') not in ('submitted','locked','sent_to_engine','missed_startlist')
      and coalesce(startlist_status,'draft') not in ('submitted','locked','sent_to_engine','missed_startlist')
  loop
    begin
      if v_current_game_at >= v_row.race_start_game_at then
        v_result := public.mark_race_preparation_missed_startlist_v1(v_row.race_id,v_row.club_id,'Race started without a valid submitted Race Plan.');
      elsif v_row.race_preparation_id is not null and v_row.saved_riders between v_row.min_riders and v_row.max_riders then
        begin
          v_submit_result := public.submit_race_preparation_v1(v_row.race_id,v_row.club_id,'auto-deadline-finalise-'||v_row.race_preparation_id::text);
          perform public.sync_submitted_race_preparation_to_participants_v1(v_row.race_preparation_id);
          select coalesce(nullif(to_jsonb(c)->>'owner_user_id','')::uuid,nullif(to_jsonb(c)->>'owner_auth_user_id','')::uuid) into v_owner_user_id from public.clubs c where c.id=v_row.club_id;
          if v_owner_user_id is not null then
            perform public.create_user_game_notification_v1(v_owner_user_id,'RACE_PLAN_FINALISED','Race Plan auto-submitted: '||v_row.race_name,
              'The rider deadline was reached, so the saved Race Plan was submitted automatically and Stage Plans are now available.',
              '/dashboard/race-preparation?tab=stagePlans&raceId='||v_row.race_id::text,
              jsonb_build_object('event_type','race_plan_auto_submitted','race_id',v_row.race_id,'club_id',v_row.club_id,'race_name',v_row.race_name,'race_preparation_id',v_row.race_preparation_id,'rider_deadline_game_at',v_row.rider_deadline_game_at,'result',v_submit_result),
              'race-plan-auto-submitted-'||v_row.club_id::text||'-'||v_row.race_id::text,null);
          end if;
          v_result := jsonb_build_object('success',true,'mode','auto_submitted_complete_draft','submit_result',v_submit_result);
        exception when others then
          v_result := jsonb_build_object('success',false,'mode','auto_submit_failed','error',sqlerrm,'race_preparation_id',v_row.race_preparation_id,'saved_riders',v_row.saved_riders,'min_riders',v_row.min_riders,'max_riders',v_row.max_riders);
        end;
      else
        v_result := public.mark_race_preparation_missed_startlist_v1(v_row.race_id,v_row.club_id,'Rider deadline passed with no valid submitted startlist.');
      end if;
      if coalesce((v_result->>'success')::boolean,false) then
        v_processed := v_processed || jsonb_build_array(jsonb_build_object('race_id',v_row.race_id,'race_name',v_row.race_name,'club_id',v_row.club_id,'race_team_entry_id',v_row.race_team_entry_id,'race_preparation_id',v_row.race_preparation_id,'saved_riders',v_row.saved_riders,'result',v_result));
      else
        v_failed := v_failed || jsonb_build_array(jsonb_build_object('race_id',v_row.race_id,'race_name',v_row.race_name,'club_id',v_row.club_id,'race_team_entry_id',v_row.race_team_entry_id,'race_preparation_id',v_row.race_preparation_id,'saved_riders',v_row.saved_riders,'result',v_result));
      end if;
    exception when others then
      v_failed := v_failed || jsonb_build_array(jsonb_build_object('race_id',v_row.race_id,'race_name',v_row.race_name,'club_id',v_row.club_id,'race_team_entry_id',v_row.race_team_entry_id,'race_preparation_id',v_row.race_preparation_id,'saved_riders',v_row.saved_riders,'error',sqlerrm));
    end;
  end loop;
  return jsonb_build_object('success',true,'version','exact_game_timestamp_v2','current_game_at',v_current_game_at,'processed',v_processed,'failed',v_failed);
end;
$function$;
