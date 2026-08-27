-- Sponsor objective preview V3.
-- Main-sponsor bonus pools scale to 3-6 exact, visible race objectives.
-- Rewards are difficulty weighted and always reconcile to the advertised bonus pool.
-- No country-code-only labels such as "Race in KR" are generated.

create or replace function public.sponsor_build_offer_preview_objectives_v3(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_offer record;
  v_bonus bigint := 0;
  v_objective_count integer := 0;
  v_season_start date;
  v_season_end date;
  v_from_date date;
  v_sponsor_group text;
  v_used uuid[] := array[]::uuid[];
  v_result jsonb := '[]'::jsonb;
  v_weights numeric[] := array[0.65, 0.75, 0.90, 1.00, 1.15, 1.30];
  v_weight_sum numeric := 0;
  v_index integer;
  v_weight numeric;
  v_reward bigint;
  v_allocated bigint := 0;
  v_race record;
  v_required_result text;
  v_title text;
  v_description text;
  v_evaluation_mode text;
  v_progress_source text;
begin
  select
    o.id,
    o.season_number,
    o.bonus_pool_amount,
    o.metadata,
    sc.name as sponsor_name,
    upper(sc.country_code) as sponsor_country_code,
    c.name as club_name,
    upper(c.country_code) as club_country_code,
    c.club_tier::text as club_tier
  into v_offer
  from public.club_sponsor_offers o
  join public.sponsor_companies sc on sc.id = o.company_id
  join public.clubs c on c.id = o.club_id
  where o.id = p_offer_id
    and o.sponsor_kind = 'main';

  if not found then
    return '[]'::jsonb;
  end if;

  v_bonus := greatest(0, coalesce(v_offer.bonus_pool_amount, 0));
  if v_bonus <= 0 then
    return '[]'::jsonb;
  end if;

  -- Scale between three and six visible objectives. The offer UI renders six
  -- objective cards, so every advertised target remains visible to the player.
  v_objective_count := least(
    6,
    greatest(
      3,
      ceil(v_bonus::numeric / 90000.0)::integer
    )
  );

  v_season_start := public.get_game_date_for_season_start(v_offer.season_number);
  v_season_end := public.get_game_date_for_season_end(v_offer.season_number);
  v_from_date := greatest(v_season_start, public.get_current_game_date_safe_v1());

  select cgm.group_code
  into v_sponsor_group
  from public.country_market_group_members cgm
  where upper(cgm.country_code) = v_offer.sponsor_country_code
  limit 1;

  select coalesce(sum(x), 0)
  into v_weight_sum
  from unnest(v_weights[1:v_objective_count]) as u(x);

  for v_index in 1..v_objective_count loop
    select
      r.id,
      r.name,
      r.start_date,
      coalesce(r.end_date, r.start_date) as end_date,
      r.country_code,
      r.category,
      r.race_type
    into v_race
    from public.races r
    left join public.country_market_group_members cgm
      on upper(cgm.country_code) = upper(r.country_code)
    where r.start_date between v_from_date and v_season_end
      and lower(coalesce(r.status::text, 'scheduled')) not in (
        'finished','completed','canceled','cancelled','finalized','results_published','done','simulated'
      )
      and not (r.id = any(v_used))
      and (
        v_index not in (3, 4, 6)
        or lower(coalesce(r.race_type, '')) = 'stage_race'
      )
    order by
      case
        when v_index = 1 and upper(r.country_code) = v_offer.sponsor_country_code then 0
        when v_index = 1 and v_sponsor_group is not null and cgm.group_code = v_sponsor_group then 1
        when v_index = 3 and upper(r.country_code) = v_offer.club_country_code then 0
        when v_index in (4, 5, 6) and r.category ilike '%UWT%' then 0
        when v_index in (4, 5, 6) and r.category ilike '%Pro%' then 1
        when v_index in (4, 5, 6) and r.category in ('2.1','1.1') then 2
        else 3
      end,
      md5(r.id::text || p_offer_id::text || '|objective-v3-' || v_index::text)
    limit 1;

    if not found and v_index not in (3, 4, 6) then
      select
        r.id,
        r.name,
        r.start_date,
        coalesce(r.end_date, r.start_date) as end_date,
        r.country_code,
        r.category,
        r.race_type
      into v_race
      from public.races r
      where r.start_date between v_from_date and v_season_end
        and lower(coalesce(r.status::text, 'scheduled')) not in (
          'finished','completed','canceled','cancelled','finalized','results_published','done','simulated'
        )
        and not (r.id = any(v_used))
      order by md5(r.id::text || p_offer_id::text || '|fallback-v3-' || v_index::text)
      limit 1;
    end if;

    if not found then
      exit;
    end if;

    v_used := v_used || v_race.id;

    case v_index
      when 1 then
        v_required_result := 'race_start';
        v_title := v_race.name || ': start the race';
        v_description := 'Start ' || v_race.name || ' with your team. The objective is completed when your team appears on the race start list.';
        v_evaluation_mode := 'race_start_count';
        v_progress_source := 'race_entries';
      when 2 then
        v_required_result := 'classification_visibility';
        v_title := v_race.name || ': appear in the final classification';
        v_description := 'Finish the race with at least one rider listed in the published final classifications.';
        v_evaluation_mode := 'race_final_result';
        v_progress_source := 'race_results';
      when 3 then
        v_required_result := 'stage_top_5';
        v_title := v_race.name || ': stage top 5';
        v_description := 'Place at least one rider in the top 5 of a stage in ' || v_race.name || '.';
        v_evaluation_mode := 'stage_result_count';
        v_progress_source := 'stage_results';
      when 4 then
        v_required_result := 'gc_top_10';
        v_title := v_race.name || ': final GC top 10';
        v_description := 'Finish at least one rider inside the final general-classification top 10 of ' || v_race.name || '.';
        v_evaluation_mode := 'race_final_result';
        v_progress_source := 'race_results';
      when 5 then
        v_required_result := 'race_podium';
        v_title := v_race.name || ': finish on the podium';
        v_description := 'Finish in the top 3 of ' || v_race.name || ' to deliver a headline result for the sponsor.';
        v_evaluation_mode := 'race_final_result';
        v_progress_source := 'race_results';
      else
        v_required_result := 'stage_win';
        v_title := v_race.name || ': win a stage';
        v_description := 'Win at least one stage of ' || v_race.name || '.';
        v_evaluation_mode := 'stage_result_count';
        v_progress_source := 'stage_results';
    end case;

    v_weight := v_weights[v_index];

    if v_index = v_objective_count then
      v_reward := greatest(0, v_bonus - v_allocated);
    else
      v_reward := round(v_bonus::numeric * v_weight / nullif(v_weight_sum, 0))::bigint;
      v_allocated := v_allocated + v_reward;
    end if;

    v_result := v_result || jsonb_build_array(
      jsonb_build_object(
        'objective_code', v_required_result,
        'title', v_title,
        'description', v_description,
        'target_race_id', v_race.id::text,
        'target_race_name', v_race.name,
        'target_country_code', v_race.country_code,
        'target_category', v_race.category,
        'target_race_type', v_race.race_type,
        'target_race_start_date', v_race.start_date::text,
        'target_race_end_date', v_race.end_date::text,
        'check_date', v_race.end_date::text,
        'target_check_game_date', v_race.end_date::text,
        'required_result', v_required_result,
        'target_value', 1,
        'current_value', 0,
        'evaluation_mode', v_evaluation_mode,
        'progress_source', v_progress_source,
        'estimated_reward_amount', v_reward,
        'reward_amount', v_reward,
        'reward_label', '$' || to_char(v_reward, 'FM999,999,999'),
        'objective_number', v_index,
        'objective_count', v_objective_count,
        'bonus_pool_amount', v_bonus,
        'preview_policy_version', 'v3_scaled_exact_races_max6'
      )
    );
  end loop;

  return v_result;
end;
$function$;
