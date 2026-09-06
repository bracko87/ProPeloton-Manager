create or replace function public.fill_race_ai_teams_v1(p_race_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_current record;
  v_race record;
  v_rule record;

  v_min_riders integer;
  v_target_teams integer;
  v_max_teams integer;
  v_existing_accepted integer;
  v_accepted_after_base integer;
  v_accepted_after integer;
  v_slots_to_fill integer;
  v_base_slots integer;
  v_extra_slots integer;

  v_base_inserted integer := 0;
  v_extra_inserted integer := 0;
  v_inserted integer := 0;
  v_assignment_result jsonb;
begin
  perform pg_advisory_xact_lock(
    hashtext('fill_race_ai_teams_v1'),
    hashtext(p_race_id::text)
  );

  select *
  into v_current
  from public.get_current_game_date_parts()
  limit 1;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'current_game_date_not_found'
    );
  end if;

  select *
  into v_race
  from public.races
  where id = p_race_id;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'race_not_found'
    );
  end if;

  select *
  into v_rule
  from public.race_entry_rules
  where race_id = p_race_id
  limit 1;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'race_entry_rules_not_found'
    );
  end if;

  v_min_riders := coalesce(v_rule.min_riders_per_team, 4);
  v_target_teams := coalesce(v_rule.target_teams, v_rule.min_teams, 12);
  v_max_teams := greatest(
    coalesce(v_rule.max_teams, v_target_teams),
    v_target_teams
  );

  select count(*)::integer
  into v_existing_accepted
  from public.race_team_entries
  where race_id = p_race_id
    and status = 'accepted';

  -- New policy: use all available field capacity, not only target_teams.
  v_slots_to_fill := greatest(0, v_max_teams - coalesce(v_existing_accepted, 0));

  if v_slots_to_fill <= 0 then
    select public.assign_ai_riders_to_race_v1(p_race_id)
    into v_assignment_result;

    return jsonb_build_object(
      'success', true,
      'race_id', p_race_id,
      'race_name', v_race.name,
      'target_teams', v_target_teams,
      'max_teams', v_max_teams,
      'existing_accepted', v_existing_accepted,
      'accepted_after_fill', v_existing_accepted,
      'ai_entries_added', 0,
      'base_ai_entries_added', 0,
      'extra_ai_entries_added', 0,
      'rider_assignment_result', v_assignment_result,
      'curated_ai_pool_only', true,
      'fill_policy', 'fill_to_max',
      'message', 'Race already has maximum number of accepted teams.'
    );
  end if;

  create temporary table if not exists pg_temp.race_ai_fill_candidates_v2 (
    club_id uuid primary key,
    club_name text,
    country_code text,
    club_tier text,
    world_tier integer,
    reputation numeric,
    is_national_team boolean,
    available_riders integer,
    geographic_priority integer
  ) on commit drop;

  truncate table pg_temp.race_ai_fill_candidates_v2;

  insert into pg_temp.race_ai_fill_candidates_v2 (
    club_id,
    club_name,
    country_code,
    club_tier,
    world_tier,
    reputation,
    is_national_team,
    available_riders,
    geographic_priority
  )
  select
    pool.id,
    pool.name,
    pool.country_code,
    pool.club_tier::text,
    pool.world_tier,
    pool.reputation,
    public.is_national_team_club_v1(pool.id),
    available.available_riders,
    public.race_ai_geographic_priority_v1(
      v_race.country_code,
      pool.country_code
    )
  from public.ai_competition_filler_club_pool_v1 pool
  cross join lateral (
    select count(*)::integer as available_riders
    from public.club_roster cr
    where cr.club_id = pool.id
      and public.roster_status_allows_race_selection_v1(cr.availability_status)
      and (
        public.is_national_team_club_v1(pool.id) is not true
        or upper(coalesce(cr.country_code, '')) = upper(coalesce(pool.country_code, ''))
      )
      and not exists (
        select 1
        from public.race_participant_riders existing_same
        where existing_same.race_id = p_race_id
          and existing_same.rider_id = cr.rider_id
      )
      and not exists (
        select 1
        from public.race_participant_riders existing_other
        join public.races other_race
          on other_race.id = existing_other.race_id
        where existing_other.rider_id = cr.rider_id
          and existing_other.race_id <> p_race_id
          and daterange(
            other_race.start_date,
            coalesce(other_race.end_date, other_race.start_date) + 1,
            '[)'
          ) && daterange(
            v_race.start_date,
            coalesce(v_race.end_date, v_race.start_date) + 1,
            '[)'
          )
      )
  ) available
  where coalesce(pool.is_active, true) is true
    and coalesce(pool.is_ai, true) is true
    and coalesce(pool.logo_path, '') <> ''
    and available.available_riders >= v_min_riders
    and not exists (
      select 1
      from public.race_team_entries rte
      where rte.race_id = p_race_id
        and rte.club_id = pool.id
    )
    and not exists (
      select 1
      from public.race_team_entries rte2
      join public.races r2
        on r2.id = rte2.race_id
      where rte2.club_id = pool.id
        and rte2.status = 'accepted'
        and r2.id <> p_race_id
        and daterange(
          r2.start_date,
          coalesce(r2.end_date, r2.start_date) + 1,
          '[)'
        ) && daterange(
          v_race.start_date,
          coalesce(v_race.end_date, v_race.start_date) + 1,
          '[)'
        )
    );

  -- Phase 1: preserve the existing target-field behaviour. This fills any
  -- shortage up to target_teams using the established category preference.
  v_base_slots := greatest(
    0,
    least(v_target_teams, v_max_teams) - coalesce(v_existing_accepted, 0)
  );

  if v_base_slots > 0 then
    with base_candidates as (
      select candidate.*
      from pg_temp.race_ai_fill_candidates_v2 candidate
      where not exists (
        select 1
        from public.race_team_entries rte
        where rte.race_id = p_race_id
          and rte.club_id = candidate.club_id
      )
      order by
        candidate.geographic_priority asc,
        case
          when v_race.category in ('1.UWT', '2.UWT') then coalesce(candidate.world_tier, 99)
          when v_race.category in ('1.Pro', '2.Pro') then abs(coalesce(candidate.world_tier, 3) - 2)
          when v_race.category in ('1.1', '2.1') then abs(coalesce(candidate.world_tier, 3) - 3)
          when v_race.category in ('1.2', '2.2') then abs(coalesce(candidate.world_tier, 4) - 4)
          else coalesce(candidate.world_tier, 99)
        end asc,
        candidate.available_riders desc,
        coalesce(candidate.reputation, 0) desc,
        candidate.club_id
      limit v_base_slots
    ),
    inserted as (
      insert into public.race_team_entries (
        id,
        race_id,
        club_id,
        participating_club_id,
        status,
        entry_source,
        is_ai_filler,
        auto_filled_at,
        commitment_score_snapshot,
        acceptance_score,
        review_round,
        decision_reason,
        reviewed_at,
        final_decision_at,
        created_at,
        updated_at
      )
      select
        gen_random_uuid(),
        p_race_id,
        club_id,
        club_id,
        'accepted',
        'ai_fill',
        true,
        now(),
        null,
        null,
        1,
        case
          when is_national_team then
            'AI National Team added from curated AI filler pool. National-team same-country rider rule enforced.'
          else
            'AI team added from curated AI filler pool to complete the normal target field.'
        end,
        now(),
        now(),
        now(),
        now()
      from base_candidates
      on conflict (race_id, club_id) do nothing
      returning id
    )
    select count(*)::integer
    into v_base_inserted
    from inserted;
  end if;

  select count(*)::integer
  into v_accepted_after_base
  from public.race_team_entries
  where race_id = p_race_id
    and status = 'accepted';

  -- Phase 2: use the difference between target and max as additional AI
  -- capacity. For 1.1/2.1 the extra mix is 1x Tier 1, 2x Tier 2, then Tier 3.
  -- For 1.2/2.2 it is 1x Tier 1, 2x Tier 3, then Tier 4.
  -- If a requested tier is unavailable, the remaining places fall back to
  -- the normal category preference so the field still reaches max when possible.
  v_extra_slots := greatest(0, v_max_teams - coalesce(v_accepted_after_base, 0));

  if v_extra_slots > 0 then
    with ranked_by_tier as (
      select
        candidate.*,
        row_number() over (
          partition by candidate.world_tier
          order by
            candidate.geographic_priority asc,
            candidate.available_riders desc,
            coalesce(candidate.reputation, 0) desc,
            candidate.club_id
        ) as tier_rank
      from pg_temp.race_ai_fill_candidates_v2 candidate
      where not exists (
        select 1
        from public.race_team_entries rte
        where rte.race_id = p_race_id
          and rte.club_id = candidate.club_id
      )
    ),
    extra_candidates as (
      select ranked.*
      from ranked_by_tier ranked
      order by
        case
          when v_race.category in ('1.1', '2.1')
               and ranked.world_tier = 1 and ranked.tier_rank <= 1 then 0
          when v_race.category in ('1.1', '2.1')
               and ranked.world_tier = 2 and ranked.tier_rank <= 2 then 1
          when v_race.category in ('1.1', '2.1')
               and ranked.world_tier = 3 then 2
          when v_race.category in ('1.1', '2.1') then 3

          when v_race.category in ('1.2', '2.2')
               and ranked.world_tier = 1 and ranked.tier_rank <= 1 then 0
          when v_race.category in ('1.2', '2.2')
               and ranked.world_tier = 3 and ranked.tier_rank <= 2 then 1
          when v_race.category in ('1.2', '2.2')
               and ranked.world_tier = 4 then 2
          when v_race.category in ('1.2', '2.2') then 3

          else 0
        end asc,
        case
          when v_race.category in ('1.UWT', '2.UWT') then coalesce(ranked.world_tier, 99)
          when v_race.category in ('1.Pro', '2.Pro') then abs(coalesce(ranked.world_tier, 3) - 2)
          when v_race.category in ('1.1', '2.1') then abs(coalesce(ranked.world_tier, 3) - 3)
          when v_race.category in ('1.2', '2.2') then abs(coalesce(ranked.world_tier, 4) - 4)
          else coalesce(ranked.world_tier, 99)
        end asc,
        ranked.geographic_priority asc,
        ranked.available_riders desc,
        coalesce(ranked.reputation, 0) desc,
        ranked.club_id
      limit v_extra_slots
    ),
    inserted as (
      insert into public.race_team_entries (
        id,
        race_id,
        club_id,
        participating_club_id,
        status,
        entry_source,
        is_ai_filler,
        auto_filled_at,
        commitment_score_snapshot,
        acceptance_score,
        review_round,
        decision_reason,
        reviewed_at,
        final_decision_at,
        created_at,
        updated_at
      )
      select
        gen_random_uuid(),
        p_race_id,
        club_id,
        club_id,
        'accepted',
        'ai_fill',
        true,
        now(),
        null,
        null,
        1,
        case
          when is_national_team then
            'AI National Team added from curated AI filler pool while filling the race to maximum field size. National-team same-country rider rule enforced.'
          else
            'AI team added from curated AI filler pool to use available field capacity up to the race maximum. Category tier-mix policy applied.'
        end,
        now(),
        now(),
        now(),
        now()
      from extra_candidates
      on conflict (race_id, club_id) do nothing
      returning id
    )
    select count(*)::integer
    into v_extra_inserted
    from inserted;
  end if;

  v_inserted := coalesce(v_base_inserted, 0) + coalesce(v_extra_inserted, 0);

  select public.assign_ai_riders_to_race_v1(p_race_id)
  into v_assignment_result;

  select count(*)::integer
  into v_accepted_after
  from public.race_team_entries
  where race_id = p_race_id
    and status = 'accepted';

  return jsonb_build_object(
    'success', true,
    'race_id', p_race_id,
    'race_name', v_race.name,
    'category', v_race.category,
    'target_teams', v_target_teams,
    'max_teams', v_max_teams,
    'existing_accepted_before_fill', v_existing_accepted,
    'slots_to_fill_to_max', v_slots_to_fill,
    'base_ai_entries_added', coalesce(v_base_inserted, 0),
    'extra_ai_entries_added', coalesce(v_extra_inserted, 0),
    'ai_entries_added', coalesce(v_inserted, 0),
    'accepted_after_fill', v_accepted_after,
    'remaining_capacity', greatest(0, v_max_teams - coalesce(v_accepted_after, 0)),
    'rider_assignment_result', v_assignment_result,
    'curated_ai_pool_only', true,
    'national_team_country_lock_enforced', true,
    'fill_policy', 'fill_to_max',
    'extra_tier_mix', case
      when v_race.category in ('1.1', '2.1') then '1x Tier 1 + 2x Tier 2 + remaining Tier 3'
      when v_race.category in ('1.2', '2.2') then '1x Tier 1 + 2x Tier 3 + remaining Tier 4'
      else 'normal category preference'
    end,
    'message', 'AI race field fill completed up to maximum capacity when eligible teams were available.'
  );
end;
$function$;

create or replace function public.trim_ai_filler_teams_to_target_v1(p_race_id uuid default null::uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_race record;
  v_surplus integer := 0;
  v_deleted_riders integer := 0;
  v_deleted_entries integer := 0;
  v_total_deleted_riders integer := 0;
  v_total_deleted_entries integer := 0;
  v_results jsonb := '[]'::jsonb;
begin
  -- Compatibility name retained. New policy trims only above max_teams,
  -- because target-to-max capacity is intentionally used by AI fillers.
  for v_race in
    select
      r.id as race_id,
      r.name as race_name,
      r.status as race_status,
      coalesce(rer.target_teams, rer.min_teams, 0) as target_teams,
      greatest(
        coalesce(rer.max_teams, rer.target_teams, rer.min_teams, 0),
        coalesce(rer.target_teams, rer.min_teams, 0)
      ) as capacity_teams,
      count(rte.id) filter (where rte.status = 'accepted')::integer as accepted_teams,
      count(rte.id) filter (
        where rte.status = 'accepted'
          and coalesce(rte.is_ai_filler, false) = true
      )::integer as accepted_ai_teams
    from public.races r
    join public.race_entry_rules rer
      on rer.race_id = r.id
    left join public.race_team_entries rte
      on rte.race_id = r.id
    where p_race_id is null
       or r.id = p_race_id
    group by
      r.id,
      r.name,
      r.status,
      rer.target_teams,
      rer.max_teams,
      rer.min_teams
    having count(rte.id) filter (where rte.status = 'accepted')
      > greatest(
          coalesce(rer.max_teams, rer.target_teams, rer.min_teams, 0),
          coalesce(rer.target_teams, rer.min_teams, 0)
        )
  loop
    v_surplus := greatest(v_race.accepted_teams - v_race.capacity_teams, 0);
    v_deleted_riders := 0;
    v_deleted_entries := 0;

    if v_race.race_status not in ('scheduled', 'draft', 'active') then
      v_results := v_results || jsonb_build_array(
        jsonb_build_object(
          'race_id', v_race.race_id,
          'race_name', v_race.race_name,
          'race_status', v_race.race_status,
          'target_teams', v_race.target_teams,
          'capacity_teams', v_race.capacity_teams,
          'accepted_before', v_race.accepted_teams,
          'ai_before', v_race.accepted_ai_teams,
          'surplus', v_surplus,
          'skipped', true,
          'reason', 'race_not_safe_to_trim'
        )
      );
      continue;
    end if;

    create temporary table if not exists pg_temp.tmp_surplus_ai_entries_to_trim (
      race_team_entry_id uuid primary key,
      race_id uuid not null,
      club_id uuid not null
    ) on commit drop;

    truncate table pg_temp.tmp_surplus_ai_entries_to_trim;

    insert into pg_temp.tmp_surplus_ai_entries_to_trim (
      race_team_entry_id,
      race_id,
      club_id
    )
    select
      rte.id,
      rte.race_id,
      rte.club_id
    from public.race_team_entries rte
    where rte.race_id = v_race.race_id
      and rte.status = 'accepted'
      and coalesce(rte.is_ai_filler, false) = true
      and coalesce(rte.entry_source::text, '') in ('ai_fill', 'ai', 'ai_filler')
    order by
      rte.created_at desc nulls last,
      rte.id
    limit v_surplus;

    delete from public.race_participant_riders rpr
    using pg_temp.tmp_surplus_ai_entries_to_trim s
    where rpr.race_id = s.race_id
      and rpr.team_id = s.club_id;

    get diagnostics v_deleted_riders = row_count;

    delete from public.race_team_entries rte
    using pg_temp.tmp_surplus_ai_entries_to_trim s
    where rte.id = s.race_team_entry_id;

    get diagnostics v_deleted_entries = row_count;

    v_total_deleted_riders := v_total_deleted_riders + v_deleted_riders;
    v_total_deleted_entries := v_total_deleted_entries + v_deleted_entries;

    v_results := v_results || jsonb_build_array(
      jsonb_build_object(
        'race_id', v_race.race_id,
        'race_name', v_race.race_name,
        'race_status', v_race.race_status,
        'target_teams', v_race.target_teams,
        'capacity_teams', v_race.capacity_teams,
        'accepted_before', v_race.accepted_teams,
        'ai_before', v_race.accepted_ai_teams,
        'surplus_above_max', v_surplus,
        'deleted_ai_rider_reservations', v_deleted_riders,
        'deleted_surplus_ai_entries', v_deleted_entries
      )
    );
  end loop;

  return jsonb_build_object(
    'success', true,
    'trim_policy', 'max_teams_only',
    'deleted_ai_rider_reservations', v_total_deleted_riders,
    'deleted_surplus_ai_entries', v_total_deleted_entries,
    'results', v_results
  );
end;
$function$;

create or replace function public.finalize_race_team_list_announcement_v1(p_race_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_team_count integer := 0;
  v_team_count_before_fill integer := 0;
  v_max_teams integer := 0;
  v_fill_result jsonb := '{}'::jsonb;
begin
  select greatest(
           coalesce(rer.max_teams, rer.target_teams, rer.min_teams, 0),
           coalesce(rer.target_teams, rer.min_teams, 0)
         )::integer
  into v_max_teams
  from public.race_entry_rules rer
  where rer.race_id = p_race_id
  limit 1;

  if not found then
    raise exception 'Team-list announcement cannot be finalized: race % has no entry rules', p_race_id;
  end if;

  select count(distinct coalesce(
           entry.participating_club_id,
           entry.club_id
         ))::integer
  into v_team_count_before_fill
  from public.race_team_entries entry
  where entry.race_id = p_race_id
    and entry.status in ('accepted', 'confirmed');

  -- Final safety net: if normal review already reached target_teams but left
  -- unused max_teams capacity, fill those remaining places before freezing
  -- the official team-list announcement.
  if v_team_count_before_fill < v_max_teams then
    select public.fill_race_ai_teams_v1(p_race_id)
    into v_fill_result;

    if coalesce((v_fill_result ->> 'success')::boolean, false) is not true then
      raise exception
        'Team-list announcement cannot be finalized: AI max-field fill failed for race %: %',
        p_race_id,
        v_fill_result;
    end if;
  else
    v_fill_result := jsonb_build_object(
      'success', true,
      'skipped', true,
      'reason', 'already_at_or_above_max',
      'accepted_teams', v_team_count_before_fill,
      'max_teams', v_max_teams,
      'ai_entries_added', 0
    );
  end if;

  select count(distinct coalesce(
           entry.participating_club_id,
           entry.club_id
         ))::integer
  into v_team_count
  from public.race_team_entries entry
  where entry.race_id = p_race_id
    and entry.status in ('accepted', 'confirmed');

  if v_team_count = 0 then
    raise exception
      'Team-list announcement cannot be finalized: race % has no accepted teams',
      p_race_id;
  end if;

  update public.races race
  set
    metadata =
      coalesce(race.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'team_list_announcement_finalized', true,
        'team_list_announcement_finalized_at', now(),
        'team_list_announcement_processed', true,
        'team_list_announcement_processed_at', now(),
        'team_list_announcement_team_count', v_team_count,
        'team_list_announcement_max_teams', v_max_teams,
        'team_list_announcement_fill_to_max_policy', true,
        'captains_pending_rider_deadline', true
      ),
    updated_at = now()
  where race.id = p_race_id;

  return jsonb_build_object(
    'success', true,
    'race_id', p_race_id,
    'team_count_before_max_fill', v_team_count_before_fill,
    'team_count', v_team_count,
    'max_teams', v_max_teams,
    'ai_entries_added', coalesce((v_fill_result ->> 'ai_entries_added')::integer, 0),
    'remaining_capacity', greatest(0, v_max_teams - v_team_count),
    'team_list_announced', true,
    'fill_to_max_policy', true,
    'ai_fill_result', v_fill_result,
    'captains_and_numbers_finalized', false,
    'captains_pending_rider_deadline', true
  );
end;
$function$;
