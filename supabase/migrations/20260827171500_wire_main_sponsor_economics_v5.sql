-- Wire main-sponsor economics V5 into future generation and daily refresh.
-- Keep the original daily refresh implementation as a core function so its
-- rotation/proration behaviour remains unchanged, then finalize main offers
-- through V5 after the core refresh completes.

do $$
begin
  if to_regprocedure('public.sponsor_refresh_daily_offers_core_v1(uuid)') is null
     and to_regprocedure('public.sponsor_refresh_daily_offers(uuid)') is not null
  then
    execute 'alter function public.sponsor_refresh_daily_offers(uuid) rename to sponsor_refresh_daily_offers_core_v1';
  end if;
end
$$;

create or replace function public.sponsor_refresh_daily_offers(p_club_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_base jsonb;
  v_season integer;
  v_finalize jsonb;
begin
  v_base := public.sponsor_refresh_daily_offers_core_v1(p_club_id);

  v_season := coalesce(
    nullif(v_base->>'season_number', '')::integer,
    (select coalesce(gs.season_number, 1) from public.game_state gs limit 1),
    1
  );

  v_finalize := public.sponsor_finalize_main_offer_portfolio_v5(p_club_id, v_season);

  return coalesce(v_base, '{}'::jsonb)
    || jsonb_build_object(
      'main_offer_economic_model', 'v5_one_total_split',
      'main_offer_finalize', v_finalize
    );
end;
$function$;

create or replace function public.sponsor_generate_offers(
  p_club_id uuid,
  p_force boolean default false
)
returns table(
  season_number integer,
  game_month integer,
  coverage_months integer,
  proration_factor numeric,
  inserted_count integer,
  main_offers integer,
  secondary_offers integer,
  technical_offers integer
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_core record;
  v_finalize jsonb;
begin
  select * into v_core
  from public.sponsor_generate_offers_core_v1(p_club_id, p_force);

  if not found then
    return;
  end if;

  v_finalize := public.sponsor_finalize_main_offer_portfolio_v5(
    p_club_id,
    v_core.season_number
  );

  return query
  select
    v_core.season_number::integer,
    v_core.game_month::integer,
    v_core.coverage_months::integer,
    v_core.proration_factor::numeric,
    v_core.inserted_count::integer,
    (
      select count(*)::integer
      from public.club_sponsor_offers o
      where o.club_id = p_club_id
        and o.season_number = v_core.season_number
        and o.sponsor_kind = 'main'
        and o.status = 'offered'
    ),
    (
      select count(*)::integer
      from public.club_sponsor_offers o
      where o.club_id = p_club_id
        and o.season_number = v_core.season_number
        and o.sponsor_kind = 'secondary'
        and o.status = 'offered'
    ),
    (
      select count(*)::integer
      from public.club_sponsor_offers o
      where o.club_id = p_club_id
        and o.season_number = v_core.season_number
        and o.sponsor_kind = 'technical'
        and o.status = 'offered'
    );
end;
$function$;

-- Bring current player-controlled unsigned main offers onto V5 immediately.
-- Signed sponsor contracts are deliberately excluded.
do $$
declare
  v_season integer;
  r record;
begin
  select coalesce(gs.season_number, 1)
  into v_season
  from public.game_state gs
  limit 1;

  for r in
    select distinct c.id
    from public.clubs c
    join public.club_sponsor_offers o on o.club_id = c.id
    where c.deleted_at is null
      and c.is_active = true
      and coalesce(c.club_type::text, 'main') = 'main'
      and c.owner_user_id is not null
      and o.season_number = v_season
      and o.sponsor_kind = 'main'
      and o.status = 'offered'
  loop
    perform public.sponsor_finalize_main_offer_portfolio_v5(r.id, v_season);
  end loop;
end
$$;
