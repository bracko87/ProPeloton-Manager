-- Main sponsor economics V6.
-- Reduce every offered main-sponsor contract total by 30% versus V5.
-- Preserve the naming-rights 30-50% premium versus the best standard offer.
-- Keep the V5 guarantee/bonus split, then rebuild objectives through market-group V4.

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

    if coalesce(new.metadata ->> 'economic_model_version', '') in (
      'v5_one_total_split',
      'v6_reduced_30_market_split'
    ) then
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
          'test_preview_economic_model', coalesce(new.metadata ->> 'economic_model_version', '')
        );
      return new;
    end if;

    v_base_guaranteed := greatest(0, coalesce(new.full_season_guaranteed_amount, new.guaranteed_amount, 0));
    v_base_bonus := greatest(0, coalesce(new.full_season_bonus_pool_amount, new.bonus_pool_amount, 0));

    if coalesce(new.main_sponsor_deal_type, 'standard') = 'naming_rights' then
      v_uplift := greatest(30, least(40, coalesce(
        new.naming_rights_uplift_pct,
        nullif(new.metadata ->> 'naming_rights_uplift_pct', '')::numeric,
        30
      )));
    end if;

    new.guaranteed_amount := floor(v_base_guaranteed::numeric * (1 + v_uplift / 100.0))::bigint;
    new.bonus_pool_amount := floor(v_base_bonus::numeric * (1 + v_uplift / 100.0))::bigint;
    new.monthly_amount := floor(new.guaranteed_amount::numeric / 12)::bigint;
  end if;

  return new;
end;
$function$;

create or replace function public.sponsor_finalize_main_offer_portfolio_v6(p_club_id uuid,p_season integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_base jsonb;
  v_offer record;
  v_v5_total bigint;
  v_full_total bigint;
  v_full_guaranteed bigint;
  v_full_bonus bigint;
  v_current_total bigint;
  v_current_guaranteed bigint;
  v_current_bonus bigint;
  v_monthly bigint;
  v_share numeric;
  v_factor numeric;
  v_preview jsonb;
  v_preview_total bigint;
  v_previewed integer:=0;
begin
  v_base:=public.sponsor_finalize_main_offer_portfolio_v5(p_club_id,p_season);

  for v_offer in
    select o.*
    from public.club_sponsor_offers o
    where o.club_id=p_club_id
      and o.season_number=p_season
      and o.sponsor_kind='main'
      and o.status='offered'
    order by o.created_at,o.id
  loop
    v_v5_total:=greatest(0,coalesce(
      nullif(v_offer.metadata->>'full_season_contract_total_value','')::bigint,
      coalesce(v_offer.full_season_guaranteed_amount,0)+coalesce(v_offer.full_season_bonus_pool_amount,0)
    ));
    v_full_total:=round(v_v5_total::numeric*0.70)::bigint;
    v_share:=coalesce(nullif(v_offer.metadata->>'guaranteed_share_pct','')::numeric,
      case when coalesce(v_offer.main_sponsor_deal_type,'standard')='naming_rights' then 80 else 70 end);
    v_share:=greatest(0,least(100,v_share));
    v_full_guaranteed:=floor(v_full_total::numeric*v_share/100.0)::bigint;
    v_full_bonus:=greatest(0,v_full_total-v_full_guaranteed);
    v_factor:=greatest(0.01,least(1.0,coalesce(v_offer.proration_factor,
      case when coalesce(v_offer.coverage_months,0)>0 then v_offer.coverage_months::numeric/12.0 else 1.0 end)));
    v_current_total:=round(v_full_total::numeric*v_factor)::bigint;
    v_current_guaranteed:=floor(v_full_guaranteed::numeric*v_factor)::bigint;
    v_current_bonus:=greatest(0,v_current_total-v_current_guaranteed);
    v_monthly:=case when coalesce(v_offer.coverage_months,0)>0
      then floor(v_current_guaranteed::numeric/v_offer.coverage_months)::bigint else v_current_guaranteed end;

    update public.club_sponsor_offers o
    set full_season_guaranteed_amount=v_full_guaranteed,
        full_season_bonus_pool_amount=v_full_bonus,
        guaranteed_amount=v_current_guaranteed,
        bonus_pool_amount=v_current_bonus,
        monthly_amount=v_monthly,
        metadata=(case
          when coalesce(o.metadata->>'offer_description_version','')='v5_total_breakdown'
            then coalesce(o.metadata,'{}'::jsonb)-'description'-'offer_description_version'
          else coalesce(o.metadata,'{}'::jsonb)
        end) || jsonb_build_object(
          'economic_model_version','v6_reduced_30_market_split',
          'pre_reduction_full_season_contract_total_value',v_v5_total,
          'sponsor_total_reduction_pct',30,
          'full_season_contract_total_value',v_full_total,
          'contract_total_value',v_current_total,
          'guaranteed_amount',v_current_guaranteed,
          'bonus_pool_amount',v_current_bonus,
          'guaranteed_share_pct',round(v_share,2),
          'bonus_share_pct',round(100-v_share,2),
          'objective_market_policy','country_market_groups_v4',
          'economics_refreshed_at',now()
        )
    where o.id=v_offer.id;
  end loop;

  for v_offer in
    select o.id
    from public.club_sponsor_offers o
    where o.club_id=p_club_id
      and o.season_number=p_season
      and o.sponsor_kind='main'
      and o.status='offered'
  loop
    v_preview:=public.sponsor_build_offer_preview_objectives_v4(v_offer.id);
    select coalesce(sum((x.value->>'estimated_reward_amount')::bigint),0)::bigint
      into v_preview_total
    from jsonb_array_elements(coalesce(v_preview,'[]'::jsonb)) as x(value);

    update public.club_sponsor_offers o
    set metadata=coalesce(o.metadata,'{}'::jsonb)||jsonb_build_object(
      'preview_objectives',coalesce(v_preview,'[]'::jsonb),
      'preview_objectives_version','v4_market_group_split',
      'preview_objective_count',jsonb_array_length(coalesce(v_preview,'[]'::jsonb)),
      'preview_objective_total_reward',v_preview_total,
      'preview_objectives_match_bonus_pool',v_preview_total=coalesce(o.bonus_pool_amount,0),
      'preview_objectives_refreshed_at',now()
    )
    where o.id=v_offer.id;
    v_previewed:=v_previewed+1;
  end loop;

  return coalesce(v_base,'{}'::jsonb)||jsonb_build_object(
    'economic_model_version','v6_reduced_30_market_split',
    'total_reduction_pct',30,
    'objective_market_policy','country_market_groups_v4',
    'offers_previewed',v_previewed
  );
end;
$function$;

create or replace function public.sponsor_set_main_offer_total_value_headlines_v1(p_club_id uuid,p_season integer)
returns integer
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_count integer:=0;
begin
  update public.club_sponsor_offers o
  set metadata=coalesce(o.metadata,'{}'::jsonb)||jsonb_build_object(
    'description','TOTAL VALUE: $'||to_char(
      greatest(0,coalesce((o.metadata->>'contract_total_value')::bigint,o.guaranteed_amount+o.bonus_pool_amount)),
      'FM999,999,999'
    ),
    'offer_description_version','v6_total_value_headline'
  )
  where o.club_id=p_club_id
    and o.season_number=p_season
    and o.sponsor_kind='main'
    and o.status='offered';
  get diagnostics v_count=row_count;
  return v_count;
end;
$function$;

create or replace function public.sponsor_generate_offers(p_club_id uuid,p_force boolean default false)
returns table(season_number integer,game_month integer,coverage_months integer,proration_factor numeric,inserted_count integer,main_offers integer,secondary_offers integer,technical_offers integer)
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_core record; v_finalize jsonb; v_headlines integer;
begin
  select * into v_core from public.sponsor_generate_offers_core_v1(p_club_id,p_force);
  if not found then return; end if;
  v_finalize:=public.sponsor_finalize_main_offer_portfolio_v6(p_club_id,v_core.season_number);
  v_headlines:=public.sponsor_set_main_offer_total_value_headlines_v1(p_club_id,v_core.season_number);
  return query select
    v_core.season_number::integer,v_core.game_month::integer,v_core.coverage_months::integer,v_core.proration_factor::numeric,v_core.inserted_count::integer,
    (select count(*)::integer from public.club_sponsor_offers o where o.club_id=p_club_id and o.season_number=v_core.season_number and o.sponsor_kind='main' and o.status='offered'),
    (select count(*)::integer from public.club_sponsor_offers o where o.club_id=p_club_id and o.season_number=v_core.season_number and o.sponsor_kind='secondary' and o.status='offered'),
    (select count(*)::integer from public.club_sponsor_offers o where o.club_id=p_club_id and o.season_number=v_core.season_number and o.sponsor_kind='technical' and o.status='offered');
end;
$function$;

create or replace function public.sponsor_refresh_daily_offers(p_club_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_base jsonb; v_season integer; v_finalize jsonb; v_headlines integer;
begin
  v_base:=public.sponsor_refresh_daily_offers_core_v1(p_club_id);
  v_season:=coalesce(nullif(v_base->>'season_number','')::integer,(select coalesce(gs.season_number,1) from public.game_state gs limit 1),1);
  v_finalize:=public.sponsor_finalize_main_offer_portfolio_v6(p_club_id,v_season);
  v_headlines:=public.sponsor_set_main_offer_total_value_headlines_v1(p_club_id,v_season);
  return coalesce(v_base,'{}'::jsonb)||jsonb_build_object(
    'main_offer_economic_model','v6_reduced_30_market_split',
    'main_offer_finalize',v_finalize,
    'main_offer_total_value_headlines',v_headlines
  );
end;
$function$;
