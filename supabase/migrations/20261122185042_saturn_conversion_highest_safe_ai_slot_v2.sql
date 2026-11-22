-- Conversion uses a competition-safe AI swap, preserving both source and destination cohorts.
CREATE OR REPLACE FUNCTION public.saturn_place_converted_test_team_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_trial record;
  v_club record;
  v_destination record;
  v_original_priority integer;
  v_dest_division text;
  v_occupied integer;
  v_global_top3_occupied integer;
  v_live_max_teams integer;
  v_race_pending boolean := false;
  v_reserve uuid;
  v_source_count integer;
  v_target_count integer;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;
  if not exists (
    select 1 from auth.users u
    where u.id=v_uid and u.is_anonymous is false
  ) then
    raise exception 'Verify your permanent account first' using errcode='42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('saturn-converted-owner:'||v_uid::text,49)
  );

  select t.club_id,t.converted_at into v_trial
    from public.saturn_test_accounts_v1 t
    where t.user_id=v_uid for update;
  if not found or v_trial.converted_at is null then
    raise exception 'Original trial has not been permanently converted'
      using errcode='42501';
  end if;

  select c.id,c.owner_user_id,c.country_code,c.club_tier,c.world_tier,
         c.tier2_division,c.tier3_division,c.amateur_division
    into v_club
    from public.clubs c
    where c.id=v_trial.club_id
      and c.owner_user_id=v_uid
      and c.club_type='main' and c.is_ai is false
      and c.is_active is true and c.deleted_at is null
    for update;
  if not found or not exists (
    select 1 from public.club_memberships m
    where m.club_id=v_trial.club_id and m.user_id=v_uid and m.role='owner'
  ) then
    raise exception 'Converted team ownership could not be verified'
      using errcode='42501';
  end if;

  -- Retry after a completed promotion must be safe and idempotent.
  -- A single conversion cannot repeatedly jump higher leagues as vacancies
  -- emerge, even from a second browser/session.
  if exists (
    select 1 from private.saturn_converted_team_placements_v1 p
    where p.user_id=v_uid and p.club_id=v_club.id
  ) then
    return jsonb_build_object('placed',false,
      'status','already_placed','club_id',v_club.id);
  end if;

  -- All applied season transitions and race participation refer to a stable
  -- team/league. Never change category while the transition is armed.
  if public.season_transition_guard_active_v1()
     or exists (
       select 1 from public.season_transition_control_v1 s
       where s.id=true and s.is_armed is true
     )
  then
    return jsonb_build_object('placed',false,'status','season_transition_pending',
      'club_id',v_club.id);
  end if;

  -- A team with ANY unresolved application/entry/participation in EITHER
  -- race system cannot change tier mid-competition. Historic records remain
  -- intact; finished/cancelled races alone do not block the move.
  select (
    exists(
      select 1 from public.race_team_entries e
      left join public.races r on r.id=e.race_id
      where (e.club_id=v_club.id or e.participating_club_id=v_club.id)
        and coalesce(r.status,'unknown') not in ('completed','finished','cancelled')
    )
    or exists(
      select 1 from public.race_team_applications a
      left join public.races r on r.id=a.race_id
      where a.team_id=v_club.id
        and coalesce(r.status,'unknown') not in ('completed','finished','cancelled')
    )
    or exists(
      select 1 from public.race_participant_teams p
      left join public.races r on r.id=p.race_id
      where p.team_id=v_club.id
        and coalesce(r.status,'unknown') not in ('completed','finished','cancelled')
    )
    or exists(
      select 1 from public.race_participant_teams_v1 p
      left join public.races r on r.id=p.race_id
      where (p.club_id=v_club.id or p.owner_club_id=v_club.id
         or p.participating_club_id=v_club.id)
        and coalesce(r.status,'unknown') not in ('completed','finished','cancelled')
    )
  ) into v_race_pending;
  if v_race_pending then
    return jsonb_build_object('placed',false,'status','race_commitment_pending',
      'club_id',v_club.id);
  end if;

  -- Only converted guest clubs in the original amateur division are eligible.
  if v_club.club_tier<>'amateur' or v_club.amateur_division is null then
    return jsonb_build_object('placed',false,'status','not_original_amateur_division','club_id',v_club.id);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('saturn-conversion-ai-swap-v2',53));
  perform pg_advisory_xact_lock(hashtextextended('saturn-test-division:'||v_club.world_tier::text||':'||v_club.amateur_division,23));

  -- First ensure the departing club's slot can be restored by a safe regional reserve.
  select a.id into v_reserve from public.clubs a
    where a.is_ai and a.owner_user_id is null and a.is_active and a.deleted_at is null and a.club_type='main'
      and a.club_tier='continental' and a.tier3_division='ai_pool'
      and public.safe_get_amateur_division_for_country(a.country_code)=v_club.amateur_division
      and not public.is_national_team_club_v1(a.id)
      and not exists(select 1 from public.race_team_entries e where e.club_id=a.id or e.participating_club_id=a.id)
      and not exists(select 1 from public.race_team_applications a where a.team_id=a.id)
      and not exists(select 1 from public.race_participant_teams p where p.team_id=a.id)
      and not exists(select 1 from public.race_participant_teams_v1 p where p.club_id=a.id or p.owner_club_id=a.id or p.participating_club_id=a.id)
      and not exists(select 1 from public.race_preparations p where p.club_id=a.id or p.participating_club_id=a.id)
      and (select count(*) from public.club_riders cr join public.riders r on r.id=cr.rider_id where cr.club_id=a.id and r.availability_status is distinct from 'retired')>=8
    order by a.id limit 1 for update of a;
  if v_reserve is null then return jsonb_build_object('placed',false,'status','no_safe_regional_ai_reserve','club_id',v_club.id); end if;

  -- Same sporting category priority as normal registration, then highest world tier.
  -- Skip AI with any race records; retain all historic data and identities.
  select a.id,a.club_tier,a.world_tier,a.tier2_division,a.tier3_division,a.amateur_division
    into v_destination from public.clubs a
    where a.is_ai and a.owner_user_id is null and a.is_active and a.deleted_at is null and a.club_type='main'
      and a.club_tier in ('worldteam','proteam','continental')
      and not (a.club_tier='continental' and a.tier3_division='ai_pool')
      and (a.club_tier='worldteam'
        or (a.club_tier='proteam' and a.tier2_division=public.get_expected_tier2_division_for_country(v_club.country_code))
        or (a.club_tier='continental' and a.tier3_division=public.get_expected_tier3_division_for_country(v_club.country_code)))
      and not public.is_national_team_club_v1(a.id)
      and not exists(select 1 from public.race_team_entries e where e.club_id=a.id or e.participating_club_id=a.id)
      and not exists(select 1 from public.race_team_applications a where a.team_id=a.id)
      and not exists(select 1 from public.race_participant_teams p where p.team_id=a.id)
      and not exists(select 1 from public.race_participant_teams_v1 p where p.club_id=a.id or p.owner_club_id=a.id or p.participating_club_id=a.id)
      and not exists(select 1 from public.race_preparations p where p.club_id=a.id or p.participating_club_id=a.id)
    order by case a.club_tier when 'worldteam' then 1 when 'proteam' then 2 else 3 end,
       a.world_tier,coalesce(a.season_points,0),a.name,a.id
    limit 1 for update of a skip locked;
  if not found then return jsonb_build_object('placed',false,'status','no_safe_higher_ai_slot','club_id',v_club.id); end if;
  v_dest_division:=case v_destination.club_tier when 'worldteam' then '-' when 'proteam' then v_destination.tier2_division else v_destination.tier3_division end;
  perform pg_advisory_xact_lock(hashtextextended('saturn-top3-global:'||v_destination.club_tier::text||':'||v_dest_division,52));
  select count(*) into v_source_count from public.clubs where club_type='main' and is_active and deleted_at is null
    and club_tier=v_club.club_tier and world_tier=v_club.world_tier and amateur_division=v_club.amateur_division;
  select count(*) into v_target_count from public.clubs where club_type='main' and is_active and deleted_at is null
    and club_tier=v_destination.club_tier and world_tier=v_destination.world_tier
    and (case club_tier when 'worldteam' then '-' when 'proteam' then tier2_division else tier3_division end)=v_dest_division;

  update public.clubs set club_tier='continental',world_tier=3,tier2_division=null,tier3_division='ai_pool',amateur_division=null,updated_at=now()
    where id=v_destination.id and is_ai and owner_user_id is null and deleted_at is null;
  if not found then raise exception 'AI replacement no longer available'; end if;
  insert into private.saturn_converted_team_update_tickets_v1(transaction_id,user_id,club_id,from_club_tier,from_world_tier,to_club_tier,to_world_tier,to_region)
    values(txid_current(),v_uid,v_club.id,v_club.club_tier,v_club.world_tier,v_destination.club_tier,v_destination.world_tier,v_dest_division);
  update public.clubs set club_tier=v_destination.club_tier,world_tier=v_destination.world_tier,tier2_division=v_destination.tier2_division,
    tier3_division=v_destination.tier3_division,amateur_division=null,updated_at=now()
    where id=v_club.id and owner_user_id=v_uid and is_ai is false and deleted_at is null;
  if not found then raise exception 'Converted team changed during placement';end if;
  delete from private.saturn_converted_team_update_tickets_v1 where transaction_id=txid_current() and user_id=v_uid and club_id=v_club.id;
  update public.clubs set club_tier=v_club.club_tier,world_tier=v_club.world_tier,tier2_division=null,tier3_division=null,amateur_division=v_club.amateur_division,updated_at=now()
    where id=v_reserve and is_ai and owner_user_id is null and tier3_division='ai_pool';
  if not found then raise exception 'Regional reserve no longer available'; end if;
  if (select count(*) from public.clubs where club_type='main' and is_active and deleted_at is null and club_tier=v_club.club_tier and world_tier=v_club.world_tier and amateur_division=v_club.amateur_division)<>v_source_count
    or (select count(*) from public.clubs where club_type='main' and is_active and deleted_at is null and club_tier=v_destination.club_tier and world_tier=v_destination.world_tier and (case club_tier when 'worldteam' then '-' when 'proteam' then tier2_division else tier3_division end)=v_dest_division)<>v_target_count
    then raise exception 'Conversion placement changed league capacity'; end if;

  insert into private.saturn_converted_team_placements_v1(user_id,club_id,from_club_tier,from_world_tier,to_club_tier,to_world_tier,to_region)
    values(v_uid,v_club.id,v_club.club_tier,v_club.world_tier,v_destination.club_tier,v_destination.world_tier,v_dest_division);
  return jsonb_build_object('placed',true,'status','moved_to_ai_slot','club_id',v_club.id,'club_tier',v_destination.club_tier,'world_tier',v_destination.world_tier,'region',v_dest_division,'displaced_ai_id',v_destination.id,'restored_ai_id',v_reserve);
end;
$function$;
