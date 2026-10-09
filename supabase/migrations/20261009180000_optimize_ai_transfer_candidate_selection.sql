-- Keep the accelerated daily automation within its runtime budget.
-- Semantics are unchanged: cache the game date once and inline two stable
-- predicates that were previously executed as functions for every listing row.

create index if not exists rider_transfer_offers_listing_game_date_idx
  on public.rider_transfer_offers (listing_id, offered_on_game_date)
  where offered_on_game_date is not null;

create or replace function public.ai_review_club_for_transfer_buys(
  p_club_id uuid
)
returns table(
  action_taken text,
  listing_id uuid,
  rider_id uuid,
  offer_id uuid,
  offered_price bigint
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_candidate record;
  v_offer_price bigint;
  v_offer_result record;
  v_cfg record;
  v_cash_balance bigint;
  v_first_squad_count integer := 0;
  v_today date;
begin
  select count(*)::integer
  into v_first_squad_count
  from public.club_riders cr
  where cr.club_id = p_club_id;

  if v_first_squad_count >= 18 then
    return query
    select
      'skipped_squad_full'::text,
      null::uuid,
      null::uuid,
      null::uuid,
      null::bigint;
    return;
  end if;

  select *
  into v_cfg
  from public.get_market_ai_config();

  select c.cash_balance::bigint
  into v_cash_balance
  from public.clubs c
  where c.id = p_club_id;

  v_today := public.get_market_game_date();

  select
    rtl.id as listing_id,
    rtl.rider_id,
    rtl.asking_price,
    r.market_value,
    r.potential,
    r.morale,
    r.birth_date,
    (
      (
        case
          when coalesce(r.market_value, 0) > 0
            then (
              (
                coalesce(r.market_value, 0)
                - rtl.asking_price
              )::numeric
              / r.market_value
            ) * 100
          else 0
        end
      )
      + (coalesce(r.potential, 50) - 50) * 0.6
      + greatest(
          0,
          35 - coalesce(
            greatest(
              0,
              extract(year from age(v_today, r.birth_date))::integer
            ),
            35
          )
        ) * 0.8
      + (coalesce(r.morale, 50) - 50) * 0.2
    ) as buy_score
  into v_candidate
  from public.rider_transfer_listings rtl
  join public.riders r
    on r.id = rtl.rider_id
  where rtl.status = 'listed'
    and not exists (
      select 1
      from public.club_roster_country_rules rule
      where rule.club_id = p_club_id
        and rule.rule_key = 'national_team_country_lock_v1'
        and rule.is_active = true
        and r.country_code is distinct from rule.allowed_country_code
    )
    and rtl.seller_club_id <> p_club_id
    and not exists (
      select 1
      from public.club_riders cr
      where cr.club_id = p_club_id
        and cr.rider_id = rtl.rider_id
    )
    and not exists (
      select 1
      from public.rider_transfer_offers rto
      where rto.listing_id = rtl.id
        and rto.buyer_club_id = p_club_id
        and rto.status in (
          'open',
          'club_accepted',
          'completed'
        )
    )
    and not exists (
      select 1
      from public.rider_transfer_offers rto_today
      where rto_today.listing_id = rtl.id
        and rto_today.offered_on_game_date = v_today
    )
  order by
    buy_score desc,
    rtl.asking_price asc
  limit 1;

  if v_candidate.listing_id is null then
    return query
    select
      'skipped_no_candidate'::text,
      null::uuid,
      null::uuid,
      null::uuid,
      null::bigint;
    return;
  end if;

  if coalesce(v_candidate.market_value, 0) > 0
     and v_candidate.asking_price
         <= v_candidate.market_value then
    v_offer_price := floor(
      v_candidate.asking_price
      * v_cfg.transfer_bid_pct_below_asking
    )::bigint;
  else
    v_offer_price := floor(
      v_candidate.asking_price
      * v_cfg.transfer_bid_pct_above_market
    )::bigint;
  end if;

  v_offer_price := greatest(v_offer_price, 1000);

  if not coalesce(
       v_cfg.ignore_ai_cash_constraints,
       false
     )
     and coalesce(v_cash_balance, 0) - v_offer_price
       < coalesce(v_cfg.min_club_cash_reserve, 0) then
    return query
    select
      'skipped_cash_reserve'::text,
      null::uuid,
      null::uuid,
      null::uuid,
      null::bigint;
    return;
  end if;

  select *
  into v_offer_result
  from public.admin_submit_rider_transfer_offer(
    v_candidate.listing_id::uuid,
    p_club_id::uuid,
    v_offer_price::bigint,
    null::uuid
  )
  limit 1;

  if v_offer_result.offer_id is null then
    return query
    select
      'skipped_daily_offer_limit'::text,
      v_candidate.listing_id::uuid,
      v_candidate.rider_id::uuid,
      null::uuid,
      v_offer_price::bigint;
    return;
  end if;

  return query
  select
    'offered'::text,
    v_candidate.listing_id::uuid,
    v_candidate.rider_id::uuid,
    v_offer_result.offer_id::uuid,
    v_offer_price::bigint;
end;
$function$;
