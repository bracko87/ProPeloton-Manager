-- Include contemporary preselection statuses when withdrawing expired trial entries.
CREATE OR REPLACE FUNCTION control_center_private.retire_expired_saturn_test_clubs_v1(p_dry_run boolean DEFAULT true, p_max_clubs integer DEFAULT 5)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'control_center_private'
AS $function$
declare
  c record;
  rr record;
  v_club uuid;
  v_ai uuid;
  v_old_occupancy integer;
  v_deferred jsonb:='[]'::jsonb;
  v_game date;
  v_state record;
  v_tier text;
  v_division text;
  v_fill jsonb;
  v_rider_count integer;
  v_staff_count integer;
  v_removed integer:=0;
  v_replaced integer:=0;
  v_candidates jsonb:='[]'::jsonb;
  v_processed jsonb:='[]'::jsonb;
  v_related_clubs uuid[];
  v_expected integer;
  v_min integer;
  v_duration smallint;
begin
  if public.season_transition_guard_active_v1() then
    return jsonb_build_object('status','skipped_season_transition');
  end if;

  v_game:=public.get_current_game_date_date();
  select season_number,month_number,day_number,hour_number,minute_number
    into v_state from public.game_state where id=true;
  if v_game is null or v_state.season_number is null then
    raise exception 'Game time is unavailable. Inactivity removal aborted';
  end if;

  -- Lock the same trial row used by both conversion finalizers FIRST.
  for c in
    select club.id,club.name,club.owner_user_id,club.club_tier::text tier,
           club.tier2_division,club.tier3_division,club.amateur_division,
           club.world_tier,t.expires_at,
           floor(extract(epoch from(clock_timestamp()-t.started_at))/86400)::integer inactive_real_days
      from public.saturn_test_accounts_v1 t
      join public.clubs club on club.id=t.club_id and club.owner_user_id=t.user_id
      where t.converted_at is null and t.expires_at<=clock_timestamp()
        and club.is_ai is false and club.club_type='main' and club.deleted_at is null
      order by t.expires_at,club.id
      limit greatest(1,least(coalesce(p_max_clubs,5),20))
      for update of t skip locked
  loop
    v_candidates:=v_candidates||jsonb_build_array(jsonb_build_object(
      'club_id',c.id,'name',c.name,'expires_at',c.expires_at,'tier',c.tier));
    if p_dry_run then continue; end if;
    -- A malformed or moved trial is never retired by this routine.
    if c.tier<>'amateur' or c.world_tier<>4 or c.amateur_division is null then
      v_deferred:=v_deferred||jsonb_build_array(jsonb_build_object('club_id',c.id,'reason','unexpected_trial_division'));
      continue;
    end if;
    perform pg_advisory_xact_lock(hashtextextended('saturn-test-division:'||c.world_tier::text||':'||c.amateur_division,23));
    perform 1 from public.clubs club where club.id=c.id
      and club.owner_user_id=c.owner_user_id and club.is_ai is false
      and club.club_type='main' and club.deleted_at is null
      and club.world_tier=c.world_tier and club.amateur_division=c.amateur_division
      for update;
    if not found then continue; end if;
    if not exists(select 1 from public.saturn_test_accounts_v1 t
      where t.user_id=c.owner_user_id and t.club_id=c.id
       and t.converted_at is null and t.expires_at<=clock_timestamp()) then continue; end if;

    v_tier:=c.tier;
    v_division:=case v_tier
      when 'worldteam' then 'WORLD'
      when 'proteam' then c.tier2_division
      when 'continental' then c.tier3_division
      when 'amateur' then c.amateur_division end;
    if v_division is null or v_tier not in ('worldteam','proteam','continental','amateur') then
      raise exception 'No valid competition for inactive human club %. No removal performed',c.id;
    end if;

    select array_agg(id) into v_related_clubs
      from public.clubs where (id=c.id or parent_club_id=c.id) and is_ai=false;
    v_related_clubs:=coalesce(v_related_clubs,array[c.id]);
    v_rider_count:=0;
    v_staff_count:=0;

    -- Never change a started or locked race. Lock relevant race rows before
    -- cancelling future entries, and retain all finished race history.
    perform 1 from public.races race
    where race.status in ('draft','scheduled','active')
      and (exists(select 1 from public.race_team_entries e where e.race_id=race.id and (e.club_id=any(v_related_clubs) or e.participating_club_id=any(v_related_clubs)))
        or exists(select 1 from public.race_team_applications a where a.race_id=race.id and a.team_id=any(v_related_clubs))
        or exists(select 1 from public.race_participant_teams p where p.race_id=race.id and p.team_id=any(v_related_clubs))
        or exists(select 1 from public.race_preparations p where p.race_id=race.id and (p.club_id=any(v_related_clubs) or p.participating_club_id=any(v_related_clubs))))
    order by race.id for update;
    if exists(select 1 from public.races race where race.status in ('active','scheduled','draft') and
      (race.status='active' or race.start_date<=v_game) and
      (exists(select 1 from public.race_team_entries e where e.race_id=race.id and e.status in ('applied','under_review','provisionally_accepted','accepted','confirmed') and (e.club_id=any(v_related_clubs) or e.participating_club_id=any(v_related_clubs)))
      or exists(select 1 from public.race_team_applications a where a.race_id=race.id and a.application_status in ('submitted','accepted','waitlisted') and a.team_id=any(v_related_clubs))
      or exists(select 1 from public.race_participant_teams p where p.race_id=race.id and p.status in ('applied','accepted') and p.team_id=any(v_related_clubs))
      or exists(select 1 from public.race_preparations p where p.race_id=race.id and p.status<>'cancelled' and (p.club_id=any(v_related_clubs) or p.participating_club_id=any(v_related_clubs))))) then
      v_deferred:=v_deferred||jsonb_build_array(jsonb_build_object('club_id',c.id,'reason','race_in_progress_or_due'));
      continue;
    end if;
    -- Select only a safe existing reserve from the same region; never steal
    -- an incumbent competition team or create a replacement placeholder.
    select ai.id into v_ai from public.clubs ai
    where ai.is_ai is true and ai.owner_user_id is null and ai.deleted_at is null and ai.is_active
      and ai.club_type='main' and ai.club_tier='continental' and ai.tier3_division='ai_pool'
      and public.safe_get_amateur_division_for_country(ai.country_code)=v_division
      and not public.is_national_team_club_v1(ai.id)
      and not exists(select 1 from public.race_team_entries e where e.club_id=ai.id or e.participating_club_id=ai.id)
      and not exists(select 1 from public.race_team_applications a where a.team_id=ai.id)
      and not exists(select 1 from public.race_participant_teams p where p.team_id=ai.id)
      and not exists(select 1 from public.race_participant_teams_v1 p where p.club_id=ai.id or p.owner_club_id=ai.id or p.participating_club_id=ai.id)
      and (select count(*) from public.club_riders cr join public.riders rd on rd.id=cr.rider_id where cr.club_id=ai.id and rd.availability_status is distinct from 'retired')>=8
    order by ai.id limit 1 for update of ai skip locked;
    if v_ai is null then
      v_deferred:=v_deferred||jsonb_build_array(jsonb_build_object('club_id',c.id,'reason','no_safe_regional_ai_reserve'));
      continue;
    end if;
    select count(*) into v_old_occupancy from public.clubs where club_type='main' and club_tier='amateur'
      and world_tier=c.world_tier and amateur_division=v_division and deleted_at is null and is_active;
    -- Future entries only. Completed race snapshots and results are untouched.
    update public.race_team_entries e set status='withdrawn',decision_reason='Test account expired',withdrawn_at=now(),updated_at=now()
      from public.races race where race.id=e.race_id and race.status in ('scheduled','draft') and race.start_date>v_game
        and (e.club_id=any(v_related_clubs) or e.participating_club_id=any(v_related_clubs)) and e.status in ('applied','under_review','provisionally_accepted','accepted','confirmed');
    update public.race_team_applications a set application_status='withdrawn',withdrawn_game_date=v_game,updated_at=now()
      from public.races race where race.id=a.race_id and race.status in ('scheduled','draft') and race.start_date>v_game
        and a.team_id=any(v_related_clubs) and a.application_status in ('draft','submitted','accepted','waitlisted');
    update public.race_participant_teams p set status='withdrawn'
      from public.races race where race.id=p.race_id and race.status in ('scheduled','draft') and race.start_date>v_game
        and p.team_id=any(v_related_clubs) and p.status in ('applied','accepted');
    update public.race_preparations p set status='cancelled',updated_at=now()
      from public.races race where race.id=p.race_id and race.status in ('scheduled','draft') and race.start_date>v_game
        and (p.club_id=any(v_related_clubs) or p.participating_club_id=any(v_related_clubs)) and p.status<>'cancelled';
    delete from public.race_participant_riders p using public.races race
      where race.id=p.race_id and race.status in ('scheduled','draft') and race.start_date>v_game
      and p.team_id=any(v_related_clubs);

    -- Close the player-owned competition slot, but preserve historical club
    -- identity/results. On failure of subsequent AI fill all changes roll back.
    update public.clubs
    set deleted_at=coalesce(deleted_at,now()),is_active=false,owner_user_id=null,
        inactivity_status='closed',season_end_transition_pending=false,
        inactivity_season_end_action=null,
        inactivity_reason='saturn_14_day_trial_expired',
        archived_at=coalesce(archived_at,now()),updated_at=now()
    where id=c.id and is_ai=false and deleted_at is null;

    update public.clubs set club_tier='amateur',world_tier=c.world_tier,
      tier2_division=null,tier3_division=null,amateur_division=v_division,
      season_points=0,updated_at=now()
    where id=v_ai and is_ai is true and owner_user_id is null and tier3_division='ai_pool';
    if not found then raise exception 'Reserved AI team unavailable'; end if;
    if (select count(*) from public.clubs where club_type='main' and club_tier='amateur'
        and world_tier=c.world_tier and amateur_division=v_division and deleted_at is null and is_active)<>v_old_occupancy then
      raise exception 'Trial retirement would change division occupancy';
    end if;
    v_fill:=jsonb_build_object('moved',1,'club_id',v_ai,'target_division',v_division);

    update public.club_staff
    set is_active=false,contract_expires_at=v_game,
        notes=coalesce(notes,'{}'::jsonb)||jsonb_build_object('ended_reason','saturn_trial_expired'),
        updated_at=now()
    where club_id=any(v_related_clubs) and is_active=true;
    get diagnostics v_staff_count=row_count;

    -- Preserve rider identities and past results. End active obligations and
    -- return released riders to the standard free-agent market.
    for rr in
      select distinct rd.id as rider_id,rd.birth_date,rd.overall,rd.potential,
             rd.salary,rd.availability_status,cr.club_id as former_club
      from public.club_riders cr
      join public.riders rd on rd.id=cr.rider_id
      where cr.club_id=any(v_related_clubs)
    loop
      update public.rider_contracts
      set status='terminated',notes_json=coalesce(notes_json,'{}'::jsonb)||
          jsonb_build_object('terminated_reason','saturn_trial_expired'),
          updated_at=now()
      where rider_id=rr.rider_id and club_id=any(v_related_clubs) and status='active';

      update public.rider_payroll_state
      set payroll_status=case
        when coalesce(outstanding_salary_debt,0)+coalesce(outstanding_breach_fine,0)>0
          then 'released_unpaid'::public.rider_payroll_status
        else 'settled'::public.rider_payroll_status end,
        settled_at=case when coalesce(outstanding_salary_debt,0)+
          coalesce(outstanding_breach_fine,0)=0 then now() else settled_at end,
        updated_at=now()
      where rider_id=rr.rider_id and club_id=any(v_related_clubs) and payroll_status='active';

      delete from public.club_riders
      where rider_id=rr.rider_id and club_id=any(v_related_clubs);
      v_rider_count:=v_rider_count+1;

      if rr.availability_status<>'retired'
        and not exists(select 1 from public.club_riders x where x.rider_id=rr.rider_id)
        and not exists(select 1 from public.rider_contracts ct where ct.rider_id=rr.rider_id and ct.status='active')
      then
        v_expected:=greatest(coalesce(rr.salary,0),250);
        v_min:=greatest(floor(v_expected*.90)::integer,100);
        v_duration:=public.suggest_initial_contract_seasons(
          coalesce(public.get_age_years_on_game_date(rr.birth_date),25),
          coalesce(rr.overall,50)::smallint,coalesce(rr.potential,50)::smallint);
        insert into public.rider_free_agents(
          rider_id,source_type,source_club_id,desired_tier,
          expected_salary_weekly,min_acceptable_salary_weekly,
          preferred_duration_seasons,available_from_game_date,
          expires_on_game_date,status
        ) values(
          rr.rider_id,'club_removed',rr.former_club,
          case v_tier when 'amateur' then 'amateur'
                      when 'continental' then 'continental' else 'proteam' end,
          v_expected,v_min,v_duration,v_game,v_game+30,'available'
        )
        on conflict on constraint rider_free_agents_rider_id_key
        do update set source_type='club_removed',
          source_club_id=excluded.source_club_id,desired_tier=excluded.desired_tier,
          expected_salary_weekly=excluded.expected_salary_weekly,
          min_acceptable_salary_weekly=excluded.min_acceptable_salary_weekly,
          preferred_duration_seasons=excluded.preferred_duration_seasons,
          available_from_game_date=excluded.available_from_game_date,
          expires_on_game_date=excluded.expires_on_game_date,status='available',
          updated_at=now();

        update public.rider_transfer_listings set status='expired'
        where rider_id=rr.rider_id and status in ('listed','club_accepted');
        update public.rider_transfer_offers set status='expired'
        where rider_id=rr.rider_id and status in ('open','club_accepted');
        update public.rider_transfer_negotiations set status='expired'
        where rider_id=rr.rider_id and status in ('open','accepted');
        delete from public.rider_free_agent_negotiations n using public.rider_free_agents fa
        where fa.rider_id=rr.rider_id and n.free_agent_id=fa.id;
      end if;
      perform public.sync_rider_contract_snapshot(rr.rider_id);
    end loop;

    update public.clubs
    set deleted_at=coalesce(deleted_at,now()),is_active=false,owner_user_id=null,
        inactivity_status='closed',season_end_transition_pending=false,
        inactivity_season_end_action=null,
        inactivity_reason='parent_saturn_trial_expired',
        archived_at=coalesce(archived_at,now()),updated_at=now()
    where parent_club_id=c.id and is_ai=false and deleted_at is null;

    -- Retain the lifecycle tombstone to prevent a second trial or late conversion.
    -- Remove membership and revoke anonymous sessions, keeping immutable history.
    delete from public.club_memberships where club_id=any(v_related_clubs) and user_id=c.owner_user_id;
    delete from private.saturn_approved_testers_v1 where user_id=c.owner_user_id;
    delete from auth.sessions where user_id=c.owner_user_id
      and exists(select 1 from auth.users u where u.id=c.owner_user_id and u.is_anonymous is true);

    update public.profiles
    set team_archived_at=coalesce(team_archived_at,now()),updated_at=now()
    where id=c.owner_user_id;

    insert into public.user_team_inactivity_events(
      user_id,club_id,previous_status,new_status,days_inactive,reason,metadata)
    values(c.owner_user_id,c.id,'season_end_removal_pending','closed',
           c.inactive_real_days,'saturn_14_day_trial_expired',
           jsonb_build_object('ai_replacement',v_fill,'game_date',v_game,
                             'riders_released',v_rider_count,'staff_released',v_staff_count));

    v_removed:=v_removed+1;
    v_replaced:=v_replaced+1;
    v_processed:=v_processed||jsonb_build_array(jsonb_build_object(
      'club_id',c.id,'club_name',c.name,'riders_released',v_rider_count,
      'staff_released',v_staff_count,'ai_replacement',v_fill));
  end loop;

  return jsonb_build_object('dry_run',p_dry_run,'candidates',v_candidates,
    'clubs_removed',v_removed,'ai_replacements',v_replaced,'completed',v_processed,'deferred',v_deferred);
end;
$function$
;