-- SAT-08: guest expiration guards on selected real-world transfer,
-- contract and training-camp financial mutations.
-- Draft only. No production schema change; no override of paid player logic.
-- Requires public.saturn_test_account_can_mutate_v1(uuid).
-- Auth checks use canonical auth.users.is_anonymous and exact owning club.
-- SECURITY DEFINER functions MUST guard before writing.

CREATE OR REPLACE FUNCTION public.accept_rider_transfer_offer(p_offer_id uuid)
 RETURNS TABLE(offer_id uuid, listing_id uuid, rider_id uuid, seller_club_id uuid, buyer_club_id uuid, negotiation_id uuid, negotiation_status text, closed_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_offer public.rider_transfer_offers%rowtype;
  v_listing public.rider_transfer_listings%rowtype;
  v_negotiation public.rider_transfer_negotiations%rowtype;
  v_start record;
  v_game_date date;

  v_buyer_owner_user_id public.clubs.owner_user_id%type;
  v_seller_club_name text;
  v_buyer_club_name text;
  v_rider_name text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_game_date := public.get_current_game_date_date();

  select *
  into v_offer
  from public.rider_transfer_offers o
  where o.id = p_offer_id
  for update;

  if not found then
    raise exception 'Transfer offer not found';
  end if;

  -- SAT-08: enforce 14-day test expiry and exact real club ownership.
  -- Existing non-anonymous managers retain the ordinary function behavior.
  if exists (
    select 1 from auth.users u
    where u.id=auth.uid() and u.is_anonymous is true
  ) and not public.saturn_test_account_can_mutate_v1(v_offer.seller_club_id) then
    raise exception 'Test account expired or not authorized for this club'
      using errcode='42501';
  end if;

  if coalesce(trim(lower(v_offer.status)), '') <> 'open' then
    raise exception 'Only open offers can be accepted';
  end if;

  select *
  into v_listing
  from public.rider_transfer_listings l
  where l.id = v_offer.listing_id
  for update;

  if not found then
    raise exception 'Transfer listing not found';
  end if;

  if coalesce(trim(lower(v_listing.status)), '') <> 'listed' then
    raise exception 'Listing is not active';
  end if;

  if not (
    exists (
      select 1
      from public.clubs c
      where c.id = v_offer.seller_club_id
        and c.owner_user_id = auth.uid()
    )
    or exists (
      select 1
      from public.club_memberships cm
      where cm.club_id = v_offer.seller_club_id
        and cm.user_id = auth.uid()
    )
  ) then
    raise exception 'Not allowed to accept offers for this club';
  end if;

  select *
  into v_start
  from public._start_rider_transfer_negotiation_internal(
    p_offer_id => v_offer.id,
    p_accepted_by => auth.uid(),
    p_auto_accepted => false
  );

  select *
  into v_negotiation
  from public.rider_transfer_negotiations n
  where n.id = v_start.negotiation_id;

  if not found then
    raise exception 'Transfer negotiation not found';
  end if;

  select
    coalesce(
      to_jsonb(c)->>'name',
      to_jsonb(c)->>'club_name',
      to_jsonb(c)->>'display_name',
      c.id::text
    )
  into v_seller_club_name
  from public.clubs c
  where c.id = v_listing.seller_club_id;

  select
    c.owner_user_id,
    coalesce(
      to_jsonb(c)->>'name',
      to_jsonb(c)->>'club_name',
      to_jsonb(c)->>'display_name',
      c.id::text
    )
  into
    v_buyer_owner_user_id,
    v_buyer_club_name
  from public.clubs c
  where c.id = v_offer.buyer_club_id;

  select
    coalesce(
      to_jsonb(r)->>'name',
      to_jsonb(r)->>'rider_name',
      to_jsonb(r)->>'display_name',
      to_jsonb(r)->>'full_name',
      r.id::text
    )
  into v_rider_name
  from public.riders r
  where r.id = v_listing.rider_id;

  v_seller_club_name := coalesce(v_seller_club_name, v_offer.seller_club_id::text);
  v_buyer_club_name := coalesce(v_buyer_club_name, v_offer.buyer_club_id::text);
  v_rider_name := coalesce(v_rider_name, v_offer.rider_id::text);

  perform public.log_rider_transfer_event(
    p_event_type      => 'offer_accepted_by_seller',
    p_rider_id        => v_offer.rider_id,
    p_listing_id      => v_offer.listing_id,
    p_offer_id        => v_offer.id,
    p_negotiation_id  => v_start.negotiation_id,
    p_seller_club_id  => v_offer.seller_club_id,
    p_buyer_club_id   => v_offer.buyer_club_id,
    p_actor_user_id   => auth.uid(),
    p_event_game_date => v_game_date,
    p_payload         => jsonb_build_object(
      'negotiation_status', v_start.negotiation_status,
      'closed_reason', v_start.closed_reason
    )
  );

  if v_buyer_owner_user_id is not null then
    begin
      if coalesce(v_start.negotiation_status, '') = 'open' then
        perform public.create_transfer_notification(
          p_user_id => v_buyer_owner_user_id,
          p_type_code => 'TRANSFER_OFFER_ACCEPTED',
          p_title => 'Transfer offer accepted',
          p_message => format(
            'Your offer of %s for %s was accepted by %s.',
            to_char(v_offer.offered_price, 'FM$999,999,999'),
            v_rider_name,
            v_seller_club_name
          ),
          p_offer_id => v_offer.id,
          p_listing_id => v_listing.id,
          p_negotiation_id => v_negotiation.id,
          p_rider_id => v_listing.rider_id,
          p_action_url => format('/dashboard/transfers/negotiations/%s', v_negotiation.id),
          p_payload_json => jsonb_build_object(
            'offer_id', v_offer.id,
            'listing_id', v_listing.id,
            'negotiation_id', v_negotiation.id,
            'rider_id', v_listing.rider_id,
            'rider_name', v_rider_name,
            'seller_club_id', v_listing.seller_club_id,
            'seller_club_name', v_seller_club_name,
            'buyer_club_id', v_offer.buyer_club_id,
            'buyer_club_name', v_buyer_club_name,
            'offered_price', v_offer.offered_price,
            'asking_price', v_listing.asking_price,
            'status', 'club_accepted'
          )
        );

        perform public.create_transfer_notification(
          p_user_id => v_buyer_owner_user_id,
          p_type_code => 'RIDER_NEGOTIATION_OPENED',
          p_title => format('Negotiation opened for %s', v_rider_name),
          p_message => format(
            'Your offer of %s was accepted by %s. You can now negotiate salary and contract length with %s.',
            to_char(v_offer.offered_price, 'FM$999,999,999'),
            v_seller_club_name,
            v_rider_name
          ),
          p_offer_id => v_offer.id,
          p_listing_id => v_listing.id,
          p_negotiation_id => v_negotiation.id,
          p_rider_id => v_listing.rider_id,
          p_action_url => format('/dashboard/transfers/negotiations/%s', v_negotiation.id),
          p_payload_json => jsonb_build_object(
            'offer_id', v_offer.id,
            'listing_id', v_listing.id,
            'negotiation_id', v_negotiation.id,
            'rider_id', v_listing.rider_id,
            'rider_name', v_rider_name,
            'seller_club_name', v_seller_club_name,
            'buyer_club_name', v_buyer_club_name,
            'expected_salary_weekly', v_negotiation.expected_salary_weekly,
            'min_acceptable_salary_weekly', v_negotiation.min_acceptable_salary_weekly,
            'preferred_duration_seasons', v_negotiation.preferred_duration_seasons,
            'status', v_negotiation.status
          )
        );
      else
        perform public.create_transfer_notification(
          p_user_id => v_buyer_owner_user_id,
          p_type_code => 'TRANSFER_OFFER_ACCEPTED',
          p_title => 'Transfer accepted, rider declined',
          p_message => format(
            '%s accepted your offer for %s, but the rider rejected the move.',
            v_seller_club_name,
            v_rider_name
          ),
          p_offer_id => v_offer.id,
          p_listing_id => v_listing.id,
          p_negotiation_id => v_negotiation.id,
          p_rider_id => v_listing.rider_id,
          p_action_url => '/dashboard/transfers',
          p_payload_json => jsonb_build_object(
            'offer_id', v_offer.id,
            'listing_id', v_listing.id,
            'negotiation_id', v_negotiation.id,
            'rider_id', v_listing.rider_id,
            'rider_name', v_rider_name,
            'seller_club_name', v_seller_club_name,
            'buyer_club_name', v_buyer_club_name,
            'offered_price', v_offer.offered_price,
            'asking_price', v_listing.asking_price,
            'status', v_start.negotiation_status,
            'closed_reason', v_start.closed_reason
          )
        );
      end if;
    exception
      when others then
        raise warning 'accept_rider_transfer_offer notification failed for offer %: %', v_offer.id, sqlerrm;
    end;
  end if;

  return query
  select
    v_offer.id,
    v_offer.listing_id,
    v_offer.rider_id,
    v_offer.seller_club_id,
    v_offer.buyer_club_id,
    v_start.negotiation_id,
    v_start.negotiation_status,
    v_start.closed_reason;
end;
$function$


CREATE OR REPLACE FUNCTION public.cancel_rider_transfer_listing(p_listing_id uuid)
 RETURNS TABLE(listing_id uuid, rider_id uuid, seller_club_id uuid, status text, auto_blocked_offer_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_listing public.rider_transfer_listings%rowtype;
  v_blocked_count integer := 0;
  v_game_date date;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_game_date := public.get_current_game_date_date();

  select *
  into v_listing
  from public.rider_transfer_listings l
  where l.id = p_listing_id
  for update;

  if not found then
    raise exception 'Transfer listing not found';
  end if;

  -- SAT-08: enforce 14-day test expiry and exact real club ownership.
  -- Existing non-anonymous managers retain the ordinary function behavior.
  if exists (
    select 1 from auth.users u
    where u.id=auth.uid() and u.is_anonymous is true
  ) and not public.saturn_test_account_can_mutate_v1(v_listing.seller_club_id) then
    raise exception 'Test account expired or not authorized for this club'
      using errcode='42501';
  end if;

  if v_listing.status <> 'listed' then
    raise exception 'Only active listings can be cancelled';
  end if;

  if not (
    exists (
      select 1
      from public.clubs c
      where c.id = v_listing.seller_club_id
        and c.owner_user_id = auth.uid()
    )
    or exists (
      select 1
      from public.club_memberships cm
      where cm.club_id = v_listing.seller_club_id
        and cm.user_id = auth.uid()
    )
  ) then
    raise exception 'Not allowed to cancel listings for this club';
  end if;

  update public.rider_transfer_listings l
  set status = 'cancelled'
  where l.id = v_listing.id
  returning *
  into v_listing;

  update public.rider_transfer_offers o
  set
    status = 'auto_blocked',
    auto_block_reason = 'listing_cancelled',
    metadata = coalesce(o.metadata, '{}'::jsonb) || jsonb_build_object(
      'auto_blocked_at', now(),
      'listing_cancelled_by', auth.uid()
    )
  where o.listing_id = v_listing.id
    and o.status = 'open';

  get diagnostics v_blocked_count = row_count;

  update public.riders r
  set release_requested = false
  where r.id = v_listing.rider_id;

  perform public.log_rider_transfer_event(
    p_event_type      => 'listing_cancelled',
    p_rider_id        => v_listing.rider_id,
    p_listing_id      => v_listing.id,
    p_seller_club_id  => v_listing.seller_club_id,
    p_actor_user_id   => auth.uid(),
    p_event_game_date => v_game_date,
    p_payload         => jsonb_build_object(
      'auto_blocked_offer_count', v_blocked_count
    )
  );

  return query
  select
    v_listing.id,
    v_listing.rider_id,
    v_listing.seller_club_id,
    v_listing.status,
    v_blocked_count;
end;
$function$


CREATE OR REPLACE FUNCTION public.cancel_training_camp_booking(p_booking_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_stage text := 'start';
  v_uid uuid;
  v_booking record;
  v_current_date date;
  v_current_hour integer := 0;
  v_current_ts timestamp;
  v_start_ts timestamp;
  v_refund_ratio numeric;
  v_refund_amount bigint := 0;
  v_club_account uuid;
  v_sink_account uuid;
  v_tx uuid;
begin
  v_stage := 'auth';
  v_uid := auth.uid();

  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  v_stage := 'load_booking';
  select
    b.id,
    b.club_id,
    b.status,
    b.start_date,
    b.total_cost
  into v_booking
  from public.training_camp_bookings b
  join public.clubs c
    on c.id = b.club_id
  where b.id = p_booking_id
    and c.owner_user_id = v_uid
  limit 1;

  if v_booking.id is null then
    raise exception 'Training camp booking not found';
  end if;

  -- SAT-08: enforce 14-day test expiry and exact real club ownership.
  -- Existing non-anonymous managers retain the ordinary function behavior.
  if exists (
    select 1 from auth.users u
    where u.id=auth.uid() and u.is_anonymous is true
  ) and not public.saturn_test_account_can_mutate_v1(v_booking.club_id) then
    raise exception 'Test account expired or not authorized for this club'
      using errcode='42501';
  end if;

  v_stage := 'status_check';
  if v_booking.status not in ('planned', 'active') then
    raise exception 'Only planned or active camps can be cancelled';
  end if;

  v_stage := 'current_game_date';
  select public.get_current_game_date_date()
  into v_current_date;

  select coalesce(gs.hour_number, 0)
  into v_current_hour
  from public.game_state gs
  where gs.id = true
  limit 1;

  v_current_ts :=
    v_current_date::timestamp
    + make_interval(hours => v_current_hour);

  v_start_ts := v_booking.start_date::timestamp;

  v_stage := 'refund_calculation';
  if v_current_ts <= (v_start_ts - interval '48 hours') then
    v_refund_ratio := 1.00;
  else
    v_refund_ratio := 0.20;
  end if;

  v_refund_amount := round(coalesce(v_booking.total_cost, 0) * v_refund_ratio);

  v_stage := 'resolve_accounts';
  if v_refund_amount > 0 then
    select id
    into v_club_account
    from finance.accounts
    where club_id = v_booking.club_id
      and currency = 'CASH'
      and kind = 'main'
    limit 1;

    select id
    into v_sink_account
    from finance.accounts
    where system_code = 'SINK'
      and currency = 'CASH'
      and kind = 'main'
    limit 1;

    if v_club_account is null then
      raise exception 'Club cash account not found';
    end if;

    if v_sink_account is null then
      raise exception 'Sink account not found';
    end if;
  end if;

  v_stage := 'refund_transaction';
  if v_refund_amount > 0 then
    insert into finance.transactions(type, created_by, metadata)
    values (
      'training_camp_refund',
      v_uid,
      jsonb_build_object(
        'booking_id', v_booking.id,
        'refund_ratio', v_refund_ratio,
        'refund_amount', v_refund_amount
      )
    )
    returning id into v_tx;

    insert into finance.entries(transaction_id, account_id, amount, memo)
    values
      (v_tx, v_club_account,  v_refund_amount, 'training camp refund credit'),
      (v_tx, v_sink_account, -v_refund_amount, 'training camp refund debit');
  end if;

  v_stage := 'cancel_booking';
  update public.training_camp_bookings
  set status = 'cancelled'
  where id = v_booking.id;

  return jsonb_build_object(
    'ok', true,
    'booking_id', v_booking.id,
    'refund_amount', v_refund_amount,
    'refund_ratio', v_refund_ratio
  );

exception
  when others then
    raise exception 'cancel_training_camp_booking failed at stage [%]: %', v_stage, SQLERRM;
end;
$function$


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

  -- SAT-08: enforce 14-day test expiry and exact real club ownership.
  -- Existing non-anonymous managers retain the ordinary function behavior.
  if exists (
    select 1 from auth.users u
    where u.id=auth.uid() and u.is_anonymous is true
  ) and not public.saturn_test_account_can_mutate_v1(v_bid.buyer_club_id) then
    raise exception 'Test account expired or not authorized for this club'
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
$function$


CREATE OR REPLACE FUNCTION public.extend_club_staff_contract(p_staff_id uuid, p_seasons integer, p_salary_weekly integer)
 RETURNS TABLE(staff_id uuid, staff_name text, new_salary_weekly integer, new_contract_expires_at date, new_season_number integer, decision_status text, decision_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid;
  v_quote record;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'You must be signed in to extend staff contracts.';
  end if;

  -- SAT-08: enforce 14-day test expiry and exact real club ownership.
  -- Existing non-anonymous managers retain the ordinary function behavior.
  if exists (
    select 1 from auth.users u
    where u.id=auth.uid() and u.is_anonymous is true
  ) and not public.saturn_test_account_can_mutate_v1((select cs.club_id from public.club_staff cs where cs.id=p_staff_id)) then
    raise exception 'Test account expired or not authorized for this club'
      using errcode='42501';
  end if;

  if p_seasons not in (1, 2) then
    raise exception 'Please choose a valid contract length.';
  end if;

  if p_salary_weekly is null or p_salary_weekly <= 0 then
    raise exception 'Please enter a valid weekly salary.';
  end if;

  select *
  into v_quote
  from public.staff_get_contract_extension_quote(p_staff_id, p_seasons);

  if v_quote.staff_id is null then
    raise exception 'No contract quote is available for this staff member.';
  end if;

  if v_quote.willingness_status = 'unwilling' then
    return query
    select
      v_quote.staff_id,
      v_quote.staff_name,
      v_quote.current_salary_weekly,
      null::date,
      null::integer,
      'unwilling'::text,
      (v_quote.staff_name || ' is not interested in extending the contract right now.')::text;
    return;
  end if;

  if p_salary_weekly < v_quote.minimum_acceptable_salary_weekly then
    return query
    select
      v_quote.staff_id,
      v_quote.staff_name,
      v_quote.current_salary_weekly,
      null::date,
      null::integer,
      'rejected'::text,
      (
        v_quote.staff_name ||
        ' rejected the offer. He wants at least $' ||
        v_quote.minimum_acceptable_salary_weekly::text ||
        ' per week.'
      )::text;
    return;
  end if;

  if p_salary_weekly < v_quote.requested_salary_weekly then
    return query
    select
      v_quote.staff_id,
      v_quote.staff_name,
      v_quote.current_salary_weekly,
      null::date,
      null::integer,
      'countered'::text,
      (
        v_quote.staff_name ||
        ' is interested, but wants closer to $' ||
        v_quote.requested_salary_weekly::text ||
        ' per week.'
      )::text;
    return;
  end if;

  update public.club_staff
  set
    salary_weekly = p_salary_weekly,
    contract_expires_at = v_quote.target_contract_expires_at,
    updated_at = now()
  where id = p_staff_id
    and is_active = true;

  return query
  select
    cs.id,
    cs.staff_name,
    cs.salary_weekly,
    cs.contract_expires_at,
    extract(year from cs.contract_expires_at)::int - 1999,
    'accepted'::text,
    (
      cs.staff_name ||
      ' accepted the new contract until Season ' ||
      (extract(year from cs.contract_expires_at)::int - 1999)::text ||
      '.'
    )::text
  from public.club_staff cs
  where cs.id = p_staff_id
  limit 1;
end;
$function$


CREATE OR REPLACE FUNCTION public.finance_book_training_camp(p_club_id uuid, p_camp_id uuid, p_start_date date, p_days integer, p_rider_ids uuid[], p_idempotency_key text)
 RETURNS TABLE(booking_id uuid, finance_transaction_id uuid, booking_status text, total_cost integer, participants_count integer, weather_state text, validation_warnings jsonb, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare
  v_stage text := 'start';
  v_uid uuid;
  v_normalized_rider_ids uuid[];
  v_eligible_rider_ids uuid[];
  v_eligible_rider_count integer := 0;

  v_owner_user_id uuid;
  v_family_club_ids uuid[];

  v_validation record;
  v_quote record;
  v_camp record;

  v_finance_tx uuid;
  v_existing_booking record;
  v_new_booking_id uuid;
  v_inserted_participants integer := 0;
  v_created_at timestamptz;
begin
  v_stage := 'auth';
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- SAT-08: enforce 14-day test expiry and exact real club ownership.
  -- Existing non-anonymous managers retain the ordinary function behavior.
  if exists (
    select 1 from auth.users u
    where u.id=auth.uid() and u.is_anonymous is true
  ) and not public.saturn_test_account_can_mutate_v1(p_club_id) then
    raise exception 'Test account expired or not authorized for this club'
      using errcode='42501';
  end if;

  v_stage := 'idempotency_key_check';
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'Idempotency key is required';
  end if;

  v_stage := 'normalize_riders';
  select coalesce(array_agg(x.rider_id), '{}'::uuid[])
  into v_normalized_rider_ids
  from (
    select distinct unnest(coalesce(p_rider_ids, '{}'::uuid[])) as rider_id
  ) x;

  v_stage := 'resolve_club_family';
  select c.owner_user_id
  into v_owner_user_id
  from public.clubs c
  where c.id = p_club_id
  limit 1;

  if v_owner_user_id is null then
    raise exception 'Club not found';
  end if;

  select coalesce(array_agg(c.id), '{}'::uuid[])
  into v_family_club_ids
  from public.clubs c
  where c.owner_user_id = v_owner_user_id;

  v_stage := 'resolve_eligible_riders';
  select
    coalesce(array_agg(cr.rider_id order by cr.rider_id), '{}'::uuid[]),
    count(*)
  into v_eligible_rider_ids, v_eligible_rider_count
  from public.club_roster cr
  where cr.club_id = any(v_family_club_ids)
    and cr.rider_id = any(v_normalized_rider_ids)
    and cr.availability_status in ('fit', 'not_fully_fit', 'injured', 'sick');

  if v_eligible_rider_count < 5 then
    raise exception 'Need at least 5 eligible riders, found %.', v_eligible_rider_count;
  end if;

  v_stage := 'validate_booking';
  select *
  into v_validation
  from public.validate_training_camp_booking(
    p_club_id,
    p_camp_id,
    p_start_date,
    p_days,
    v_eligible_rider_ids
  );

  if not coalesce(v_validation.is_valid, false) then
    raise exception 'Training camp booking validation failed: %',
      coalesce(v_validation.validation_errors::text, '[]');
  end if;

  v_stage := 'get_quote';
  select *
  into v_quote
  from public.get_training_camp_quote(
    p_club_id,
    p_camp_id,
    p_start_date,
    p_days,
    v_eligible_rider_ids
  );

  if v_quote.camp_id is null then
    raise exception 'Quote generation returned no row';
  end if;

  v_stage := 'load_camp_snapshot';
  select
    id,
    name,
    city_name,
    country_code,
    camp_type,
    stars
  into v_camp
  from public.training_camp_catalog
  where id = p_camp_id
  limit 1;

  if v_camp.id is null then
    raise exception 'Training camp not found';
  end if;

  v_stage := 'finance_spend_from_club';
  v_finance_tx := public.finance_spend_from_club(
    p_club_id,
    v_quote.total_cost,
    'training_camp_booking',
    'SINK',
    p_idempotency_key,
    jsonb_build_object(
      'camp_id', v_camp.id,
      'camp_name', v_camp.name,
      'city_name', v_camp.city_name,
      'country_code', v_camp.country_code,
      'camp_type', v_camp.camp_type,
      'start_date', p_start_date,
      'days', p_days,
      'participants_count', v_quote.participants_count,
      'weather_state', v_quote.weather_state,
      'travel_total', v_quote.travel_total,
      'accommodation_total', v_quote.accommodation_total,
      'camp_fee_total', v_quote.camp_fee_total,
      'logistics_total', v_quote.logistics_total,
      'total_cost', v_quote.total_cost,
      'rider_ids', to_jsonb(v_eligible_rider_ids)
    )
  );

  if v_finance_tx is null then
    raise exception 'finance_spend_from_club returned null transaction id';
  end if;

  v_stage := 'check_existing_booking_by_finance_tx';
  select
    b.id,
    b.finance_transaction_id,
    b.status,
    b.total_cost,
    b.participants_count,
    b.created_at
  into v_existing_booking
  from public.training_camp_bookings b
  where b.finance_transaction_id = v_finance_tx
  limit 1;

  if v_existing_booking.id is not null then
    return query
    select
      v_existing_booking.id,
      v_existing_booking.finance_transaction_id,
      v_existing_booking.status,
      v_existing_booking.total_cost,
      v_existing_booking.participants_count,
      v_quote.weather_state,
      coalesce(v_validation.validation_warnings, '[]'::jsonb),
      v_existing_booking.created_at;
    return;
  end if;

  v_stage := 'insert_booking';
  insert into public.training_camp_bookings as tcb (
    club_id,
    camp_id,
    start_date,
    end_date,
    days_count,
    status,
    participants_count,
    camp_type_snapshot,
    stars_snapshot,
    city_snapshot,
    country_code_snapshot,
    weather_summary,
    travel_cost_total,
    accommodation_cost_total,
    camp_fee_cost_total,
    logistics_cost_total,
    total_cost,
    finance_transaction_id,
    created_by_user_id
  )
  values (
    p_club_id,
    p_camp_id,
    p_start_date,
    (p_start_date + (p_days - 1)),
    p_days,
    'planned',
    v_quote.participants_count,
    v_camp.camp_type,
    v_camp.stars,
    v_camp.city_name,
    v_camp.country_code,
    jsonb_build_object(
      'weather_state', v_quote.weather_state,
      'weather_score', v_quote.weather_score,
      'training_modifier', v_quote.training_modifier,
      'missed_day_chance', v_quote.missed_day_chance
    ),
    v_quote.travel_total,
    v_quote.accommodation_total,
    v_quote.camp_fee_total,
    v_quote.logistics_total,
    v_quote.total_cost,
    v_finance_tx,
    v_uid
  )
  returning tcb.id, tcb.created_at
  into v_new_booking_id, v_created_at;

  v_stage := 'insert_participants';
  insert into public.training_camp_participants (
    booking_id,
    rider_id
  )
  select
    v_new_booking_id,
    x.rider_id
  from unnest(v_eligible_rider_ids) as x(rider_id);

  get diagnostics v_inserted_participants = row_count;

  v_stage := 'participant_count_check';
  if v_inserted_participants < 5 then
    raise exception 'Booking creation failed: fewer than 5 eligible riders were inserted (%).', v_inserted_participants;
  end if;

  v_stage := 'update_booking_participant_count';
  update public.training_camp_bookings
  set participants_count = v_inserted_participants
  where id = v_new_booking_id;

  v_stage := 'return_success';
  return query
  select
    v_new_booking_id,
    v_finance_tx,
    'planned'::text,
    v_quote.total_cost,
    v_inserted_participants,
    v_quote.weather_state,
    coalesce(v_validation.validation_warnings, '[]'::jsonb),
    v_created_at;

exception
  when others then
    raise exception 'finance_book_training_camp failed at stage [%]: %', v_stage, SQLERRM;
end;$function$


CREATE OR REPLACE FUNCTION public.finance_book_training_camp_v2(p_club_id uuid, p_camp_id uuid, p_start_date date, p_days integer, p_rider_ids uuid[], p_staff_ids uuid[], p_idempotency_key text)
 RETURNS TABLE(booking_id uuid, finance_transaction_id uuid, booking_status text, total_cost integer, participants_count integer, staff_count integer, charged_participants_count integer, weather_state text, validation_warnings jsonb, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare
  v_stage text := 'start';
  v_uid uuid;
  v_current_game_date date;
  v_normalized_rider_ids uuid[];
  v_normalized_staff_ids uuid[];
  v_eligible_rider_ids uuid[];
  v_eligible_staff_ids uuid[];
  v_eligible_rider_count integer := 0;
  v_eligible_staff_count integer := 0;

  v_owner_user_id uuid;
  v_family_club_ids uuid[];

  v_validation record;
  v_quote record;
  v_camp record;

  v_finance_tx uuid;
  v_existing_booking record;
  v_new_booking_id uuid;
  v_inserted_participants integer := 0;
  v_inserted_staff integer := 0;
  v_created_at timestamptz;
begin
  v_stage := 'auth';
  v_uid := auth.uid();

  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- SAT-08: enforce 14-day test expiry and exact real club ownership.
  -- Existing non-anonymous managers retain the ordinary function behavior.
  if exists (
    select 1 from auth.users u
    where u.id=auth.uid() and u.is_anonymous is true
  ) and not public.saturn_test_account_can_mutate_v1(p_club_id) then
    raise exception 'Test account expired or not authorized for this club'
      using errcode='42501';
  end if;

  v_stage := 'idempotency_key_check';

  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'Idempotency key is required';
  end if;

  v_stage := 'current_game_date_check';

  select public.get_current_game_date_date()
  into v_current_game_date;

  if v_current_game_date is null then
    raise exception 'Current game date could not be resolved.';
  end if;

  if p_start_date <= v_current_game_date then
    raise exception 'Training camp cannot start today or in the past. Earliest start is tomorrow.';
  end if;

  v_stage := 'normalize_ids';

  select coalesce(array_agg(x.rider_id), '{}'::uuid[])
  into v_normalized_rider_ids
  from (
    select distinct unnest(coalesce(p_rider_ids, '{}'::uuid[])) as rider_id
  ) x;

  select coalesce(array_agg(x.staff_id), '{}'::uuid[])
  into v_normalized_staff_ids
  from (
    select distinct unnest(coalesce(p_staff_ids, '{}'::uuid[])) as staff_id
  ) x;

  v_stage := 'resolve_club_family';

  select c.owner_user_id
  into v_owner_user_id
  from public.clubs c
  where c.id = p_club_id
  limit 1;

  if v_owner_user_id is null then
    raise exception 'Club not found';
  end if;

  select coalesce(array_agg(c.id), '{}'::uuid[])
  into v_family_club_ids
  from public.clubs c
  where c.owner_user_id = v_owner_user_id
    and c.deleted_at is null
    and coalesce(c.club_type, 'main') in ('main', 'developing');

  v_stage := 'resolve_eligible_riders';

  select
    coalesce(array_agg(cr.rider_id order by cr.rider_id), '{}'::uuid[]),
    count(*)
  into v_eligible_rider_ids, v_eligible_rider_count
  from public.club_roster cr
  where cr.club_id = any(v_family_club_ids)
    and cr.rider_id = any(v_normalized_rider_ids)
    and cr.availability_status in ('fit', 'not_fully_fit', 'injured', 'sick');

  if v_eligible_rider_count < 5 then
    raise exception 'Need at least 5 eligible riders, found %.', v_eligible_rider_count;
  end if;

  v_stage := 'resolve_eligible_staff';

  select
    coalesce(array_agg(cs.id order by cs.id), '{}'::uuid[]),
    count(*)
  into v_eligible_staff_ids, v_eligible_staff_count
  from public.club_staff cs
  where cs.club_id = any(v_family_club_ids)
    and cs.id = any(v_normalized_staff_ids)
    and cs.is_active = true
    and cs.role_type in ('head_coach', 'team_doctor', 'mechanic', 'sport_director')
    and not exists (
      select 1
      from public.staff_courses sc
      where sc.staff_id = cs.id
        and sc.status = 'active'
    )
    and not exists (
      select 1
      from public.training_camp_staff_assignments a
      join public.training_camp_bookings b
        on b.id = a.booking_id
      where a.staff_id = cs.id
        and b.status in ('planned', 'active')
        and (p_start_date - 1) <= (b.end_date + 1)
        and (b.start_date - 1) <= (p_start_date + p_days)
    );

  v_stage := 'validate_booking';

  select *
  into v_validation
  from public.validate_training_camp_booking_v2(
    p_club_id,
    p_camp_id,
    p_start_date,
    p_days,
    v_normalized_rider_ids,
    v_normalized_staff_ids
  );

  if not coalesce(v_validation.is_valid, false) then
    raise exception 'Training camp booking validation failed: %',
      coalesce(v_validation.validation_errors::text, '[]');
  end if;

  v_stage := 'get_quote';

  select *
  into v_quote
  from public.get_training_camp_quote_v2(
    p_club_id,
    p_camp_id,
    p_start_date,
    p_days,
    v_eligible_rider_ids,
    v_eligible_staff_ids
  );

  if v_quote.camp_id is null then
    raise exception 'Quote generation returned no row';
  end if;

  v_stage := 'load_camp_snapshot';

  select
    id,
    name,
    city_name,
    country_code,
    region_name,
    camp_type,
    stars
  into v_camp
  from public.training_camp_catalog
  where id = p_camp_id
  limit 1;

  if v_camp.id is null then
    raise exception 'Training camp not found';
  end if;

  v_stage := 'finance_spend_from_club';

  v_finance_tx := public.finance_spend_from_club(
    p_club_id,
    v_quote.total_cost,
    'training_camp_booking',
    'SINK',
    p_idempotency_key,
    jsonb_build_object(
      'camp_id', v_camp.id,
      'camp_name', v_camp.name,
      'city_name', v_camp.city_name,
      'country_code', v_camp.country_code,
      'region_name', v_camp.region_name,
      'camp_type', v_camp.camp_type,
      'start_date', p_start_date,
      'days', p_days,
      'riders_count', v_quote.riders_count,
      'staff_count', v_quote.staff_count,
      'charged_participants_count', v_quote.charged_participants_count,
      'participants_count', v_quote.participants_count,
      'weather_state', v_quote.weather_state,
      'travel_total', v_quote.travel_total,
      'accommodation_total', v_quote.accommodation_total,
      'camp_fee_total', v_quote.camp_fee_total,
      'logistics_total', v_quote.logistics_total,
      'total_cost', v_quote.total_cost,
      'rider_ids', to_jsonb(v_eligible_rider_ids),
      'staff_ids', to_jsonb(v_eligible_staff_ids)
    )
  );

  if v_finance_tx is null then
    raise exception 'finance_spend_from_club returned null transaction id';
  end if;

  v_stage := 'check_existing_booking_by_finance_tx';

  select
    b.id,
    b.finance_transaction_id,
    b.status,
    b.total_cost,
    b.participants_count,
    b.staff_count,
    b.charged_participants_count,
    b.created_at
  into v_existing_booking
  from public.training_camp_bookings b
  where b.finance_transaction_id = v_finance_tx
  limit 1;

  if v_existing_booking.id is not null then
    return query
    select
      v_existing_booking.id,
      v_existing_booking.finance_transaction_id,
      v_existing_booking.status,
      v_existing_booking.total_cost,
      v_existing_booking.participants_count,
      v_existing_booking.staff_count,
      v_existing_booking.charged_participants_count,
      v_quote.weather_state,
      coalesce(v_validation.validation_warnings, '[]'::jsonb),
      v_existing_booking.created_at;
    return;
  end if;

  v_stage := 'insert_booking';

  insert into public.training_camp_bookings as tcb (
    club_id,
    camp_id,
    start_date,
    end_date,
    days_count,
    status,
    participants_count,
    staff_count,
    charged_participants_count,
    camp_name,
    country_code,
    region_name,
    camp_type_snapshot,
    stars_snapshot,
    city_snapshot,
    country_code_snapshot,
    weather_summary,
    travel_cost_total,
    accommodation_cost_total,
    camp_fee_cost_total,
    logistics_cost_total,
    total_cost,
    finance_transaction_id,
    created_by_user_id,
    notes
  )
  values (
    p_club_id,
    p_camp_id,
    p_start_date,
    (p_start_date + (p_days - 1)),
    p_days,
    'planned',
    v_quote.riders_count,
    v_quote.staff_count,
    v_quote.charged_participants_count,
    v_camp.name,
    v_camp.country_code,
    v_camp.region_name,
    v_camp.camp_type,
    v_camp.stars,
    v_camp.city_name,
    v_camp.country_code,
    jsonb_build_object(
      'weather_state', v_quote.weather_state,
      'weather_score', v_quote.weather_score,
      'training_modifier', v_quote.training_modifier,
      'missed_day_chance', v_quote.missed_day_chance
    ),
    v_quote.travel_total,
    v_quote.accommodation_total,
    v_quote.camp_fee_total,
    v_quote.logistics_total,
    v_quote.total_cost,
    v_finance_tx,
    v_uid,
    jsonb_build_object(
      'riders_count', v_quote.riders_count,
      'staff_count', v_quote.staff_count,
      'charged_participants_count', v_quote.charged_participants_count
    )
  )
  returning tcb.id, tcb.created_at
  into v_new_booking_id, v_created_at;

  v_stage := 'insert_participants';

  insert into public.training_camp_participants (
    booking_id,
    rider_id
  )
  select
    v_new_booking_id,
    x.rider_id
  from unnest(v_eligible_rider_ids) as x(rider_id);

  get diagnostics v_inserted_participants = row_count;

  if v_inserted_participants < 5 then
    raise exception 'Booking creation failed: fewer than 5 eligible riders were inserted (%).', v_inserted_participants;
  end if;

  v_stage := 'insert_staff_assignments';

  insert into public.training_camp_staff_assignments (
    booking_id,
    staff_id,
    club_id,
    role_type,
    staff_name_snapshot,
    boost_label,
    boost_metadata
  )
  select
    v_new_booking_id,
    cs.id,
    cs.club_id,
    cs.role_type,
    cs.staff_name,
    boost.boost_label,
    boost.boost_metadata
  from public.club_staff cs
  cross join lateral public.training_camp_staff_boost(
    cs.role_type,
    cs.expertise,
    cs.experience,
    cs.potential,
    cs.leadership,
    cs.efficiency,
    cs.loyalty
  ) boost
  where cs.id = any(v_eligible_staff_ids)
  on conflict do nothing;

  get diagnostics v_inserted_staff = row_count;

  v_stage := 'update_booking_counts';

  update public.training_camp_bookings
  set
    participants_count = v_inserted_participants,
    staff_count = v_inserted_staff,
    charged_participants_count = v_inserted_participants + v_inserted_staff,
    notes = coalesce(notes, '{}'::jsonb) || jsonb_build_object(
      'riders_count', v_inserted_participants,
      'staff_count', v_inserted_staff,
      'charged_participants_count', v_inserted_participants + v_inserted_staff,
      'staff_boost_summary', public.get_training_camp_staff_boost_summary(v_new_booking_id)
    )
  where id = v_new_booking_id;

  v_stage := 'return_success';

  return query
  select
    v_new_booking_id,
    v_finance_tx,
    'planned'::text,
    v_quote.total_cost,
    v_inserted_participants,
    v_inserted_staff,
    v_inserted_participants + v_inserted_staff,
    v_quote.weather_state,
    coalesce(v_validation.validation_warnings, '[]'::jsonb),
    v_created_at;

exception
  when others then
    raise exception 'finance_book_training_camp_v2 failed at stage [%]: %', v_stage, sqlerrm;
end;$function$


