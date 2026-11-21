-- SAT-08 sponsor / branding write-only guards (DRAFT).
-- Preserve live owner checks, sponsor automation and read-only dashboards.
-- Never enable anonymous guest mode until staging tests pass.
-- Guards use unconverted lifecycle, not auth.users.is_anonymous.

-- Player-facing write: sponsor_prepare_main_offer_deal_metadata_v1
CREATE OR REPLACE FUNCTION public.sponsor_prepare_main_offer_deal_metadata_v1(p_offer_id uuid, p_deal_type text DEFAULT 'standard'::text, p_uplift_pct numeric DEFAULT NULL::numeric, p_display_name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_offer public.club_sponsor_offers%rowtype;
  v_company_name text;
  v_uplift numeric(5,2);
  v_bonus_uplift numeric(5,2);
  v_proration numeric;
  v_display_name text;
  v_new_guaranteed bigint;
  v_new_bonus bigint;
  v_new_monthly bigint;
begin
  if p_offer_id is null then
    raise exception 'Offer id is required.';
  end if;

  if p_deal_type not in ('standard', 'naming_rights') then
    raise exception 'Invalid main sponsor deal type: %', p_deal_type;
  end if;

  select *
    into v_offer
  from public.club_sponsor_offers o
  where o.id = p_offer_id
  for update;

  if not found then
    raise exception 'Sponsor offer not found.';
  end if;

  if v_offer.sponsor_kind <> 'main' then
    raise exception 'Only main sponsor offers can use main sponsor deal types.';
  end if;

  if v_offer.status <> 'offered' then
    raise exception 'Only offered sponsor offers can be prepared.';
  end if;

  if auth.uid() is not null
     and not finance.is_club_member_or_owner(v_offer.club_id, auth.uid()) then
    raise exception 'Not allowed to update this sponsor offer.';
  end if;

  -- Saturn 14-day trial: prevent linked-but-unconverted identities from
  -- modifying sponsor deals, objectives or branding after expiration.
  if public.saturn_test_account_requires_guard_v1()
     and not public.saturn_test_account_can_mutate_v1(v_offer.club_id) then
    raise exception 'Test account expired or not authorized for this club'
      using errcode='42501';
  end if;

  select sc.name
    into v_company_name
  from public.sponsor_companies sc
  where sc.id = v_offer.company_id;

  v_company_name := coalesce(v_company_name, 'Sponsor');

  v_proration := greatest(
    0.01,
    least(
      1.0,
      coalesce(
        v_offer.proration_factor,
        (coalesce(v_offer.coverage_months, 12)::numeric / 12.0),
        1.0
      )
    )
  );

  if p_deal_type = 'naming_rights' then
    v_uplift := coalesce(
      p_uplift_pct,
      30 + (((('x' || substr(md5(p_offer_id::text || '|naming-premium-v4'), 1, 8))::bit(32)::bigint) % 1001)::numeric / 100.0)
    );
    -- Old callers may still pass a 20-30 value. Clamp them into the new 30-40 policy
    -- rather than breaking existing transition/retry code.
    v_uplift := round(greatest(30, least(40, v_uplift)), 2);
    v_bonus_uplift := v_uplift;

    v_display_name := regexp_replace(
      trim(coalesce(nullif(p_display_name, ''), v_company_name || ' Team')),
      '\s+',
      ' ',
      'g'
    );

    if length(v_display_name) not between 3 and 60 then
      raise exception 'Naming-rights display name must be between 3 and 60 characters.';
    end if;
  else
    v_uplift := 0;
    v_bonus_uplift := 0;
    v_display_name := null;
  end if;

  v_new_guaranteed := floor(
    greatest(0, coalesce(v_offer.full_season_guaranteed_amount, v_offer.guaranteed_amount, 0))
    * v_proration
    * (1 + (v_uplift / 100.0))
  )::bigint;

  v_new_bonus := floor(
    greatest(0, coalesce(v_offer.full_season_bonus_pool_amount, v_offer.bonus_pool_amount, 0))
    * v_proration
    * (1 + (v_bonus_uplift / 100.0))
  )::bigint;

  v_new_monthly := case
    when coalesce(v_offer.coverage_months, 0) > 0 then
      floor(v_new_guaranteed::numeric / v_offer.coverage_months)::bigint
    else
      v_new_guaranteed
  end;

  update public.club_sponsor_offers o
  set
    main_sponsor_deal_type = p_deal_type,
    naming_rights_uplift_pct = v_uplift,
    guaranteed_amount = v_new_guaranteed,
    bonus_pool_amount = v_new_bonus,
    monthly_amount = v_new_monthly,
    metadata = coalesce(o.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'deal_type', p_deal_type,
        'main_sponsor_deal_type', p_deal_type,
        'requires_team_name_change', p_deal_type = 'naming_rights',
        'naming_rights_uplift_pct', v_uplift,
        'naming_rights_bonus_uplift_pct', v_bonus_uplift,
        'naming_rights_policy_version', 'v4_min_30',
        'season_display_name', v_display_name,
        'full_display_name_preview',
          case
            when v_display_name is not null then v_display_name || ' (Original club name)'
            else null
          end,
        'branding_locked_fields',
          case
            when p_deal_type = 'naming_rights'
            then jsonb_build_array('name', 'primary_color', 'secondary_color')
            else '[]'::jsonb
          end
      )
  where o.id = p_offer_id;

  return p_offer_id;
end;
$function$;

-- Player-facing write: sponsor_set_objective_target_v1
CREATE OR REPLACE FUNCTION public.sponsor_set_objective_target_v1(p_objective_id uuid, p_target_race_id uuid DEFAULT NULL::uuid, p_target_stage_id uuid DEFAULT NULL::uuid, p_target_check_game_date date DEFAULT NULL::date, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_club_id uuid;
begin
  if p_objective_id is null then
    raise exception 'Objective id is required.';
  end if;

  select cs.club_id
  into v_club_id
  from public.club_sponsor_objectives o
  join public.club_sponsors cs on cs.id = o.club_sponsor_id
  where o.id = p_objective_id;

  if not found then
    raise exception 'Sponsor objective not found.';
  end if;

  if not finance.is_club_member_or_owner(v_club_id, auth.uid()) then
    raise exception 'Not allowed to update sponsor objective target.';
  end if;

  -- Saturn 14-day trial: prevent linked-but-unconverted identities from
  -- modifying sponsor deals, objectives or branding after expiration.
  if public.saturn_test_account_requires_guard_v1()
     and not public.saturn_test_account_can_mutate_v1(v_club_id) then
    raise exception 'Test account expired or not authorized for this club'
      using errcode='42501';
  end if;

  update public.club_sponsor_objectives o
  set
    target_race_id = p_target_race_id,
    target_stage_id = p_target_stage_id,
    target_check_game_date = p_target_check_game_date,
    check_state = case
      when p_target_check_game_date is null then 'not_scheduled'
      else 'scheduled'
    end,
    metadata = coalesce(o.metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb)
  where o.id = p_objective_id;

  return p_objective_id;
end;
$function$;

-- Player-facing write: sponsor_sign_offer
CREATE OR REPLACE FUNCTION public.sponsor_sign_offer(p_offer_id uuid)
 RETURNS TABLE(signed_sponsor_id uuid, payment_transaction_id uuid, accepted_offer_id uuid, signed_kind text, assigned_slot_no integer, created_objectives integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'pg_temp'
AS $function$declare
  v_offer record;
  v_existing_sponsor_id uuid;
  v_existing_payment_tx uuid;

  v_slot_no integer := null;
  v_signed_count integer := 0;

  v_started_at date;
  v_ends_at date;

  v_signed_sponsor_id uuid;
  v_payment_tx uuid;
  v_payment_amount bigint := 0;

  v_technical_benefit jsonb := null;
  v_technical_benefit_id uuid := null;
  v_technical_cash_support_cash bigint := 0;
  v_technical_equipment_support_cash numeric := 0;
  v_technical_category_discounts jsonb := '{}'::jsonb;

  v_objective_count integer := 0;
  v_reward_1 bigint := 0;
  v_reward_2 bigint := 0;
  v_reward_3 bigint := 0;

  v_starts_target integer := 1;
  v_top5_target integer := 1;

  v_notification_title text;
  v_notification_message text;
begin
  if p_offer_id is null then
    raise exception 'p_offer_id is required';
  end if;

  select
    o.id,
    o.club_id,
    o.season_number,
    o.company_id,
    o.sponsor_kind,
    o.slot_no,
    o.generated_game_month,
    o.coverage_months,
    o.proration_factor,
    o.full_season_guaranteed_amount,
    o.full_season_bonus_pool_amount,
    o.guaranteed_amount,
    o.bonus_pool_amount,
    o.monthly_amount,
    o.technical_discount_pct,
    o.status,
    o.metadata,
    sc.name as company_name,
    sc.country_code as company_country_code,
    sc.logo_url as company_logo_url,
    c.owner_user_id,
    c.club_tier
  into v_offer
  from public.club_sponsor_offers o
  join public.sponsor_companies sc on sc.id = o.company_id
  join public.clubs c on c.id = o.club_id
  where o.id = p_offer_id
    and c.deleted_at is null
  for update of o;

  if not found then
    raise exception 'Sponsor offer not found';
  end if;

  if auth.uid() is not null
     and auth.role() <> 'service_role'
     and v_offer.owner_user_id <> auth.uid() then
    raise exception 'You do not own this club';
  end if;

  -- Saturn 14-day trial: prevent linked-but-unconverted identities from
  -- modifying sponsor deals, objectives or branding after expiration.
  if public.saturn_test_account_requires_guard_v1()
     and not public.saturn_test_account_can_mutate_v1(v_offer.club_id) then
    raise exception 'Test account expired or not authorized for this club'
      using errcode='42501';
  end if;

  if v_offer.season_number <> public.get_current_season_number() then
    raise exception 'This sponsor offer is not for the current season';
  end if;

  if v_offer.status = 'accepted' then
    select s.id
    into v_existing_sponsor_id
    from public.club_sponsors s
    where s.club_id = v_offer.club_id
      and s.season_number = v_offer.season_number
      and s.company_id = v_offer.company_id
    order by s.created_at desc
    limit 1;

    select l.transaction_id
    into v_existing_payment_tx
    from finance.event_locks l
    where l.event_type = 'sponsor_contract_payment'
      and l.club_id = v_offer.club_id
      and l.ref_id = p_offer_id
    limit 1;

    return query
    select
      v_existing_sponsor_id,
      v_existing_payment_tx,
      p_offer_id,
      v_offer.sponsor_kind::text,
      v_offer.slot_no::integer,
      0;
    return;
  end if;

  if v_offer.status <> 'offered' then
    raise exception 'This sponsor offer is not available anymore';
  end if;

  if v_offer.sponsor_kind = 'main' then
    if exists (
      select 1
      from public.club_sponsors s
      where s.club_id = v_offer.club_id
        and s.season_number = v_offer.season_number
        and s.sponsor_kind = 'main'
        and coalesce(s.status, 'active') not in ('expired', 'ended', 'terminated', 'inactive')
    ) then
      raise exception 'A main sponsor is already signed for this club and season';
    end if;
  elsif v_offer.sponsor_kind = 'technical' then
    if exists (
      select 1
      from public.club_sponsors s
      where s.club_id = v_offer.club_id
        and s.season_number = v_offer.season_number
        and s.sponsor_kind = 'technical'
        and coalesce(s.status, 'active') not in ('expired', 'ended', 'terminated', 'inactive')
    ) then
      raise exception 'A technical sponsor is already signed for this club and season';
    end if;
  elsif v_offer.sponsor_kind = 'secondary' then
    select gs.slot_no
    into v_slot_no
    from generate_series(1, 3) as gs(slot_no)
    where not exists (
      select 1
      from public.club_sponsors s
      where s.club_id = v_offer.club_id
        and s.season_number = v_offer.season_number
        and s.sponsor_kind = 'secondary'
        and s.slot_no = gs.slot_no
        and coalesce(s.status, 'active') not in ('expired', 'ended', 'terminated', 'inactive')
    )
    order by gs.slot_no
    limit 1;

    if v_slot_no is null then
      raise exception 'All 3 secondary sponsor slots are already filled for this season';
    end if;
  else
    raise exception 'Unsupported sponsor kind %', v_offer.sponsor_kind;
  end if;

  v_started_at :=
    (public.get_game_date_for_season_start(v_offer.season_number)
      + make_interval(months => greatest(0, v_offer.generated_game_month - 1)))::date;

  v_ends_at := public.get_game_date_for_season_end(v_offer.season_number);

  insert into public.club_sponsors (
    club_id,
    company_id,
    season_number,
    name,
    monthly_amount,
    status,
    is_main,
    started_at,
    ends_at,
    sponsor_kind,
    slot_no,
    country_code,
    logo_url,
    signed_game_month,
    coverage_months,
    proration_factor,
    full_season_guaranteed_amount,
    full_season_bonus_pool_amount,
    guaranteed_amount,
    bonus_pool_amount,
    technical_discount_pct,
    metadata
  )
  values (
    v_offer.club_id,
    v_offer.company_id,
    v_offer.season_number,
    v_offer.company_name,
    v_offer.monthly_amount,
    'active',
    (v_offer.sponsor_kind = 'main'),
    v_started_at,
    v_ends_at,
    v_offer.sponsor_kind,
    case when v_offer.sponsor_kind = 'secondary' then v_slot_no else null end,
    v_offer.company_country_code,
    v_offer.company_logo_url,
    v_offer.generated_game_month,
    v_offer.coverage_months,
    v_offer.proration_factor,
    v_offer.full_season_guaranteed_amount,
    v_offer.full_season_bonus_pool_amount,
    v_offer.guaranteed_amount,
    v_offer.bonus_pool_amount,
    v_offer.technical_discount_pct,
    coalesce(v_offer.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'offer_id', v_offer.id,
        'signed_at', now(),
        'company_name', v_offer.company_name,
        'company_country_code', v_offer.company_country_code
      )
  )
  returning id into v_signed_sponsor_id;

  /*
    Sponsor payment logic.

    Main / secondary sponsors:
    - guaranteed_amount is paid as cash immediately.

    Technical sponsors:
    - guaranteed_amount is treated as total contract value.
    - only cash_support_cash is paid immediately.
    - equipment_support_budget_cash is stored separately and used later for equipment discounts.
  */
  if v_offer.sponsor_kind = 'technical' then
    v_technical_benefit := public.create_technical_sponsor_benefit_for_club_sponsor(
      v_signed_sponsor_id,
      v_offer.guaranteed_amount,
      v_started_at,
      v_ends_at,
      v_offer.season_number,
      false
    );

    v_technical_benefit_id := (v_technical_benefit->>'benefit_id')::uuid;

    v_technical_cash_support_cash := round(
      coalesce((v_technical_benefit->>'cash_support_cash')::numeric, 0)
    )::bigint;

    v_technical_equipment_support_cash := coalesce(
      (v_technical_benefit->>'equipment_support_budget_cash')::numeric,
      0
    );

    v_technical_category_discounts := coalesce(
      v_technical_benefit->'category_discounts_json',
      '{}'::jsonb
    );

    update public.club_sponsors
    set
      metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object(
          'technical_sponsor_benefit_id', v_technical_benefit_id,
          'technical_contract_value_cash', v_offer.guaranteed_amount,
          'technical_cash_support_cash', v_technical_cash_support_cash,
          'technical_equipment_support_budget_cash', v_technical_equipment_support_cash,
          'technical_category_discounts_json', v_technical_category_discounts,
          'technical_support_created_at', now()
        ),
      updated_at = now()
    where id = v_signed_sponsor_id;

    v_payment_amount := v_technical_cash_support_cash;
  else
    v_payment_amount := round(coalesce(v_offer.guaranteed_amount, 0))::bigint;
  end if;

  if v_payment_amount > 0 then
    v_payment_tx := public.finance_grant_sponsor_contract_payment(
      v_offer.club_id,
      v_offer.id,
      v_payment_amount,
      jsonb_build_object(
        'sponsor_kind', v_offer.sponsor_kind,
        'sponsor_name', v_offer.company_name,
        'season_number', v_offer.season_number,
        'coverage_months', v_offer.coverage_months,
        'proration_factor', v_offer.proration_factor,
        'full_season_guaranteed_amount', v_offer.full_season_guaranteed_amount,
        'full_season_bonus_pool_amount', v_offer.full_season_bonus_pool_amount,
        'contract_value_cash', v_offer.guaranteed_amount,
        'cash_paid_now', v_payment_amount,
        'bonus_pool_amount', v_offer.bonus_pool_amount,
        'technical_sponsor_benefit_id', v_technical_benefit_id,
        'technical_equipment_support_budget_cash', v_technical_equipment_support_cash,
        'technical_category_discounts_json', v_technical_category_discounts
      )
    );
  else
    v_payment_tx := null;
  end if;

  if v_offer.sponsor_kind = 'main' and v_offer.bonus_pool_amount > 0 then
    v_objective_count := case
      when v_offer.club_tier = 'amateur' then 1
      when v_offer.coverage_months >= 9 then 3
      when v_offer.coverage_months >= 5 then 2
      else 1
    end;

    if v_objective_count = 1 then
      v_reward_1 := v_offer.bonus_pool_amount;
    elsif v_objective_count = 2 then
      v_reward_1 := round(v_offer.bonus_pool_amount * 0.65)::bigint;
      v_reward_2 := v_offer.bonus_pool_amount - v_reward_1;
    else
      v_reward_1 := round(v_offer.bonus_pool_amount * 0.50)::bigint;
      v_reward_2 := round(v_offer.bonus_pool_amount * 0.30)::bigint;
      v_reward_3 := v_offer.bonus_pool_amount - v_reward_1 - v_reward_2;
    end if;

    v_starts_target := case
      when v_offer.club_tier = 'amateur' then 1
      when v_offer.club_tier = 'continental' then case when v_offer.coverage_months >= 8 then 2 else 1 end
      when v_offer.club_tier = 'proteam' then case when v_offer.coverage_months >= 8 then 2 else 1 end
      when v_offer.club_tier = 'worldteam' then case when v_offer.coverage_months >= 8 then 3 else 2 end
      else 1
    end;

    v_top5_target := case
      when v_offer.club_tier = 'worldteam' and v_offer.coverage_months >= 8 then 2
      else 1
    end;

    -- NEW: amateur objectives
    if v_offer.club_tier = 'amateur' then
      insert into public.club_sponsor_objectives (
        club_sponsor_id,
        objective_code,
        title,
        reward_amount,
        target_value,
        current_value,
        country_code,
        status,
        metadata
      )
      values (
        v_signed_sponsor_id,
        'sponsor_local_visibility',
        'Build visibility for sponsor in local market',
        v_reward_1,
        1,
        0,
        v_offer.company_country_code,
        'active',
        jsonb_build_object(
          'focus', 'local_visibility',
          'tier', 'amateur'
        )
      );

    elsif v_offer.club_tier = 'continental' then
      insert into public.club_sponsor_objectives (
        club_sponsor_id, objective_code, title, reward_amount, target_value, current_value, country_code, status, metadata
      )
      values (
        v_signed_sponsor_id,
        'sponsor_country_starts',
        format('Start %s races in %s or the surrounding region', v_starts_target, v_offer.company_country_code),
        v_reward_1,
        v_starts_target,
        0,
        v_offer.company_country_code,
        'active',
        jsonb_build_object('focus', 'starts', 'tier', 'continental')
      );

      if v_objective_count >= 2 then
        insert into public.club_sponsor_objectives (
          club_sponsor_id, objective_code, title, reward_amount, target_value, current_value, country_code, status, metadata
        )
        values (
          v_signed_sponsor_id,
          'sponsor_country_top10',
          format('Finish top 10 in an event connected to %s', v_offer.company_country_code),
          v_reward_2,
          1,
          0,
          v_offer.company_country_code,
          'active',
          jsonb_build_object('focus', 'top10', 'tier', 'continental')
        );
      end if;

      if v_objective_count >= 3 then
        insert into public.club_sponsor_objectives (
          club_sponsor_id, objective_code, title, reward_amount, target_value, current_value, country_code, status, metadata
        )
        values (
          v_signed_sponsor_id,
          'sponsor_country_gc_top10',
          format('Finish GC top 10 in a tour connected to %s', v_offer.company_country_code),
          v_reward_3,
          1,
          0,
          v_offer.company_country_code,
          'active',
          jsonb_build_object('focus', 'gc_top10', 'tier', 'continental')
        );
      end if;

    elsif v_offer.club_tier = 'proteam' then
      insert into public.club_sponsor_objectives (
        club_sponsor_id, objective_code, title, reward_amount, target_value, current_value, country_code, status, metadata
      )
      values (
        v_signed_sponsor_id,
        'sponsor_country_starts',
        format('Start %s races in %s or the surrounding region', v_starts_target, v_offer.company_country_code),
        v_reward_1,
        v_starts_target,
        0,
        v_offer.company_country_code,
        'active',
        jsonb_build_object('focus', 'starts', 'tier', 'proteam')
      );

      if v_objective_count >= 2 then
        insert into public.club_sponsor_objectives (
          club_sponsor_id, objective_code, title, reward_amount, target_value, current_value, country_code, status, metadata
        )
        values (
          v_signed_sponsor_id,
          'sponsor_country_podium',
          format('Finish on the podium in an event connected to %s', v_offer.company_country_code),
          v_reward_2,
          1,
          0,
          v_offer.company_country_code,
          'active',
          jsonb_build_object('focus', 'podium', 'tier', 'proteam')
        );
      end if;

      if v_objective_count >= 3 then
        insert into public.club_sponsor_objectives (
          club_sponsor_id, objective_code, title, reward_amount, target_value, current_value, country_code, status, metadata
        )
        values (
          v_signed_sponsor_id,
          'sponsor_country_stage_or_gc_top5',
          format('Take a stage win or GC top 5 in a tour connected to %s', v_offer.company_country_code),
          v_reward_3,
          1,
          0,
          v_offer.company_country_code,
          'active',
          jsonb_build_object('focus', 'stage_or_gc_top5', 'tier', 'proteam')
        );
      end if;

    elsif v_offer.club_tier = 'worldteam' then
      insert into public.club_sponsor_objectives (
        club_sponsor_id, objective_code, title, reward_amount, target_value, current_value, country_code, status, metadata
      )
      values (
        v_signed_sponsor_id,
        'sponsor_market_starts',
        format('Start %s sponsor-market events', v_starts_target),
        v_reward_1,
        v_starts_target,
        0,
        v_offer.company_country_code,
        'active',
        jsonb_build_object('focus', 'starts', 'tier', 'worldteam')
      );

      if v_objective_count >= 2 then
        insert into public.club_sponsor_objectives (
          club_sponsor_id, objective_code, title, reward_amount, target_value, current_value, country_code, status, metadata
        )
        values (
          v_signed_sponsor_id,
          'sponsor_country_win_or_podium',
          format('Win or podium in an event connected to %s', v_offer.company_country_code),
          v_reward_2,
          1,
          0,
          v_offer.company_country_code,
          'active',
          jsonb_build_object('focus', 'win_or_podium', 'tier', 'worldteam')
        );
      end if;

      if v_objective_count >= 3 then
        insert into public.club_sponsor_objectives (
          club_sponsor_id, objective_code, title, reward_amount, target_value, current_value, country_code, status, metadata
        )
        values (
          v_signed_sponsor_id,
          'sponsor_market_top5_results',
          format('Record %s top-5 results in sponsor-market events', v_top5_target),
          v_reward_3,
          v_top5_target,
          0,
          v_offer.company_country_code,
          'active',
          jsonb_build_object('focus', 'top5_results', 'tier', 'worldteam')
        );
      end if;
    end if;
  end if;

  update public.club_sponsor_offers o
  set
    status = 'accepted',
    slot_no = case when v_offer.sponsor_kind = 'secondary' then v_slot_no else o.slot_no end,
    updated_at = now(),
    metadata = coalesce(o.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'accepted_at', now(),
        'signed_sponsor_id', v_signed_sponsor_id,
        'assigned_slot_no', v_slot_no
      )
  where o.id = v_offer.id;

  if v_offer.sponsor_kind in ('main', 'technical') then
    update public.club_sponsor_offers o
    set
      status = 'rejected',
      updated_at = now(),
      metadata = coalesce(o.metadata, '{}'::jsonb)
        || jsonb_build_object('rejected_reason', 'another_offer_signed_same_kind')
    where o.club_id = v_offer.club_id
      and o.season_number = v_offer.season_number
      and o.sponsor_kind = v_offer.sponsor_kind
      and o.id <> v_offer.id
      and o.status = 'offered';
  elsif v_offer.sponsor_kind = 'secondary' then
    select count(*)
    into v_signed_count
    from public.club_sponsors s
    where s.club_id = v_offer.club_id
      and s.season_number = v_offer.season_number
      and s.sponsor_kind = 'secondary'
      and coalesce(s.status, 'active') not in ('expired', 'ended', 'terminated', 'inactive');

    if v_signed_count >= 3 then
      update public.club_sponsor_offers o
      set
        status = 'rejected',
        updated_at = now(),
        metadata = coalesce(o.metadata, '{}'::jsonb)
          || jsonb_build_object('rejected_reason', 'all_secondary_slots_filled')
      where o.club_id = v_offer.club_id
        and o.season_number = v_offer.season_number
        and o.sponsor_kind = 'secondary'
        and o.id <> v_offer.id
        and o.status = 'offered';
    end if;
  end if;

  if v_offer.owner_user_id is not null then
    v_notification_title := format('%s signed as %s sponsor', v_offer.company_name, v_offer.sponsor_kind);

    if v_offer.sponsor_kind = 'technical' then
      v_notification_message := format(
        'You signed %s as your %s sponsor for season %s. Cash paid now: $%s. Equipment support fund: $%s.',
        v_offer.company_name,
        v_offer.sponsor_kind,
        v_offer.season_number,
        to_char(coalesce(v_payment_amount, 0), 'FM999,999,999,999'),
        to_char(coalesce(v_technical_equipment_support_cash, 0), 'FM999,999,999,999')
      );
    else
      v_notification_message := format(
        'You signed %s as your %s sponsor for season %s. Guaranteed payment: $%s.',
        v_offer.company_name,
        v_offer.sponsor_kind,
        v_offer.season_number,
        to_char(coalesce(v_payment_amount, 0), 'FM999,999,999,999')
      );
    end if;

    perform public.create_infrastructure_notification(
      v_offer.owner_user_id,
      'SPONSOR_DEAL_SIGNED',
      v_notification_title,
      v_notification_message,
      '/dashboard/finance',
      jsonb_build_object(
        'club_id', v_offer.club_id,
        'offer_id', v_offer.id,
        'signed_sponsor_id', v_signed_sponsor_id,
        'payment_transaction_id', v_payment_tx,
        'sponsor_kind', v_offer.sponsor_kind,
        'company_name', v_offer.company_name,
        'season_number', v_offer.season_number,
        'coverage_months', v_offer.coverage_months,
        'guaranteed_amount', v_offer.guaranteed_amount,
        'cash_paid_now', v_payment_amount,
        'bonus_pool_amount', v_offer.bonus_pool_amount,
        'technical_sponsor_benefit_id', v_technical_benefit_id,
        'technical_equipment_support_budget_cash', v_technical_equipment_support_cash,
        'technical_category_discounts_json', v_technical_category_discounts
      )
    );
  end if;

  return query
  select
    v_signed_sponsor_id,
    v_payment_tx,
    v_offer.id,
    v_offer.sponsor_kind::text,
    v_slot_no,
    v_objective_count;
end;$function$;

-- Player-facing write: update_club_branding_v1
CREATE OR REPLACE FUNCTION public.update_club_branding_v1(p_club_id uuid, p_name text DEFAULT NULL::text, p_primary_color text DEFAULT NULL::text, p_secondary_color text DEFAULT NULL::text, p_logo_path text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, owner_user_id uuid, name text, country_code text, primary_color text, secondary_color text, logo_path text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_club public.clubs%rowtype;
  v_name text;
  v_primary_color text;
  v_secondary_color text;
  v_has_naming_lock boolean;
  v_season integer;
begin
  if p_club_id is null then
    raise exception 'Club id is required.';
  end if;

  select *
  into v_club
  from public.clubs c
  where c.id = p_club_id
  for update;

  if not found then
    raise exception 'Club not found.';
  end if;

  if v_club.owner_user_id is distinct from auth.uid() then
    raise exception 'Only the club owner can customize club branding.';
  end if;

  -- Saturn 14-day trial: prevent linked-but-unconverted identities from
  -- modifying sponsor deals, objectives or branding after expiration.
  if public.saturn_test_account_requires_guard_v1()
     and not public.saturn_test_account_can_mutate_v1(p_club_id) then
    raise exception 'Test account expired or not authorized for this club'
      using errcode='42501';
  end if;

  v_name := case
    when p_name is null then null
    else regexp_replace(trim(p_name), '\s+', ' ', 'g')
  end;

  v_primary_color := case
    when p_primary_color is null then null
    else trim(p_primary_color)
  end;

  v_secondary_color := case
    when p_secondary_color is null then null
    else trim(p_secondary_color)
  end;

  if v_name is not null and length(v_name) not between 3 and 40 then
    raise exception 'Team name must be between 3 and 40 characters.';
  end if;

  if v_primary_color is not null and v_primary_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Primary color must be a valid HEX color.';
  end if;

  if v_secondary_color is not null and v_secondary_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Secondary color must be a valid HEX color.';
  end if;

  if v_primary_color is not null
     and v_secondary_color is not null
     and lower(v_primary_color) = lower(v_secondary_color) then
    raise exception 'Primary and secondary colors must be different.';
  end if;

  v_season := public.get_current_game_season_number_safe_v1();

  select exists (
    select 1
    from public.club_season_identities i
    where i.club_id = p_club_id
      and i.season_number = v_season
      and i.is_active = true
      and i.source_type = 'sponsor_naming_rights'
  )
  into v_has_naming_lock;

  if v_has_naming_lock then
    if v_name is not null and v_name is distinct from v_club.name then
      raise exception 'Team name is locked by an active naming-rights sponsor until the end of the season.';
    end if;

    if v_primary_color is not null and v_primary_color is distinct from v_club.primary_color then
      raise exception 'Primary color is locked by an active naming-rights sponsor until the end of the season.';
    end if;

    if v_secondary_color is not null and v_secondary_color is distinct from v_club.secondary_color then
      raise exception 'Secondary color is locked by an active naming-rights sponsor until the end of the season.';
    end if;
  end if;

  return query
  update public.clubs c
  set
    name = coalesce(v_name, c.name),
    primary_color = coalesce(v_primary_color, c.primary_color),
    secondary_color = coalesce(v_secondary_color, c.secondary_color),
    logo_path = case
      when p_logo_path is null then c.logo_path
      else p_logo_path
    end
  where c.id = p_club_id
    and c.owner_user_id = auth.uid()
  returning
    c.id,
    c.owner_user_id,
    c.name,
    c.country_code,
    c.primary_color,
    c.secondary_color,
    c.logo_path;
end;
$function$;

