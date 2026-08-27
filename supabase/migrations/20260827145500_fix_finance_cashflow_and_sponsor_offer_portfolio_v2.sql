-- Finance overview reset-safety + sponsor portfolio policy v2.
-- Reusable migration only. Current-production offer finalization is intentionally not replayed here.

create or replace function public.finance_get_club_cashflow_series(
  p_club_id uuid,
  p_days integer default 90
)
returns table(bucket_date date, income bigint, expenses bigint, net bigint)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid;
  v_days integer;
  v_restart_at timestamptz;
  v_start_date date;
  v_end_date date := current_date;
begin
  v_user_id := auth.uid();
  v_days := greatest(1, coalesce(p_days, 90));

  if p_club_id is null then
    raise exception 'Club id is required.';
  end if;

  if v_user_id is not null and not exists (
    select 1
    from public.clubs c
    where c.id = p_club_id
      and c.owner_user_id = v_user_id
      and coalesce(c.club_type::text, 'main') = 'main'
  ) then
    raise exception 'You can only view finance cashflow for your own main club.';
  end if;

  select max(h.created_at)
    into v_restart_at
  from public.club_restart_history h
  where h.club_id = p_club_id;

  v_start_date := greatest(
    current_date - (v_days - 1),
    coalesce(v_restart_at::date, current_date - (v_days - 1))
  );

  return query
  with days as (
    select generate_series(
      v_start_date,
      v_end_date,
      interval '1 day'
    )::date as bucket_date
  ),
  club_transaction_net as (
    select
      t.created_at::date as bucket_date,
      sum(e.amount)::bigint as net_amount
    from finance.transactions t
    join finance.entries e
      on e.transaction_id = t.id
    join finance.accounts a
      on a.id = e.account_id
    left join finance.transaction_types tt
      on tt.code = t.type
    where a.club_id = p_club_id
      and a.currency = 'CASH'
      and a.kind = 'main'
      and t.created_at >= v_start_date::timestamptz
      and t.created_at < (v_end_date + 1)::timestamptz
      and t.created_at > coalesce(v_restart_at, '-infinity'::timestamptz)
      and coalesce(tt.is_user_visible, true) = true
      and not exists (
        select 1
        from finance.transaction_voids v
        where v.source_transaction_id = t.id
      )
      and not exists (
        select 1
        from finance.transaction_voids v
        where v.correction_transaction_id = t.id
      )
    group by t.id, t.created_at::date
  ),
  daily as (
    select
      ctn.bucket_date,
      sum(greatest(ctn.net_amount, 0::bigint))::bigint as income,
      sum(greatest(-ctn.net_amount, 0::bigint))::bigint as expenses,
      sum(ctn.net_amount)::bigint as net
    from club_transaction_net ctn
    group by ctn.bucket_date
  )
  select
    d.bucket_date,
    coalesce(daily.income, 0)::bigint as income,
    coalesce(daily.expenses, 0)::bigint as expenses,
    coalesce(daily.net, 0)::bigint as net
  from days d
  left join daily
    on daily.bucket_date = d.bucket_date
  order by d.bucket_date;
end;
$function$;

create or replace function public.sponsor_finalize_main_offer_portfolio_v2(
  p_club_id uuid,
  p_season integer
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_club public.clubs%rowtype;
  v_club_group text;
  v_desired_nonregional integer := 0;
  v_desired_naming integer := 0;
  v_current_nonregional integer := 0;
  v_current_naming integer := 0;
  v_missing_nonregional integer := 0;
  v_missing_naming integer := 0;
  v_geo_replaced integer := 0;
  v_naming_prepared integer := 0;
  v_renewal_prepared integer := 0;

  v_source_season integer;
  v_prior record;
  v_prior_objectives integer := 0;
  v_prior_completed integer := 0;
  v_success_rate numeric := 0;
  v_final_position integer;
  v_division text;
  v_division_size integer := 0;
  v_performance_percentile numeric := 1;
  v_renewal_probability numeric := 0;
  v_renewal_roll numeric := 1;
  v_renewal_uplift numeric := 0;
  v_renew_offer record;
  v_base_guaranteed bigint;
  v_base_bonus bigint;
  v_new_full_guaranteed bigint;
  v_new_full_bonus bigint;
  v_new_guaranteed bigint;
  v_new_bonus bigint;
  v_new_monthly bigint;

  v_offer record;
  v_candidate record;
  v_naming_uplift numeric;
begin
  if p_club_id is null or p_season is null then
    raise exception 'Club id and season are required.';
  end if;

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

  if auth.role() <> 'service_role'
     and auth.uid() is not null
     and not finance.is_club_member_or_owner(p_club_id, auth.uid()) then
    raise exception 'Not allowed to finalize sponsor offers for this club.';
  end if;

  if not exists (
    select 1
    from public.club_sponsor_offers o
    where o.club_id = p_club_id
      and o.season_number = p_season
      and o.sponsor_kind = 'main'
      and o.status = 'offered'
  ) then
    return jsonb_build_object(
      'ok', true,
      'club_id', p_club_id,
      'season_number', p_season,
      'main_offers', 0,
      'nonregional_replacements', 0,
      'naming_rights_prepared', 0,
      'renewal_prepared', 0
    );
  end if;

  select cgm.group_code
    into v_club_group
  from public.country_market_group_members cgm
  where upper(cgm.country_code) = upper(v_club.country_code)
  limit 1;

  case v_club.club_tier
    when 'worldteam' then
      v_desired_nonregional := 6;
      v_desired_naming := 2;
    when 'proteam' then
      v_desired_nonregional := 3;
      v_desired_naming := 1;
    else
      v_desired_nonregional := 0;
      v_desired_naming := 0;
  end case;

  v_source_season := p_season - 1;

  if v_source_season >= 1 and public.get_current_game_month() = 1 then
    select
      s.id,
      s.company_id,
      s.main_sponsor_deal_type,
      s.full_season_guaranteed_amount,
      s.full_season_bonus_pool_amount,
      s.guaranteed_amount,
      s.bonus_pool_amount,
      sc.name as company_name,
      sc.country_code as company_country_code,
      sc.logo_url,
      sc.home_group_code
    into v_prior
    from public.club_sponsors s
    join public.sponsor_companies sc
      on sc.id = s.company_id
     and sc.is_active = true
     and sc.sponsor_kind = 'main'
    where s.club_id = p_club_id
      and s.season_number = v_source_season
      and s.sponsor_kind = 'main'
    order by s.created_at desc
    limit 1;

    if found and v_prior.company_id is not null then
      select
        count(*)::integer,
        count(*) filter (
          where coalesce(o.objective_result_state, '') in ('completed', 'paid')
             or coalesce(o.status, '') in ('completed', 'paid')
        )::integer
      into v_prior_objectives, v_prior_completed
      from public.club_sponsor_objectives o
      where o.club_sponsor_id = v_prior.id;

      if v_prior_objectives > 0 then
        v_success_rate := v_prior_completed::numeric / v_prior_objectives::numeric;
      else
        v_success_rate := 0;
      end if;

      select s.final_position, s.division
        into v_final_position, v_division
      from public.team_ranking_season_snapshots s
      where s.season_number = v_source_season
        and s.club_id = p_club_id
      order by s.created_at desc
      limit 1;

      if v_final_position is not null then
        if v_division is not null then
          select count(*)::integer
            into v_division_size
          from public.team_ranking_season_snapshots s
          where s.season_number = v_source_season
            and s.division = v_division
            and coalesce(s.is_active, true) = true;
        else
          select count(*)::integer
            into v_division_size
          from public.team_ranking_season_snapshots s
          where s.season_number = v_source_season
            and s.club_tier = v_club.club_tier::text
            and coalesce(s.is_active, true) = true;
        end if;

        if v_division_size > 0 then
          v_performance_percentile := least(
            1,
            greatest(0, v_final_position::numeric / v_division_size::numeric)
          );
        end if;
      end if;

      if v_success_rate >= 0.90 and v_performance_percentile <= 0.10 then
        v_renewal_probability := 1.00;
        v_renewal_uplift := 15;
      elsif v_success_rate >= 0.75 and v_performance_percentile <= 0.25 then
        v_renewal_probability := 0.80;
        v_renewal_uplift := 10;
      elsif v_success_rate >= 0.60 and v_performance_percentile <= 0.50 then
        v_renewal_probability := 0.55;
        v_renewal_uplift := 5;
      else
        v_renewal_probability := 0;
        v_renewal_uplift := 0;
      end if;

      v_renewal_roll := (
        ('x' || substr(md5(
          p_club_id::text || '|' ||
          v_prior.company_id::text || '|' ||
          v_source_season::text || '|renewal'
        ), 1, 8))::bit(32)::bigint
      )::numeric / 4294967295::numeric;

      if v_renewal_probability > 0
         and v_renewal_roll <= v_renewal_probability
         and not exists (
           select 1
           from public.club_sponsor_offers x
           where x.club_id = p_club_id
             and x.season_number = p_season
             and x.company_id = v_prior.company_id
             and x.status <> 'offered'
         ) then

        select o.*
          into v_renew_offer
        from public.club_sponsor_offers o
        where o.club_id = p_club_id
          and o.season_number = p_season
          and o.sponsor_kind = 'main'
          and o.status = 'offered'
          and o.company_id = v_prior.company_id
        limit 1;

        if not found then
          select o.*
            into v_renew_offer
          from public.club_sponsor_offers o
          where o.club_id = p_club_id
            and o.season_number = p_season
            and o.sponsor_kind = 'main'
            and o.status = 'offered'
          order by md5(o.id::text || '|renewal-slot|' || p_season::text)
          limit 1;
        end if;

        if v_renew_offer.id is not null then
          v_base_guaranteed := coalesce(
            nullif(v_prior.full_season_guaranteed_amount, 0),
            nullif(v_prior.guaranteed_amount, 0),
            nullif(v_renew_offer.full_season_guaranteed_amount, 0),
            v_renew_offer.guaranteed_amount,
            0
          );
          v_base_bonus := coalesce(
            nullif(v_prior.full_season_bonus_pool_amount, 0),
            nullif(v_prior.bonus_pool_amount, 0),
            nullif(v_renew_offer.full_season_bonus_pool_amount, 0),
            v_renew_offer.bonus_pool_amount,
            0
          );

          v_new_full_guaranteed := round(
            v_base_guaranteed::numeric * (1 + v_renewal_uplift / 100.0)
          )::bigint;
          v_new_full_bonus := round(
            v_base_bonus::numeric * (1 + (v_renewal_uplift / 2.0) / 100.0)
          )::bigint;
          v_new_guaranteed := round(
            v_new_full_guaranteed::numeric * coalesce(v_renew_offer.proration_factor, 1)
          )::bigint;
          v_new_bonus := round(
            v_new_full_bonus::numeric * coalesce(v_renew_offer.proration_factor, 1)
          )::bigint;
          v_new_monthly := case
            when coalesce(v_renew_offer.coverage_months, 0) > 0
              then round(v_new_guaranteed::numeric / v_renew_offer.coverage_months)::bigint
            else v_new_guaranteed
          end;

          update public.club_sponsor_offers o
          set
            company_id = v_prior.company_id,
            main_sponsor_deal_type = 'standard',
            naming_rights_uplift_pct = 0,
            full_season_guaranteed_amount = v_new_full_guaranteed,
            full_season_bonus_pool_amount = v_new_full_bonus,
            guaranteed_amount = v_new_guaranteed,
            bonus_pool_amount = v_new_bonus,
            monthly_amount = v_new_monthly,
            metadata = (
              coalesce(o.metadata, '{}'::jsonb)
              - array[
                'deal_type',
                'main_sponsor_deal_type',
                'requires_team_name_change',
                'naming_rights_uplift_pct',
                'season_display_name',
                'naming_rights_display_name',
                'full_display_name',
                'full_display_name_preview',
                'team_name_preview',
                'branding_locked_fields'
              ]
            ) || jsonb_build_object(
              'company_name', v_prior.company_name,
              'company_country_code', v_prior.company_country_code,
              'logo_url', v_prior.logo_url,
              'is_renewal_offer', true,
              'renewal_from_season', v_source_season,
              'previous_contract_id', v_prior.id,
              'objective_success_rate', round(v_success_rate, 4),
              'previous_final_position', v_final_position,
              'previous_division_size', v_division_size,
              'sporting_performance_percentile', round(v_performance_percentile, 4),
              'renewal_probability', v_renewal_probability,
              'renewal_roll', round(v_renewal_roll, 4),
              'renewal_uplift_pct', v_renewal_uplift,
              'renewal_terms_improved', true,
              'portfolio_policy_version', 'v2'
            )
          where o.id = v_renew_offer.id;

          v_renewal_prepared := 1;

          if coalesce(v_prior.main_sponsor_deal_type, 'standard') = 'naming_rights' then
            v_naming_uplift := 20 + (
              (
                ('x' || substr(md5(v_renew_offer.id::text || '|renewal-naming'), 1, 8))::bit(32)::bigint
              ) % 1001
            )::numeric / 100.0;

            perform public.sponsor_prepare_main_offer_deal_metadata_v1(
              v_renew_offer.id,
              'naming_rights',
              v_naming_uplift,
              v_prior.company_name || ' Team'
            );

            update public.club_sponsor_offers o
            set metadata = coalesce(o.metadata, '{}'::jsonb) || jsonb_build_object(
              'full_display_name', (o.metadata->>'season_display_name') || ' (' || v_club.name || ')',
              'renewal_preserves_naming_rights', true
            )
            where o.id = v_renew_offer.id;
          end if;
        end if;
      end if;
    end if;
  end if;

  if v_desired_nonregional > 0 then
    select count(*)::integer
      into v_current_nonregional
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
      );

    v_missing_nonregional := greatest(0, v_desired_nonregional - v_current_nonregional);

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
      order by md5(o.id::text || '|nonregional-slot|' || p_season::text)
      limit v_missing_nonregional
    loop
      select
        sc.id,
        sc.name,
        sc.country_code,
        sc.logo_url,
        coalesce(sc.home_group_code, scm.group_code) as sponsor_group_code
      into v_candidate
      from public.sponsor_companies sc
      left join public.country_market_group_members scm
        on upper(scm.country_code) = upper(sc.country_code)
      where sc.is_active = true
        and sc.sponsor_kind = 'main'
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
      order by md5(sc.id::text || '|' || p_club_id::text || '|' || p_season::text || '|' || v_offer.id::text)
      limit 1;

      if not found then
        exit;
      end if;

      update public.club_sponsor_offers o
      set
        company_id = v_candidate.id,
        main_sponsor_deal_type = 'standard',
        naming_rights_uplift_pct = 0,
        metadata = (
          coalesce(o.metadata, '{}'::jsonb)
          - array[
            'deal_type',
            'main_sponsor_deal_type',
            'requires_team_name_change',
            'naming_rights_uplift_pct',
            'season_display_name',
            'naming_rights_display_name',
            'full_display_name',
            'full_display_name_preview',
            'team_name_preview',
            'branding_locked_fields',
            'is_renewal_offer',
            'renewal_from_season',
            'previous_contract_id',
            'objective_success_rate',
            'previous_final_position',
            'previous_division_size',
            'sporting_performance_percentile',
            'renewal_probability',
            'renewal_roll',
            'renewal_uplift_pct',
            'renewal_terms_improved'
          ]
        ) || jsonb_build_object(
          'company_name', v_candidate.name,
          'company_country_code', v_candidate.country_code,
          'logo_url', v_candidate.logo_url,
          'market_priority_bucket', 2,
          'market_match', 'non_regional',
          'portfolio_policy_version', 'v2'
        )
      where o.id = v_offer.id;

      v_geo_replaced := v_geo_replaced + 1;
    end loop;
  end if;

  select count(*)::integer
    into v_current_naming
  from public.club_sponsor_offers o
  where o.club_id = p_club_id
    and o.season_number = p_season
    and o.sponsor_kind = 'main'
    and o.status = 'offered'
    and (
      o.main_sponsor_deal_type = 'naming_rights'
      or o.metadata->>'main_sponsor_deal_type' = 'naming_rights'
      or o.metadata->>'deal_type' = 'naming_rights'
    );

  v_missing_naming := greatest(0, v_desired_naming - v_current_naming);

  for v_offer in
    select o.id, sc.name as company_name
    from public.club_sponsor_offers o
    join public.sponsor_companies sc on sc.id = o.company_id
    where o.club_id = p_club_id
      and o.season_number = p_season
      and o.sponsor_kind = 'main'
      and o.status = 'offered'
      and coalesce(o.main_sponsor_deal_type, 'standard') <> 'naming_rights'
      and coalesce((o.metadata->>'is_renewal_offer')::boolean, false) = false
    order by md5(o.id::text || '|naming-slot|' || p_season::text)
    limit v_missing_naming
  loop
    v_naming_uplift := 20 + (
      (
        ('x' || substr(md5(v_offer.id::text || '|naming-uplift'), 1, 8))::bit(32)::bigint
      ) % 1001
    )::numeric / 100.0;

    perform public.sponsor_prepare_main_offer_deal_metadata_v1(
      v_offer.id,
      'naming_rights',
      v_naming_uplift,
      v_offer.company_name || ' Team'
    );

    update public.club_sponsor_offers o
    set metadata = coalesce(o.metadata, '{}'::jsonb) || jsonb_build_object(
      'full_display_name', (o.metadata->>'season_display_name') || ' (' || v_club.name || ')',
      'auto_generated_naming_rights', true,
      'portfolio_policy_version', 'v2'
    )
    where o.id = v_offer.id;

    v_naming_prepared := v_naming_prepared + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'club_id', p_club_id,
    'season_number', p_season,
    'tier', v_club.club_tier::text,
    'desired_nonregional', v_desired_nonregional,
    'nonregional_replacements', v_geo_replaced,
    'desired_naming_rights', v_desired_naming,
    'naming_rights_prepared', v_naming_prepared,
    'renewal_prepared', v_renewal_prepared
  );
end;
$function$;

do $block$
begin
  if to_regprocedure('public.sponsor_generate_offers_core_v1(uuid,boolean)') is null then
    alter function public.sponsor_generate_offers(uuid, boolean)
      rename to sponsor_generate_offers_core_v1;
  end if;
end;
$block$;

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

  v_finalize := public.sponsor_finalize_main_offer_portfolio_v2(
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
