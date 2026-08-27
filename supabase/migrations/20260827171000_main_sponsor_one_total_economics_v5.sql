-- Main sponsor economics V5.
-- One contract total is split into guaranteed cash + objective bonus pool.
-- Standard deals: 65-75% guaranteed / 25-35% bonus.
-- Naming-rights deals: 30-50% above the strongest standard total and
-- 78-84% guaranteed / 16-22% bonus.

create or replace function public.sponsor_keep_test_season_start_preview_offer_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uplift numeric := 0;
  v_base_guaranteed bigint;
  v_base_bonus bigint;
begin
  if tg_op = 'UPDATE'
     and coalesce(old.metadata ->> 'test_new_season_start_preview', '') = 'true'
     and coalesce(new.status, 'offered') = 'offered'
  then
    new.generated_game_month := 1;
    new.coverage_months := 12;
    new.proration_factor := 1;

    if coalesce(new.metadata ->> 'economic_model_version', '') = 'v5_one_total_split' then
      new.guaranteed_amount := greatest(0, coalesce(new.full_season_guaranteed_amount, new.guaranteed_amount, 0));
      new.bonus_pool_amount := greatest(0, coalesce(new.full_season_bonus_pool_amount, new.bonus_pool_amount, 0));
      new.monthly_amount := floor(new.guaranteed_amount::numeric / 12)::bigint;

      new.metadata := coalesce(new.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'test_new_season_start_preview', true,
          'test_preview_generated_game_month', 1,
          'test_preview_coverage_months', 12,
          'test_preview_proration_factor', 1,
          'test_preview_refresh_protected', true,
          'test_preview_refresh_protected_at', now(),
          'test_preview_economic_model', 'v5_one_total_split'
        );

      return new;
    end if;

    -- Legacy fallback for pre-V5 offers kept during transitional deployments.
    v_base_guaranteed := greatest(0, coalesce(new.full_season_guaranteed_amount, new.guaranteed_amount, 0));
    v_base_bonus := greatest(0, coalesce(new.full_season_bonus_pool_amount, new.bonus_pool_amount, 0));

    if coalesce(new.main_sponsor_deal_type, 'standard') = 'naming_rights' then
      v_uplift := greatest(
        30,
        least(
          40,
          coalesce(
            new.naming_rights_uplift_pct,
            nullif(new.metadata ->> 'naming_rights_uplift_pct', '')::numeric,
            30
          )
        )
      );
    end if;

    new.guaranteed_amount := floor(v_base_guaranteed::numeric * (1 + v_uplift / 100.0))::bigint;
    new.bonus_pool_amount := floor(v_base_bonus::numeric * (1 + v_uplift / 100.0))::bigint;
    new.monthly_amount := floor(new.guaranteed_amount::numeric / 12)::bigint;
  end if;

  return new;
end;
$function$;

create or replace function public.sponsor_finalize_main_offer_portfolio_v5(
  p_club_id uuid,
  p_season integer
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_base jsonb;
  v_club public.clubs%rowtype;
  v_desired_naming integer := 0;
  v_fixed_naming integer := 0;
  v_missing_naming integer := 0;
  v_auto_naming integer := 0;
  v_standard_reference_total bigint := 0;
  v_offer record;
  v_base_total bigint;
  v_full_total bigint;
  v_full_guaranteed bigint;
  v_full_bonus bigint;
  v_current_total bigint;
  v_current_guaranteed bigint;
  v_current_bonus bigint;
  v_monthly bigint;
  v_factor numeric;
  v_guarantee_share numeric;
  v_bonus_share numeric;
  v_uplift numeric;
  v_rotation_stamp text;
  v_stored_rotation_stamp text;
  v_preview jsonb;
  v_preview_total bigint;
  v_previewed integer := 0;
begin
  -- Keep the established regional/worldwide portfolio rules from V3.
  v_base := public.sponsor_finalize_main_offer_portfolio_v3(p_club_id, p_season);

  select * into v_club
  from public.clubs c
  where c.id = p_club_id
    and c.deleted_at is null
    and c.is_active = true
    and coalesce(c.club_type::text, 'main') = 'main'
  limit 1;

  if not found then
    raise exception 'Live main club not found.';
  end if;

  case v_club.club_tier
    when 'worldteam' then v_desired_naming := 2;
    when 'proteam' then v_desired_naming := 1;
    else v_desired_naming := 0;
  end case;

  -- Reset only automatically generated naming slots. Manual/renewal naming
  -- relationships remain fixed and continue to count toward the tier quota.
  update public.club_sponsor_offers o
  set main_sponsor_deal_type = 'standard',
      naming_rights_uplift_pct = 0,
      metadata = (coalesce(o.metadata, '{}'::jsonb) - array[
        'season_display_name',
        'naming_rights_display_name',
        'full_display_name',
        'full_display_name_preview',
        'team_name_preview',
        'branding_locked_fields'
      ]) || jsonb_build_object(
        'auto_generated_naming_rights', false,
        'naming_rights_policy_version', 'v5_standard_reference_30_50'
      )
  where o.club_id = p_club_id
    and o.season_number = p_season
    and o.sponsor_kind = 'main'
    and o.status = 'offered'
    and coalesce((o.metadata->>'is_renewal_offer')::boolean, false) = false
    and coalesce((o.metadata->>'auto_generated_naming_rights')::boolean, false) = true;

  select count(*)::integer into v_fixed_naming
  from public.club_sponsor_offers o
  where o.club_id = p_club_id
    and o.season_number = p_season
    and o.sponsor_kind = 'main'
    and o.status = 'offered'
    and coalesce(o.main_sponsor_deal_type, 'standard') = 'naming_rights';

  v_missing_naming := greatest(0, v_desired_naming - v_fixed_naming);

  -- Automatic naming slots come from the strongest underlying standard offers.
  for v_offer in
    select
      o.id,
      sc.name as company_name,
      case
        when coalesce(o.metadata->>'economic_model_v5_base_contract_total', '') ~ '^[0-9]+$'
          then (o.metadata->>'economic_model_v5_base_contract_total')::bigint
        else greatest(0, coalesce(o.full_season_guaranteed_amount, o.guaranteed_amount, 0))
      end as base_total
    from public.club_sponsor_offers o
    join public.sponsor_companies sc on sc.id = o.company_id
    where o.club_id = p_club_id
      and o.season_number = p_season
      and o.sponsor_kind = 'main'
      and o.status = 'offered'
      and coalesce(o.main_sponsor_deal_type, 'standard') <> 'naming_rights'
      and coalesce((o.metadata->>'is_renewal_offer')::boolean, false) = false
    order by
      case
        when coalesce(o.metadata->>'economic_model_v5_base_contract_total', '') ~ '^[0-9]+$'
          then (o.metadata->>'economic_model_v5_base_contract_total')::bigint
        else greatest(0, coalesce(o.full_season_guaranteed_amount, o.guaranteed_amount, 0))
      end desc,
      md5(o.id::text || '|naming-slot-v5|' || p_season::text)
    limit v_missing_naming
  loop
    v_uplift := 30 + (
      ((('x' || substr(md5(v_offer.id::text || '|naming-uplift-v5'), 1, 8))::bit(32)::bigint) % 2001)::numeric
      / 100.0
    );

    update public.club_sponsor_offers o
    set main_sponsor_deal_type = 'naming_rights',
        naming_rights_uplift_pct = v_uplift,
        metadata = coalesce(o.metadata, '{}'::jsonb) || jsonb_build_object(
          'deal_type', 'naming_rights',
          'main_sponsor_deal_type', 'naming_rights',
          'requires_team_name_change', true,
          'naming_rights_uplift_pct', v_uplift,
          'season_display_name', v_offer.company_name || ' Team',
          'naming_rights_display_name', v_offer.company_name || ' Team',
          'full_display_name', v_offer.company_name || ' Team (' || v_club.name || ')',
          'team_name_preview', v_offer.company_name || ' Team (' || v_club.name || ')',
          'branding_locked_fields', jsonb_build_array('name', 'primary_color', 'secondary_color'),
          'auto_generated_naming_rights', true,
          'naming_rights_policy_version', 'v5_standard_reference_30_50',
          'naming_rights_minimum_premium_pct', 30,
          'naming_rights_maximum_premium_pct', 50
        )
    where o.id = v_offer.id;

    v_auto_naming := v_auto_naming + 1;
  end loop;

  -- The strongest standard total is the benchmark for every naming-rights offer.
  -- This makes the stated 30-50% premium exact and easy to compare in the UI.
  select coalesce(max(
    case
      when coalesce(o.metadata->>'economic_model_v5_base_contract_total', '') ~ '^[0-9]+$'
        then (o.metadata->>'economic_model_v5_base_contract_total')::bigint
      else greatest(0, coalesce(o.full_season_guaranteed_amount, o.guaranteed_amount, 0))
    end
  ), 0)::bigint
  into v_standard_reference_total
  from public.club_sponsor_offers o
  where o.club_id = p_club_id
    and o.season_number = p_season
    and o.sponsor_kind = 'main'
    and o.status = 'offered'
    and coalesce(o.main_sponsor_deal_type, 'standard') = 'standard';

  if v_standard_reference_total <= 0 then
    select coalesce(max(greatest(0, coalesce(o.full_season_guaranteed_amount, o.guaranteed_amount, 0))), 0)::bigint
    into v_standard_reference_total
    from public.club_sponsor_offers o
    where o.club_id = p_club_id
      and o.season_number = p_season
      and o.sponsor_kind = 'main'
      and o.status = 'offered';
  end if;

  for v_offer in
    select o.*, sc.name as company_name
    from public.club_sponsor_offers o
    join public.sponsor_companies sc on sc.id = o.company_id
    where o.club_id = p_club_id
      and o.season_number = p_season
      and o.sponsor_kind = 'main'
      and o.status = 'offered'
    order by o.created_at, o.id
  loop
    v_rotation_stamp := coalesce(v_offer.metadata->>'last_rotated_game_month', '') || ':' ||
                        coalesce(v_offer.metadata->>'last_rotated_game_day', '');
    if v_rotation_stamp = ':' then
      v_rotation_stamp := 'none';
    end if;

    v_stored_rotation_stamp := coalesce(
      v_offer.metadata->>'economic_model_v5_rotation_stamp',
      'none'
    );

    -- A rotating offer that was rerolled by the core refresh has a new raw
    -- full-season value. Capture it as the new V5 total before splitting.
    if coalesce(v_offer.metadata->>'economic_model_version', '') = 'v5_one_total_split'
       and v_rotation_stamp <> 'none'
       and v_rotation_stamp is distinct from v_stored_rotation_stamp
    then
      v_base_total := greatest(0, coalesce(v_offer.full_season_guaranteed_amount, v_offer.guaranteed_amount, 0));
    elsif coalesce(v_offer.metadata->>'economic_model_v5_base_contract_total', '') ~ '^[0-9]+$'
    then
      v_base_total := (v_offer.metadata->>'economic_model_v5_base_contract_total')::bigint;
    else
      v_base_total := greatest(0, coalesce(v_offer.full_season_guaranteed_amount, v_offer.guaranteed_amount, 0));
    end if;

    if coalesce(v_offer.main_sponsor_deal_type, 'standard') = 'naming_rights' then
      v_uplift := coalesce(v_offer.naming_rights_uplift_pct, 0);
      if v_uplift < 30 or v_uplift > 50 then
        v_uplift := 30 + (
          ((('x' || substr(md5(v_offer.id::text || '|naming-uplift-v5'), 1, 8))::bit(32)::bigint) % 2001)::numeric
          / 100.0
        );
      end if;

      v_full_total := round(v_standard_reference_total::numeric * (1 + v_uplift / 100.0))::bigint;
      v_guarantee_share := 78 + (
        ((('x' || substr(md5(v_offer.id::text || '|naming-guarantee-share-v5'), 1, 8))::bit(32)::bigint) % 601)::numeric
        / 100.0
      );
    else
      v_uplift := 0;
      v_full_total := v_base_total;
      v_guarantee_share := 65 + (
        ((('x' || substr(md5(v_offer.id::text || '|standard-guarantee-share-v5'), 1, 8))::bit(32)::bigint) % 1001)::numeric
        / 100.0
      );
    end if;

    v_guarantee_share := greatest(0, least(100, v_guarantee_share));
    v_bonus_share := 100 - v_guarantee_share;

    v_full_guaranteed := floor(v_full_total::numeric * v_guarantee_share / 100.0)::bigint;
    v_full_bonus := greatest(0, v_full_total - v_full_guaranteed);

    v_factor := greatest(
      0.01,
      least(
        1.0,
        coalesce(
          v_offer.proration_factor,
          case
            when coalesce(v_offer.coverage_months, 0) > 0
              then v_offer.coverage_months::numeric / 12.0
            else 1.0
          end
        )
      )
    );

    v_current_total := round(v_full_total::numeric * v_factor)::bigint;
    v_current_guaranteed := floor(v_full_guaranteed::numeric * v_factor)::bigint;
    v_current_bonus := greatest(0, v_current_total - v_current_guaranteed);

    v_monthly := case
      when coalesce(v_offer.coverage_months, 0) > 0
        then floor(v_current_guaranteed::numeric / v_offer.coverage_months)::bigint
      else v_current_guaranteed
    end;

    update public.club_sponsor_offers o
    set naming_rights_uplift_pct = v_uplift,
        full_season_guaranteed_amount = v_full_guaranteed,
        full_season_bonus_pool_amount = v_full_bonus,
        guaranteed_amount = v_current_guaranteed,
        bonus_pool_amount = v_current_bonus,
        monthly_amount = v_monthly,
        metadata = coalesce(o.metadata, '{}'::jsonb)
          || jsonb_build_object(
            'economic_model_version', 'v5_one_total_split',
            'economic_model_v5_base_contract_total', v_base_total,
            'economic_model_v5_rotation_stamp', v_rotation_stamp,
            'full_season_contract_total_value', v_full_total,
            'contract_total_value', v_current_total,
            'guaranteed_share_pct', round(v_guarantee_share, 2),
            'bonus_share_pct', round(v_bonus_share, 2),
            'guaranteed_amount', v_current_guaranteed,
            'bonus_pool_amount', v_current_bonus,
            'naming_rights_reference_standard_total', v_standard_reference_total,
            'naming_rights_uplift_pct', v_uplift,
            'bonus_balance_policy', 'scaled_objectives_approx_90k_each',
            'economics_refreshed_at', now()
          )
          || case
            when coalesce(v_offer.main_sponsor_deal_type, 'standard') = 'naming_rights'
              then jsonb_build_object(
                'deal_type', 'naming_rights',
                'main_sponsor_deal_type', 'naming_rights',
                'requires_team_name_change', true,
                'season_display_name', v_offer.company_name || ' Team',
                'naming_rights_display_name', v_offer.company_name || ' Team',
                'full_display_name', v_offer.company_name || ' Team (' || v_club.name || ')',
                'team_name_preview', v_offer.company_name || ' Team (' || v_club.name || ')',
                'branding_locked_fields', jsonb_build_array('name', 'primary_color', 'secondary_color'),
                'naming_rights_policy_version', 'v5_standard_reference_30_50',
                'naming_rights_minimum_premium_pct', 30,
                'naming_rights_maximum_premium_pct', 50
              )
            else jsonb_build_object(
              'deal_type', 'standard',
              'main_sponsor_deal_type', 'standard',
              'requires_team_name_change', false
            )
          end
    where o.id = v_offer.id;
  end loop;

  -- Build the complete exact-race objective preview only after economics settle.
  for v_offer in
    select o.id
    from public.club_sponsor_offers o
    where o.club_id = p_club_id
      and o.season_number = p_season
      and o.sponsor_kind = 'main'
      and o.status = 'offered'
  loop
    v_preview := public.sponsor_build_offer_preview_objectives_v3(v_offer.id);

    select coalesce(sum((x.value->>'estimated_reward_amount')::bigint), 0)::bigint
    into v_preview_total
    from jsonb_array_elements(coalesce(v_preview, '[]'::jsonb)) as x(value);

    update public.club_sponsor_offers o
    set metadata = coalesce(o.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'preview_objectives', coalesce(v_preview, '[]'::jsonb),
        'preview_objectives_version', 'v3_scaled_exact_races',
        'preview_objective_count', jsonb_array_length(coalesce(v_preview, '[]'::jsonb)),
        'preview_objective_total_reward', v_preview_total,
        'preview_objectives_match_bonus_pool', v_preview_total = coalesce(o.bonus_pool_amount, 0),
        'preview_objectives_refreshed_at', now()
      )
    where o.id = v_offer.id;

    v_previewed := v_previewed + 1;
  end loop;

  return coalesce(v_base, '{}'::jsonb)
    || jsonb_build_object(
      'economic_model_version', 'v5_one_total_split',
      'naming_policy_version', 'v5_standard_reference_30_50',
      'standard_reference_total', v_standard_reference_total,
      'desired_naming_rights', v_desired_naming,
      'fixed_naming_rights', v_fixed_naming,
      'auto_naming_rights_prepared', v_auto_naming,
      'standard_guarantee_share_range', jsonb_build_array(65, 75),
      'naming_guarantee_share_range', jsonb_build_array(78, 84),
      'preview_policy_version', 'v3_scaled_exact_races',
      'offers_previewed', v_previewed
    );
end;
$function$;
