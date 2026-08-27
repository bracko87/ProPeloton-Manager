-- Strengthen naming-rights economics and restore the full five-target main-sponsor preview.
-- Naming-rights offers must compensate for a seasonal team-name change.
-- The five advertised objective rewards always add up to the advertised bonus pool.

create or replace function public.sponsor_prepare_main_offer_deal_metadata_v1(
  p_offer_id uuid,
  p_deal_type text default 'standard'::text,
  p_uplift_pct numeric default null::numeric,
  p_display_name text default null::text
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
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

  select * into v_offer
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

  select sc.name into v_company_name
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
    -- Keep older callers safe: values below/above the new policy are clamped.
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
    else v_new_guaranteed
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
          case when v_display_name is not null
            then v_display_name || ' (Original club name)'
            else null end,
        'branding_locked_fields',
          case when p_deal_type = 'naming_rights'
            then jsonb_build_array('name', 'primary_color', 'secondary_color')
            else '[]'::jsonb end
      )
  where o.id = p_offer_id;

  return p_offer_id;
end;
$function$;

create or replace function public.sponsor_build_offer_preview_objectives_v2(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_offer record;
  v_club_country text;
  v_club_group text;
  v_sponsor_group text;
  v_bonus bigint := 0;
  v_season_start date;
  v_season_end date;
  v_from_date date;
  v_reward_1 bigint := 0;
  v_reward_2 bigint := 0;
  v_reward_3 bigint := 0;
  v_reward_4 bigint := 0;
  v_reward_5 bigint := 0;
  v_race_1 jsonb;
  v_race_2 jsonb;
  v_race_3 jsonb;
  v_race_4 jsonb;
  v_race_5 jsonb;
  v_used uuid[] := array[]::uuid[];
begin
  select
    o.id,
    o.season_number,
    o.bonus_pool_amount,
    o.metadata,
    sc.name as sponsor_name,
    upper(sc.country_code) as sponsor_country_code,
    c.name as club_name,
    upper(c.country_code) as club_country_code,
    c.club_tier::text as club_tier
  into v_offer
  from public.club_sponsor_offers o
  join public.sponsor_companies sc on sc.id = o.company_id
  join public.clubs c on c.id = o.club_id
  where o.id = p_offer_id and o.sponsor_kind = 'main';

  if not found then return '[]'::jsonb; end if;

  v_club_country := v_offer.club_country_code;
  v_bonus := greatest(0, coalesce(v_offer.bonus_pool_amount, 0));
  v_season_start := public.get_game_date_for_season_start(v_offer.season_number);
  v_season_end := public.get_game_date_for_season_end(v_offer.season_number);
  v_from_date := greatest(v_season_start, public.get_current_game_date_safe_v1());

  select cgm.group_code into v_club_group
  from public.country_market_group_members cgm
  where upper(cgm.country_code) = v_club_country limit 1;

  select cgm.group_code into v_sponsor_group
  from public.country_market_group_members cgm
  where upper(cgm.country_code) = v_offer.sponsor_country_code limit 1;

  v_reward_1 := round(v_bonus::numeric * 0.28)::bigint;
  v_reward_2 := round(v_bonus::numeric * 0.24)::bigint;
  v_reward_3 := round(v_bonus::numeric * 0.20)::bigint;
  v_reward_4 := round(v_bonus::numeric * 0.16)::bigint;
  v_reward_5 := greatest(0, v_bonus - v_reward_1 - v_reward_2 - v_reward_3 - v_reward_4);

  select jsonb_build_object(
    'race_id', r.id, 'race_name', r.name, 'country_code', r.country_code,
    'category', r.category, 'race_type', r.race_type,
    'check_date', coalesce(r.end_date, r.start_date)
  ) into v_race_1
  from public.races r
  left join public.country_market_group_members cgm on upper(cgm.country_code)=upper(r.country_code)
  where r.start_date between v_from_date and v_season_end
    and lower(coalesce(r.status::text,'scheduled')) not in ('finished','completed','canceled','cancelled')
    and (
      upper(r.country_code)=v_offer.sponsor_country_code
      or (v_sponsor_group is not null and cgm.group_code=v_sponsor_group)
      or (v_offer.club_tier in ('worldteam','proteam') and (
        r.category ilike '%UWT%' or r.category ilike '%Pro%' or r.category in ('2.1','1.1')
      ))
    )
  order by
    case when upper(r.country_code)=v_offer.sponsor_country_code then 0
         when v_sponsor_group is not null and cgm.group_code=v_sponsor_group then 1 else 2 end,
    case when r.category ilike '%UWT%' then 0 when r.category ilike '%Pro%' then 1
         when r.category in ('2.1','1.1') then 2 else 3 end,
    md5(r.id::text || p_offer_id::text || '|preview-1')
  limit 1;
  if coalesce(v_race_1,'{}'::jsonb) ? 'race_id' then v_used := v_used || (v_race_1->>'race_id')::uuid; end if;

  select jsonb_build_object(
    'race_id', r.id, 'race_name', r.name, 'country_code', r.country_code,
    'category', r.category, 'race_type', r.race_type,
    'check_date', coalesce(r.end_date, r.start_date)
  ) into v_race_2
  from public.races r
  left join public.country_market_group_members cgm on upper(cgm.country_code)=upper(r.country_code)
  where r.start_date between v_from_date and v_season_end
    and lower(coalesce(r.status::text,'scheduled')) not in ('finished','completed','canceled','cancelled')
    and not (r.id = any(v_used))
    and (
      (v_sponsor_group is not null and cgm.group_code=v_sponsor_group)
      or upper(r.country_code)=v_offer.sponsor_country_code
      or (v_offer.club_tier in ('worldteam','proteam') and (
        r.category ilike '%UWT%' or r.category ilike '%Pro%' or r.category in ('2.1','1.1')
      ))
    )
  order by
    case when v_sponsor_group is not null and cgm.group_code=v_sponsor_group then 0
         when upper(r.country_code)=v_offer.sponsor_country_code then 1 else 2 end,
    case when r.category ilike '%UWT%' then 0 when r.category ilike '%Pro%' then 1
         when r.category in ('2.1','1.1') then 2 else 3 end,
    md5(r.id::text || p_offer_id::text || '|preview-2')
  limit 1;
  if coalesce(v_race_2,'{}'::jsonb) ? 'race_id' then v_used := v_used || (v_race_2->>'race_id')::uuid; end if;

  select jsonb_build_object(
    'race_id', r.id, 'race_name', r.name, 'country_code', r.country_code,
    'category', r.category, 'race_type', r.race_type,
    'check_date', coalesce(r.end_date, r.start_date)
  ) into v_race_3
  from public.races r
  where r.start_date between v_from_date and v_season_end
    and lower(coalesce(r.status::text,'scheduled')) not in ('finished','completed','canceled','cancelled')
    and upper(r.country_code)=v_club_country
    and not (r.id = any(v_used))
  order by
    case when lower(coalesce(r.race_type,''))='stage_race' then 0 else 1 end,
    case when r.category ilike '%UWT%' then 0 when r.category ilike '%Pro%' then 1
         when r.category in ('2.1','1.1') then 2 else 3 end,
    md5(r.id::text || p_offer_id::text || '|preview-3')
  limit 1;
  if coalesce(v_race_3,'{}'::jsonb) ? 'race_id' then v_used := v_used || (v_race_3->>'race_id')::uuid; end if;

  select jsonb_build_object(
    'race_id', r.id, 'race_name', r.name, 'country_code', r.country_code,
    'category', r.category, 'race_type', r.race_type,
    'check_date', coalesce(r.end_date, r.start_date)
  ) into v_race_4
  from public.races r
  where r.start_date between v_from_date and v_season_end
    and lower(coalesce(r.status::text,'scheduled')) not in ('finished','completed','canceled','cancelled')
    and not (r.id = any(v_used))
    and lower(coalesce(r.race_type,''))='stage_race'
    and (r.category ilike '%UWT%' or r.category ilike '%Pro%' or r.category in ('2.1','1.1','2.2'))
  order by
    case when r.category ilike '%UWT%' then 0 when r.category ilike '%Pro%' then 1
         when r.category in ('2.1','1.1') then 2 else 3 end,
    md5(r.id::text || p_offer_id::text || '|preview-4')
  limit 1;
  if coalesce(v_race_4,'{}'::jsonb) ? 'race_id' then v_used := v_used || (v_race_4->>'race_id')::uuid; end if;

  select jsonb_build_object(
    'race_id', r.id, 'race_name', r.name, 'country_code', r.country_code,
    'category', r.category, 'race_type', r.race_type,
    'check_date', coalesce(r.end_date, r.start_date)
  ) into v_race_5
  from public.races r
  where r.start_date between v_from_date and v_season_end
    and lower(coalesce(r.status::text,'scheduled')) not in ('finished','completed','canceled','cancelled')
    and not (r.id = any(v_used))
  order by
    case when r.category ilike '%UWT%' then 0 when r.category ilike '%Pro%' then 1
         when r.category in ('2.1','1.1') then 2 else 3 end,
    md5(r.id::text || p_offer_id::text || '|preview-5')
  limit 1;

  v_race_1 := coalesce(v_race_1,v_race_2,v_race_4,v_race_5,'{}'::jsonb);
  v_race_2 := coalesce(v_race_2,v_race_4,v_race_5,v_race_1,'{}'::jsonb);
  v_race_3 := coalesce(v_race_3,v_race_4,v_race_5,v_race_1,'{}'::jsonb);
  v_race_4 := coalesce(v_race_4,v_race_5,v_race_1,'{}'::jsonb);
  v_race_5 := coalesce(v_race_5,v_race_4,v_race_1,'{}'::jsonb);

  return jsonb_build_array(
    jsonb_build_object(
      'objective_code','race_start',
      'title',coalesce(v_race_1->>'race_name','Sponsor-market race') || ': start the race',
      'description','Start this sponsor-market race with your team. The objective is completed when your team appears on the race start list.',
      'target_race_id',v_race_1->>'race_id','target_race_name',v_race_1->>'race_name',
      'target_country_code',v_race_1->>'country_code','target_category',v_race_1->>'category',
      'target_race_type',v_race_1->>'race_type','check_date',v_race_1->>'check_date',
      'target_check_game_date',v_race_1->>'check_date','required_result','race_start',
      'target_value',1,'current_value',0,'evaluation_mode','race_start_count','progress_source','race_entries',
      'estimated_reward_amount',v_reward_1,'reward_amount',v_reward_1,
      'reward_label','$' || to_char(v_reward_1,'FM999,999,999')
    ),
    jsonb_build_object(
      'objective_code','race_podium',
      'title',coalesce(v_race_2->>'race_name','Sponsor-connected event') || ': finish on the podium',
      'description','Deliver a headline result for the sponsor by finishing in the top 3 of this race.',
      'target_race_id',v_race_2->>'race_id','target_race_name',v_race_2->>'race_name',
      'target_country_code',v_race_2->>'country_code','target_category',v_race_2->>'category',
      'target_race_type',v_race_2->>'race_type','check_date',v_race_2->>'check_date',
      'target_check_game_date',v_race_2->>'check_date','required_result','race_podium',
      'target_value',1,'current_value',0,'evaluation_mode','race_final_result','progress_source','race_results',
      'estimated_reward_amount',v_reward_2,'reward_amount',v_reward_2,
      'reward_label','$' || to_char(v_reward_2,'FM999,999,999')
    ),
    jsonb_build_object(
      'objective_code','stage_top_5',
      'title',coalesce(v_race_3->>'race_name','Home-market event') || ': stage top 5',
      'description','Give the sponsor strong home-market visibility by placing a rider in the top 5 of a stage in this race.',
      'target_race_id',v_race_3->>'race_id','target_race_name',v_race_3->>'race_name',
      'target_country_code',v_race_3->>'country_code','target_category',v_race_3->>'category',
      'target_race_type',v_race_3->>'race_type','check_date',v_race_3->>'check_date',
      'target_check_game_date',v_race_3->>'check_date','required_result','stage_top_5',
      'target_value',1,'current_value',0,'evaluation_mode','stage_result_count','progress_source','stage_results',
      'estimated_reward_amount',v_reward_3,'reward_amount',v_reward_3,
      'reward_label','$' || to_char(v_reward_3,'FM999,999,999')
    ),
    jsonb_build_object(
      'objective_code','gc_top_10',
      'title',coalesce(v_race_4->>'race_name','Prestige stage race') || ': final GC top 10',
      'description','Finish a rider inside the final general-classification top 10 of this prestige stage race.',
      'target_race_id',v_race_4->>'race_id','target_race_name',v_race_4->>'race_name',
      'target_country_code',v_race_4->>'country_code','target_category',v_race_4->>'category',
      'target_race_type',v_race_4->>'race_type','check_date',v_race_4->>'check_date',
      'target_check_game_date',v_race_4->>'check_date','required_result','gc_top_10',
      'target_value',1,'current_value',0,'evaluation_mode','race_final_result','progress_source','race_results',
      'estimated_reward_amount',v_reward_4,'reward_amount',v_reward_4,
      'reward_label','$' || to_char(v_reward_4,'FM999,999,999')
    ),
    jsonb_build_object(
      'objective_code','classification_visibility',
      'title',coalesce(v_race_5->>'race_name','Classification race') || ': classification visibility',
      'description','Place your team in the final published classifications of this race to deliver sponsor exposure.',
      'target_race_id',v_race_5->>'race_id','target_race_name',v_race_5->>'race_name',
      'target_country_code',v_race_5->>'country_code','target_category',v_race_5->>'category',
      'target_race_type',v_race_5->>'race_type','check_date',v_race_5->>'check_date',
      'target_check_game_date',v_race_5->>'check_date','required_result','classification_visibility',
      'target_value',1,'current_value',0,'evaluation_mode','race_final_result','progress_source','race_results',
      'estimated_reward_amount',v_reward_5,'reward_amount',v_reward_5,
      'reward_label','$' || to_char(v_reward_5,'FM999,999,999')
    )
  );
end;
$function$;

-- Do not let a metadata-only refresh overwrite the deliberate five-target preview.
drop trigger if exists trg_sponsor_offer_visibility_preview_normalizer_v1 on public.club_sponsor_offers;
create trigger trg_sponsor_offer_visibility_preview_normalizer_v1
before insert or update of status, sponsor_kind, bonus_pool_amount, coverage_months, generated_game_month
on public.club_sponsor_offers
for each row
execute function public.sponsor_offer_visibility_preview_normalizer_v1();

create or replace function public.sponsor_finalize_main_offer_portfolio_v4(
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
  v_previewed integer := 0;
  v_offer record;
  v_preview jsonb;
  v_preview_total bigint;
  v_uplift numeric;
begin
  v_base := public.sponsor_finalize_main_offer_portfolio_v3(p_club_id, p_season);

  select * into v_club
  from public.clubs c
  where c.id=p_club_id and c.deleted_at is null and c.is_active=true
    and coalesce(c.club_type::text,'main')='main'
  limit 1;
  if not found then raise exception 'Live main club not found.'; end if;

  case v_club.club_tier
    when 'worldteam' then v_desired_naming := 2;
    when 'proteam' then v_desired_naming := 1;
    else v_desired_naming := 0;
  end case;

  -- Relationship-driven/manual naming deals survive, but always satisfy the new minimum.
  for v_offer in
    select o.id,o.naming_rights_uplift_pct,sc.name as company_name
    from public.club_sponsor_offers o
    join public.sponsor_companies sc on sc.id=o.company_id
    where o.club_id=p_club_id and o.season_number=p_season
      and o.sponsor_kind='main' and o.status='offered'
      and coalesce(o.main_sponsor_deal_type,'standard')='naming_rights'
      and (
        coalesce((o.metadata->>'is_renewal_offer')::boolean,false)=true
        or coalesce((o.metadata->>'auto_generated_naming_rights')::boolean,false)=false
      )
  loop
    perform public.sponsor_prepare_main_offer_deal_metadata_v1(
      v_offer.id,'naming_rights',greatest(30,coalesce(v_offer.naming_rights_uplift_pct,30)),v_offer.company_name || ' Team'
    );
  end loop;

  -- Reassign automatic naming-rights choices from the strongest underlying offers.
  for v_offer in
    select o.id
    from public.club_sponsor_offers o
    where o.club_id=p_club_id and o.season_number=p_season
      and o.sponsor_kind='main' and o.status='offered'
      and coalesce(o.main_sponsor_deal_type,'standard')='naming_rights'
      and coalesce((o.metadata->>'is_renewal_offer')::boolean,false)=false
      and coalesce((o.metadata->>'auto_generated_naming_rights')::boolean,false)=true
  loop
    perform public.sponsor_prepare_main_offer_deal_metadata_v1(v_offer.id,'standard',0,null);
    update public.club_sponsor_offers o
    set metadata=(coalesce(o.metadata,'{}'::jsonb)-array[
      'season_display_name','naming_rights_display_name','full_display_name',
      'full_display_name_preview','team_name_preview','branding_locked_fields'
    ]) || jsonb_build_object(
      'auto_generated_naming_rights',false,
      'naming_rights_policy_version','v4_strongest_offer_30_40'
    )
    where o.id=v_offer.id;
  end loop;

  select count(*)::integer into v_fixed_naming
  from public.club_sponsor_offers o
  where o.club_id=p_club_id and o.season_number=p_season
    and o.sponsor_kind='main' and o.status='offered'
    and coalesce(o.main_sponsor_deal_type,'standard')='naming_rights';
  v_missing_naming := greatest(0,v_desired_naming-v_fixed_naming);

  for v_offer in
    select o.id,sc.name as company_name
    from public.club_sponsor_offers o
    join public.sponsor_companies sc on sc.id=o.company_id
    where o.club_id=p_club_id and o.season_number=p_season
      and o.sponsor_kind='main' and o.status='offered'
      and coalesce(o.main_sponsor_deal_type,'standard')<>'naming_rights'
      and coalesce((o.metadata->>'is_renewal_offer')::boolean,false)=false
    order by
      coalesce(o.full_season_guaranteed_amount,o.guaranteed_amount,0) desc,
      coalesce(o.full_season_bonus_pool_amount,o.bonus_pool_amount,0) desc,
      md5(o.id::text || '|naming-v4|' || p_season::text)
    limit v_missing_naming
  loop
    v_uplift := 30 + (((('x' || substr(md5(v_offer.id::text || '|naming-uplift-v4'),1,8))::bit(32)::bigint) % 1001)::numeric / 100.0);
    perform public.sponsor_prepare_main_offer_deal_metadata_v1(
      v_offer.id,'naming_rights',v_uplift,v_offer.company_name || ' Team'
    );
    update public.club_sponsor_offers o
    set metadata=coalesce(o.metadata,'{}'::jsonb) || jsonb_build_object(
      'full_display_name',(o.metadata->>'season_display_name') || ' (' || v_club.name || ')',
      'auto_generated_naming_rights',true,
      'naming_rights_policy_version','v4_strongest_offer_30_40',
      'naming_rights_minimum_premium_pct',30,
      'naming_rights_maximum_premium_pct',40
    )
    where o.id=v_offer.id;
    v_auto_naming := v_auto_naming + 1;
  end loop;

  -- Build the exact five-target preview only after final deal values are known.
  for v_offer in
    select o.id
    from public.club_sponsor_offers o
    where o.club_id=p_club_id and o.season_number=p_season
      and o.sponsor_kind='main' and o.status='offered'
  loop
    v_preview := public.sponsor_build_offer_preview_objectives_v2(v_offer.id);
    select coalesce(sum((x.value->>'estimated_reward_amount')::bigint),0)::bigint
      into v_preview_total
    from jsonb_array_elements(coalesce(v_preview,'[]'::jsonb)) as x(value);

    update public.club_sponsor_offers o
    set metadata=coalesce(o.metadata,'{}'::jsonb) || jsonb_build_object(
      'preview_objectives',coalesce(v_preview,'[]'::jsonb),
      'preview_objectives_version','five_target_v2',
      'preview_objective_count',jsonb_array_length(coalesce(v_preview,'[]'::jsonb)),
      'preview_objective_total_reward',v_preview_total,
      'preview_objectives_match_bonus_pool',v_preview_total=coalesce(o.bonus_pool_amount,0),
      'preview_objectives_refreshed_at',now()
    )
    where o.id=v_offer.id;
    v_previewed := v_previewed + 1;
  end loop;

  return coalesce(v_base,'{}'::jsonb) || jsonb_build_object(
    'naming_policy_version','v4_strongest_offer_30_40',
    'desired_naming_rights',v_desired_naming,
    'fixed_naming_rights',v_fixed_naming,
    'auto_naming_rights_prepared',v_auto_naming,
    'preview_policy_version','five_target_v2',
    'offers_with_five_target_preview',v_previewed
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
  from public.sponsor_generate_offers_core_v1(p_club_id,p_force);
  if not found then return; end if;

  v_finalize := public.sponsor_finalize_main_offer_portfolio_v4(p_club_id,v_core.season_number);

  return query
  select
    v_core.season_number::integer,
    v_core.game_month::integer,
    v_core.coverage_months::integer,
    v_core.proration_factor::numeric,
    v_core.inserted_count::integer,
    (select count(*)::integer from public.club_sponsor_offers o
      where o.club_id=p_club_id and o.season_number=v_core.season_number
        and o.sponsor_kind='main' and o.status='offered'),
    (select count(*)::integer from public.club_sponsor_offers o
      where o.club_id=p_club_id and o.season_number=v_core.season_number
        and o.sponsor_kind='secondary' and o.status='offered'),
    (select count(*)::integer from public.club_sponsor_offers o
      where o.club_id=p_club_id and o.season_number=v_core.season_number
        and o.sponsor_kind='technical' and o.status='offered');
end;
$function$;
