-- Project Saturn SAT-03: converted test-team vacant-slot reassignment.
-- REVIEW-ONLY. Do not apply in production until simulated race/season checks.
-- No AI or human club is evicted. This function never mutates race/finance,
-- points, riders, owner user or Premium clocks.
-- It REQUIRES explicitly approved world-tier/category/region capacities.
-- With no approved capacities, the result is 'pending'; no move occurs.

create table if not exists private.saturn_converted_vacancy_caps_v1 (
  world_tier smallint not null check(world_tier between 1 and 10),
  club_tier public.club_tier not null,
  region_code text not null,
  max_teams integer not null check(max_teams > 0),
  approved_at timestamptz not null,
  enabled boolean not null default false,
  reason text not null default 'Not authorized until division and season integrity reviewed',
  primary key(world_tier,club_tier,region_code),
  constraint saturn_conversion_region_sanity check (
    (club_tier='worldteam'::public.club_tier and region_code='-')
    or (club_tier<>'worldteam'::public.club_tier and region_code<>'-'
        and btrim(region_code)<>'')
  )
);
alter table private.saturn_converted_vacancy_caps_v1 enable row level security;
revoke all on private.saturn_converted_vacancy_caps_v1 from public,anon,authenticated;

-- Durable conversion-placement audit. One successful placement per
-- converted original team, even if a more attractive slot opens later.
-- No browser access or updates to this record.
create table if not exists private.saturn_converted_team_placements_v1 (
  user_id uuid primary key references auth.users(id),
  club_id uuid not null unique references public.clubs(id),
  from_club_tier public.club_tier not null,
  from_world_tier smallint not null,
  to_club_tier public.club_tier not null,
  to_world_tier smallint not null,
  to_region text not null,
  placed_at timestamptz not null default now()
);
alter table private.saturn_converted_team_placements_v1 enable row level security;
revoke all on table private.saturn_converted_team_placements_v1
  from public, anon, authenticated;

-- A narrow, private ticket suppresses the existing global TOP-3 AI
-- overflow rebalance trigger for exactly ONE reviewed conversion UPDATE.
-- The placement RPC itself proves league vacancies; it must never cause
-- unrelated historical AI clubs to move into the reserve pool.
create table if not exists private.saturn_converted_team_update_tickets_v1 (
  transaction_id bigint not null,
  user_id uuid not null,
  club_id uuid not null,
  from_club_tier public.club_tier not null,
  from_world_tier smallint not null,
  to_club_tier public.club_tier not null,
  to_world_tier smallint not null,
  to_region text not null,
  primary key(transaction_id,club_id)
);
alter table private.saturn_converted_team_update_tickets_v1
  enable row level security;
revoke all on table private.saturn_converted_team_update_tickets_v1
  from public,anon,authenticated;

-- Preserve normal team onboarding/rebalancing for EVERY ordinary mutation.
-- Only a privileged Saturn transaction with the exact original owner,
-- original/destination tier and region is exempted from this specific
-- global rebalancing trigger.
create or replace function public.trg_rebalance_top3_overflow_ai_to_pool_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $saturn$
begin
  -- This trigger also runs on INSERT. OLD is only defined for UPDATE;
  -- don't even evaluate its fields for normal new permanent clubs.
  if tg_op='UPDATE' then
  if new.club_type='main'
     and new.is_ai is false
     and new.owner_user_id is not null
     and new.deleted_at is null
     and new.club_tier in ('worldteam','proteam','continental')
     and exists (
       select 1 from private.saturn_converted_team_update_tickets_v1 t
       where t.transaction_id=txid_current()
         and t.user_id=auth.uid()
         and t.club_id=new.id
         and old.owner_user_id=t.user_id
         and new.owner_user_id=t.user_id
         and old.club_tier=t.from_club_tier
         and old.world_tier=t.from_world_tier
         and new.club_tier=t.to_club_tier
         and new.world_tier=t.to_world_tier
         and (case new.club_tier
           when 'worldteam'::public.club_tier then '-'
           when 'proteam'::public.club_tier then new.tier2_division
           when 'continental'::public.club_tier then new.tier3_division
           else null end)=t.to_region
     )
  then
    return new;
  end if;
  end if;

  -- Original production trigger behavior for all other top-three human
  -- team INSERTs and tier changes.
  if new.club_type='main'
     and coalesce(new.is_ai,false)=false
     and new.owner_user_id is not null
     and new.deleted_at is null
     and coalesce(new.inactivity_status,'active') <> 'season_end_removal_pending'
     and new.club_tier in ('worldteam','proteam','continental')
  then
    perform public.rebalance_top3_overflow_ai_to_pool_v1(
      'real_club_top3_trigger_guard'
    );
  end if;
  return new;
end;
$saturn$;
revoke all on function public.trg_rebalance_top3_overflow_ai_to_pool_v1()
  from public,anon,authenticated;

-- Caller can only ask to place their OWN original trial club, after
-- verified conversion. The function chooses destination exclusively from
-- approved capacity and server country->regional-division mappings.
create or replace function public.saturn_place_converted_test_team_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $saturn$
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

  v_original_priority := (
    case v_club.club_tier
      when 'worldteam'::public.club_tier then 1
      when 'proteam'::public.club_tier then 2
      when 'continental'::public.club_tier then 3
      when 'amateur'::public.club_tier then 4
      else 99
    end
  ) * 100 + v_club.world_tier;

  -- Priorities are worldteam, proteam, continental, amateur; within each
  -- category lower world_tier is higher. Only approved matching regions.
  for v_destination in
    select cap.world_tier,cap.club_tier,cap.region_code,cap.max_teams
    from private.saturn_converted_vacancy_caps_v1 cap
    where cap.enabled=true and cap.approved_at is not null
      and (
        case cap.club_tier
          when 'worldteam'::public.club_tier then 1
          when 'proteam'::public.club_tier then 2
          when 'continental'::public.club_tier then 3
          when 'amateur'::public.club_tier then 4
          else 99
        end
      ) * 100 + cap.world_tier < v_original_priority
    order by
      case cap.club_tier
        when 'worldteam'::public.club_tier then 1
        when 'proteam'::public.club_tier then 2
        when 'continental'::public.club_tier then 3
        when 'amateur'::public.club_tier then 4
        else 99
      end,
      cap.world_tier
  loop
    v_dest_division :=
      case v_destination.club_tier
        when 'worldteam'::public.club_tier then '-'
        when 'proteam'::public.club_tier then
          public.get_expected_tier2_division_for_country(v_club.country_code)
        when 'continental'::public.club_tier then
          public.get_expected_tier3_division_for_country(v_club.country_code)
        when 'amateur'::public.club_tier then
          public.safe_get_amateur_division_for_country(v_club.country_code)
        else null
      end;
    if v_dest_division is null or v_dest_division<>v_destination.region_code then
      continue;
    end if;

    -- Never create an invented competition solely because an admin capacity
    -- row was entered incorrectly. The exact category/tier/region must
    -- already contain an active official main-club league cohort.
    if not exists(
      select 1 from public.clubs league
      where league.club_type='main' and league.is_active=true
        and league.deleted_at is null
        and league.world_tier=v_destination.world_tier
        and league.club_tier=v_destination.club_tier
        and (case league.club_tier
          when 'worldteam'::public.club_tier then '-'
          when 'proteam'::public.club_tier then league.tier2_division
          when 'continental'::public.club_tier then league.tier3_division
          when 'amateur'::public.club_tier then league.amateur_division
          else null end)=v_destination.region_code
    ) then
      continue;
    end if;

    -- Lock each actual vacancy pool for all concurrent conversions. Capacity
    -- is a HARD ceiling: no AI swap and no incumbents are moved or deleted.
    perform pg_advisory_xact_lock(hashtextextended(
      'saturn-converted-slot:'||v_destination.world_tier::text||':'||
        v_destination.club_tier::text||':'||v_destination.region_code,51));

    -- The legacy TOP-3 overflow rebalance groups all world tiers together
    -- (WorldTeam globally; ProTeam/Continental by their regional code) and
    -- automatically moves AI clubs if a cohort exceeds 25. Never cross that
    -- hard global limit or trigger unrelated AI relocation. The advisory
    -- lock spans ALL world tiers sharing the same division cohort.
    if v_destination.club_tier in (
      'worldteam'::public.club_tier,'proteam'::public.club_tier,
      'continental'::public.club_tier
    ) then
      perform pg_advisory_xact_lock(hashtextextended(
        'saturn-top3-global:'||v_destination.club_tier::text||':'||
          v_destination.region_code,52
      ));
      select count(*) into v_global_top3_occupied
      from public.clubs c
      where c.deleted_at is null and c.club_type='main'
        and c.club_tier=v_destination.club_tier
        and (case c.club_tier
          when 'worldteam'::public.club_tier then '-'
          when 'proteam'::public.club_tier then c.tier2_division
          when 'continental'::public.club_tier then c.tier3_division
          else null end)=v_destination.region_code;
      if v_global_top3_occupied >= 25 then continue; end if;
    end if;

    -- Confirm capacity is still enabled under a row lock (admins may close
    -- allocations while the conversion is processing).
    select cap.max_teams into v_live_max_teams
      from private.saturn_converted_vacancy_caps_v1 cap
      where cap.world_tier=v_destination.world_tier
        and cap.club_tier=v_destination.club_tier
        and cap.region_code=v_destination.region_code
        and cap.enabled=true and cap.approved_at is not null
      for update;
    if not found or v_live_max_teams is null then continue; end if;

    select count(*) into v_occupied from public.clubs c
    where c.deleted_at is null and c.is_active=true and c.club_type='main'
      and c.world_tier=v_destination.world_tier
      and c.club_tier=v_destination.club_tier
      and (case c.club_tier
        when 'worldteam'::public.club_tier then '-'
        when 'proteam'::public.club_tier then c.tier2_division
        when 'continental'::public.club_tier then c.tier3_division
        when 'amateur'::public.club_tier then c.amateur_division
        else null end) = v_destination.region_code;

    -- Use cap as freshly read under its row lock, not a stale earlier
    -- loop snapshot: an admin may have reduced or disabled capacity.
    if v_occupied >= v_live_max_teams then continue; end if;

    -- Only club placement columns change. No season_points, original club
    -- UUID, owner, roster, money, commitments or historic race rows change.
    -- Private ticket exists ONLY during this owner's exact conversion
    -- update. Prevents the global rebalance trigger from touching any AI.
    insert into private.saturn_converted_team_update_tickets_v1(
      transaction_id,user_id,club_id,from_club_tier,from_world_tier,
      to_club_tier,to_world_tier,to_region
    ) values(
      txid_current(),v_uid,v_club.id,v_club.club_tier,v_club.world_tier,
      v_destination.club_tier,v_destination.world_tier,v_dest_division
    );

    update public.clubs set
      club_tier=v_destination.club_tier,
      world_tier=v_destination.world_tier,
      tier2_division=case when v_destination.club_tier='proteam'::public.club_tier
        then v_dest_division else null end,
      tier3_division=case when v_destination.club_tier='continental'::public.club_tier
        then v_dest_division else null end,
      amateur_division=case when v_destination.club_tier='amateur'::public.club_tier
        then v_dest_division else null end,
      updated_at=now()
    where id=v_club.id and owner_user_id=v_uid
      and is_ai is false and deleted_at is null;
    if not found then
      raise exception 'Converted club changed during placement; transaction rolled back';
    end if;

    delete from private.saturn_converted_team_update_tickets_v1
    where transaction_id=txid_current()
      and user_id=v_uid and club_id=v_club.id;

    -- Successful placement and immutable audit commit atomically. A failed
    -- insert rolls the club tier update back in the SAME transaction.
    insert into private.saturn_converted_team_placements_v1(
      user_id,club_id,from_club_tier,from_world_tier,
      to_club_tier,to_world_tier,to_region
    ) values (
      v_uid,v_club.id,v_club.club_tier,v_club.world_tier,
      v_destination.club_tier,v_destination.world_tier,v_dest_division
    );

    return jsonb_build_object(
      'placed',true,'status','moved_to_approved_vacancy',
      'club_id',v_club.id,'club_tier',v_destination.club_tier::text,
      'world_tier',v_destination.world_tier,'region',v_dest_division);
  end loop;

  return jsonb_build_object('placed',false,
    'status','no_approved_higher_vacancy','club_id',v_club.id);
end;
$saturn$;

-- Safe to expose only to signed-in identities: this procedure validates
-- the original verified conversion, club ownership, races and hard capacity.
revoke all on function public.saturn_place_converted_test_team_v1()
  from public, anon, authenticated;
grant execute on function public.saturn_place_converted_test_team_v1()
  to authenticated;
