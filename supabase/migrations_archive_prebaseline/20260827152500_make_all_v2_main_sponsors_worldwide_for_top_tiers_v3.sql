-- Make the full V2 main-sponsor expansion pool available worldwide to top-tier clubs.
-- WorldTeam: 6 of 15 international main-offer slots.
-- ProTeam: 3 of 10 international main-offer slots.
-- Continental/Amateur remain regional/local for ordinary main offers.

insert into public.sponsor_company_eligibility (
  company_id,
  scope_type,
  country_code,
  group_code,
  macro_region,
  min_club_tier,
  max_club_tier,
  allow_worldteam_global,
  priority_weight,
  is_active,
  metadata
)
select
  sc.id,
  'worldwide',
  null,
  null,
  null,
  'worldteam'::public.club_tier,
  'proteam'::public.club_tier,
  true,
  100,
  true,
  jsonb_build_object(
    'rule_source', 'additional_country_main_real_name_seed_v2',
    'worldwide_main_pool_version', 'v3',
    'eligible_tiers', jsonb_build_array('worldteam','proteam')
  )
from public.sponsor_companies sc
where sc.is_active = true
  and sc.sponsor_kind = 'main'
  and sc.metadata->>'seed_source' = 'additional_country_main_real_name_seed_v2'
on conflict do nothing;

create or replace function public.sponsor_finalize_main_offer_portfolio_v3(
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
  v_club_group text;
  v_desired_worldwide integer := 0;
  v_current_worldwide integer := 0;
  v_missing_worldwide integer := 0;
  v_invalid_replaced integer := 0;
  v_quota_replaced integer := 0;
  v_offer record;
  v_candidate record;
begin
  v_base := public.sponsor_finalize_main_offer_portfolio_v2(p_club_id, p_season);

  select *
    into v_club
  from public.clubs c
  where c.id = p_club_id
    and c.deleted_at is null
    and c.is_active = true
    and coalesce(c.club_type::text, 'main') = 'main'
  limit 1;

  if not found then
    raise exception 'Live main club not found.';
  end if;

  select cgm.group_code
    into v_club_group
  from public.country_market_group_members cgm
  where upper(cgm.country_code) = upper(v_club.country_code)
  limit 1;

  case v_club.club_tier
    when 'worldteam' then v_desired_worldwide := 6;
    when 'proteam' then v_desired_worldwide := 3;
    else v_desired_worldwide := 0;
  end case;

  if v_desired_worldwide = 0 then
    return coalesce(v_base, '{}'::jsonb) || jsonb_build_object(
      'worldwide_pool_policy_version', 'v3',
      'desired_worldwide_nonregional', 0,
      'invalid_nonregional_replaced', 0,
      'worldwide_quota_replaced', 0
    );
  end if;

  /* Replace ordinary out-of-region offers not in the explicit worldwide pool.
     Renewal offers remain a special exception because they preserve a prior relationship. */
  for v_offer in
    select
      o.id,
      coalesce(o.main_sponsor_deal_type, 'standard') as deal_type
    from public.club_sponsor_offers o
    join public.sponsor_companies sc on sc.id = o.company_id
    left join public.country_market_group_members scm
      on upper(scm.country_code) = upper(sc.country_code)
    where o.club_id = p_club_id
      and o.season_number = p_season
      and o.sponsor_kind = 'main'
      and o.status = 'offered'
      and coalesce((o.metadata->>'is_renewal_offer')::boolean, false) = false
      and upper(coalesce(sc.country_code, '')) <> upper(coalesce(v_club.country_code, ''))
      and (
        v_club_group is null
        or coalesce(sc.home_group_code, scm.group_code) is distinct from v_club_group
      )
      and not exists (
        select 1
        from public.sponsor_company_eligibility e
        where e.company_id = sc.id
          and e.is_active = true
          and e.scope_type = 'worldwide'
          and v_club.club_tier between e.min_club_tier and e.max_club_tier
      )
    order by md5(o.id::text || '|replace-invalid-worldwide|' || p_season::text)
  loop
    select distinct on (sc.id)
      sc.id,
      sc.name,
      sc.country_code,
      sc.logo_url,
      coalesce(sc.home_group_code, scm.group_code) as sponsor_group_code
    into v_candidate
    from public.sponsor_companies sc
    join public.sponsor_company_eligibility e
      on e.company_id = sc.id
     and e.is_active = true
     and e.scope_type = 'worldwide'
    left join public.country_market_group_members scm
      on upper(scm.country_code) = upper(sc.country_code)
    where sc.is_active = true
      and sc.sponsor_kind = 'main'
      and v_club.club_tier between e.min_club_tier and e.max_club_tier
      and upper(coalesce(sc.country_code, '')) <> upper(coalesce(v_club.country_code, ''))
      and (
        v_club_group is null
        or coalesce(sc.home_group_code, scm.group_code) is distinct from v_club_group
      )
      and not exists (
        select 1
        from public.club_sponsor_offers x
        where x.club_id = p_club_id
          and x.season_number = p_season
          and x.company_id = sc.id
      )
      and not exists (
        select 1
        from public.club_sponsors s
        where s.club_id = p_club_id
          and s.season_number = p_season
          and s.company_id = sc.id
      )
    order by sc.id,
      md5(sc.id::text || '|' || p_club_id::text || '|' || p_season::text || '|' || v_offer.id::text);

    if not found then
      exit;
    end if;

    update public.club_sponsor_offers o
    set
      company_id = v_candidate.id,
      metadata = (
        coalesce(o.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'company_name', v_candidate.name,
          'company_country_code', v_candidate.country_code,
          'logo_url', v_candidate.logo_url,
          'market_priority_bucket', 2,
          'market_match', 'worldwide',
          'worldwide_eligibility', true,
          'worldwide_pool_version', 'v3',
          'portfolio_policy_version', 'v3'
        )
        || case
          when coalesce(o.main_sponsor_deal_type, 'standard') = 'naming_rights'
            then jsonb_build_object(
              'season_display_name', v_candidate.name || ' Team',
              'naming_rights_display_name', v_candidate.name || ' Team',
              'full_display_name', v_candidate.name || ' Team (' || v_club.name || ')',
              'team_name_preview', v_candidate.name || ' Team (' || v_club.name || ')'
            )
          else '{}'::jsonb
        end
      )
    where o.id = v_offer.id;

    v_invalid_replaced := v_invalid_replaced + 1;
  end loop;

  select count(*)::integer
    into v_current_worldwide
  from public.club_sponsor_offers o
  join public.sponsor_companies sc on sc.id = o.company_id
  left join public.country_market_group_members scm
    on upper(scm.country_code) = upper(sc.country_code)
  where o.club_id = p_club_id
    and o.season_number = p_season
    and o.sponsor_kind = 'main'
    and o.status = 'offered'
    and upper(coalesce(sc.country_code, '')) <> upper(coalesce(v_club.country_code, ''))
    and (
      v_club_group is null
      or coalesce(sc.home_group_code, scm.group_code) is distinct from v_club_group
    )
    and exists (
      select 1
      from public.sponsor_company_eligibility e
      where e.company_id = sc.id
        and e.is_active = true
        and e.scope_type = 'worldwide'
        and v_club.club_tier between e.min_club_tier and e.max_club_tier
    );

  v_missing_worldwide := greatest(0, v_desired_worldwide - v_current_worldwide);

  /* Fill any remaining international quota only from the explicit worldwide pool. */
  for v_offer in
    select o.id
    from public.club_sponsor_offers o
    join public.sponsor_companies sc on sc.id = o.company_id
    left join public.country_market_group_members scm
      on upper(scm.country_code) = upper(sc.country_code)
    where o.club_id = p_club_id
      and o.season_number = p_season
      and o.sponsor_kind = 'main'
      and o.status = 'offered'
      and coalesce((o.metadata->>'is_renewal_offer')::boolean, false) = false
      and (
        upper(coalesce(sc.country_code, '')) = upper(coalesce(v_club.country_code, ''))
        or (
          v_club_group is not null
          and coalesce(sc.home_group_code, scm.group_code) = v_club_group
        )
      )
    order by md5(o.id::text || '|worldwide-quota-slot|' || p_season::text)
    limit v_missing_worldwide
  loop
    select distinct on (sc.id)
      sc.id,
      sc.name,
      sc.country_code,
      sc.logo_url,
      coalesce(sc.home_group_code, scm.group_code) as sponsor_group_code
    into v_candidate
    from public.sponsor_companies sc
    join public.sponsor_company_eligibility e
      on e.company_id = sc.id
     and e.is_active = true
     and e.scope_type = 'worldwide'
    left join public.country_market_group_members scm
      on upper(scm.country_code) = upper(sc.country_code)
    where sc.is_active = true
      and sc.sponsor_kind = 'main'
      and v_club.club_tier between e.min_club_tier and e.max_club_tier
      and upper(coalesce(sc.country_code, '')) <> upper(coalesce(v_club.country_code, ''))
      and (
        v_club_group is null
        or coalesce(sc.home_group_code, scm.group_code) is distinct from v_club_group
      )
      and not exists (
        select 1
        from public.club_sponsor_offers x
        where x.club_id = p_club_id
          and x.season_number = p_season
          and x.company_id = sc.id
      )
      and not exists (
        select 1
        from public.club_sponsors s
        where s.club_id = p_club_id
          and s.season_number = p_season
          and s.company_id = sc.id
      )
    order by sc.id,
      md5(sc.id::text || '|' || p_club_id::text || '|' || p_season::text || '|' || v_offer.id::text);

    if not found then
      exit;
    end if;

    update public.club_sponsor_offers o
    set
      company_id = v_candidate.id,
      metadata = (
        coalesce(o.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'company_name', v_candidate.name,
          'company_country_code', v_candidate.country_code,
          'logo_url', v_candidate.logo_url,
          'market_priority_bucket', 2,
          'market_match', 'worldwide',
          'worldwide_eligibility', true,
          'worldwide_pool_version', 'v3',
          'portfolio_policy_version', 'v3'
        )
        || case
          when coalesce(o.main_sponsor_deal_type, 'standard') = 'naming_rights'
            then jsonb_build_object(
              'season_display_name', v_candidate.name || ' Team',
              'naming_rights_display_name', v_candidate.name || ' Team',
              'full_display_name', v_candidate.name || ' Team (' || v_club.name || ')',
              'team_name_preview', v_candidate.name || ' Team (' || v_club.name || ')'
            )
          else '{}'::jsonb
        end
      )
    where o.id = v_offer.id;

    v_quota_replaced := v_quota_replaced + 1;
  end loop;

  select count(*)::integer
    into v_current_worldwide
  from public.club_sponsor_offers o
  join public.sponsor_companies sc on sc.id = o.company_id
  left join public.country_market_group_members scm
    on upper(scm.country_code) = upper(sc.country_code)
  where o.club_id = p_club_id
    and o.season_number = p_season
    and o.sponsor_kind = 'main'
    and o.status = 'offered'
    and upper(coalesce(sc.country_code, '')) <> upper(coalesce(v_club.country_code, ''))
    and (
      v_club_group is null
      or coalesce(sc.home_group_code, scm.group_code) is distinct from v_club_group
    )
    and exists (
      select 1
      from public.sponsor_company_eligibility e
      where e.company_id = sc.id
        and e.is_active = true
        and e.scope_type = 'worldwide'
        and v_club.club_tier between e.min_club_tier and e.max_club_tier
    );

  return coalesce(v_base, '{}'::jsonb) || jsonb_build_object(
    'worldwide_pool_policy_version', 'v3',
    'desired_worldwide_nonregional', v_desired_worldwide,
    'final_worldwide_nonregional', v_current_worldwide,
    'invalid_nonregional_replaced', v_invalid_replaced,
    'worldwide_quota_replaced', v_quota_replaced
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
  select *
    into v_core
  from public.sponsor_generate_offers_core_v1(p_club_id, p_force);

  if not found then
    return;
  end if;

  v_finalize := public.sponsor_finalize_main_offer_portfolio_v3(
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
