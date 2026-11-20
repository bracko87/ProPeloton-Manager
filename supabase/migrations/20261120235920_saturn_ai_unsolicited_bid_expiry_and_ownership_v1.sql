-- SAT-08: unsolicted AI bid authorization + 14-day lifecycle hardening.
-- DRAFT ONLY. Does not alter decision scoring, money movements, or race engine.
-- Existing club member/owner path retained, but explicitly checked before
-- even hard-rejected bids are recorded. Production remains unchanged.

-- Player transfer action: confirm_unsolicited_ai_transfer_bid_v1
CREATE OR REPLACE FUNCTION public.confirm_unsolicited_ai_transfer_bid_v1(p_bid_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();

  v_bid public.rider_unsolicited_transfer_bids%rowtype;

  v_today date;
  v_expires_on date;

  v_current_owner_club_id uuid;
  v_seller_is_ai boolean := false;

  v_listing_id uuid;
  v_offer_id uuid;
  v_negotiation_id uuid;

  v_existing_listing_id uuid;
  v_existing_offer_id uuid;
  v_existing_negotiation_id uuid;

  v_cash_balance bigint := 0;
  v_reserved_normal_offers bigint := 0;
  v_reserved_unsolicited bigint := 0;
  v_available_transfer_funds bigint := 0;

  v_current_salary integer := 0;
  v_expected_salary integer := 0;
  v_min_salary integer := 0;
  v_preferred_duration smallint := 1;
  v_salary_breakdown jsonb := '{}'::jsonb;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_bid_id is null then
    raise exception 'bid_id is required';
  end if;

  v_today := public.get_market_game_date();

  select *
  into v_bid
  from public.rider_unsolicited_transfer_bids ub
  where ub.id = p_bid_id
  for update;

  if not found then
    raise exception 'Unsolicited transfer bid not found';
  end if;

  if not (
    exists (
      select 1
      from public.clubs c
      where c.id = v_bid.buyer_club_id
        and c.owner_user_id = v_uid
    )
    or exists (
      select 1
      from public.club_memberships cm
      where cm.club_id = v_bid.buyer_club_id
        and cm.user_id = v_uid
    )
  ) then
    raise exception 'Not allowed to confirm this bid';
  end if;

  -- Conversion-to-negotiation is player initiated; account linking alone
  -- cannot remove the 14-day unconverted trial restriction.
  if public.saturn_test_account_requires_guard_v1()
     and not public.saturn_test_account_can_mutate_v1(v_bid.buyer_club_id) then
    raise exception 'Test account expired or not authorized to confirm AI bid'
      using errcode='42501';
  end if;

  if v_bid.status = 'converted_to_transfer_flow' then
    v_existing_listing_id := nullif(v_bid.metadata ->> 'listing_id', '')::uuid;
    v_existing_offer_id := nullif(v_bid.metadata ->> 'offer_id', '')::uuid;
    v_existing_negotiation_id := nullif(v_bid.metadata ->> 'negotiation_id', '')::uuid;

    return jsonb_build_object(
      'success', true,
      'already_converted', true,
      'bid_id', v_bid.id,
      'listing_id', v_existing_listing_id,
      'offer_id', v_existing_offer_id,
      'negotiation_id', v_existing_negotiation_id,
      'message', 'This premium bid was already converted into rider negotiation.'
    );
  end if;

  if v_bid.status <> 'accepted_pending_confirmation'
     or v_bid.ai_decision <> 'accepted' then
    raise exception
      'Bid must be accepted_pending_confirmation before conversion. Current status %, ai_decision %',
      v_bid.status,
      v_bid.ai_decision;
  end if;

  if v_bid.expires_on_game_date is not null and v_today > v_bid.expires_on_game_date then
    update public.rider_unsolicited_transfer_bids
    set
      status = 'expired',
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'expired_during_confirmation', true,
        'expired_checked_at', now()
      )
    where id = v_bid.id;

    raise exception 'This premium bid has expired';
  end if;

  select cr.club_id
  into v_current_owner_club_id
  from public.club_riders cr
  where cr.rider_id = v_bid.rider_id
  limit 1
  for update;

  if v_current_owner_club_id is null then
    raise exception 'Rider is no longer assigned to any club';
  end if;

  if v_current_owner_club_id <> v_bid.seller_club_id then
    raise exception 'Rider is no longer owned by the original selling club';
  end if;

  select coalesce(c.is_ai, false)
  into v_seller_is_ai
  from public.clubs c
  where c.id = v_bid.seller_club_id;

  if coalesce(v_seller_is_ai, false) = false then
    raise exception 'Selling club is no longer AI-controlled';
  end if;

  if exists (
    select 1
    from public.rider_transfer_listings l
    where l.rider_id = v_bid.rider_id
      and l.status in ('listed', 'club_accepted')
  ) then
    raise exception 'Rider already has an active transfer listing';
  end if;

  if exists (
    select 1
    from public.rider_transfer_offers o
    where o.rider_id = v_bid.rider_id
      and o.status in ('open', 'club_accepted')
  ) then
    raise exception 'Rider already has an active transfer offer';
  end if;

  if exists (
    select 1
    from public.rider_transfer_negotiations n
    where n.rider_id = v_bid.rider_id
      and n.status = 'open'
  ) then
    raise exception 'Rider already has an open transfer negotiation';
  end if;

  select coalesce(c.cash_balance, 0)::bigint
  into v_cash_balance
  from public.clubs c
  where c.id = v_bid.buyer_club_id;

  select coalesce(sum(o.offered_price), 0)::bigint
  into v_reserved_normal_offers
  from public.rider_transfer_offers o
  where o.buyer_club_id = v_bid.buyer_club_id
    and o.status in ('open', 'club_accepted');

  select coalesce(sum(ub.offer_amount_cash), 0)::bigint
  into v_reserved_unsolicited
  from public.rider_unsolicited_transfer_bids ub
  where ub.buyer_club_id = v_bid.buyer_club_id
    and ub.id <> v_bid.id
    and ub.status in ('submitted', 'countered', 'accepted_pending_confirmation');

  v_available_transfer_funds :=
    greatest(
      coalesce(v_cash_balance, 0)
      - coalesce(v_reserved_normal_offers, 0)
      - coalesce(v_reserved_unsolicited, 0),
      0
    );

  if v_bid.offer_amount_cash > v_available_transfer_funds then
    raise exception
      'Insufficient available transfer funds. Available %, needed %',
      v_available_transfer_funds,
      v_bid.offer_amount_cash;
  end if;

  select
    t.current_salary_weekly,
    t.expected_salary_weekly,
    t.min_acceptable_salary_weekly,
    t.preferred_duration_seasons,
    t.salary_breakdown_json
  into
    v_current_salary,
    v_expected_salary,
    v_min_salary,
    v_preferred_duration,
    v_salary_breakdown
  from public.calculate_unsolicited_ai_transfer_personal_terms_v1(
    v_bid.rider_id,
    v_bid.buyer_club_id,
    v_bid.seller_club_id,
    v_bid.offer_amount_cash
  ) t
  limit 1;

  v_expires_on := least(
    coalesce(v_bid.expires_on_game_date, v_today + 3),
    v_today + 3
  );

  insert into public.rider_transfer_listings (
    rider_id,
    seller_club_id,
    asking_price,
    min_allowed_price,
    max_allowed_price,
    listed_on_game_date,
    expires_on_game_date,
    status,
    auto_price_clamped,
    status_changed_at_game_ts,
    status_changed_game_ts
  )
  values (
    v_bid.rider_id,
    v_bid.seller_club_id,
    v_bid.offer_amount_cash,
    v_bid.offer_amount_cash,
    v_bid.offer_amount_cash,
    v_today,
    v_expires_on,
    'club_accepted',
    false,
    now()::timestamp,
    now()::timestamp
  )
  returning id into v_listing_id;

  insert into public.rider_transfer_offers (
    listing_id,
    rider_id,
    seller_club_id,
    buyer_club_id,
    offered_price,
    offered_on_game_date,
    status,
    auto_block_reason,
    metadata,
    expires_on_game_date,
    status_changed_at_game_ts,
    status_changed_at_game_at
  )
  values (
    v_listing_id,
    v_bid.rider_id,
    v_bid.seller_club_id,
    v_bid.buyer_club_id,
    v_bid.offer_amount_cash,
    v_today,
    'club_accepted',
    null,
    jsonb_build_object(
      'source', 'unsolicited_ai_premium_bid',
      'unsolicited_bid_id', v_bid.id,
      'club_accepted_at', now(),
      'club_auto_accepted', true,
      'premium_offer_amount_cash', v_bid.offer_amount_cash,
      'market_value_snapshot', v_bid.market_value_snapshot,
      'resistance_multiplier_snapshot', v_bid.resistance_multiplier_snapshot
    ),
    v_expires_on,
    now()::timestamp,
    now()::timestamp
  )
  returning id into v_offer_id;

  insert into public.rider_transfer_negotiations (
    offer_id,
    listing_id,
    rider_id,
    seller_club_id,
    buyer_club_id,
    status,
    current_salary_weekly,
    expected_salary_weekly,
    min_acceptable_salary_weekly,
    preferred_duration_seasons,
    offer_salary_weekly,
    offer_duration_seasons,
    attempt_count,
    max_attempts,
    locked_until,
    opened_on_game_date,
    expires_on_game_date,
    closed_reason,
    notes_json,
    status_changed_at_game_ts,
    offer_signing_bonus,
    offer_agent_fee
  )
  values (
    v_offer_id,
    v_listing_id,
    v_bid.rider_id,
    v_bid.seller_club_id,
    v_bid.buyer_club_id,
    'open',
    v_current_salary,
    v_expected_salary,
    v_min_salary,
    v_preferred_duration,
    null,
    null,
    0,
    5,
    null,
    v_today,
    v_expires_on,
    null,
    jsonb_build_object(
      'source', 'unsolicited_ai_premium_bid',
      'unsolicited_bid_id', v_bid.id,
      'premium_transfer_fee', v_bid.offer_amount_cash,
      'expected_salary_weekly', v_expected_salary,
      'min_acceptable_salary_weekly', v_min_salary,
      'preferred_duration_seasons', v_preferred_duration,
      'salary_breakdown', v_salary_breakdown
    ),
    now()::timestamp,
    null,
    null
  )
  returning id into v_negotiation_id;

  update public.rider_unsolicited_transfer_bids ub
  set
    status = 'converted_to_transfer_flow',
    metadata = coalesce(ub.metadata, '{}'::jsonb) || jsonb_build_object(
      'converted_to_transfer_flow', true,
      'converted_at', now(),
      'listing_id', v_listing_id,
      'offer_id', v_offer_id,
      'negotiation_id', v_negotiation_id,
      'expected_salary_weekly', v_expected_salary,
      'min_acceptable_salary_weekly', v_min_salary,
      'preferred_duration_seasons', v_preferred_duration,
      'salary_breakdown', v_salary_breakdown,
      'phase', 'phase_2_opened_rider_negotiation_salary_v2'
    )
  where ub.id = v_bid.id;

  return jsonb_build_object(
    'success', true,
    'bid_id', v_bid.id,
    'status', 'converted_to_transfer_flow',
    'listing_id', v_listing_id,
    'offer_id', v_offer_id,
    'negotiation_id', v_negotiation_id,
    'rider_id', v_bid.rider_id,
    'buyer_club_id', v_bid.buyer_club_id,
    'seller_club_id', v_bid.seller_club_id,
    'transfer_fee_cash', v_bid.offer_amount_cash,
    'current_salary_weekly', v_current_salary,
    'expected_salary_weekly', v_expected_salary,
    'min_acceptable_salary_weekly', v_min_salary,
    'preferred_duration_seasons', v_preferred_duration,
    'salary_breakdown', v_salary_breakdown,
    'message', 'Premium bid converted. Rider personal-terms negotiation is now open.'
  );
end;
$function$;

-- Player transfer action: submit_unsolicited_ai_transfer_bid_v1
CREATE OR REPLACE FUNCTION public.submit_unsolicited_ai_transfer_bid_v1(p_rider_id uuid, p_buyer_club_id uuid, p_offer_amount_cash bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_review record;
  v_today date;
  v_expires_on date;
  v_bid_id uuid;

  v_cash_balance bigint := 0;
  v_reserved_normal_offers bigint := 0;
  v_reserved_unsolicited bigint := 0;
  v_available_transfer_funds bigint := 0;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Authorization must precede even the early hard-rejected bid INSERT.
  -- The decision calculator has a similar access check; enforce it here
  -- independently so refactors cannot silently admit other club IDs.
  if not (
    exists (
      select 1 from public.clubs c
      where c.id=p_buyer_club_id and c.owner_user_id=v_uid
        and c.deleted_at is null
    )
    or exists (
      select 1 from public.club_memberships cm
      join public.clubs c on c.id=cm.club_id
      where cm.club_id=p_buyer_club_id and cm.user_id=v_uid
        and c.deleted_at is null
    )
  ) then
    raise exception 'Not allowed to bid from this club'
      using errcode='42501';
  end if;

  if public.saturn_test_account_requires_guard_v1()
     and not public.saturn_test_account_can_mutate_v1(p_buyer_club_id) then
    raise exception 'Test account expired or not authorized for AI transfer bid'
      using errcode='42501';
  end if;

  if p_offer_amount_cash is null or p_offer_amount_cash <= 0 then
    raise exception 'Offer amount must be greater than 0';
  end if;

  v_today := public.get_market_game_date();
  v_expires_on := v_today + 2;

  select *
  into v_review
  from public.calculate_ai_unsolicited_transfer_decision_v1(
    p_rider_id,
    p_buyer_club_id,
    p_offer_amount_cash
  )
  limit 1;

  if v_review.hard_block then
    insert into public.rider_unsolicited_transfer_bids (
      rider_id,
      buyer_club_id,
      seller_club_id,
      offer_amount_cash,
      status,
      ai_decision,
      market_value_snapshot,
      resistance_price_snapshot,
      resistance_multiplier_snapshot,
      counteroffer_amount_cash,
      decision_breakdown_json,
      offered_on_game_date,
      expires_on_game_date,
      created_by_user_id,
      metadata
    )
    values (
      p_rider_id,
      p_buyer_club_id,
      v_review.seller_club_id,
      p_offer_amount_cash,
      'rejected',
      'hard_rejected',
      v_review.market_value,
      v_review.resistance_price,
      v_review.resistance_multiplier,
      null,
      v_review.decision_breakdown_json,
      v_today,
      v_expires_on,
      v_uid,
      jsonb_build_object('source', 'submit_unsolicited_ai_transfer_bid_v1')
    )
    returning id into v_bid_id;

    return jsonb_build_object(
      'success', true,
      'bid_id', v_bid_id,
      'status', 'rejected',
      'ai_decision', 'hard_rejected',
      'message', 'The selling club is not willing to consider this rider right now.'
    );
  end if;

  select coalesce(c.cash_balance, 0)::bigint
  into v_cash_balance
  from public.clubs c
  where c.id = p_buyer_club_id;

  select coalesce(sum(o.offered_price), 0)::bigint
  into v_reserved_normal_offers
  from public.rider_transfer_offers o
  where o.buyer_club_id = p_buyer_club_id
    and o.status in ('open', 'club_accepted');

  select coalesce(sum(ub.offer_amount_cash), 0)::bigint
  into v_reserved_unsolicited
  from public.rider_unsolicited_transfer_bids ub
  where ub.buyer_club_id = p_buyer_club_id
    and ub.status in ('submitted', 'countered', 'accepted_pending_confirmation');

  v_available_transfer_funds :=
    greatest(
      coalesce(v_cash_balance, 0)
      - coalesce(v_reserved_normal_offers, 0)
      - coalesce(v_reserved_unsolicited, 0),
      0
    );

  if p_offer_amount_cash > v_available_transfer_funds then
    raise exception
      'Insufficient funds: available %, reserved %, need %',
      public.format_money_us(v_available_transfer_funds::numeric),
      public.format_money_us((coalesce(v_reserved_normal_offers, 0) + coalesce(v_reserved_unsolicited, 0))::numeric),
      public.format_money_us(p_offer_amount_cash::numeric);
  end if;

  insert into public.rider_unsolicited_transfer_bids (
    rider_id,
    buyer_club_id,
    seller_club_id,
    offer_amount_cash,
    status,
    ai_decision,
    market_value_snapshot,
    resistance_price_snapshot,
    resistance_multiplier_snapshot,
    counteroffer_amount_cash,
    decision_breakdown_json,
    offered_on_game_date,
    expires_on_game_date,
    created_by_user_id,
    metadata
  )
  values (
    p_rider_id,
    p_buyer_club_id,
    v_review.seller_club_id,
    p_offer_amount_cash,
    v_review.suggested_status,
    v_review.ai_decision,
    v_review.market_value,
    v_review.resistance_price,
    v_review.resistance_multiplier,
    v_review.counteroffer_amount,
    v_review.decision_breakdown_json,
    v_today,
    v_expires_on,
    v_uid,
    jsonb_build_object(
      'source', 'submit_unsolicited_ai_transfer_bid_v1',
      'phase', 'phase_1_no_money_no_rider_move'
    )
  )
  returning id into v_bid_id;

  return jsonb_build_object(
    'success', true,
    'bid_id', v_bid_id,
    'rider_id', p_rider_id,
    'buyer_club_id', p_buyer_club_id,
    'seller_club_id', v_review.seller_club_id,
    'offer_amount_cash', p_offer_amount_cash,
    'status', v_review.suggested_status,
    'ai_decision', v_review.ai_decision,

    -- Public result only.
    -- Hidden resistance_price_snapshot is stored in DB for audit/admin balancing,
    -- but not returned to frontend here.
    'counteroffer_amount_cash',
      case
        when v_review.ai_decision = 'counteroffer'
          then v_review.counteroffer_amount
        else null
      end,

    'message', case
      when v_review.ai_decision = 'accepted'
        then 'The AI club accepted the transfer fee. Confirm the bid to open rider personal-terms negotiation.'
      when v_review.ai_decision = 'counteroffer'
        then 'The AI club is not ready to accept, but sent a counteroffer.'
      when v_review.ai_decision = 'rejected_low_offer'
        then 'The AI club rejected the offer as too low for a non-listed rider.'
      else 'The offer was rejected.'
    end
  );
end;
$function$;

