-- Human managers: 90 consecutive REAL days without any profile activity or
-- authentication sign-in. AI clubs are never retired or deleted.
-- Removal and AI replacement are atomic. All history is soft-retained.
create schema if not exists control_center_private;

create or replace function control_center_private.replace_90d_inactive_human_clubs_v1(
  p_dry_run boolean default true,
  p_max_clubs integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, control_center_private
as $body$
declare
  c record;
  rr record;
  v_club uuid;
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

  for c in
    select club.id,club.name,club.owner_user_id,club.club_tier::text tier,
           club.tier2_division,club.tier3_division,club.amateur_division,
           greatest(coalesce(pro.last_seen_at,club.created_at),
                    coalesce(pro.last_login_at,club.created_at),
                    coalesce(usr.last_sign_in_at,club.created_at)) last_activity,
           floor(extract(epoch from(now()-greatest(
                    coalesce(pro.last_seen_at,club.created_at),
                    coalesce(pro.last_login_at,club.created_at),
                    coalesce(usr.last_sign_in_at,club.created_at))))/86400)::integer inactive_real_days
    from public.clubs club
    join public.profiles pro on pro.id=club.owner_user_id
    left join auth.users usr on usr.id=club.owner_user_id
    where club.is_ai is false and club.club_type='main'
      and club.owner_user_id is not null and club.deleted_at is null
      and greatest(coalesce(pro.last_seen_at,club.created_at),
                    coalesce(pro.last_login_at,club.created_at),
                    coalesce(usr.last_sign_in_at,club.created_at))<=now()-interval '90 days'
    order by club.created_at,club.id
    limit greatest(1,least(coalesce(p_max_clubs,5),20))
    for update of club skip locked
  loop
    v_candidates:=v_candidates||jsonb_build_array(jsonb_build_object(
      'club_id',c.id,'name',c.name,'inactive_real_days',c.inactive_real_days,
      'last_activity',c.last_activity,'tier',c.tier));

    if p_dry_run then continue; end if;

    -- Repeat the eligibility predicate after locking the club to protect a
    -- manager who returned just before the daily processor.
    if not exists(
      select 1 from public.clubs club
      join public.profiles pro on pro.id=club.owner_user_id
      left join auth.users usr on usr.id=club.owner_user_id
      where club.id=c.id and club.is_ai is false and club.deleted_at is null
        and greatest(coalesce(pro.last_seen_at,club.created_at),
                     coalesce(pro.last_login_at,club.created_at),
                     coalesce(usr.last_sign_in_at,club.created_at))
             <=now()-interval '90 days'
    ) then continue; end if;

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
      from public.clubs where id=c.id or parent_club_id=c.id;
    v_related_clubs:=coalesce(v_related_clubs,array[c.id]);
    v_rider_count:=0;
    v_staff_count:=0;

    -- Close the player-owned competition slot, but preserve historical club
    -- identity/results. On failure of subsequent AI fill all changes roll back.
    update public.clubs
    set deleted_at=coalesce(deleted_at,now()),is_active=false,owner_user_id=null,
        inactivity_status='closed',season_end_transition_pending=false,
        inactivity_season_end_action=null,
        inactivity_reason='90_real_days_inactive_replaced_with_ai',
        archived_at=coalesce(archived_at,now()),updated_at=now()
    where id=c.id and is_ai=false and deleted_at is null;

    -- Refill the actual competition with an EXISTING curated AI team; never
    -- retire another AI team or create a placeholder.
    v_fill:=public.fill_competition_target_from_curated_ai_v2(
      v_tier,v_division,1,gen_random_uuid(),
      v_state.season_number,v_state.month_number,v_state.day_number,
      v_state.hour_number,v_state.minute_number
    );
    if coalesce((v_fill->>'moved')::integer,0)<>1 then
      raise exception 'No valid existing AI club to replace inactive human team % in %/%: %',
        c.name,v_tier,v_division,v_fill;
    end if;

    update public.club_staff
    set is_active=false,contract_expires_at=v_game,
        notes=coalesce(notes,'{}'::jsonb)||jsonb_build_object('ended_reason','90_real_days_inactive'),
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
          jsonb_build_object('terminated_reason','90_real_days_inactive'),
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
      where rider_id=rr.rider_id and club_id=any(v_related_clubs);

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
        inactivity_reason='parent_inactive_90_real_days',
        archived_at=coalesce(archived_at,now()),updated_at=now()
    where parent_club_id=c.id and is_ai=false and deleted_at is null;

    update public.profiles
    set team_archived_at=coalesce(team_archived_at,now()),updated_at=now()
    where id=c.owner_user_id;

    insert into public.user_team_inactivity_events(
      user_id,club_id,previous_status,new_status,days_inactive,reason,metadata)
    values(c.owner_user_id,c.id,'season_end_removal_pending','closed',
           c.inactive_real_days,'90_real_days_inactive_replaced_with_ai',
           jsonb_build_object('ai_replacement',v_fill,'game_date',v_game,
                             'riders_released',v_rider_count,'staff_released',v_staff_count));

    v_removed:=v_removed+1;
    v_replaced:=v_replaced+1;
    v_processed:=v_processed||jsonb_build_array(jsonb_build_object(
      'club_id',c.id,'club_name',c.name,'riders_released',v_rider_count,
      'staff_released',v_staff_count,'ai_replacement',v_fill));
  end loop;

  return jsonb_build_object('dry_run',p_dry_run,'candidates',v_candidates,
    'clubs_removed',v_removed,'ai_replacements',v_replaced,'completed',v_processed);
end;
$body$;
revoke all on function control_center_private.replace_90d_inactive_human_clubs_v1(boolean,integer)
from public,anon,authenticated;

select cron.schedule(
  'propeloton_replace_90d_inactive_human_clubs_daily',
  '20 6 * * *',
  $$select control_center_private.replace_90d_inactive_human_clubs_v1(false,5);$$
);
