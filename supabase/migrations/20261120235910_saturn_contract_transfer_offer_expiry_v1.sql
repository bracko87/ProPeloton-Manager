-- SAT-08 player contract and transfer-offer write guards (draft only).
-- Uses the existing ownership checks BEFORE the unconverted trial check.
-- Read-only market, staff quote and automated transfer engine unchanged.
-- No migration deployment or production privilege changes authorized.

-- Player-facing contract/transfer write: cancel_rider_transfer_listing
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

  -- A linked email/Google identity still obeys the original 14-day trial
  -- until verified Saturn conversion sets converted_at on the same UUID.
  if public.saturn_test_account_requires_guard_v1()
     and not public.saturn_test_account_can_mutate_v1(v_listing.seller_club_id) then
    raise exception 'Test account expired or not authorized for transfer'
      using errcode='42501';
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
$function$;

-- Player-facing contract/transfer write: reject_rider_transfer_offer
CREATE OR REPLACE FUNCTION public.reject_rider_transfer_offer(p_offer_id uuid)
 RETURNS TABLE(offer_id uuid, listing_id uuid, rider_id uuid, seller_club_id uuid, buyer_club_id uuid, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare
  v_offer public.rider_transfer_offers%rowtype;
  v_listing public.rider_transfer_listings%rowtype;
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

  select *
  into v_listing
  from public.rider_transfer_listings l
  where l.id = v_offer.listing_id;

  if not found then
    raise exception 'Transfer listing not found';
  end if;

  if v_offer.status <> 'open' then
    raise exception 'Only open offers can be rejected';
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
    raise exception 'Not allowed to reject offers for this club';
  end if;

  -- A linked email/Google identity still obeys the original 14-day trial
  -- until verified Saturn conversion sets converted_at on the same UUID.
  if public.saturn_test_account_requires_guard_v1()
     and not public.saturn_test_account_can_mutate_v1(v_offer.seller_club_id) then
    raise exception 'Test account expired or not authorized for transfer'
      using errcode='42501';
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
  where c.id = v_offer.seller_club_id;

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

  update public.rider_transfer_offers o
  set
    status = 'rejected',
    auto_block_reason = null,
    metadata = coalesce(o.metadata, '{}'::jsonb) || jsonb_build_object(
      'rejected_at', now(),
      'rejected_by', auth.uid()
    )
  where o.id = v_offer.id
  returning * into v_offer;

  perform public.log_rider_transfer_event(
    p_event_type      => 'offer_rejected',
    p_rider_id        => v_offer.rider_id,
    p_listing_id      => v_offer.listing_id,
    p_offer_id        => v_offer.id,
    p_seller_club_id  => v_offer.seller_club_id,
    p_buyer_club_id   => v_offer.buyer_club_id,
    p_actor_user_id   => auth.uid(),
    p_event_game_date => v_game_date,
    p_payload         => jsonb_build_object(
      'offered_price', v_offer.offered_price
    )
  );

  if v_buyer_owner_user_id is not null then
    perform public.create_transfer_notification(
      p_user_id => v_buyer_owner_user_id,
      p_type_code => 'TRANSFER_OFFER_REJECTED',
      p_title => 'Transfer offer rejected',
      p_message => format(
        '%s rejected your offer for %s.',
        v_seller_club_name,
        v_rider_name
      ),
      p_offer_id => v_offer.id,
      p_listing_id => v_listing.id,
      p_rider_id => v_listing.rider_id,
      p_action_url => '/#/dashboard/transfers',
      p_payload_json => jsonb_build_object(
        'offer_id', v_offer.id,
        'listing_id', v_listing.id,
        'rider_id', v_listing.rider_id,
        'rider_name', v_rider_name,
        'seller_club_id', v_listing.seller_club_id,
        'seller_club_name', v_seller_club_name,
        'buyer_club_id', v_offer.buyer_club_id,
        'buyer_club_name', v_buyer_club_name,
        'offered_price', v_offer.offered_price,
        'asking_price', v_listing.asking_price,
        'status', 'rejected'
      )
    );
  end if;

  return query
  select
    v_offer.id,
    v_offer.listing_id,
    v_offer.rider_id,
    v_offer.seller_club_id,
    v_offer.buyer_club_id,
    v_offer.status;
end;$function$;

-- Player-facing contract/transfer write: submit_contract_renewal_offer
CREATE OR REPLACE FUNCTION public.submit_contract_renewal_offer(p_negotiation_id uuid, p_offer_salary_weekly integer, p_offer_extension_seasons smallint)
 RETURNS TABLE(accepted boolean, message text, negotiation_closed boolean, attempt_count integer, cooldown_until timestamp with time zone, new_salary_weekly integer, new_contract_end_season integer, new_contract_expires_at date, new_morale smallint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_neg public.rider_contract_negotiations%rowtype;
  v_rider public.riders%rowtype;
  v_contract public.rider_contracts%rowtype;
  v_current_game_date date;
  v_attempt_count integer;
  v_max_attempts integer;
  v_recent_form_score numeric := 0;
  v_accept_score numeric := 0;
  v_threshold numeric := 0;
  v_release_request_penalty numeric := 0;
  v_release_threshold_penalty numeric := 0;
  v_new_end_season integer;
  v_new_expires_on date;
  v_new_duration smallint;
  v_locked_until date;
  v_reject_reason text := '';
  v_success_morale_bonus integer := 3;
  v_new_morale smallint;
begin
  select *
  into v_neg
  from public.rider_contract_negotiations n
  where n.id = p_negotiation_id
    and n.status = 'open'
  limit 1;

  if not found then
    raise exception 'Open negotiation not found.';
  end if;

  if not exists (
    select 1
    from public.clubs c
    where c.id = v_neg.club_id
      and c.owner_user_id = auth.uid()
      and c.club_type = 'main'
      and c.is_active = true
      and c.deleted_at is null
  ) then
    raise exception 'Negotiation does not belong to your main club.';
  end if;

  -- A linked email/Google identity still obeys the original 14-day trial
  -- until verified Saturn conversion sets converted_at on the same UUID.
  if public.saturn_test_account_requires_guard_v1()
     and not public.saturn_test_account_can_mutate_v1(v_neg.club_id) then
    raise exception 'Test account expired or not authorized for transfer'
      using errcode='42501';
  end if;

  v_current_game_date := public.get_current_game_date_date();
  v_attempt_count := coalesce(v_neg.attempt_count, 0);
  v_max_attempts := coalesce(v_neg.max_attempts, 5);

  if v_neg.locked_until is not null and v_neg.locked_until > v_current_game_date then
    raise exception 'Negotiation cooldown active until %', v_neg.locked_until;
  end if;

  select *
  into v_rider
  from public.riders r
  where r.id = v_neg.rider_id;

  select *
  into v_contract
  from public.rider_contracts rc
  where rc.rider_id = v_neg.rider_id
    and rc.club_id = v_neg.club_id
    and rc.status = 'active'
  order by rc.created_at desc
  limit 1;

  if not found then
    raise exception 'Active rider contract not found.';
  end if;

  /*
    Real recent form:
    Higher recent form makes the rider more demanding.
    This affects the acceptance score and threshold, but remains capped.
  */
  begin
    v_recent_form_score := coalesce(public.calculate_rider_recent_form_score_v1(v_neg.rider_id), 0);
  exception when others then
    v_recent_form_score := 0;
  end;

  if coalesce(v_rider.release_requested, false) = true then
    v_release_request_penalty := 18;
    v_release_threshold_penalty := 8;
  end if;

  v_accept_score :=
      (p_offer_salary_weekly::numeric / greatest(v_neg.expected_salary_weekly, 1)::numeric) * 100
    + (p_offer_extension_seasons * 4)
    - ((100 - coalesce(v_rider.morale, 50)) * 0.12)
    - (least(coalesce(v_recent_form_score, 0), 30) * 0.35)
    - v_release_request_penalty;

  v_threshold :=
      92
    + ((100 - coalesce(v_rider.morale, 50)) * 0.08)
    + (least(coalesce(v_recent_form_score, 0), 30) * 0.22)
    + v_release_threshold_penalty;

  if p_offer_salary_weekly < v_neg.min_acceptable_salary_weekly then
    v_reject_reason := 'Rider refused the offer because the salary is below his current expectations.';
  elsif p_offer_extension_seasons < 1 or p_offer_extension_seasons > 2 then
    v_reject_reason := 'Rider refused the offer because he is not happy with the proposed contract length.';
  elsif v_accept_score < v_threshold then
    if coalesce(v_rider.release_requested, false) = true then
      v_reject_reason := 'Rider refused the offer because he has already requested to leave and needs a much stronger reason to stay.';
    elsif coalesce(v_rider.morale, 50) < 45 or coalesce(v_recent_form_score, 0) >= 10 then
      v_reject_reason := 'Rider refused the offer because recent form and morale increase his demands.';
    else
      v_reject_reason := 'Rider refused the offer because the salary is below his current expectations.';
    end if;
  else
    v_new_end_season :=
      coalesce(v_contract.end_season_number, public.season_from_game_date(v_contract.expires_on))
      + p_offer_extension_seasons;

    v_new_expires_on := public.get_game_date_for_season_end(v_new_end_season);

    v_new_duration := p_offer_extension_seasons;

    if p_offer_salary_weekly::numeric >= (v_neg.expected_salary_weekly::numeric * 1.15) then
      v_success_morale_bonus := 5;
    else
      v_success_morale_bonus := 3;
    end if;

    v_new_morale :=
      least(
        100,
        greatest(
          0,
          coalesce(v_rider.morale, 50)::int + v_success_morale_bonus
        )
      )::smallint;

    update public.rider_contract_negotiations
    set
      status = 'accepted',
      responded_at = now(),
      offer_salary_weekly = p_offer_salary_weekly,
      offer_extension_seasons = p_offer_extension_seasons,
      offer_duration_seasons = p_offer_extension_seasons,
      attempt_count = v_attempt_count,
      locked_until = null,
      closed_reason = 'accepted',
      notes_json = coalesce(notes_json, '{}'::jsonb) || jsonb_build_object(
        'release_requested_at_offer', coalesce(v_rider.release_requested, false),
        'morale_at_offer', coalesce(v_rider.morale, 50),
        'recent_form_score_at_offer', v_recent_form_score,
        'accept_score', v_accept_score,
        'accept_threshold', v_threshold,
        'morale_after_acceptance', v_new_morale,
        'morale_bonus_from_renewal', v_success_morale_bonus
      ),
      updated_at = now()
    where id = v_neg.id;

    update public.rider_contracts
    set
      salary_weekly = p_offer_salary_weekly,
      duration_seasons = v_new_duration,
      expires_on = v_new_expires_on,
      end_season_number = v_new_end_season,
      signed_morale = v_new_morale,
      notes_json = coalesce(notes_json, '{}'::jsonb) || jsonb_build_object(
        'renewal_morale_bonus', v_success_morale_bonus,
        'release_request_resolved_by_renewal', coalesce(v_rider.release_requested, false),
        'recent_form_score_at_renewal', v_recent_form_score
      ),
      updated_at = now()
    where id = v_contract.id;

    update public.riders
    set
      salary = p_offer_salary_weekly,
      contract_expires_at = v_new_expires_on,
      contract_expires_season = v_new_end_season,
      morale = v_new_morale,
      low_morale_since = null,
      asked_for_more_selection = false,
      release_requested = false
    where id = v_rider.id;

    return query
    select
      true,
      format(
        'Contract extended for %s %s until season %s. Rider morale improved by %s.',
        p_offer_extension_seasons,
        case when p_offer_extension_seasons = 1 then 'season' else 'seasons' end,
        v_new_end_season,
        v_success_morale_bonus
      ),
      true,
      v_attempt_count,
      null::timestamptz,
      p_offer_salary_weekly,
      v_new_end_season,
      v_new_expires_on,
      v_new_morale;

    return;
  end if;

  v_attempt_count := v_attempt_count + 1;

  if v_attempt_count >= v_max_attempts then
    v_locked_until := v_current_game_date + 3;

    update public.rider_contract_negotiations
    set
      status = 'rejected',
      responded_at = now(),
      offer_salary_weekly = p_offer_salary_weekly,
      offer_extension_seasons = p_offer_extension_seasons,
      offer_duration_seasons = p_offer_extension_seasons,
      attempt_count = v_attempt_count,
      locked_until = v_locked_until,
      closed_reason = 'max_attempts_reached',
      notes_json = coalesce(notes_json, '{}'::jsonb) || jsonb_build_object(
        'release_requested_at_final_rejection', coalesce(v_rider.release_requested, false),
        'morale_before_final_rejection', coalesce(v_rider.morale, 50),
        'recent_form_score_at_final_rejection', v_recent_form_score,
        'morale_penalty_from_failed_negotiation', 10
      ),
      updated_at = now()
    where id = v_neg.id;

    update public.riders
    set
      morale = greatest(0, morale - 10),
      low_morale_since = case
        when greatest(0, morale - 10) < 20 and low_morale_since is null then v_current_game_date
        when greatest(0, morale - 10) >= 20 then null
        else low_morale_since
      end,
      asked_for_more_selection = case
        when greatest(0, morale - 10) < 20 then true
        else asked_for_more_selection
      end
    where id = v_rider.id
    returning morale into v_new_morale;

    return query
    select
      false,
      'Negotiations have collapsed for 3 in-game days, and morale dropped by 10.',
      true,
      v_attempt_count,
      v_locked_until::timestamptz,
      null::integer,
      null::integer,
      null::date,
      v_new_morale;

    return;
  end if;

  update public.rider_contract_negotiations
  set
    offer_salary_weekly = p_offer_salary_weekly,
    offer_extension_seasons = p_offer_extension_seasons,
    offer_duration_seasons = p_offer_extension_seasons,
    attempt_count = v_attempt_count,
    locked_until = null,
    notes_json = coalesce(notes_json, '{}'::jsonb) || jsonb_build_object(
      'release_requested_at_rejection', coalesce(v_rider.release_requested, false),
      'morale_at_rejection', coalesce(v_rider.morale, 50),
      'recent_form_score_at_rejection', v_recent_form_score,
      'accept_score', v_accept_score,
      'accept_threshold', v_threshold
    ),
    updated_at = now()
  where id = v_neg.id;

  return query
  select
    false,
    v_reject_reason,
    false,
    v_attempt_count,
    null::timestamptz,
    null::integer,
    null::integer,
    null::date,
    v_rider.morale;
end;
$function$;

-- Player-facing contract/transfer write: withdraw_rider_transfer_offer
CREATE OR REPLACE FUNCTION public.withdraw_rider_transfer_offer(p_offer_id uuid)
 RETURNS TABLE(offer_id uuid, offer_status text, listing_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_buyer_club_id uuid;
  v_offer public.rider_transfer_offers%rowtype;
  v_listing public.rider_transfer_listings%rowtype;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  v_buyer_club_id := public._get_owned_main_club_id(v_user_id);

  select *
  into v_offer
  from public.rider_transfer_offers
  where id = p_offer_id
  for update;

  if not found then
    raise exception 'Offer not found';
  end if;

  if v_offer.buyer_club_id <> v_buyer_club_id then
    raise exception 'You cannot cancel this offer';
  end if;

  -- A linked email/Google identity still obeys the original 14-day trial
  -- until verified Saturn conversion sets converted_at on the same UUID.
  if public.saturn_test_account_requires_guard_v1()
     and not public.saturn_test_account_can_mutate_v1(v_buyer_club_id) then
    raise exception 'Test account expired or not authorized for transfer'
      using errcode='42501';
  end if;

  if v_offer.status <> 'open' then
    raise exception 'Only open offers can be cancelled';
  end if;

  select *
  into v_listing
  from public.rider_transfer_listings
  where id = v_offer.listing_id
  for update;

  update public.rider_transfer_offers
  set
    status = 'withdrawn',
    auto_block_reason = 'withdrawn_by_buyer',
    updated_at = now()
  where id = p_offer_id;

  if v_listing.id is not null and v_listing.status = 'listed' then
    update public.rider_transfer_listings
    set
      updated_at = now()
    where id = v_listing.id;
  end if;

  return query
  select
    v_offer.id,
    'withdrawn'::text,
    coalesce(v_listing.status, 'listed')::text;
end;
$function$;

