CREATE OR REPLACE FUNCTION public.transfer_remove_shortlist_target_v1(p_shortlist_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare v_count integer;
begin
  delete from public.transfer_shortlist s
  using public.clubs c
  where s.id = p_shortlist_id
    and c.id = s.club_id
    and c.owner_user_id = auth.uid();

  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.transfer_list_market_alerts_v1(p_club_id uuid, p_limit integer DEFAULT 20)
 RETURNS TABLE(id uuid, saved_search_id uuid, search_name text, target_type text, target_id uuid, target_name text, alert_type text, message text, created_at timestamp with time zone, is_read boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_club_id uuid;
begin
  v_club_id := public.transfer_assert_owned_main_club_v1(p_club_id);

  if not public.transfer_user_has_premium_v1() then
    return;
  end if;

  return query
  select
    a.id,
    a.saved_search_id,
    s.search_name,
    a.target_type,
    a.target_id,
    a.target_name,
    a.alert_type,
    a.message,
    a.created_at,
    a.is_read
  from public.transfer_market_alerts a
  join public.transfer_saved_searches s on s.id = a.saved_search_id
  where a.club_id = v_club_id
  order by a.created_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.transfer_get_financial_report_access_v1(p_access_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_is_premium boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.' using errcode = '28000';
  end if;

  v_is_premium := public.transfer_user_has_premium_v1();

  return jsonb_build_object(
    'has_access', v_is_premium,
    'access_source', case when v_is_premium then 'premium' else 'none' end
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.transfer_get_target_comparison_v1(p_rider_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_club_id uuid;
  v_role text;
  v_overall numeric;
  v_salary numeric;
  v_role_count integer := 0;
  v_overall_rank integer;
  v_salary_rank integer;
  v_scout jsonb;
begin
  select c.id into v_club_id
  from public.clubs c
  where c.owner_user_id=auth.uid()
    and c.club_type='main'
    and c.deleted_at is null
  limit 1;

  if v_club_id is null then raise exception 'Main club not found.'; end if;

  select r.role,r.overall,r.salary
  into v_role,v_overall,v_salary
  from public.riders r where r.id=p_rider_id;

  select count(*) into v_role_count
  from public.club_roster cr join public.riders r on r.id=cr.rider_id
  where cr.club_id=v_club_id and r.role=v_role;

  select 1+count(*) into v_overall_rank
  from public.club_roster cr join public.riders r on r.id=cr.rider_id
  where cr.club_id=v_club_id and coalesce(r.overall,0)>coalesce(v_overall,0);

  select 1+count(*) into v_salary_rank
  from public.club_roster cr join public.riders r on r.id=cr.rider_id
  where cr.club_id=v_club_id and coalesce(r.salary,0)>coalesce(v_salary,0);

  v_scout:=public.transfer_get_scout_analyst_intelligence_v1(v_club_id,p_rider_id);

  return jsonb_build_object(
    'club_id',v_club_id,
    'rider_id',p_rider_id,
    'role_count',v_role_count,
    'overall_rank',v_overall_rank,
    'salary_rank',v_salary_rank,
    'would_be_highest_paid_in_role',
      not exists(
        select 1
        from public.club_roster cr join public.riders r on r.id=cr.rider_id
        where cr.club_id=v_club_id and r.role=v_role
          and coalesce(r.salary,0)>coalesce(v_salary,0)
      ),
    'role_duplication_warning',v_role_count>=4,
    'scout_intelligence',v_scout
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.transfer_refresh_market_alerts_v1()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  s record;
  r record;
  v_count integer := 0;
  v_search text;
  v_role text;
  v_only_active boolean;
  v_hide_own boolean;
  v_fingerprint text;
begin
  for s in
    select ss.*
    from public.transfer_saved_searches ss
    where ss.alerts_enabled=true
  loop
    v_search := lower(btrim(coalesce(s.criteria_json->>'search','')));
    v_role := lower(btrim(coalesce(s.criteria_json->>'role','all')));
    v_only_active := coalesce((s.criteria_json->>'only_active')::boolean,true);
    v_hide_own := coalesce((s.criteria_json->>'hide_own')::boolean,true);

    if s.market_type='transfer_list' then
      for r in
        select
          m.listing_id::uuid as target_id,
          m.rider_id::uuid as entity_id,
          coalesce(m.full_name,m.display_name,'Unknown rider')::text as target_name,
          coalesce(m.asking_price,0)::numeric as price_value,
          coalesce(m.status,'active')::text as status_value,
          m.seller_club_id,
          null::timestamp without time zone as expires_ts
        from public.get_transfer_market_listings(1,10000) m
        where (v_search='' or lower(coalesce(m.full_name,m.display_name,'')) like '%'||v_search||'%')
          and (v_role='all' or lower(coalesce(m.role,''))=v_role)
          and (not v_only_active or coalesce(m.status,'active')='active')
          and (not v_hide_own or m.seller_club_id<>s.club_id)
      loop
        v_fingerprint:=md5(r.price_value::text||':'||r.status_value);
        insert into public.transfer_market_alerts(
          club_id,saved_search_id,target_type,target_id,target_name,
          alert_type,message,match_fingerprint
        )
        values(
          s.club_id,s.id,'rider',r.entity_id,r.target_name,
          'new_match',
          format('Matching transfer listing available at %s cash.',to_char(r.price_value,'FM999,999,999')),
          v_fingerprint
        )
        on conflict do nothing;
        if found then v_count:=v_count+1; end if;
      end loop;

    elsif s.market_type='free_agents' then
      for r in
        select
          fa.free_agent_id::uuid as target_id,
          fa.rider_id::uuid as entity_id,
          coalesce(nullif(btrim(concat_ws(' ',fa.first_name,fa.last_name)),''),
                   fa.display_name,'Unknown rider')::text as target_name,
          coalesce(fa.expected_salary_weekly,0)::numeric as price_value,
          coalesce(fa.status,'available')::text as status_value,
          null::uuid as seller_club_id,
          fa.expires_on_game_date::timestamp without time zone as expires_ts
        from public.get_free_agent_market_rows(1,10000) fa
        where (v_search='' or lower(coalesce(
                 nullif(btrim(concat_ws(' ',fa.first_name,fa.last_name)),''),
                 fa.display_name,'')) like '%'||v_search||'%')
          and (v_role='all' or lower(coalesce(fa.role,''))=v_role)
          and (not v_only_active or fa.status in ('available','open'))
      loop
        v_fingerprint:=md5(
          r.price_value::text||':'||r.status_value||':'||coalesce(r.expires_ts::text,'')
        );
        insert into public.transfer_market_alerts(
          club_id,saved_search_id,target_type,target_id,target_name,
          alert_type,message,match_fingerprint
        )
        values(
          s.club_id,s.id,'rider',r.entity_id,r.target_name,
          'new_match',
          format('Matching free agent available. Expected salary: %s/week.',
                 to_char(r.price_value,'FM999,999,999')),
          v_fingerprint
        )
        on conflict do nothing;
        if found then v_count:=v_count+1; end if;
      end loop;

    elsif s.market_type='staff' then
      for r in
        select
          sm.id::uuid as target_id,
          sm.id::uuid as entity_id,
          coalesce(sm.staff_name,
                   nullif(btrim(concat_ws(' ',sm.first_name,sm.last_name)),''),
                   'Unknown staff')::text as target_name,
          coalesce(sm.salary_weekly,0)::numeric as price_value,
          case when sm.is_available then 'available' else 'unavailable' end::text as status_value,
          null::uuid as seller_club_id,
          sm.expires_at_game_ts as expires_ts
        from public.get_staff_market_candidates_for_club(s.club_id,1,10000) sm
        where (v_search='' or lower(coalesce(
                 sm.staff_name,
                 nullif(btrim(concat_ws(' ',sm.first_name,sm.last_name)),''),
                 '')) like '%'||v_search||'%')
          and (v_role='all' or lower(coalesce(sm.role_type,''))=v_role)
          and (not v_only_active or sm.is_available)
      loop
        v_fingerprint:=md5(
          r.price_value::text||':'||r.status_value||':'||coalesce(r.expires_ts::text,'')
        );
        insert into public.transfer_market_alerts(
          club_id,saved_search_id,target_type,target_id,target_name,
          alert_type,message,match_fingerprint
        )
        values(
          s.club_id,s.id,'staff',r.entity_id,r.target_name,
          'new_match',
          format('Matching staff candidate available at %s/week.',
                 to_char(r.price_value,'FM999,999,999')),
          v_fingerprint
        )
        on conflict do nothing;
        if found then v_count:=v_count+1; end if;
      end loop;
    end if;
  end loop;

  return v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.transfer_get_shortlist_access_v2(p_club_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_club_id uuid;
  v_is_premium boolean;
  v_used integer := 0;
  v_balance integer := 0;
  v_active_count integer := 0;
begin
  v_club_id := public.transfer_assert_owned_main_club_v1(p_club_id);
  v_is_premium := public.transfer_user_has_premium_v1();

  select count(*)
  into v_used
  from public.transfer_shortlist_daily_additions
  where user_id = auth.uid()
    and club_id = v_club_id
    and real_date = (now() at time zone 'UTC')::date;

  select coalesce(balance, 0)
  into v_balance
  from public.user_wallets
  where user_id = auth.uid();

  select count(*)
  into v_active_count
  from public.transfer_shortlist
  where club_id = v_club_id
    and target_type = 'rider'
    and removed_at is null;

  return jsonb_build_object(
    'is_premium', v_is_premium,
    'free_additions_per_day', 2,
    'premium_unlimited_additions', v_is_premium,
    'additions_used_today', v_used,
    'free_additions_left_today',
      case when v_is_premium then 2 else greatest(0, 2 - v_used) end,
    'next_addition_coin_cost',
      case
        when v_is_premium then 0
        when v_used >= 2 then 1
        else 0
      end,
    'coin_balance', coalesce(v_balance, 0),
    'active_shortlist_count', v_active_count,
    'active_shortlist_limit', 50,
    'real_date_utc', (now() at time zone 'UTC')::date
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.transfer_get_rider_shortlist_status_v2(p_club_id uuid, p_rider_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_access jsonb;
  v_shortlisted boolean;
begin
  v_access := public.transfer_get_shortlist_access_v2(p_club_id);

  select exists (
    select 1
    from public.transfer_shortlist
    where club_id = p_club_id
      and target_type = 'rider'
      and target_id = p_rider_id
      and removed_at is null
  )
  into v_shortlisted;

  return v_access || jsonb_build_object(
    'rider_id', p_rider_id,
    'is_shortlisted', v_shortlisted
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.transfer_add_rider_to_shortlist_v2(p_club_id uuid, p_rider_id uuid, p_rider_name text, p_source_type text, p_source_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_club_id uuid;
  v_user_id uuid := auth.uid();
  v_real_date date := (now() at time zone 'UTC')::date;
  v_is_premium boolean := false;
  v_used integer := 0;
  v_active_count integer := 0;
  v_coin_cost integer := 0;
  v_balance integer := 0;
  v_addition_number integer;
  v_existing_daily record;
  v_system_key text;
begin
  v_club_id := public.transfer_assert_owned_main_club_v1(p_club_id);
  v_is_premium := public.transfer_user_has_premium_v1();

  if p_source_type not in (
    'transfer_list',
    'free_agent',
    'external_profile',
    'scouting'
  ) then
    raise exception 'Unsupported shortlist source type.';
  end if;

  if exists (
    select 1
    from public.transfer_shortlist
    where club_id = v_club_id
      and target_type = 'rider'
      and target_id = p_rider_id
      and removed_at is null
  ) then
    return public.transfer_get_rider_shortlist_status_v2(
      v_club_id,
      p_rider_id
    ) || jsonb_build_object('coin_charged', 0, 'already_shortlisted', true);
  end if;

  select count(*)
  into v_active_count
  from public.transfer_shortlist
  where club_id = v_club_id
    and target_type = 'rider'
    and removed_at is null;

  if v_active_count >= 50 then
    raise exception 'Rider shortlist limit reached (50).';
  end if;

  select *
  into v_existing_daily
  from public.transfer_shortlist_daily_additions
  where user_id = v_user_id
    and club_id = v_club_id
    and rider_id = p_rider_id
    and real_date = v_real_date;

  if found then
    v_coin_cost := 0;
  else
    select count(*)
    into v_used
    from public.transfer_shortlist_daily_additions
    where user_id = v_user_id
      and club_id = v_club_id
      and real_date = v_real_date;

    v_addition_number := v_used + 1;
    v_coin_cost := case
      when v_is_premium then 0
      when v_addition_number <= 2 then 0
      else 1
    end;

    if v_coin_cost > 0 then
      insert into public.user_wallets (user_id, balance)
      values (v_user_id, 0)
      on conflict (user_id) do nothing;

      select balance
      into v_balance
      from public.user_wallets
      where user_id = v_user_id
      for update;

      if coalesce(v_balance, 0) < v_coin_cost then
        raise exception
          'You need 1 coin for this shortlist addition. Current balance: %.',
          coalesce(v_balance, 0);
      end if;

      v_system_key := format(
        'transfer_shortlist_%s_%s_%s',
        v_user_id,
        p_rider_id,
        v_real_date
      );

      if not exists (
        select 1
        from public.user_coin_ledger
        where user_id = v_user_id
          and payload_json ->> 'system_key' = v_system_key
      ) then
        insert into public.user_coin_ledger (
          user_id,
          delta,
          reason,
          payload_json
        )
        values (
          v_user_id,
          -1,
          'transfer_shortlist_addition',
          jsonb_build_object(
            'system_key', v_system_key,
            'club_id', v_club_id,
            'rider_id', p_rider_id,
            'real_date', v_real_date,
            'addition_number', v_addition_number,
            'coin_cost', 1
          )
        );

        update public.user_wallets
        set balance = balance - 1
        where user_id = v_user_id;
      end if;
    end if;

    insert into public.transfer_shortlist_daily_additions (
      user_id,
      club_id,
      rider_id,
      real_date,
      addition_number,
      coin_charged,
      source_type,
      source_id
    )
    values (
      v_user_id,
      v_club_id,
      p_rider_id,
      v_real_date,
      v_addition_number,
      v_coin_cost,
      p_source_type,
      p_source_id
    );
  end if;

  insert into public.transfer_shortlist (
    club_id,
    target_type,
    target_id,
    target_name,
    source_type,
    source_id,
    created_by_user_id,
    created_at,
    updated_at,
    removed_at
  )
  values (
    v_club_id,
    'rider',
    p_rider_id,
    btrim(p_rider_name),
    p_source_type,
    p_source_id,
    v_user_id,
    now(),
    now(),
    null
  )
  on conflict (club_id, target_type, target_id)
  do update set
    target_name = excluded.target_name,
    source_type = excluded.source_type,
    source_id = excluded.source_id,
    updated_at = now(),
    removed_at = null;

  return public.transfer_get_rider_shortlist_status_v2(
    v_club_id,
    p_rider_id
  ) || jsonb_build_object(
    'coin_charged', v_coin_cost,
    'already_shortlisted', false
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.transfer_remove_rider_from_shortlist_v2(p_club_id uuid, p_rider_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_club_id uuid;
  v_count integer;
begin
  v_club_id := public.transfer_assert_owned_main_club_v1(p_club_id);

  update public.transfer_shortlist
  set
    removed_at = now(),
    updated_at = now()
  where club_id = v_club_id
    and target_type = 'rider'
    and target_id = p_rider_id
    and removed_at is null;

  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.transfer_list_rider_shortlist_v2(p_club_id uuid)
 RETURNS TABLE(shortlist_id uuid, rider_id uuid, rider_name text, country_code text, role text, age_years integer, overall_label text, potential_label text, current_club_id uuid, current_club_name text, source_type text, source_id uuid, notes text, added_at timestamp with time zone, availability_type text, listing_id uuid, transfer_price numeric, expected_salary_weekly numeric, expires_on_game_date date, availability_label text, is_scouted boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_club_id uuid;
begin
  v_club_id:=public.transfer_assert_owned_main_club_v1(p_club_id);

  return query
  select
    s.id,
    s.target_id,
    coalesce(nullif(btrim(concat_ws(' ',r.first_name,r.last_name)),''),
             r.display_name,cr.display_name,s.target_name,'Unknown rider')::text,
    coalesce(r.country_code,cr.country_code)::text,
    coalesce(r.role,cr.assigned_role)::text,
    coalesce(cr.age_years,
      extract(year from age(coalesce(public.get_current_game_date_date(),current_date),r.birth_date))::integer),
    coalesce(
      sr.report_json->'overall'->>'label',
      case
        when coalesce(r.overall,cr.overall) is null then null
        when coalesce(r.overall,cr.overall)<40 then '0-40'
        when coalesce(r.overall,cr.overall)<60 then '40-60'
        when coalesce(r.overall,cr.overall)<80 then '60-80'
        else '80-100'
      end
    )::text,
    (sr.report_json->'potential'->>'label')::text,
    cr.club_id,
    c.name::text,
    coalesce(s.source_type,'external_profile')::text,
    s.source_id,
    s.notes,
    s.created_at,
    case when tl.id is not null then 'transfer_list'
         when fa.id is not null then 'free_agent'
         else 'not_available' end::text,
    tl.id,
    tl.asking_price::numeric,
    fa.expected_salary_weekly::numeric,
    coalesce(tl.expires_on_game_date,fa.expires_on_game_date),
    case when tl.id is not null then 'Transfer listed'
         when fa.id is not null then 'Free Agent'
         else 'Not currently available' end::text,
    (sr.id is not null)
  from public.transfer_shortlist s
  left join public.riders r on r.id=s.target_id
  left join lateral(
    select roster.club_id,roster.display_name,roster.assigned_role,roster.age_years,
           roster.overall,roster.country_code
    from public.club_roster roster
    where roster.rider_id=s.target_id
    order by case when roster.club_id=v_club_id then 0 else 1 end,roster.club_id
    limit 1
  ) cr on true
  left join public.clubs c on c.id=cr.club_id
  left join lateral(
    select rep.id,rep.report_json
    from public.rider_scout_reports rep
    where rep.club_id=v_club_id and rep.rider_id=s.target_id
    order by rep.created_at_game_ts desc nulls last,rep.created_at desc
    limit 1
  ) sr on true
  left join lateral(
    select l.id,l.asking_price,l.expires_on_game_date
    from public.rider_transfer_listings l
    where l.rider_id=s.target_id and l.status in ('listed','active','open')
    order by l.listed_on_game_date desc nulls last
    limit 1
  ) tl on true
  left join lateral(
    select f.id,f.expected_salary_weekly,f.expires_on_game_date
    from public.rider_free_agents f
    where f.rider_id=s.target_id and f.status in ('available','open')
    order by f.created_at desc
    limit 1
  ) fa on true
  where s.club_id=v_club_id
    and s.target_type='rider'
    and s.removed_at is null
  order by s.created_at desc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.customize_team_assert_owned_club_v1(p_club_id uuid)
 RETURNS clubs
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_club public.clubs;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.' using errcode = '28000';
  end if;

  select c.*
  into v_club
  from public.clubs c
  where c.id = p_club_id
    and c.owner_user_id = auth.uid()
    and coalesce(c.club_type, 'main') = 'main';

  if not found then
    raise exception 'Main club not found or not owned by the current user.'
      using errcode = '42501';
  end if;

  return v_club;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.customize_team_charge_coins_v1(p_amount integer, p_reason text, p_payload jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_balance integer;
begin
  if p_amount <= 0 then
    return public.customize_team_wallet_balance_v1();
  end if;

  insert into public.user_wallets (user_id, balance)
  values (auth.uid(), 0)
  on conflict (user_id) do nothing;

  select balance
  into v_balance
  from public.user_wallets
  where user_id = auth.uid()
  for update;

  if coalesce(v_balance, 0) < p_amount then
    raise exception 'Not enough coins. Required: %, current balance: %.',
      p_amount, coalesce(v_balance, 0);
  end if;

  update public.user_wallets
  set balance = balance - p_amount
  where user_id = auth.uid();

  insert into public.user_coin_ledger (user_id, delta, reason, payload_json)
  values (auth.uid(), -p_amount, p_reason, coalesce(p_payload, '{}'::jsonb));

  return v_balance - p_amount;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.customize_team_get_access_v1(p_club_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_club public.clubs;
  v_season integer;
  v_logo_count integer := 0;
  v_jersey_count integer := 0;
begin
  v_club := public.customize_team_assert_owned_club_v1(p_club_id);
  v_season := public.customize_team_current_season_v1();

  select coalesce(max(change_count), 0)
  into v_logo_count
  from public.club_customization_usage
  where club_id = v_club.id
    and season_number = v_season
    and customization_type = 'logo';

  select coalesce(max(change_count), 0)
  into v_jersey_count
  from public.club_customization_usage
  where club_id = v_club.id
    and season_number = v_season
    and customization_type = 'jersey';

  return jsonb_build_object(
    'season_number', v_season,
    'coin_balance', public.customize_team_wallet_balance_v1(),
    'name_change_cost', 30,
    'logo_change_cost', case when v_logo_count = 0 then 0 else 10 end,
    'logo_free_change_used', v_logo_count > 0,
    'jersey_change_cost', case when v_jersey_count = 0 then 0 else 10 end,
    'jersey_free_change_used', v_jersey_count > 0
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.customize_team_change_name_v1(p_club_id uuid, p_new_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_club public.clubs;
  v_updated public.clubs;
  v_name text;
  v_balance integer;
begin
  v_club := public.customize_team_assert_owned_club_v1(p_club_id);
  v_name := btrim(regexp_replace(coalesce(p_new_name, ''), '\s+', ' ', 'g'));

  if char_length(v_name) < 3 or char_length(v_name) > 40 then
    raise exception 'Team name must be between 3 and 40 characters.';
  end if;

  if v_name = v_club.name then
    return jsonb_build_object(
      'success', true,
      'coin_charged', 0,
      'coin_balance', public.customize_team_wallet_balance_v1(),
      'club', to_jsonb(v_club)
    );
  end if;

  v_balance := public.customize_team_charge_coins_v1(
    30,
    'team_name_change',
    jsonb_build_object(
      'club_id', v_club.id,
      'old_name', v_club.name,
      'new_name', v_name,
      'coin_cost', 30
    )
  );

  perform public.update_club_branding_v1(v_club.id, v_name, null, null, null);

  select c.* into v_updated
  from public.clubs c
  where c.id = v_club.id;

  return jsonb_build_object(
    'success', true,
    'coin_charged', 30,
    'coin_balance', v_balance,
    'club', to_jsonb(v_updated)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.customize_team_change_logo_v1(p_club_id uuid, p_logo_path text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_club public.clubs;
  v_updated public.clubs;
  v_season integer;
  v_existing_count integer := 0;
  v_cost integer;
  v_balance integer;
begin
  v_club := public.customize_team_assert_owned_club_v1(p_club_id);
  v_season := public.customize_team_current_season_v1();

  if nullif(btrim(coalesce(p_logo_path, '')), '') is null then
    raise exception 'Logo path is required.';
  end if;

  if p_logo_path = v_club.logo_path then
    return jsonb_build_object(
      'success', true,
      'coin_charged', 0,
      'coin_balance', public.customize_team_wallet_balance_v1(),
      'club', to_jsonb(v_club)
    );
  end if;

  perform pg_advisory_xact_lock(hashtext(v_club.id::text || ':' || v_season::text || ':logo'));

  select coalesce(max(change_count), 0)
  into v_existing_count
  from public.club_customization_usage
  where club_id = v_club.id
    and season_number = v_season
    and customization_type = 'logo';

  v_cost := case when v_existing_count = 0 then 0 else 10 end;
  v_balance := public.customize_team_charge_coins_v1(
    v_cost,
    'team_logo_change',
    jsonb_build_object(
      'club_id', v_club.id,
      'season_number', v_season,
      'change_number', v_existing_count + 1,
      'coin_cost', v_cost
    )
  );

  perform public.update_club_branding_v1(v_club.id, null, null, null, p_logo_path);

  insert into public.club_customization_usage (
    club_id, season_number, customization_type,
    first_changed_at, last_changed_at, change_count
  )
  values (v_club.id, v_season, 'logo', now(), now(), 1)
  on conflict (club_id, season_number, customization_type)
  do update set
    last_changed_at = now(),
    change_count = public.club_customization_usage.change_count + 1;

  select c.* into v_updated
  from public.clubs c
  where c.id = v_club.id;

  return jsonb_build_object(
    'success', true,
    'coin_charged', v_cost,
    'coin_balance', v_balance,
    'club', to_jsonb(v_updated)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.customize_team_save_home_kit_v1(p_club_id uuid, p_config jsonb)
 RETURNS team_kits
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_club public.clubs;
  v_season integer;
  v_existing_count integer := 0;
  v_cost integer;
  v_saved public.team_kits;
begin
  v_club := public.customize_team_assert_owned_club_v1(p_club_id);
  v_season := public.customize_team_current_season_v1();

  perform pg_advisory_xact_lock(hashtext(v_club.id::text || ':' || v_season::text || ':jersey'));

  select coalesce(max(change_count), 0)
  into v_existing_count
  from public.club_customization_usage
  where club_id = v_club.id
    and season_number = v_season
    and customization_type = 'jersey';

  v_cost := case when v_existing_count = 0 then 0 else 10 end;

  perform public.customize_team_charge_coins_v1(
    v_cost,
    'team_jersey_change',
    jsonb_build_object(
      'club_id', v_club.id,
      'season_number', v_season,
      'change_number', v_existing_count + 1,
      'coin_cost', v_cost
    )
  );

  select * into v_saved
  from public.save_club_home_kit_config_v1(v_club.id, p_config);

  insert into public.club_customization_usage (
    club_id, season_number, customization_type,
    first_changed_at, last_changed_at, change_count
  )
  values (v_club.id, v_season, 'jersey', now(), now(), 1)
  on conflict (club_id, season_number, customization_type)
  do update set
    last_changed_at = now(),
    change_count = public.club_customization_usage.change_count + 1;

  return v_saved;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.write_weather_cancelled_stage_report_event_v2(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_stage record;
  v_existing_event_id uuid;
  v_event_order integer;
  v_reason text;
  v_reason_label text;
  v_title text;
  v_description text;
  v_metadata jsonb;
  v_inserted_id uuid;
begin
  select
    rs.id as stage_id,
    rs.race_id,
    rs.stage_number,
    rs.stage_date,
    rs.weather_cancelled,
    rs.weather_cancellation_reason,

    candidate.weather_condition_text,
    candidate.snow_cm,
    candidate.avg_temp_c,
    candidate.min_temp_c,
    candidate.max_temp_c

  into v_stage

  from public.race_stages rs

  left join
    public.race_stage_weather_cancellation_candidates_v1
      candidate
    on candidate.stage_id = rs.id

  where rs.id = p_stage_id

  for update of rs;

  if not found then
    return jsonb_build_object(
      'status', 'stage_not_found',
      'stage_id', p_stage_id,
      'inserted', false
    );
  end if;

  if coalesce(
       v_stage.weather_cancelled,
       false
     ) = false then
    return jsonb_build_object(
      'status',
        'stage_not_weather_cancelled',
      'stage_id',
        p_stage_id,
      'race_id',
        v_stage.race_id,
      'inserted',
        false
    );
  end if;

  /*
   * Idempotency:
   * accept an existing v1 or v2 weather-cancellation event.
   */
  select event_row.id
  into v_existing_event_id
  from public.race_stage_report_events
    event_row
  where event_row.stage_id =
          p_stage_id
    and event_row.metadata
          ->> 'event_type' =
        'weather_cancelled'
  order by event_row.event_order
  limit 1;

  if v_existing_event_id is not null then
    return jsonb_build_object(
      'status',
        'weather_cancelled_report_event_already_exists',
      'stage_id',
        p_stage_id,
      'race_id',
        v_stage.race_id,
      'report_event_id',
        v_existing_event_id,
      'inserted',
        false
    );
  end if;

  select
    coalesce(
      max(event_row.event_order),
      0
    ) + 1
  into v_event_order
  from public.race_stage_report_events
    event_row
  where event_row.stage_id =
          p_stage_id;

  v_reason := coalesce(
    nullif(
      v_stage.weather_cancellation_reason,
      ''
    ),
    'unsafe_weather'
  );

  v_reason_label :=
    public.weather_cancellation_reason_label_v1(
      v_reason
    );

  v_title :=
    'Stage cancelled due to weather';

  v_description :=
    'Stage '
    || coalesce(
         v_stage.stage_number::text,
         '?'
       )
    || ' was cancelled due to '
    || v_reason_label
    || '.';

  v_metadata := jsonb_build_object(
    'source',
      'weather_cancellation_v2',
    'event_type',
      'weather_cancelled',
    'reason',
      v_reason,
    'reason_label',
      v_reason_label,

    'race_id',
      v_stage.race_id,
    'stage_id',
      v_stage.stage_id,
    'stage_number',
      v_stage.stage_number,
    'stage_date',
      v_stage.stage_date,

    'weather_condition_text',
      v_stage.weather_condition_text,
    'snow_cm',
      v_stage.snow_cm,
    'avg_temp_c',
      v_stage.avg_temp_c,
    'min_temp_c',
      v_stage.min_temp_c,
    'max_temp_c',
      v_stage.max_temp_c,

    'no_results',
      true,
    'no_points',
      true,
    'no_ranking_points',
      true,
    'no_replay',
      true,
    'no_fatigue',
      true,
    'no_prize_money',
      true,

    'simulation_run_created',
      false,
    'created_at',
      now()
  );

  insert into
    public.race_stage_report_events (
      race_id,
      stage_id,
      event_order,
      event_type,
      title,
      description,
      metadata
    )
  values (
    v_stage.race_id,
    v_stage.stage_id,
    v_event_order,
    'summary',
    v_title,
    v_description,
    v_metadata
  )
  returning id
  into v_inserted_id;

  return jsonb_build_object(
    'status',
      'weather_cancelled_report_event_inserted',
    'stage_id',
      v_stage.stage_id,
    'race_id',
      v_stage.race_id,
    'report_event_id',
      v_inserted_id,
    'event_order',
      v_event_order,
    'inserted',
      true,
    'simulation_run_id',
      null
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.finalize_weather_cancelled_race_state_v2(p_race_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_current_status text;

  v_total_stage_count integer := 0;
  v_cancelled_stage_count integer := 0;
  v_finished_result_stage_count integer := 0;
  v_terminal_stage_count integer := 0;

  v_all_stages_cancelled boolean := false;
  v_all_stages_terminal boolean := false;

  v_weather_status text := 'none';
  v_new_race_status text;
begin
  select race_row.status
  into v_current_status
  from public.races race_row
  where race_row.id = p_race_id
  for update;

  if not found then
    return jsonb_build_object(
      'status', 'race_not_found',
      'race_id', p_race_id
    );
  end if;

  select count(*)::integer
  into v_total_stage_count
  from public.race_stages stage_row
  where stage_row.race_id =
          p_race_id;

  select count(*)::integer
  into v_cancelled_stage_count
  from public.race_stages stage_row
  where stage_row.race_id =
          p_race_id
    and coalesce(
          stage_row.weather_cancelled,
          false
        ) = true;

  /*
   * Only non-cancelled stages with canonical finished results
   * count as result-completed stages.
   */
  select
    count(distinct stage_row.id)::integer
  into v_finished_result_stage_count
  from public.race_stages stage_row
  where stage_row.race_id =
          p_race_id
    and coalesce(
          stage_row.weather_cancelled,
          false
        ) = false
    and exists (
      select 1
      from public.race_stage_results
        result_row
      where result_row.stage_id =
              stage_row.id
        and result_row.status =
              'finished'
    );

  v_terminal_stage_count :=
    v_cancelled_stage_count
    + v_finished_result_stage_count;

  v_all_stages_cancelled :=
    v_total_stage_count > 0
    and v_cancelled_stage_count =
        v_total_stage_count;

  v_all_stages_terminal :=
    v_total_stage_count > 0
    and v_terminal_stage_count =
        v_total_stage_count;

  v_weather_status :=
    case
      when v_cancelled_stage_count = 0
        then 'none'

      when v_all_stages_cancelled
        then 'all_stages_weather_cancelled'

      else 'partly_weather_cancelled'
    end;

  /*
   * Do not downgrade already completed or archived races.
   */
  v_new_race_status :=
    case
      when v_current_status in (
        'completed',
        'archived'
      )
        then v_current_status

      when v_all_stages_cancelled
        then 'cancelled'

      when v_all_stages_terminal
        then 'completed'

      when v_cancelled_stage_count > 0
        then 'active'

      else v_current_status
    end;

  update public.races race_row
  set
    status =
      v_new_race_status,

    metadata =
      coalesce(
        race_row.metadata,
        '{}'::jsonb
      )
      || jsonb_build_object(
           'weather_cancellation_status',
             v_weather_status,

           'weather_cancelled_stage_count',
             v_cancelled_stage_count,

           'weather_total_stage_count',
             v_total_stage_count,

           'weather_all_stages_cancelled',
             v_all_stages_cancelled,

           'weather_result_stage_count',
             v_finished_result_stage_count,

           'weather_finished_result_stage_count',
             v_finished_result_stage_count,

           'weather_terminal_stage_count',
             v_terminal_stage_count,

           'weather_all_stages_terminal',
             v_all_stages_terminal,

           'weather_state_finalized_at',
             now(),

           'weather_state_finalizer_version',
             'weather_lifecycle_v2',

           'weather_simulation_run_required',
             false
         ),

    updated_at =
      now()

  where race_row.id =
          p_race_id;

  return jsonb_build_object(
    'status',
      'weather_race_state_finalized',

    'version',
      'weather_lifecycle_v2',

    'race_id',
      p_race_id,

    'status_before',
      v_current_status,

    'status_after',
      v_new_race_status,

    'weather_cancellation_status',
      v_weather_status,

    'weather_total_stage_count',
      v_total_stage_count,

    'weather_cancelled_stage_count',
      v_cancelled_stage_count,

    'weather_finished_result_stage_count',
      v_finished_result_stage_count,

    'weather_terminal_stage_count',
      v_terminal_stage_count,

    'weather_all_stages_cancelled',
      v_all_stages_cancelled,

    'weather_all_stages_terminal',
      v_all_stages_terminal,

    'simulation_run_required',
      false
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.refund_one_day_weather_cancelled_race_v2(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stage record;

  v_total_stage_count integer := 0;
  v_cancelled_stage_count integer := 0;

  v_refund_count integer := 0;
  v_refund_total bigint := 0;

  v_skipped_count integer := 0;

  v_refund_tx_id uuid;
  v_idempotency_key text;

  v_metadata jsonb;
  v_results jsonb := '[]'::jsonb;

  v_prep record;
begin
  -- ----------------------------------------------------------
  -- Resolve stage/race.
  -- ----------------------------------------------------------
  select
    rs.id as stage_id,
    rs.race_id,
    rs.stage_number,
    rs.stage_date,
    rs.weather_cancelled,
    rs.weather_cancellation_reason,
    r.name as race_name,
    r.status as race_status,
    r.metadata as race_metadata
  into v_stage
  from public.race_stages rs
  join public.races r
    on r.id = rs.race_id
  where rs.id = p_stage_id;

  if v_stage.stage_id is null then
    return jsonb_build_object(
      'status', 'stage_not_found',
      'stage_id', p_stage_id,
      'refunded', false,
      'refund_count', 0,
      'refund_total', 0
    );
  end if;

  -- ----------------------------------------------------------
  -- Must be one-day race.
  -- ----------------------------------------------------------
  select count(*)
  into v_total_stage_count
  from public.race_stages rs
  where rs.race_id = v_stage.race_id;

  if coalesce(v_total_stage_count, 0) <> 1 then
    return jsonb_build_object(
      'status', 'not_one_day_race_no_refund',
      'stage_id', p_stage_id,
      'race_id', v_stage.race_id,
      'race_name', v_stage.race_name,
      'stage_count', v_total_stage_count,
      'refunded', false,
      'refund_count', 0,
      'refund_total', 0
    );
  end if;

  -- ----------------------------------------------------------
  -- Stage must be weather-cancelled.
  -- ----------------------------------------------------------
  if coalesce(v_stage.weather_cancelled, false) = false then
    return jsonb_build_object(
      'status', 'stage_not_weather_cancelled_no_refund',
      'stage_id', p_stage_id,
      'race_id', v_stage.race_id,
      'race_name', v_stage.race_name,
      'stage_count', v_total_stage_count,
      'refunded', false,
      'refund_count', 0,
      'refund_total', 0
    );
  end if;

  select count(*)
  into v_cancelled_stage_count
  from public.race_stages rs
  where rs.race_id = v_stage.race_id
    and coalesce(rs.weather_cancelled, false) = true;

  if v_cancelled_stage_count <> v_total_stage_count then
    return jsonb_build_object(
      'status', 'race_not_fully_weather_cancelled_no_refund',
      'stage_id', p_stage_id,
      'race_id', v_stage.race_id,
      'race_name', v_stage.race_name,
      'stage_count', v_total_stage_count,
      'weather_cancelled_stage_count', v_cancelled_stage_count,
      'refunded', false,
      'refund_count', 0,
      'refund_total', 0
    );
  end if;

  -- ----------------------------------------------------------
  -- Finance function uses finance.internal = 1 to allow backend
  -- system credit without user-session permission problems.
  -- ----------------------------------------------------------
  perform set_config('finance.internal', '1', true);

  -- ----------------------------------------------------------
  -- Refund every paid preparation for this one-day cancelled race.
  -- Only refund rows that actually had a finance charge transaction.
  -- ----------------------------------------------------------
  for v_prep in
    select
      rp.id as race_preparation_id,
      rp.race_id,
      rp.club_id,
      rp.participating_club_id,
      rp.status as preparation_status,
      rp.startlist_status,
      rp.participation_cost_cash,
      rp.travel_cost_cash,
      rp.staff_travel_cost_cash,
      rp.asset_transport_cost_cash,
      rp.supplies_cost_cash,
      rp.operations_cost_cash,
      rp.total_cost_cash,
      rp.finance_transaction_id,
      coalesce(rp.metadata, '{}'::jsonb) as metadata
    from public.race_preparations rp
    where rp.race_id = v_stage.race_id
    order by rp.club_id
  loop
    if coalesce(v_prep.total_cost_cash, 0) <= 0 then
      v_skipped_count := v_skipped_count + 1;

      v_results := v_results || jsonb_build_array(
        jsonb_build_object(
          'race_preparation_id', v_prep.race_preparation_id,
          'club_id', v_prep.club_id,
          'status', 'skipped_no_cost',
          'amount', coalesce(v_prep.total_cost_cash, 0)
        )
      );

      continue;
    end if;

    if v_prep.finance_transaction_id is null then
      v_skipped_count := v_skipped_count + 1;

      v_results := v_results || jsonb_build_array(
        jsonb_build_object(
          'race_preparation_id', v_prep.race_preparation_id,
          'club_id', v_prep.club_id,
          'status', 'skipped_no_original_finance_transaction',
          'amount', coalesce(v_prep.total_cost_cash, 0)
        )
      );

      continue;
    end if;

    v_idempotency_key :=
      'weather_cancelled_one_day_refund:' || v_prep.race_preparation_id::text;

    v_metadata := jsonb_build_object(
      'source', 'weather_cancellation_v1',
      'source_type', 'one_day_weather_cancelled_race_refund',
      'race_id', v_stage.race_id,
      'race_name', v_stage.race_name,
      'stage_id', v_stage.stage_id,
      'stage_number', v_stage.stage_number,
      'stage_date', v_stage.stage_date,
      'weather_cancellation_reason', v_stage.weather_cancellation_reason,

      'race_preparation_id', v_prep.race_preparation_id,
      'club_id', v_prep.club_id,
      'participating_club_id', v_prep.participating_club_id,

      'original_finance_transaction_id', v_prep.finance_transaction_id,
      'refund_amount', v_prep.total_cost_cash,

      'participation_cost_cash', v_prep.participation_cost_cash,
      'travel_cost_cash', v_prep.travel_cost_cash,
      'staff_travel_cost_cash', v_prep.staff_travel_cost_cash,
      'asset_transport_cost_cash', v_prep.asset_transport_cost_cash,
      'supplies_cost_cash', v_prep.supplies_cost_cash,
      'operations_cost_cash', v_prep.operations_cost_cash,

      'no_results', true,
      'no_points', true,
      'no_replay', true,
      'no_fatigue', true,
      'no_prize_money', true,
      'created_at', now()
    );

    -- Use p_type='income' because finance_credit_to_club's default
    -- known-safe type is income. The refund meaning is stored in metadata.
    v_refund_tx_id := public.finance_credit_to_club(
      v_prep.club_id,
      v_prep.total_cost_cash,
      'income',
      'SINK',
      v_idempotency_key,
      v_metadata
    );

    update public.race_preparations rp
    set metadata =
      coalesce(rp.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'weather_refund_status', 'refunded',
        'weather_refund_source', 'weather_cancellation_v1',
        'weather_refund_transaction_id', v_refund_tx_id,
        'weather_refund_amount', v_prep.total_cost_cash,
        'weather_refund_idempotency_key', v_idempotency_key,
        'weather_refunded_at', now()
      ),
      updated_at = now()
    where rp.id = v_prep.race_preparation_id;

    v_refund_count := v_refund_count + 1;
    v_refund_total := v_refund_total + v_prep.total_cost_cash;

    v_results := v_results || jsonb_build_array(
      jsonb_build_object(
        'race_preparation_id', v_prep.race_preparation_id,
        'club_id', v_prep.club_id,
        'status', 'refunded',
        'amount', v_prep.total_cost_cash,
        'refund_transaction_id', v_refund_tx_id,
        'idempotency_key', v_idempotency_key
      )
    );
  end loop;

  return jsonb_build_object(
    'status', 'one_day_weather_cancelled_race_refund_processed',
    'stage_id', p_stage_id,
    'race_id', v_stage.race_id,
    'race_name', v_stage.race_name,
    'weather_cancellation_reason', v_stage.weather_cancellation_reason,
    'stage_count', v_total_stage_count,
    'weather_cancelled_stage_count', v_cancelled_stage_count,
    'refunded', v_refund_count > 0,
    'refund_count', v_refund_count,
    'refund_total', v_refund_total,
    'skipped_count', v_skipped_count,
    'results', v_results
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_weather_cancellation_notifications_v2(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stage record;
  v_reason text;
  v_reason_label text;

  v_total_stage_count integer := 0;
  v_cancelled_stage_count integer := 0;
  v_active_stage_count integer := 0;
  v_effective_stage_count integer := 1;

  v_is_one_day boolean := false;
  v_is_race_fully_cancelled boolean := false;

  v_stage_notification_count integer := 0;
  v_race_notification_count integer := 0;
  v_total_recipient_count integer := 0;

  v_notification_id bigint;
  v_existing_notification_id bigint;

  v_event_key text;
  v_action_url text;
  v_stage_path text;
  v_image_url text;
  v_payload jsonb;
  v_type_code text;
  v_title text;
  v_message text;

  v_recipient record;
  v_results jsonb := '[]'::jsonb;
begin
  select
    rs.id as stage_id,
    rs.race_id,
    rs.stage_number,
    rs.stage_date,
    rs.name as stage_name,
    rs.profile_image_url as stage_profile_image_url,
    rs.weather_cancelled,
    rs.weather_cancellation_reason,
    rs.weather_cancelled_at,
    r.name as race_name,
    r.status as race_status,
    coalesce(r.is_stage_race, false) as is_stage_race,
    r.stage_count,
    coalesce(r.metadata, '{}'::jsonb) as race_metadata,
    r.logo_url,
    r.profile_image_url as race_profile_image_url
  into v_stage
  from public.race_stages rs
  join public.races r
    on r.id = rs.race_id
  where rs.id = p_stage_id;

  if v_stage.stage_id is null then
    return jsonb_build_object(
      'status', 'stage_not_found',
      'stage_id', p_stage_id,
      'notification_created', false
    );
  end if;

  if coalesce(v_stage.weather_cancelled, false) = false
     and lower(coalesce(v_stage.race_status, '')) not in ('cancelled', 'canceled', 'weather_cancelled', 'weather_canceled') then
    return jsonb_build_object(
      'status', 'stage_not_weather_cancelled',
      'stage_id', p_stage_id,
      'race_id', v_stage.race_id,
      'notification_created', false
    );
  end if;

  select
    count(*)::integer,
    count(*) filter (where coalesce(rs.weather_cancelled, false) = true)::integer,
    count(*) filter (where coalesce(rs.weather_cancelled, false) = false)::integer
  into v_total_stage_count, v_cancelled_stage_count, v_active_stage_count
  from public.race_stages rs
  where rs.race_id = v_stage.race_id;

  v_effective_stage_count := greatest(coalesce(v_stage.stage_count, v_total_stage_count, 1), 1);
  v_is_one_day := v_effective_stage_count <= 1 or coalesce(v_stage.is_stage_race, false) = false;

  v_is_race_fully_cancelled :=
    lower(coalesce(v_stage.race_status, '')) in ('cancelled', 'canceled', 'weather_cancelled', 'weather_canceled')
    or coalesce(v_stage.race_metadata ->> 'weather_cancellation_status', '') = 'all_stages_weather_cancelled'
    or (
      v_total_stage_count > 0
      and v_cancelled_stage_count >= v_total_stage_count
    )
    or (
      v_is_one_day = true
      and coalesce(v_stage.weather_cancelled, false) = true
    );

  v_reason := coalesce(
    nullif(v_stage.weather_cancellation_reason, ''),
    nullif(v_stage.race_metadata ->> 'weather_cancellation_reason', ''),
    'unsafe_weather'
  );
  v_reason_label := public.weather_cancellation_reason_label_v1(v_reason);

  v_action_url := '/dashboard/races/' || v_stage.race_id::text;
  v_stage_path := v_action_url || '?stageId=' || v_stage.stage_id::text;
  v_image_url := coalesce(
    nullif(v_stage.stage_profile_image_url, ''),
    nullif(v_stage.logo_url, ''),
    nullif(v_stage.race_profile_image_url, '')
  );

  if v_is_race_fully_cancelled then
    v_type_code := 'RACE_WEATHER_CANCELLED';
    v_title := 'Race cancelled due to weather: ' || coalesce(v_stage.race_name, 'Race');
    v_message := coalesce(v_stage.race_name, 'This race')
      || ' was cancelled because of '
      || v_reason_label
      || '. No results, points, prize money, fatigue, or replay will be generated for the cancelled race.';
    v_event_key := 'weather_cancelled_race:' || v_stage.race_id::text;
  else
    v_type_code := 'RACE_STAGE_WEATHER_CANCELLED';
    v_title := 'Stage cancelled due to weather: ' || coalesce(v_stage.race_name, 'Race');
    v_message := 'Stage '
      || coalesce(v_stage.stage_number::text, '?')
      || ' of '
      || coalesce(v_stage.race_name, 'this race')
      || ' was cancelled because of '
      || v_reason_label
      || '. The race can continue if other stages are still active.';
    v_event_key := 'weather_cancelled_stage:' || v_stage.stage_id::text;
  end if;

  -- Notify all user-owned clubs with race preparations.
  for v_recipient in
    select distinct
      rp.club_id,
      coalesce(rp.participating_club_id, rp.club_id) as participating_club_id,
      c.owner_user_id as user_id
    from public.race_preparations rp
    join public.clubs c
      on c.id = rp.club_id
    where rp.race_id = v_stage.race_id
      and c.owner_user_id is not null
    order by rp.club_id
  loop
    v_total_recipient_count := v_total_recipient_count + 1;

    v_payload := jsonb_build_object(
      'source', 'weather_cancellation_v1',
      'event_type', case when v_is_race_fully_cancelled then 'race_weather_cancelled' else 'stage_weather_cancelled' end,
      'race_id', v_stage.race_id,
      'race_name', v_stage.race_name,
      'stage_id', v_stage.stage_id,
      'stage_number', v_stage.stage_number,
      'stage_name', v_stage.stage_name,
      'stage_date', v_stage.stage_date,
      'club_id', v_recipient.club_id,
      'participating_club_id', v_recipient.participating_club_id,
      'reason', v_reason,
      'reason_label', v_reason_label,
      'race_cancelled', v_is_race_fully_cancelled,
      'race_fully_cancelled', v_is_race_fully_cancelled,
      'stage_cancelled', true,
      'race_status', v_stage.race_status,
      'race_path', v_action_url,
      'action_url', v_action_url,
      'stage_path', v_stage_path,
      'image_url', v_image_url,
      'race_logo_url', v_stage.logo_url,
      'race_profile_image_url', v_stage.race_profile_image_url,
      'stage_profile_image_url', v_stage.stage_profile_image_url,
      'total_stage_count', v_total_stage_count,
      'cancelled_stage_count', v_cancelled_stage_count,
      'active_stage_count', v_active_stage_count,
      'no_results', true,
      'no_points', true,
      'no_replay', true,
      'no_fatigue', true,
      'no_prize_money', true
    );

    v_existing_notification_id := null;

    select n.id
    into v_existing_notification_id
    from public.user_notifications un
    join public.notifications n
      on n.id = un.notification_id
    join public.notification_types nt
      on nt.id = n.type_id
    where un.user_id = v_recipient.user_id
      and un.deleted_at is null
      and nt.code = v_type_code
      and (
        (v_is_race_fully_cancelled and coalesce(n.payload_json ->> 'race_id', '') = v_stage.race_id::text)
        or
        (not v_is_race_fully_cancelled and coalesce(n.payload_json ->> 'stage_id', '') = v_stage.stage_id::text)
      )
    order by n.created_at desc
    limit 1;

    if v_existing_notification_id is not null then
      v_notification_id := v_existing_notification_id;
    else
      v_notification_id := public.ppm_create_user_notification_direct_v1(
        v_recipient.user_id,
        v_type_code,
        v_title,
        v_message,
        v_action_url,
        v_payload,
        v_event_key || ':club:' || v_recipient.club_id::text
      );

      if v_is_race_fully_cancelled then
        v_race_notification_count := v_race_notification_count + 1;
      else
        v_stage_notification_count := v_stage_notification_count + 1;
      end if;
    end if;

    v_results := v_results || jsonb_build_array(
      jsonb_build_object(
        'club_id', v_recipient.club_id,
        'user_id', v_recipient.user_id,
        'notification_id', v_notification_id,
        'existing_notification_id', v_existing_notification_id,
        'type_code', v_type_code,
        'event_key', v_event_key || ':club:' || v_recipient.club_id::text
      )
    );
  end loop;

  return jsonb_build_object(
    'status', 'weather_cancellation_notifications_processed',
    'stage_id', v_stage.stage_id,
    'race_id', v_stage.race_id,
    'race_name', v_stage.race_name,
    'stage_number', v_stage.stage_number,
    'reason', v_reason,
    'reason_label', v_reason_label,
    'race_fully_cancelled', v_is_race_fully_cancelled,
    'recipient_count', v_total_recipient_count,
    'stage_notification_count', v_stage_notification_count,
    'race_notification_count', v_race_notification_count,
    'results', v_results
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_weather_cancelled_stage_v2(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_stage record;

  v_apply_result jsonb;
  v_report_result jsonb;
  v_refund_result jsonb;
  v_finalize_result jsonb;
  v_notification_result jsonb;

  v_cancelled boolean := false;
begin
  select
    stage_row.id as stage_id,
    stage_row.race_id,
    stage_row.stage_number,
    stage_row.stage_date,
    stage_row.weather_cancelled,
    stage_row.weather_cancellation_reason,

    candidate.should_cancel_for_weather,
    candidate.cancellation_reason

  into v_stage

  from public.race_stages stage_row

  left join
    public.race_stage_weather_cancellation_candidates_v1
      candidate
    on candidate.stage_id =
       stage_row.id

  where stage_row.id =
          p_stage_id;

  if not found then
    return jsonb_build_object(
      'status',
        'stage_not_found',
      'stage_id',
        p_stage_id
    );
  end if;

  if coalesce(
       v_stage.should_cancel_for_weather,
       false
     ) = false
     and coalesce(
           v_stage.weather_cancelled,
           false
         ) = false then

    return jsonb_build_object(
      'status',
        'not_weather_cancelled',
      'stage_id',
        p_stage_id,
      'race_id',
        v_stage.race_id,
      'cancelled',
        false
    );
  end if;

  /*
   * Performs the final 24-hour recheck and applies only the
   * canonical race_stages cancellation fields.
   */
  v_apply_result :=
    public.apply_race_stage_weather_cancellation_v1(
      p_stage_id
    );

  v_cancelled :=
    coalesce(
      (
        v_apply_result
          ->> 'cancelled'
      )::boolean,
      false
    );

  /*
   * Forecast risk may clear during the final weather check.
   * In that case no report, refund, notification, or status
   * change is created.
   */
  if v_cancelled = false then
    return jsonb_build_object(
      'status',
        coalesce(
          v_apply_result ->> 'status',
          'weather_cleared'
        ),
      'stage_id',
        p_stage_id,
      'race_id',
        v_stage.race_id,
      'cancelled',
        false,
      'apply_result',
        v_apply_result
    );
  end if;

  select
    stage_row.race_id,
    stage_row.stage_number,
    stage_row.stage_date,
    stage_row.weather_cancelled,
    stage_row.weather_cancellation_reason

  into v_stage

  from public.race_stages stage_row

  where stage_row.id =
          p_stage_id;

  /*
   * No simulation run and no artifact cleanup are performed.
   */
  v_report_result :=
    public.write_weather_cancelled_stage_report_event_v2(
      p_stage_id
    );

  v_refund_result :=
    public.refund_one_day_weather_cancelled_race_v2(
      p_stage_id
    );

  v_finalize_result :=
    public.finalize_weather_cancelled_race_state_v2(
      v_stage.race_id
    );

  /*
   * Run notifications after race-state finalization so the
   * notification can distinguish stage cancellation from
   * full race cancellation.
   */
  v_notification_result :=
    public.create_weather_cancellation_notifications_v2(
      p_stage_id
    );

  return jsonb_build_object(
    'status',
      'weather_cancelled_stage_processed',

    'version',
      'weather_lifecycle_v2',

    'stage_id',
      p_stage_id,

    'race_id',
      v_stage.race_id,

    'stage_number',
      v_stage.stage_number,

    'stage_date',
      v_stage.stage_date,

    'weather_cancelled',
      v_stage.weather_cancelled,

    'weather_cancellation_reason',
      v_stage.weather_cancellation_reason,

    'simulation_run_created',
      false,

    'artifact_cleanup_called',
      false,

    'apply_result',
      v_apply_result,

    'report_result',
      v_report_result,

    'refund_result',
      v_refund_result,

    'finalize_result',
      v_finalize_result,

    'notification_result',
      v_notification_result
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_due_race_stage_weather_cancellations_v2(p_limit integer DEFAULT 50, p_dry_run boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_game_timestamp timestamptz;
  v_game_date date;
  v_limit integer :=
    greatest(
      coalesce(p_limit, 50),
      0
    );

  v_stage record;
  v_result jsonb;

  v_due_count integer := 0;
  v_processed_count integer := 0;
  v_failed_count integer := 0;

  v_results jsonb := '[]'::jsonb;
begin
  v_game_timestamp :=
    public.get_current_game_timestamp();

  v_game_date :=
    (
      v_game_timestamp
        at time zone 'UTC'
    )::date;

  select count(*)::integer
  into v_due_count
  from
    public.race_stage_weather_cancellation_candidates_v1
      candidate
  join public.race_stages stage_row
    on stage_row.id =
       candidate.stage_id
  where coalesce(
          candidate.should_cancel_for_weather,
          false
        ) = true
    and coalesce(
          stage_row.weather_cancelled,
          false
        ) = false
    and candidate.stage_date <=
        (
          v_game_date + 1
        );

  if coalesce(
       p_dry_run,
       false
     ) = true then

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'stage_id',
            due_stage.stage_id,

          'race_id',
            due_stage.race_id,

          'race_name',
            due_stage.race_name,

          'stage_number',
            due_stage.stage_number,

          'stage_date',
            due_stage.stage_date,

          'cancellation_reason',
            due_stage.cancellation_reason,

          'weather_condition_text',
            due_stage.weather_condition_text,

          'avg_temp_c',
            due_stage.avg_temp_c,

          'min_temp_c',
            due_stage.min_temp_c,

          'max_temp_c',
            due_stage.max_temp_c
        )
        order by
          due_stage.stage_date,
          due_stage.race_name,
          due_stage.stage_number
      ),
      '[]'::jsonb
    )
    into v_results

    from (
      select
        candidate.stage_id,
        candidate.race_id,
        race_row.name as race_name,
        candidate.stage_number,
        candidate.stage_date,
        candidate.cancellation_reason,
        candidate.weather_condition_text,
        candidate.avg_temp_c,
        candidate.min_temp_c,
        candidate.max_temp_c

      from
        public.race_stage_weather_cancellation_candidates_v1
          candidate

      join public.race_stages stage_row
        on stage_row.id =
           candidate.stage_id

      join public.races race_row
        on race_row.id =
           candidate.race_id

      where coalesce(
              candidate.should_cancel_for_weather,
              false
            ) = true

        and coalesce(
              stage_row.weather_cancelled,
              false
            ) = false

        and candidate.stage_date <=
            (
              v_game_date + 1
            )

      order by
        candidate.stage_date,
        race_row.name,
        candidate.stage_number

      limit v_limit
    ) due_stage;

    return jsonb_build_object(
      'status',
        'dry_run',

      'version',
        'weather_lifecycle_v2',

      'game_timestamp',
        v_game_timestamp,

      'game_date',
        v_game_date,

      'decision_due_until_stage_date',
        v_game_date + 1,

      'due_count_total',
        v_due_count,

      'limit',
        v_limit,

      'simulation_runs_created',
        0,

      'stages',
        v_results
    );
  end if;

  for v_stage in
    select
      candidate.stage_id,
      candidate.race_id,
      race_row.name as race_name,
      candidate.stage_number,
      candidate.stage_date,
      candidate.cancellation_reason

    from
      public.race_stage_weather_cancellation_candidates_v1
        candidate

    join public.race_stages stage_row
      on stage_row.id =
         candidate.stage_id

    join public.races race_row
      on race_row.id =
         candidate.race_id

    where coalesce(
            candidate.should_cancel_for_weather,
            false
          ) = true

      and coalesce(
            stage_row.weather_cancelled,
            false
          ) = false

      and candidate.stage_date <=
          (
            v_game_date + 1
          )

    order by
      candidate.stage_date,
      race_row.name,
      candidate.stage_number

    limit v_limit

  loop
    begin
      v_result :=
        public.process_weather_cancelled_stage_v2(
          v_stage.stage_id
        );

      v_processed_count :=
        v_processed_count + 1;

      v_results :=
        v_results
        || jsonb_build_array(
             jsonb_build_object(
               'stage_id',
                 v_stage.stage_id,

               'race_id',
                 v_stage.race_id,

               'race_name',
                 v_stage.race_name,

               'stage_number',
                 v_stage.stage_number,

               'stage_date',
                 v_stage.stage_date,

               'cancellation_reason',
                 v_stage.cancellation_reason,

               'status',
                 coalesce(
                   v_result ->> 'status',
                   'processed'
                 ),

               'result',
                 v_result
             )
           );

    exception
      when others then
        v_failed_count :=
          v_failed_count + 1;

        v_results :=
          v_results
          || jsonb_build_array(
               jsonb_build_object(
                 'stage_id',
                   v_stage.stage_id,

                 'race_id',
                   v_stage.race_id,

                 'race_name',
                   v_stage.race_name,

                 'stage_number',
                   v_stage.stage_number,

                 'stage_date',
                   v_stage.stage_date,

                 'cancellation_reason',
                   v_stage.cancellation_reason,

                 'status',
                   'failed',

                 'error',
                   sqlerrm
               )
             );
    end;
  end loop;

  return jsonb_build_object(
    'status',
      'processed',

    'version',
      'weather_lifecycle_v2',

    'game_timestamp',
      v_game_timestamp,

    'game_date',
      v_game_date,

    'decision_due_until_stage_date',
      v_game_date + 1,

    'due_count_total_before_run',
      v_due_count,

    'limit',
      v_limit,

    'processed_count',
      v_processed_count,

    'failed_count',
      v_failed_count,

    'simulation_runs_created',
      0,

    'artifact_cleanup_called',
      false,

    'results',
      v_results
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.complete_overdue_races_by_date_v2()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_current record;

  v_today_ordinal integer;
  v_current_game_date date;

  v_completed_count integer := 0;
  v_completed_rows jsonb := '[]'::jsonb;
begin
  select *
  into v_current
  from public.get_current_game_date_parts()
  limit 1;

  if not found then
    return jsonb_build_object(
      'success',
        false,
      'version',
        'canonical_race_completion_v2',
      'error',
        'current_game_date_not_found'
    );
  end if;

  v_today_ordinal :=
    public.game_date_ordinal_v1(
      v_current.season_number,
      v_current.month_number,
      v_current.day_number
    );

  v_current_game_date :=
    make_date(
      1999 + v_current.season_number,
      v_current.month_number,
      v_current.day_number
    );

  /*
   * A scheduled or active race becomes completed only when:
   *
   * 1. Its end date is before the current game date.
   * 2. It has canonical stages.
   * 3. At least one stage was not weather-cancelled.
   * 4. Every non-weather-cancelled stage has canonical
   *    race_stage_results with status = finished.
   *
   * Weather-cancelled stages count as terminal, but a race whose
   * every stage was weather-cancelled is left to the dedicated
   * weather lifecycle, which marks that race cancelled.
   */
  with eligible as (
    select
      race_row.id,
      race_row.name,
      race_row.status
        as status_before

    from public.races race_row

    where race_row.status in (
            'scheduled',
            'active'
          )

      and public.game_date_ordinal_v1(
            extract(
              year from coalesce(
                race_row.end_date,
                race_row.start_date
              )
            )::integer - 1999,

            extract(
              month from coalesce(
                race_row.end_date,
                race_row.start_date
              )
            )::integer,

            extract(
              day from coalesce(
                race_row.end_date,
                race_row.start_date
              )
            )::integer
          ) < v_today_ordinal

      and exists (
        select 1
        from public.race_stages stage_row
        where stage_row.race_id =
                race_row.id
      )

      /*
       * Prevent a fully weather-cancelled race from being marked
       * completed. The weather lifecycle owns that transition.
       */
      and exists (
        select 1
        from public.race_stages stage_row
        where stage_row.race_id =
                race_row.id
          and coalesce(
                stage_row.weather_cancelled,
                false
              ) = false
      )

      /*
       * There must be no remaining non-cancelled stage without
       * finished canonical results.
       */
      and not exists (
        select 1
        from public.race_stages stage_row
        where stage_row.race_id =
                race_row.id

          and coalesce(
                stage_row.weather_cancelled,
                false
              ) = false

          and not exists (
            select 1
            from public.race_stage_results
              result_row
            where result_row.stage_id =
                    stage_row.id
              and result_row.status =
                    'finished'
          )
      )
  ),

  changed as (
    update public.races race_row
    set
      status =
        'completed',

      updated_at =
        now()

    from eligible candidate

    where race_row.id =
            candidate.id

    returning
      race_row.id,
      candidate.name,
      candidate.status_before,
      race_row.status
        as status_after
  )

  select
    count(*)::integer,

    coalesce(
      jsonb_agg(
        to_jsonb(changed)
        order by changed.name
      ),
      '[]'::jsonb
    )

  into
    v_completed_count,
    v_completed_rows

  from changed;

  return jsonb_build_object(
    'success',
      true,

    'version',
      'canonical_race_completion_v2',

    'current_game_date',
      public.game_date_display_v1(
        v_current.season_number,
        v_current.month_number,
        v_current.day_number
      ),

    'current_game_date_iso',
      v_current_game_date,

    'completed_races',
      v_completed_count,

    'completed_results',
      v_completed_rows,

    /*
     * Compatibility fields retained for callers expecting the
     * old response structure. V2 never performs this cancellation.
     */
    'cancelled_stale_historical_races',
      0,

    'cancelled_stale_historical_results',
      '[]'::jsonb,

    'guards',
      jsonb_build_object(
        'normal_completion',
          'Every non-weather-cancelled stage must have finished canonical results.',

        'fully_weather_cancelled_races',
          'Owned by the neutral weather lifecycle and not completed here.',

        'historical_stale_closure',
          'Disabled. V2 never cancels races because simulation-run evidence is absent.',

        'simulation_run_required',
          false
      )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.seed_rio_universal_race_integration_test_state_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_race_id constant uuid :=
    '65739034-f9e5-4b5c-8f21-4ea27451e0d4';
  v_rows integer := 0;
begin
  if not public.is_universal_race_integration_test_admin_v1() then
    raise exception 'Universal race integration test admin access is required.';
  end if;

  insert into public.universal_race_integration_test_stage_state (
    stage_id,
    race_id,
    stage_number,
    unlocked,
    status,
    unlocked_at,
    details
  )
  select
    stage.id,
    stage.race_id,
    stage.stage_number,
    stage.stage_number = 1,
    case
      when stage.stage_number = 1 then 'unlocked'
      else 'locked'
    end,
    case
      when stage.stage_number = 1 then clock_timestamp()
      else null
    end,
    jsonb_build_object(
      'mode', 'universal_race_integration_test_v1',
      'manual_progression', true
    )
  from public.race_stages stage
  where stage.race_id = v_race_id
  on conflict (stage_id) do nothing;

  get diagnostics v_rows = row_count;

  return jsonb_build_object(
    'race_id', v_race_id,
    'inserted_stage_state_rows', v_rows
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_universal_race_integration_test_run_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_result jsonb;
begin
  if not public.is_universal_race_integration_test_admin_v1() then
    raise exception 'Universal race integration test admin access is required.';
  end if;

  select to_jsonb(run)
  into v_result
  from public.universal_race_integration_test_stage_state state
  join public.universal_race_integration_test_runs run
    on run.id = state.current_run_id
  where state.stage_id = p_stage_id;

  return coalesce(v_result, '{}'::jsonb);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.save_universal_race_integration_test_run_v1(p_stage_id uuid, p_input_payload jsonb, p_output_payload jsonb, p_stage_results_payload jsonb, p_point_results_payload jsonb, p_stage_classifications_payload jsonb, p_commentary_payload jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_state public.universal_race_integration_test_stage_state%rowtype;
  v_stage public.race_stages%rowtype;
  v_previous_state public.universal_race_integration_test_stage_state%rowtype;
  v_existing_run public.universal_race_integration_test_runs%rowtype;
  v_run public.universal_race_integration_test_runs%rowtype;
  v_input_hash text;
  v_output_hash text;
  v_engine_key text;
  v_engine_version integer;
  v_seed text;
  v_finish_count integer;
  v_stage_result_count integer;
begin
  if not public.is_universal_race_integration_test_admin_v1() then
    raise exception 'Universal race integration test admin access is required.';
  end if;

  if jsonb_typeof(p_input_payload) <> 'object'
     or jsonb_typeof(p_output_payload) <> 'object' then
    raise exception 'Input and output payloads must be JSON objects.';
  end if;

  if jsonb_typeof(p_stage_results_payload) <> 'array'
     or jsonb_typeof(p_point_results_payload) <> 'array'
     or jsonb_typeof(p_stage_classifications_payload) <> 'array'
     or jsonb_typeof(p_commentary_payload) <> 'array' then
    raise exception 'Result, point, classification, and commentary payloads must be JSON arrays.';
  end if;

  select *
  into v_stage
  from public.race_stages
  where id = p_stage_id;

  if not found then
    raise exception 'Race stage % was not found.', p_stage_id;
  end if;

  if v_stage.race_id <>
     '65739034-f9e5-4b5c-8f21-4ea27451e0d4'::uuid then
    raise exception 'Integration test mode is restricted to Rio Tour.';
  end if;

  select *
  into v_state
  from public.universal_race_integration_test_stage_state
  where stage_id = p_stage_id
  for update;

  if not found then
    raise exception
      'Integration test state is missing for stage %. Run the seed/reset SQL first.',
      p_stage_id;
  end if;

  if v_state.unlocked is not true then
    raise exception 'Stage % is still locked.', v_stage.stage_number;
  end if;

  if v_state.status = 'published' then
    raise exception
      'Stage % is already published and cannot be recalculated.',
      v_stage.stage_number;
  end if;

  if v_stage.stage_number > 1 then
    select *
    into v_previous_state
    from public.universal_race_integration_test_stage_state
    where race_id = v_stage.race_id
      and stage_number = v_stage.stage_number - 1;

    if not found or v_previous_state.status <> 'published' then
      raise exception
        'Stage % cannot be calculated before Stage % is published.',
        v_stage.stage_number,
        v_stage.stage_number - 1;
    end if;
  end if;

  v_engine_key := p_output_payload ->> 'engineKey';
  v_engine_version :=
    nullif(p_output_payload ->> 'engineVersion', '')::integer;
  v_seed := p_input_payload #>> '{engine,deterministicSeed}';

  if v_engine_key <> 'ppm_universal_race_v1'
     or v_engine_version <> 1 then
    raise exception
      'Unexpected universal engine identity: % / %.',
      v_engine_key,
      v_engine_version;
  end if;

  if p_output_payload ->> 'raceId' <> v_stage.race_id::text
     or p_output_payload ->> 'stageId' <> p_stage_id::text then
    raise exception 'The engine output does not belong to this race stage.';
  end if;

  if p_input_payload #>> '{race,raceId}' <> v_stage.race_id::text
     or p_input_payload #>> '{stage,stageId}' <> p_stage_id::text then
    raise exception 'The engine input does not belong to this race stage.';
  end if;

  v_finish_count := jsonb_array_length(
    coalesce(
      p_output_payload #> '{roadRaceResolution,phase4Finish,finish,rankings}',
      '[]'::jsonb
    )
  );
  v_stage_result_count := jsonb_array_length(p_stage_results_payload);

  if v_finish_count < 2 or v_stage_result_count <> v_finish_count then
    raise exception
      'Stage-result count % does not match finish-ranking count %.',
      v_stage_result_count,
      v_finish_count;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_stage_results_payload) row_json
    where coalesce(row_json ->> 'rider_id', '') = ''
       or coalesce(row_json ->> 'team_id', '') = ''
       or nullif(row_json ->> 'rank', '') is null
  ) then
    raise exception 'Every stored stage-result row needs rider, team, and rank.';
  end if;

  v_input_hash :=
    public.universal_race_integration_test_hash_v1(p_input_payload);
  v_output_hash :=
    public.universal_race_integration_test_hash_v1(p_output_payload);

  select run.*
  into v_existing_run
  from public.universal_race_integration_test_runs run
  where run.stage_id = p_stage_id
    and run.output_hash = v_output_hash
  order by run.calculated_at desc
  limit 1;

  if found then
    update public.universal_race_integration_test_stage_state
    set
      unlocked = true,
      status = case
        when v_existing_run.status = 'published' then 'published'
        else 'calculated'
      end,
      current_run_id = v_existing_run.id,
      calculated_at = v_existing_run.calculated_at,
      published_at = v_existing_run.published_at,
      updated_at = clock_timestamp()
    where stage_id = p_stage_id;

    return to_jsonb(v_existing_run);
  end if;

  update public.universal_race_integration_test_runs
  set
    status = 'superseded',
    updated_at = clock_timestamp()
  where stage_id = p_stage_id
    and status = 'calculated';

  insert into public.universal_race_integration_test_runs (
    race_id,
    stage_id,
    stage_number,
    engine_key,
    engine_version,
    deterministic_seed,
    input_hash,
    output_hash,
    input_payload,
    output_payload,
    stage_results_payload,
    point_results_payload,
    stage_classifications_payload,
    commentary_payload,
    status,
    calculated_by
  )
  values (
    v_stage.race_id,
    p_stage_id,
    v_stage.stage_number,
    v_engine_key,
    v_engine_version,
    v_seed,
    v_input_hash,
    v_output_hash,
    p_input_payload,
    p_output_payload,
    p_stage_results_payload,
    p_point_results_payload,
    p_stage_classifications_payload,
    p_commentary_payload,
    'calculated',
    auth.uid()
  )
  returning *
  into v_run;

  update public.universal_race_integration_test_stage_state
  set
    unlocked = true,
    status = 'calculated',
    current_run_id = v_run.id,
    calculated_at = v_run.calculated_at,
    published_at = null,
    details = coalesce(details, '{}'::jsonb) ||
      jsonb_build_object(
        'input_hash', v_input_hash,
        'output_hash', v_output_hash,
        'engine_key', v_engine_key,
        'engine_version', v_engine_version
      ),
    updated_at = clock_timestamp()
  where stage_id = p_stage_id;

  return to_jsonb(v_run);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rebuild_universal_race_integration_test_classifications_v1(p_race_id uuid, p_after_stage_number integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_published_stage_count integer;
  v_result jsonb;
begin
  select count(*)::integer
  into v_published_stage_count
  from public.universal_race_integration_test_runs run
  where run.race_id = p_race_id
    and run.status = 'published'
    and run.stage_number <= p_after_stage_number;

  if v_published_stage_count = 0 then
    return '[]'::jsonb;
  end if;

  with published_runs as (
    select run.*
    from public.universal_race_integration_test_runs run
    where run.race_id = p_race_id
      and run.status = 'published'
      and run.stage_number <= p_after_stage_number
  ),
  stage_rows as (
    select
      run.stage_number,
      (row_json ->> 'rider_id')::uuid as rider_id,
      (row_json ->> 'team_id')::uuid as team_id,
      nullif(row_json ->> 'rank', '')::integer as stage_rank,
      greatest(
        coalesce(nullif(row_json ->> 'elapsed_seconds', '')::integer, 0)
        - coalesce(nullif(row_json ->> 'bonus_seconds', '')::integer, 0)
        + coalesce(nullif(row_json ->> 'penalty_seconds', '')::integer, 0),
        0
      )::bigint as adjusted_time,
      coalesce(nullif(row_json ->> 'finish_points', '')::integer, 0)
        + coalesce(nullif(row_json ->> 'sprint_points', '')::integer, 0)
        as points_score,
      coalesce(nullif(row_json ->> 'mountain_points', '')::integer, 0)
        as mountain_score,
      coalesce(
        nullif(row_json ->> 'rider_name_snapshot', ''),
        row_json ->> 'full_name',
        row_json ->> 'rider_id'
      ) as rider_name,
      coalesce(
        nullif(row_json ->> 'team_name_snapshot', ''),
        row_json ->> 'team_id'
      ) as team_name
    from published_runs run
    cross join lateral jsonb_array_elements(
      run.stage_results_payload
    ) row_json
    where lower(coalesce(row_json ->> 'status', 'finished')) = 'finished'
  ),
  young_riders as (
    select distinct
      (classification_json ->> 'rider_id')::uuid as rider_id
    from published_runs run
    cross join lateral jsonb_array_elements(
      run.stage_classifications_payload
    ) classification_json
    where classification_json ->> 'classification_type' = 'young'
      and classification_json ->> 'entity_type' = 'rider'
      and nullif(classification_json ->> 'rider_id', '') is not null
  ),
  rider_totals as (
    select
      row.rider_id,
      (array_agg(row.team_id order by row.stage_number desc))[1] as team_id,
      (array_agg(row.rider_name order by row.stage_number desc))[1]
        as rider_name,
      (array_agg(row.team_name order by row.stage_number desc))[1]
        as team_name,
      sum(row.adjusted_time)::bigint as total_time,
      sum(coalesce(row.stage_rank, 9999))::bigint as rank_tiebreak,
      sum(row.points_score)::integer as points_score,
      sum(row.mountain_score)::integer as mountain_score,
      count(distinct row.stage_number)::integer as stage_count
    from stage_rows row
    group by row.rider_id
    having count(distinct row.stage_number) = v_published_stage_count
  ),
  general_ranked as (
    select
      total.*,
      row_number() over (
        order by
          total.total_time,
          total.rank_tiebreak,
          total.rider_id
      )::integer as classification_rank,
      min(total.total_time) over () as leader_time
    from rider_totals total
  ),
  points_ranked as (
    select
      total.*,
      row_number() over (
        order by
          total.points_score desc,
          total.total_time,
          total.rider_id
      )::integer as classification_rank
    from rider_totals total
    where total.points_score > 0
  ),
  mountain_ranked as (
    select
      total.*,
      row_number() over (
        order by
          total.mountain_score desc,
          total.total_time,
          total.rider_id
      )::integer as classification_rank
    from rider_totals total
    where total.mountain_score > 0
  ),
  young_ranked as (
    select
      total.*,
      row_number() over (
        order by
          total.total_time,
          total.rank_tiebreak,
          total.rider_id
      )::integer as classification_rank,
      min(total.total_time) over () as leader_time
    from rider_totals total
    join young_riders young
      on young.rider_id = total.rider_id
  ),
  team_stage_times as (
    select
      stage_number,
      team_id,
      max(team_name) as team_name,
      sum(adjusted_time)::bigint as team_stage_time
    from (
      select
        row.*,
        row_number() over (
          partition by row.stage_number, row.team_id
          order by row.adjusted_time, row.rider_id
        ) as team_rider_order
      from stage_rows row
    ) ranked_team_rider
    where team_rider_order <= 3
    group by stage_number, team_id
  ),
  team_totals as (
    select
      team_id,
      (array_agg(team_name order by stage_number desc))[1] as team_name,
      sum(team_stage_time)::bigint as total_time,
      count(distinct stage_number)::integer as stage_count
    from team_stage_times
    group by team_id
    having count(distinct stage_number) = v_published_stage_count
  ),
  team_ranked as (
    select
      total.*,
      row_number() over (
        order by total.total_time, total.team_id
      )::integer as classification_rank,
      min(total.total_time) over () as leader_time
    from team_totals total
  ),
  classification_objects as (
    select
      1 as type_order,
      general.classification_rank as row_rank,
      jsonb_build_object(
        'classification_type', 'general',
        'entity_type', 'rider',
        'rank', general.classification_rank,
        'previous_rank', null,
        'rider_id', general.rider_id,
        'team_id', general.team_id,
        'display_name_snapshot', general.rider_name,
        'team_name_snapshot', general.team_name,
        'total_time_seconds', general.total_time,
        'gap_seconds', general.total_time - general.leader_time,
        'points', null
      ) as classification
    from general_ranked general

    union all

    select
      2,
      points.classification_rank,
      jsonb_build_object(
        'classification_type', 'points',
        'entity_type', 'rider',
        'rank', points.classification_rank,
        'previous_rank', null,
        'rider_id', points.rider_id,
        'team_id', points.team_id,
        'display_name_snapshot', points.rider_name,
        'team_name_snapshot', points.team_name,
        'total_time_seconds', null,
        'gap_seconds', null,
        'points', points.points_score
      )
    from points_ranked points

    union all

    select
      3,
      mountain.classification_rank,
      jsonb_build_object(
        'classification_type', 'mountain',
        'entity_type', 'rider',
        'rank', mountain.classification_rank,
        'previous_rank', null,
        'rider_id', mountain.rider_id,
        'team_id', mountain.team_id,
        'display_name_snapshot', mountain.rider_name,
        'team_name_snapshot', mountain.team_name,
        'total_time_seconds', null,
        'gap_seconds', null,
        'points', mountain.mountain_score
      )
    from mountain_ranked mountain

    union all

    select
      4,
      young.classification_rank,
      jsonb_build_object(
        'classification_type', 'young',
        'entity_type', 'rider',
        'rank', young.classification_rank,
        'previous_rank', null,
        'rider_id', young.rider_id,
        'team_id', young.team_id,
        'display_name_snapshot', young.rider_name,
        'team_name_snapshot', young.team_name,
        'total_time_seconds', young.total_time,
        'gap_seconds', young.total_time - young.leader_time,
        'points', null
      )
    from young_ranked young

    union all

    select
      5,
      team.classification_rank,
      jsonb_build_object(
        'classification_type', 'team',
        'entity_type', 'team',
        'rank', team.classification_rank,
        'previous_rank', null,
        'rider_id', null,
        'team_id', team.team_id,
        'display_name_snapshot', team.team_name,
        'team_name_snapshot', team.team_name,
        'total_time_seconds', team.total_time,
        'gap_seconds', team.total_time - team.leader_time,
        'points', null
      )
    from team_ranked team
  )
  select coalesce(
    jsonb_agg(
      classification
      order by type_order, row_rank
    ),
    '[]'::jsonb
  )
  into v_result
  from classification_objects;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.publish_universal_race_integration_test_run_v1(p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_run public.universal_race_integration_test_runs%rowtype;
  v_state public.universal_race_integration_test_stage_state%rowtype;
  v_previous_state public.universal_race_integration_test_stage_state%rowtype;
  v_classifications jsonb;
begin
  if not public.is_universal_race_integration_test_admin_v1() then
    raise exception 'Universal race integration test admin access is required.';
  end if;

  select *
  into v_run
  from public.universal_race_integration_test_runs
  where id = p_run_id
  for update;

  if not found then
    raise exception 'Integration-test run % was not found.', p_run_id;
  end if;

  select *
  into v_state
  from public.universal_race_integration_test_stage_state
  where stage_id = v_run.stage_id
  for update;

  if not found or v_state.current_run_id is distinct from v_run.id then
    raise exception 'Run % is not the current calculation for its stage.', p_run_id;
  end if;

  if v_run.status = 'published' then
    return public.get_universal_race_integration_test_run_v1(v_run.stage_id);
  end if;

  if v_run.status <> 'calculated' then
    raise exception 'Only a calculated run can be published.';
  end if;

  if public.universal_race_integration_test_hash_v1(v_run.input_payload)
       <> v_run.input_hash
     or public.universal_race_integration_test_hash_v1(v_run.output_payload)
       <> v_run.output_hash then
    raise exception 'Stored integration-test payload hash validation failed.';
  end if;

  if v_run.stage_number > 1 then
    select *
    into v_previous_state
    from public.universal_race_integration_test_stage_state
    where race_id = v_run.race_id
      and stage_number = v_run.stage_number - 1;

    if not found or v_previous_state.status <> 'published' then
      raise exception
        'Stage % cannot be published before Stage %.',
        v_run.stage_number,
        v_run.stage_number - 1;
    end if;
  end if;

  update public.universal_race_integration_test_runs
  set
    status = 'published',
    published_at = coalesce(published_at, clock_timestamp()),
    updated_at = clock_timestamp()
  where id = v_run.id;

  v_classifications :=
    public.rebuild_universal_race_integration_test_classifications_v1(
      v_run.race_id,
      v_run.stage_number
    );

  update public.universal_race_integration_test_runs
  set
    cumulative_classifications_payload = v_classifications,
    updated_at = clock_timestamp()
  where id = v_run.id;

  update public.universal_race_integration_test_stage_state
  set
    unlocked = true,
    status = 'published',
    published_at = coalesce(published_at, clock_timestamp()),
    updated_at = clock_timestamp()
  where stage_id = v_run.stage_id;

  return public.get_universal_race_integration_test_run_v1(v_run.stage_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.unlock_next_universal_race_integration_test_stage_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_current public.universal_race_integration_test_stage_state%rowtype;
  v_next public.universal_race_integration_test_stage_state%rowtype;
begin
  if not public.is_universal_race_integration_test_admin_v1() then
    raise exception 'Universal race integration test admin access is required.';
  end if;

  select *
  into v_current
  from public.universal_race_integration_test_stage_state
  where stage_id = p_stage_id
  for update;

  if not found then
    raise exception 'Integration-test state for stage % was not found.', p_stage_id;
  end if;

  if v_current.status <> 'published' then
    raise exception
      'Publish Stage % before unlocking the following stage.',
      v_current.stage_number;
  end if;

  select *
  into v_next
  from public.universal_race_integration_test_stage_state
  where race_id = v_current.race_id
    and stage_number = v_current.stage_number + 1
  for update;

  if not found then
    return jsonb_build_object(
      'race_id', v_current.race_id,
      'stage_id', v_current.stage_id,
      'next_stage_id', null,
      'next_stage_number', null,
      'message', 'No later stage exists.'
    );
  end if;

  update public.universal_race_integration_test_stage_state
  set
    unlocked = true,
    status = case
      when status = 'locked' then 'unlocked'
      else status
    end,
    unlocked_at = coalesce(unlocked_at, clock_timestamp()),
    updated_at = clock_timestamp()
  where stage_id = v_next.stage_id
  returning *
  into v_next;

  return jsonb_build_object(
    'race_id', v_current.race_id,
    'stage_id', v_current.stage_id,
    'next_stage_id', v_next.stage_id,
    'next_stage_number', v_next.stage_number,
    'next_stage_unlocked', v_next.unlocked,
    'next_stage_status', v_next.status
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_get_calculation_payload_full_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_race_id uuid;
  v_stage_number integer;
  v_race jsonb;
  v_stage jsonb;
  v_profile jsonb;
  v_rider_inputs jsonb;
  v_phase_commands jsonb;
  v_phase9_inputs jsonb;
  v_pre_stage_leaders jsonb;
  v_stage_points jsonb;
  v_participant_teams jsonb;
  v_participant_riders jsonb;
  v_stage_plans jsonb;
  v_stage_plan_riders jsonb;
  v_stage_start_game_at timestamp without time zone;
  v_lock_game_at timestamp without time zone;
  v_jersey_eligibility jsonb;
  v_disqualified jsonb;
begin
  if p_stage_id is null then
    raise exception using errcode='22023', message='stage_id is required';
  end if;

  select
    s.race_id,
    s.stage_number,
    to_jsonb(s),
    s.stage_date::timestamp
      + make_interval(
          hours=>coalesce(s.planned_start_hour_number,12),
          mins=>coalesce(s.planned_start_minute,0)
        )
  into
    v_race_id,
    v_stage_number,
    v_stage,
    v_stage_start_game_at
  from public.race_stages s
  where s.id=p_stage_id;

  if v_race_id is null then
    raise exception using
      errcode='P0002',
      message=format('Stage %s was not found.',p_stage_id);
  end if;

  v_lock_game_at:=v_stage_start_game_at-interval '3 hours';

  -- Hard sporting decision before immutable engine input is assembled.
  v_jersey_eligibility:=
    public.universal_race_stage_enforce_mandatory_jerseys_v1(p_stage_id);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'team_id',d.team_id,
        'from_stage_id',d.from_stage_id,
        'from_stage_number',d.from_stage_number,
        'reason_code',d.reason_code,
        'required_jersey_units',d.required_jersey_units,
        'available_jersey_units',d.available_jersey_units,
        'missing_jersey_units',d.missing_jersey_units
      )
      order by d.team_id
    ),
    '[]'::jsonb
  )
  into v_disqualified
  from public.race_team_stage_disqualifications d
  where d.race_id=v_race_id
    and d.from_stage_number<=v_stage_number
    and d.reason_code <> 'mandatory_race_jersey_shortage';

  select to_jsonb(r)
  into v_race
  from public.races r
  where r.id=v_race_id;

  v_profile:=coalesce(
    public.get_race_stage_profile_detail_v1(p_stage_id),
    '{}'::jsonb
  );

  select coalesce(
    jsonb_agg(to_jsonb(x) order by x.team_id,x.rider_id),
    '[]'::jsonb
  )
  into v_rider_inputs
  from public.race_engine_get_stage_rider_inputs_v1(p_stage_id) x
  where not public.universal_race_team_disqualified_for_stage_v1(
    v_race_id,x.team_id,v_stage_number
  );

  select coalesce(
    jsonb_agg(to_jsonb(x) order by x.team_id,x.rider_id),
    '[]'::jsonb
  )
  into v_phase_commands
  from public.race_engine_get_stage_phase_commands_v1(p_stage_id) x
  where not public.universal_race_team_disqualified_for_stage_v1(
    v_race_id,x.team_id,v_stage_number
  );

  v_phase9_inputs:=coalesce(
    public.race_engine_get_stage_phase9_inputs_v1(p_stage_id),
    '{}'::jsonb
  );

  v_phase9_inputs:=
    public.universal_race_stage_filter_phase9_eligible_v1(
      p_stage_id,
      v_phase9_inputs
    );

  -- Phase 11D.1: one exact durable jersey/use for every remaining rider.
  v_phase9_inputs:=
    public.universal_race_stage_force_mandatory_jersey_phase9_v1(
      p_stage_id,
      v_phase9_inputs
    );

  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)
  into v_pre_stage_leaders
  from public.get_race_stage_pre_stage_leaders_v1(p_stage_id) x
  where nullif(to_jsonb(x)->>'team_id','') is null
     or (
       (to_jsonb(x)->>'team_id')
         ~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and not public.universal_race_team_disqualified_for_stage_v1(
         v_race_id,
         (to_jsonb(x)->>'team_id')::uuid,
         v_stage_number
       )
     );

  perform public.sync_race_stage_points_from_stage_json_v1(p_stage_id,false);

  select coalesce(
    jsonb_agg(to_jsonb(p) order by p.sort_order,p.km_from_start,p.id),
    '[]'::jsonb
  )
  into v_stage_points
  from public.race_stage_points p
  where p.stage_id=p_stage_id;

  select coalesce(
    jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),
    '[]'::jsonb
  )
  into v_participant_teams
  from public.race_participant_teams_v1 t
  where t.race_id=v_race_id
    and lower(coalesce(t.status,'accepted'))='accepted'
    and not public.universal_race_team_disqualified_for_stage_v1(
      v_race_id,t.club_id,v_stage_number
    );

  select coalesce(
    jsonb_agg(to_jsonb(r) order by r.start_number nulls last,r.rider_id),
    '[]'::jsonb
  )
  into v_participant_riders
  from public.race_participant_riders_v1 r
  where r.race_id=v_race_id
    and not public.universal_race_team_disqualified_for_stage_v1(
      v_race_id,r.team_id,v_stage_number
    );

  select coalesce(
    jsonb_agg(
      to_jsonb(p)||jsonb_build_object(
        'team_id',coalesce(rp.participating_club_id,rp.club_id),
        'club_id',rp.club_id,
        'participating_club_id',rp.participating_club_id,
        'race_preparation_status',rp.status
      )
      order by coalesce(rp.participating_club_id,rp.club_id),p.id
    ),
    '[]'::jsonb
  )
  into v_stage_plans
  from public.race_stage_plans p
  join public.race_preparations rp
    on rp.id=p.race_preparation_id
  where p.stage_id=p_stage_id
    and not public.universal_race_team_disqualified_for_stage_v1(
      v_race_id,
      coalesce(rp.participating_club_id,rp.club_id),
      v_stage_number
    );

  select coalesce(
    jsonb_agg(
      to_jsonb(pr)||jsonb_build_object(
        'team_id',coalesce(rp.participating_club_id,rp.club_id),
        'race_stage_plan_id',p.id
      )
      order by coalesce(rp.participating_club_id,rp.club_id),pr.rider_id
    ),
    '[]'::jsonb
  )
  into v_stage_plan_riders
  from public.race_stage_plan_riders pr
  join public.race_stage_plans p
    on p.id=pr.race_stage_plan_id
  join public.race_preparations rp
    on rp.id=p.race_preparation_id
  where p.stage_id=p_stage_id
    and not public.universal_race_team_disqualified_for_stage_v1(
      v_race_id,
      coalesce(rp.participating_club_id,rp.club_id),
      v_stage_number
    );

  return jsonb_build_object(
    'contract','universal_race_calculation_payload_v3_phase11b',
    'race',coalesce(v_race,'{}'::jsonb),
    'stage',coalesce(v_stage,'{}'::jsonb),
    'profile',coalesce(v_profile,'{}'::jsonb),
    'participant_teams',v_participant_teams,
    'participant_riders',v_participant_riders,
    'rider_inputs',v_rider_inputs,
    'phase_commands',v_phase_commands,
    'phase9_inputs',v_phase9_inputs,
    'pre_stage_leaders',v_pre_stage_leaders,
    'stage_points',v_stage_points,
    'locked_plans',v_stage_plans,
    'stage_plan_riders',v_stage_plan_riders,
    'mandatory_jersey_eligibility',v_jersey_eligibility,
    'disqualified_teams',v_disqualified,
    'lifecycle',jsonb_build_object(
      'lock_game_at',v_lock_game_at,
      'stage_start_game_at',v_stage_start_game_at,
      'replay_duration_real_seconds',900,
      'official_outputs_persisted',false,
      'phase11_persistence_applied',false,
      'verification_only',false
    )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_claim_calculation_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_stage record;
  v_previous_stage_id uuid;
  v_control public.race_engine_runtime_control_v1%rowtype;
  v_existing_run public.race_stage_simulation_runs%rowtype;
  v_current_game_at timestamp without time zone;
  v_stage_start_game_at timestamp without time zone;
  v_calculation_due_game_at timestamp without time zone;
  v_run_id uuid;
  v_payload jsonb;
  v_startlist_readiness jsonb;
  v_startlist_reconciliation jsonb;
  v_sporting_readiness jsonb;
  v_sporting_reconciliation jsonb;
begin
  if p_stage_id is null then return jsonb_build_object('status','blocked','reason','stage_id_required'); end if;
  perform pg_advisory_xact_lock(hashtextextended('phase11b_claim:'||p_stage_id::text,0));

  select * into v_control from public.race_engine_runtime_control_v1 where singleton_id=true;
  if not found or v_control.active_engine<>'typescript_v1' or not v_control.typescript_execution_enabled or v_control.legacy_execution_enabled
     or not coalesce(v_control.typescript_lifecycle_enabled,false) then
    return jsonb_build_object('status','disabled','reason','phase11b_lifecycle_not_enabled');
  end if;
  if v_control.typescript_activation_game_at is null then return jsonb_build_object('status','disabled','reason','production_activation_game_boundary_missing'); end if;

  select stage.id,stage.race_id,stage.stage_number,stage.stage_date,stage.planned_start_hour_number,stage.planned_start_minute,
    lower(coalesce(stage.stage_format,'road_race')) as stage_format,coalesce(stage.weather_cancelled,false) as weather_cancelled
  into v_stage from public.race_stages stage where stage.id=p_stage_id;
  if not found then return jsonb_build_object('status','blocked','reason','stage_not_found','stage_id',p_stage_id); end if;
  if v_stage.weather_cancelled then return jsonb_build_object('status','skipped','reason','weather_cancelled','stage_id',p_stage_id); end if;

  v_stage_start_game_at := v_stage.stage_date::timestamp + make_interval(hours=>coalesce(v_stage.planned_start_hour_number,12),mins=>coalesce(v_stage.planned_start_minute,0));
  v_calculation_due_game_at := v_stage_start_game_at - make_interval(hours=>coalesce(v_control.typescript_calculation_lead_hours,3));
  select public.get_current_game_timestamp()::timestamp without time zone into v_current_game_at;
  if v_stage_start_game_at<v_control.typescript_activation_game_at then
    return jsonb_build_object('status','blocked','reason','before_phase11b_activation_boundary','stage_id',p_stage_id,'stage_start_game_at',v_stage_start_game_at,'activation_game_at',v_control.typescript_activation_game_at);
  end if;
  if v_current_game_at<v_calculation_due_game_at then
    return jsonb_build_object('status','not_due','stage_id',p_stage_id,'current_game_at',v_current_game_at,'calculation_due_game_at',v_calculation_due_game_at,'stage_start_game_at',v_stage_start_game_at);
  end if;

  v_sporting_readiness := public.race_stage_sporting_point_profile_readiness_v1(p_stage_id);
  if not coalesce((v_sporting_readiness->>'ready')::boolean,false) then
    v_sporting_reconciliation := public.reconcile_unprocessed_stage_sporting_points_v1(p_stage_id);
    v_sporting_readiness := public.race_stage_sporting_point_profile_readiness_v1(p_stage_id);
    if not coalesce((v_sporting_readiness->>'ready')::boolean,false) then
      return jsonb_build_object('status','blocked','reason','stage_sporting_points_not_engine_ready','stage_id',p_stage_id,'race_id',v_stage.race_id,
        'sporting_point_readiness',v_sporting_readiness,'sporting_point_reconciliation',v_sporting_reconciliation);
    end if;
  else
    v_sporting_reconciliation := jsonb_build_object('status','not_needed','stage_id',p_stage_id);
  end if;

  v_startlist_readiness := public.race_startlist_engine_readiness_v1(v_stage.race_id);
  if not coalesce((v_startlist_readiness->>'ready')::boolean,false) then
    return jsonb_build_object('status','blocked','reason','race_startlist_not_engine_ready','stage_id',p_stage_id,'race_id',v_stage.race_id,'startlist_readiness',v_startlist_readiness);
  end if;
  v_startlist_reconciliation := public.reconcile_race_startlist_engine_readiness_v1(v_stage.race_id);

  select previous.id into v_previous_stage_id from public.race_stages previous
  where previous.race_id=v_stage.race_id and previous.stage_number<v_stage.stage_number and not coalesce(previous.weather_cancelled,false)
  order by previous.stage_number desc limit 1;
  if v_previous_stage_id is not null and not exists(
    select 1 from public.race_stage_authoritative_runs authority
    join public.race_stage_simulation_runs previous_run on previous_run.id=authority.simulation_run_id
    where authority.stage_id=v_previous_stage_id and authority.engine_version='race_engine_ts_v1'
      and authority.simulation_mode='deterministic_road_race_v1' and previous_run.status='completed'
  ) then
    return jsonb_build_object('status','blocked','reason','previous_stage_not_published','stage_id',p_stage_id,'previous_stage_id',v_previous_stage_id);
  end if;

  select run.* into v_existing_run from public.race_stage_simulation_runs run
  where run.stage_id=p_stage_id and run.engine_version='race_engine_ts_v1' and run.simulation_mode='deterministic_road_race_v1'
    and run.status in ('running','completed') and coalesce(run.result_summary_json->>'calculation_contract','') in ('phase11b_claim_pending_v1','universal_phase11b_calculated_hidden_v1')
  order by run.updated_at desc,run.created_at desc,run.id desc limit 1;
  if found then
    return jsonb_build_object('status',case when coalesce(v_existing_run.result_summary_json->>'calculation_contract','')='universal_phase11b_calculated_hidden_v1' then 'already_calculated' else 'already_claimed' end,
      'stage_id',p_stage_id,'simulation_run_id',v_existing_run.id,'run_status',v_existing_run.status);
  end if;

  perform set_config('app.race_engine_writer_family','typescript',true);
  insert into public.race_stage_simulation_runs(race_id,stage_id,status,engine_version,simulation_mode,started_at,input_snapshot_json,result_summary_json)
  values(v_stage.race_id,p_stage_id,'running','race_engine_ts_v1','deterministic_road_race_v1',clock_timestamp(),'{}'::jsonb,
    jsonb_build_object('calculation_contract','phase11b_claim_pending_v1','calculation_status','claimed','claimed_at_real',clock_timestamp(),
      'calculation_due_game_at',v_calculation_due_game_at,'stage_start_game_at',v_stage_start_game_at,'official_outputs_persisted',false,
      'phase11_persistence_applied',false,'results_published',false,'verification_only',false,'startlist_readiness',v_startlist_readiness,
      'startlist_reconciliation',v_startlist_reconciliation,'sporting_point_readiness',v_sporting_readiness,'sporting_point_reconciliation',v_sporting_reconciliation))
  returning id into v_run_id;

  insert into public.race_stage_automation_state(stage_id,race_id,scheduled_game_at,last_status,simulation_run_id,attempt_count,last_checked_at,last_started_at,last_error,details,updated_at)
  values(p_stage_id,v_stage.race_id,v_stage_start_game_at,'calculating',v_run_id,1,clock_timestamp(),clock_timestamp(),null,
    jsonb_build_object('contract','phase11b_universal_production_lifecycle_v1','calculation_due_game_at',v_calculation_due_game_at,'stage_start_game_at',v_stage_start_game_at,
      'replay_duration_real_seconds',coalesce(v_control.typescript_replay_duration_real_seconds,900),'worker_version','netlify_phase11b_v1','verification_only',false,
      'startlist_readiness_model','snapshot_invariants_v1','sporting_point_readiness_model','profile_catalogue_counts_v1'),clock_timestamp())
  on conflict(stage_id) do update set race_id=excluded.race_id,scheduled_game_at=excluded.scheduled_game_at,last_status=excluded.last_status,
    simulation_run_id=excluded.simulation_run_id,attempt_count=public.race_stage_automation_state.attempt_count+1,last_checked_at=excluded.last_checked_at,
    last_started_at=excluded.last_started_at,last_error=null,details=coalesce(public.race_stage_automation_state.details,'{}'::jsonb)||excluded.details,updated_at=excluded.updated_at;

  v_payload := public.universal_race_stage_get_calculation_payload_v1(p_stage_id);
  return jsonb_build_object('status','claimed','contract','universal_race_stage_calculation_claim_v2_phase11b','stage_id',p_stage_id,'race_id',v_stage.race_id,
    'simulation_run_id',v_run_id,'current_game_at',v_current_game_at,'calculation_due_game_at',v_calculation_due_game_at,'stage_start_game_at',v_stage_start_game_at,
    'stage_format',v_stage.stage_format,'startlist_readiness',v_startlist_readiness,'sporting_point_readiness',v_sporting_readiness,
    'sporting_point_reconciliation',v_sporting_reconciliation,'payload',v_payload);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_submit_calculation_v1(p_stage_id uuid, p_simulation_run_id uuid, p_input_snapshot jsonb, p_universal_result jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '110s'
 SET lock_timeout TO '5s'
AS $function$
declare
  v_run public.race_stage_simulation_runs%rowtype;
  v_manifest jsonb;
  v_input_hash text;
  v_output_hash text;
  v_stage_start_game_at timestamp without time zone;
begin
  if p_stage_id is null or p_simulation_run_id is null or p_input_snapshot is null or p_universal_result is null then
    raise exception using errcode = '22023', message = 'stage_id, simulation_run_id, input_snapshot and universal output are required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('phase11b_submit:' || p_stage_id::text, 0));
  perform set_config('app.race_engine_writer_family', 'typescript', true);

  select * into v_run
  from public.race_stage_simulation_runs run
  where run.id = p_simulation_run_id
    and run.stage_id = p_stage_id
    and run.engine_version = 'race_engine_ts_v1'
    and run.simulation_mode = 'deterministic_road_race_v1'
  for update;

  if not found then raise exception 'Claimed Phase 11B run was not found.'; end if;

  -- Idempotent duplicate submission guard. The first identical hidden result wins.
  if coalesce(v_run.result_summary_json ->> 'calculation_contract', '') =
       'universal_phase11b_calculated_hidden_v1'
  then
    v_input_hash := md5(p_input_snapshot::text);
    v_output_hash := md5(p_universal_result::text);

    if coalesce(v_run.result_summary_json ->> 'input_hash_md5','') <> v_input_hash
       or coalesce(v_run.result_summary_json ->> 'output_hash_md5','') <> v_output_hash
    then
      raise exception 'Run % already has a different calculated hidden output.', p_simulation_run_id;
    end if;

    update public.race_stage_simulation_runs
       set status='running', failed_at=null, error_message=null,
           result_summary_json =
             (coalesce(result_summary_json,'{}'::jsonb)-'failed_at_real'-'error_details')
             || jsonb_build_object(
                  'calculation_status','calculated_hidden',
                  'duplicate_submit_reconciled_at_real',clock_timestamp()
                ),
           updated_at=clock_timestamp()
     where id=p_simulation_run_id;

    update public.race_stage_automation_state
       set last_status='calculated_hidden', last_error=null,
           last_checked_at=clock_timestamp(),
           details=coalesce(details,'{}'::jsonb)
             || jsonb_build_object(
                  'duplicate_submit_reconciled_at_real',clock_timestamp(),
                  'manifest_ready',true
                ),
           updated_at=clock_timestamp()
     where stage_id=p_stage_id and simulation_run_id=p_simulation_run_id;

    return jsonb_build_object(
      'status','calculated_hidden',
      'contract','universal_phase11b_calculated_hidden_v1',
      'stage_id',p_stage_id,
      'race_id',v_run.race_id,
      'simulation_run_id',p_simulation_run_id,
      'input_hash_md5',v_input_hash,
      'output_hash_md5',v_output_hash,
      'phase11_manifest_ready',true,
      'idempotent_duplicate_submit',true
    );
  end if;

  if v_run.status <> 'running' then
    if v_run.status='failed'
       and exists (
         select 1
         from public.race_stage_safe_calculation_v1 sf
         where sf.stage_id=p_stage_id
           and sf.simulation_run_id=p_simulation_run_id
           and sf.status='running'
           and sf.step>=9
           and sf.lease_token is not null
           and sf.lease_expires_at>clock_timestamp()
       )
    then
      update public.race_stage_simulation_runs
      set status='running',
          failed_at=null,
          error_message=null,
          result_summary_json=
            (coalesce(result_summary_json,'{}'::jsonb)-'failed_at_real'-'error_details')
            || jsonb_build_object(
                 'safe_mode_recovery_revived_at_real',clock_timestamp(),
                 'safe_mode_recovery_revived_from_status','failed'
               ),
          updated_at=clock_timestamp()
      where id=p_simulation_run_id;

      select * into v_run
      from public.race_stage_simulation_runs run
      where run.id=p_simulation_run_id
      for update;
    else
      raise exception 'Run % is not running.', p_simulation_run_id;
    end if;
  end if;

  if coalesce(v_run.result_summary_json ->> 'calculation_contract', '') <> 'phase11b_claim_pending_v1' then
    raise exception 'Run % is not a Phase 11B pending claim.', p_simulation_run_id;
  end if;

  if coalesce(p_input_snapshot #>> '{engine,engineKey}', '') <> 'ppm_universal_race_v1'
     or coalesce(p_input_snapshot #>> '{engine,engineVersion}', '') <> '1'
     or coalesce(p_input_snapshot #>> '{stage,stageId}', '') <> p_stage_id::text
     or coalesce(p_input_snapshot #>> '{race,raceId}', '') <> v_run.race_id::text
  then
    raise exception 'Universal input identity does not match the claimed run.';
  end if;

  if coalesce(p_universal_result ->> 'contractVersion', '') <> 'universal_race_stage_output_v1'
     or coalesce(p_universal_result ->> 'engineKey', '') <> 'ppm_universal_race_v1'
     or coalesce(p_universal_result ->> 'engineVersion', '') <> '1'
     or coalesce(p_universal_result ->> 'stageId', '') <> p_stage_id::text
     or coalesce(p_universal_result ->> 'raceId', '') <> v_run.race_id::text
     or coalesce(p_universal_result #>> '{universalResult,validationPassed}', '') <> 'true'
  then
    raise exception 'Universal output identity/contract is invalid.';
  end if;

  v_manifest := coalesce(p_universal_result -> 'applicationManifest', '{}'::jsonb);
  if coalesce(v_manifest ->> 'contractVersion', '') <> 'universal_phase11_application_manifest_v1'
     or not coalesce((v_manifest ->> 'readyForApplication')::boolean, false)
     or coalesce((v_manifest ->> 'persistenceApplied')::boolean, true)
  then
    raise exception 'Phase 11 application manifest is missing, invalid, or already applied.';
  end if;

  if jsonb_array_length(coalesce(v_manifest -> 'riderStateRows', '[]'::jsonb)) = 0 then
    raise exception 'Phase 11 application manifest contains no rider-state rows.';
  end if;

  select stage.stage_date::timestamp
      + make_interval(hours => coalesce(stage.planned_start_hour_number, 12), mins => coalesce(stage.planned_start_minute, 0))
  into v_stage_start_game_at
  from public.race_stages stage
  where stage.id = p_stage_id;

  v_input_hash := md5(p_input_snapshot::text);
  v_output_hash := md5(p_universal_result::text);

  update public.race_stage_simulation_runs
  set input_snapshot_json = p_input_snapshot,
      result_summary_json = jsonb_build_object(
        'calculation_contract', 'universal_phase11b_calculated_hidden_v1',
        'contractVersion', p_universal_result ->> 'contractVersion',
        'engineKey', p_universal_result ->> 'engineKey',
        'engineVersion', p_universal_result ->> 'engineVersion',
        'raceId', p_universal_result ->> 'raceId',
        'stageId', p_universal_result ->> 'stageId',
        'calculation_status', 'calculated_hidden',
        'calculated_at_real', clock_timestamp(),
        'stage_start_game_at', v_stage_start_game_at,
        'input_hash_md5', v_input_hash,
        'output_hash_md5', v_output_hash,
        'output_snapshot', p_universal_result,
        
        'application_manifest', v_manifest,
        'official_outputs_persisted', false,
        'phase11_persistence_applied', false,
        'results_published', false,
        'verification_only', false
      ),
      error_message = null,
      failed_at = null,
      updated_at = clock_timestamp()
  where id = p_simulation_run_id;

  update public.race_stage_automation_state
  set last_status = 'calculated_hidden',
      last_checked_at = clock_timestamp(),
      last_error = null,
      details = coalesce(details, '{}'::jsonb) || jsonb_build_object(
        'calculated_at_real', clock_timestamp(),
        'input_hash_md5', v_input_hash,
        'output_hash_md5', v_output_hash,
        'manifest_ready', true,
        'verification_only', false
      ),
      updated_at = clock_timestamp()
  where stage_id = p_stage_id
    and simulation_run_id = p_simulation_run_id;

  return jsonb_build_object(
    'status', 'calculated_hidden',
    'contract', 'universal_phase11b_calculated_hidden_v1',
    'stage_id', p_stage_id,
    'race_id', v_run.race_id,
    'simulation_run_id', p_simulation_run_id,
    'input_hash_md5', v_input_hash,
    'output_hash_md5', v_output_hash,
    'phase11_manifest_ready', true,
    'official_outputs_persisted', false,
    'phase11_persistence_applied', false,
    'results_published', false
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_fail_calculation_v1(p_stage_id uuid, p_simulation_run_id uuid, p_error_message text, p_error_details jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_run public.race_stage_simulation_runs%rowtype;
begin
  perform set_config('app.race_engine_writer_family', 'typescript', true);
  perform pg_advisory_xact_lock(hashtextextended('phase11b_submit:' || p_stage_id::text, 0));

  select * into v_run
  from public.race_stage_simulation_runs r
  where r.id=p_simulation_run_id and r.stage_id=p_stage_id
    and r.engine_version='race_engine_ts_v1'
    and r.simulation_mode='deterministic_road_race_v1'
  for update;

  if not found then
    return jsonb_build_object('status','ignored_missing_run','stage_id',p_stage_id,'simulation_run_id',p_simulation_run_id);
  end if;

  -- A late duplicate worker may not overwrite an accepted hidden/authoritative result.
  if exists (select 1 from public.race_stage_authoritative_runs a where a.stage_id=p_stage_id)
     or coalesce(v_run.result_summary_json->>'calculation_contract','') =
          'universal_phase11b_calculated_hidden_v1'
  then
    if coalesce(v_run.result_summary_json->>'calculation_contract','') =
         'universal_phase11b_calculated_hidden_v1'
       and not exists (select 1 from public.race_stage_authoritative_runs a where a.stage_id=p_stage_id)
    then
      update public.race_stage_simulation_runs
         set status='running', failed_at=null, error_message=null,
             result_summary_json =
               (coalesce(result_summary_json,'{}'::jsonb)-'failed_at_real'-'error_details')
               || jsonb_build_object(
                    'calculation_status','calculated_hidden',
                    'late_failure_ignored_at_real',clock_timestamp()
                  ),
             updated_at=clock_timestamp()
       where id=p_simulation_run_id;

      update public.race_stage_automation_state
         set last_status='calculated_hidden', last_error=null,
             last_checked_at=clock_timestamp(),
             details=coalesce(details,'{}'::jsonb)
               || jsonb_build_object(
                    'late_failure_ignored_at_real',clock_timestamp(),
                    'late_failure_message',left(coalesce(p_error_message,'Unknown error'),10000)
                  ),
             updated_at=clock_timestamp()
       where stage_id=p_stage_id and simulation_run_id=p_simulation_run_id;
    end if;

    return jsonb_build_object('status','ignored_already_calculated','stage_id',p_stage_id,'simulation_run_id',p_simulation_run_id);
  end if;


  update public.race_stage_simulation_runs
  set status = 'failed',
      failed_at = clock_timestamp(),
      error_message = left(coalesce(p_error_message, 'Unknown error'), 10000),
      result_summary_json = coalesce(result_summary_json, '{}'::jsonb) || jsonb_build_object(
        'calculation_status', 'failed',
        'failed_at_real', clock_timestamp(),
        'error_details', coalesce(p_error_details, '{}'::jsonb),
        'verification_only', false
      ),
      updated_at = clock_timestamp()
  where id = p_simulation_run_id
    and stage_id = p_stage_id
    and engine_version = 'race_engine_ts_v1'
    and simulation_mode = 'deterministic_road_race_v1';

  update public.race_stage_automation_state
  set last_status = 'failed',
      last_error = left(coalesce(p_error_message, 'Unknown error'), 10000),
      last_checked_at = clock_timestamp(),
      details = coalesce(details, '{}'::jsonb) || jsonb_build_object(
        'failed_at_real', clock_timestamp(),
        'error_details', coalesce(p_error_details, '{}'::jsonb)
      ),
      updated_at = clock_timestamp()
  where stage_id = p_stage_id
    and simulation_run_id = p_simulation_run_id;

  return jsonb_build_object('status', 'failed_recorded', 'stage_id', p_stage_id, 'simulation_run_id', p_simulation_run_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_universal_race_stage_replay_payload_v1_raw_20260909(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_run public.race_stage_simulation_runs%rowtype;
  v_state public.race_stage_automation_state%rowtype;
  v_control public.race_engine_runtime_control_v1%rowtype;
  v_current_game_at timestamp without time zone;
  v_stage_start_game_at timestamp without time zone;
  v_calculation_due_game_at timestamp without time zone;
  v_results_reveal_game_at timestamp without time zone;
  v_output jsonb;
  v_replay_sync jsonb;
  v_replay_checkpoints jsonb;
  v_results_published boolean := false;
  v_results_visible boolean := false;
begin
  select * into v_control
  from public.race_engine_runtime_control_v1
  where singleton_id = true;

  select stage.stage_date::timestamp
      + make_interval(
          hours => coalesce(stage.planned_start_hour_number, 12),
          mins => coalesce(stage.planned_start_minute, 0)
        )
  into v_stage_start_game_at
  from public.race_stages stage
  where stage.id = p_stage_id;

  if v_stage_start_game_at is null then
    return jsonb_build_object(
      'status', 'not_available',
      'reason', 'stage_not_found_or_unscheduled',
      'stage_id', p_stage_id
    );
  end if;

  v_calculation_due_game_at :=
    v_stage_start_game_at
      - make_interval(
          hours => coalesce(v_control.typescript_calculation_lead_hours, 3)
        );
  v_results_reveal_game_at := v_stage_start_game_at + interval '30 minutes';

  select public.get_current_game_timestamp()::timestamp without time zone
  into v_current_game_at;

  select run.* into v_run
  from public.race_stage_simulation_runs run
  where run.stage_id = p_stage_id
    and run.status in ('running', 'completed')
    and run.engine_version = 'race_engine_ts_v1'
    and run.simulation_mode = 'deterministic_road_race_v1'
    and coalesce(run.result_summary_json ->> 'calculation_contract', '') =
      'universal_phase11b_calculated_hidden_v1'
  order by run.updated_at desc, run.created_at desc, run.id desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'status', 'not_available',
      'reason',
        case
          when v_current_game_at < v_calculation_due_game_at
            then 'awaiting_calculation_window'
          else 'awaiting_backend_calculation'
        end,
      'stage_id', p_stage_id,
      'current_game_at', v_current_game_at,
      'calculation_due_game_at', v_calculation_due_game_at,
      'replay_opens_game_at', v_stage_start_game_at,
      'results_reveal_game_at', v_results_reveal_game_at,
      'browser_calculation_allowed', false
    );
  end if;

  v_output := coalesce(v_run.result_summary_json -> 'output_snapshot', '{}'::jsonb);

  v_replay_sync :=
    coalesce(v_output #> '{universalResult,replaySynchronization}', '{}'::jsonb);
  v_replay_checkpoints :=
    coalesce(v_output #> '{universalResult,replayTimeline,checkpoints}', '[]'::jsonb);

  if coalesce((v_replay_sync ->> 'synchronized')::boolean, false) = false
     and jsonb_typeof(v_replay_checkpoints) = 'array'
     and jsonb_array_length(v_replay_checkpoints) >= 2
     and coalesce((v_replay_sync ->> 'allCheckpointRidersComplete')::boolean, false)
     and coalesce((v_replay_sync ->> 'allCheckpointsChronological')::boolean, false)
     and coalesce((v_replay_sync ->> 'allGapsMatchGroups')::boolean, false)
     and coalesce((v_replay_sync ->> 'allResultFieldsHiddenBeforeFinish')::boolean, false)
     and coalesce((v_replay_sync ->> 'finalCheckpointMatchesClassification')::boolean, false)
  then
    v_output := jsonb_set(
      v_output,
      '{universalResult,replayProgressGuarantee}',
      jsonb_build_object(
        'canProgress', true,
        'mode', 'degraded',
        'reason', 'non_blocking_synchronization_warnings',
        'issueCount',
          jsonb_array_length(coalesce(v_replay_sync -> 'issues', '[]'::jsonb))
      ),
      true
    );
  end if;

  select * into v_state
  from public.race_stage_automation_state state
  where state.stage_id = p_stage_id;

  v_results_published :=
    coalesce((v_run.result_summary_json ->> 'results_published')::boolean, false);
  v_results_visible :=
    v_results_published
      and v_current_game_at >= v_results_reveal_game_at;

  if v_current_game_at < v_stage_start_game_at then
    return jsonb_build_object(
      'status', 'not_open',
      'stage_id', p_stage_id,
      'calculated', true,
      'simulation_run_id', v_run.id,
      'replay_opens_game_at', v_stage_start_game_at,
      'results_reveal_game_at', v_results_reveal_game_at,
      'results_visible', false,
      'speed_locked', true,
      'browser_calculation_allowed', false
    );
  end if;

  -- Defense in depth: until official publication is both persisted AND the
  -- +30-game-minute reveal gate has passed, no replay checkpoint is allowed to
  -- advertise finalResultsVisible=true. This prevents the browser-memory
  -- shadow classification from exposing the precomputed finish early even if
  -- the client tries to jump to the final checkpoint.
  if not v_results_visible
     and jsonb_typeof(v_replay_checkpoints) = 'array'
  then
    select coalesce(
      jsonb_agg(
        jsonb_set(checkpoint_value, '{finalResultsVisible}', 'false'::jsonb, true)
        order by checkpoint_order
      ),
      '[]'::jsonb
    )
    into v_replay_checkpoints
    from jsonb_array_elements(v_replay_checkpoints)
      with ordinality as checkpoint(checkpoint_value, checkpoint_order);

    v_output := jsonb_set(
      v_output,
      '{universalResult,replayTimeline,checkpoints}',
      v_replay_checkpoints,
      true
    );
  end if;

  return jsonb_build_object(
    'status', 'available',
    'stage_id', p_stage_id,
    'race_id', v_run.race_id,
    'simulation_run_id', v_run.id,
    'engine_version', v_output ->> 'engineVersion',
    'engine_key', v_output ->> 'engineKey',
    'database_engine_identity', v_run.engine_version,
    'database_simulation_mode', v_run.simulation_mode,
    'input_snapshot', v_run.input_snapshot_json,
    'output_snapshot', v_output,
    'lifecycle', jsonb_build_object(
      'replay_opened_game_at', v_stage_start_game_at,
      'replay_opened_at_real', v_state.details ->> 'replay_opened_at_real',
      'replay_closes_at_real', v_state.details ->> 'replay_closes_at_real',
      'results_reveal_game_at', v_results_reveal_game_at,
      'results_visible', v_results_visible,
      'results_published_at', v_state.details ->> 'results_published_at_real',
      'speed_locked', not v_results_visible,
      'max_playback_speed', case when v_results_visible then 8 else 1 end,
      'finish_replay_allowed', v_results_visible,
      'live_replay_minimum_game_minutes', 30,
      'verification_only', false,
      'official_outputs_persisted',
        coalesce(
          (v_run.result_summary_json ->> 'official_outputs_persisted')::boolean,
          false
        ),
      'phase11_persistence_applied',
        coalesce(
          (v_run.result_summary_json ->> 'phase11_persistence_applied')::boolean,
          false
        ),
      'browser_calculation_allowed', false
    )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_apply_phase9_supplies_exact_v1(p_simulation_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_run public.race_stage_simulation_runs%rowtype;
  v_manifest jsonb;
  v_row jsonb;

  v_resource_id text;
  v_kind text;
  v_supply_key text;
  v_team_id uuid;

  v_quantity_used numeric;
  v_current_quantity numeric;
  v_applied_quantity_after numeric;

  v_stage_uses_used numeric;
  v_current_uses numeric;
  v_applied_uses_after numeric;
  v_unit_id uuid;
  v_last_used_game_date date;

  v_stage_date date;

  v_inserted integer;
  v_consumable_updates integer := 0;
  v_durable_updates integer := 0;
  v_already_applied integer := 0;

  v_event record;
  v_usage jsonb;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
begin
  select *
  into v_run
  from public.race_stage_simulation_runs run
  where run.id = p_simulation_run_id
  for update;

  if not found then
    raise exception 'Unknown simulation run %', p_simulation_run_id;
  end if;

  v_manifest := coalesce(
    v_run.result_summary_json -> 'application_manifest',
    '{}'::jsonb
  );

  if coalesce(v_manifest ->> 'contractVersion', '')
      <> 'universal_phase11_application_manifest_v1'
  then
    raise exception
      'Run % has no universal Phase 11 application manifest.',
      p_simulation_run_id;
  end if;

  select stage.stage_date::date
  into v_stage_date
  from public.race_stages stage
  where stage.id = v_run.stage_id;

  for v_row in
    select item
    from jsonb_array_elements(
      coalesce(v_manifest -> 'phase9ResourceUpdates', '[]'::jsonb)
    ) item
    where item ->> 'resourceType' = 'supply'
    order by item ->> 'resourceId'
  loop
    v_resource_id := v_row ->> 'resourceId';

    v_kind := coalesce(
      v_run.input_snapshot_json #>>
        array[
          'preparation',
          'raceSupplies',
          v_resource_id,
          'resourceKind'
        ],
      ''
    );

    v_supply_key := coalesce(
      v_run.input_snapshot_json #>>
        array[
          'preparation',
          'raceSupplies',
          v_resource_id,
          'supplyKey'
        ],
      ''
    );

    v_team_id := nullif(v_row ->> 'teamId', '')::uuid;

    if v_team_id is null or v_supply_key = '' then
      continue;
    end if;

    if exists (
      select 1
      from public.race_engine_stage_supply_applications a
      where a.simulation_run_id = p_simulation_run_id
        and a.resource_id = v_resource_id
    ) then
      v_already_applied := v_already_applied + 1;
      continue;
    end if;

    if v_kind = 'consumable_supply' then
      v_quantity_used := coalesce(
        nullif(v_row ->> 'quantityUsed', '')::numeric,
        0
      );

      if v_quantity_used <= 0 then
        continue;
      end if;

      select s.quantity_available::numeric
      into v_current_quantity
      from public.club_race_supplies s
      where s.club_id = v_team_id
        and s.supply_key = v_supply_key
      for update;

      if not found then
        raise exception
          'Shared consumable supply % is missing for resource owner %.',
          v_supply_key,
          v_team_id;
      end if;

      if v_current_quantity < v_quantity_used then
        raise exception
          'Shared consumable supply shortage at Phase 11 application for owner %, key %: current %, immutable use %.',
          v_team_id,
          v_supply_key,
          v_current_quantity,
          v_quantity_used;
      end if;

      v_applied_quantity_after :=
        greatest(v_current_quantity - v_quantity_used, 0);

      insert into public.race_engine_stage_supply_applications (
        simulation_run_id,
        stage_id,
        race_id,
        club_id,
        resource_id,
        supply_key,
        resource_kind,
        quantity_used,
        stage_uses_used,
        applied_game_date,
        metadata
      )
      values (
        p_simulation_run_id,
        v_run.stage_id,
        v_run.race_id,
        v_team_id,
        v_resource_id,
        v_supply_key,
        v_kind,
        v_quantity_used,
        null,
        v_stage_date,
        jsonb_build_object(
          'source', 'phase11d2_shared_owner_exact_supply_application',
          'manifest_quantity_before', v_row ->> 'quantityBefore',
          'manifest_quantity_after', v_row ->> 'quantityAfter',
          'applied_quantity_before', v_current_quantity,
          'applied_quantity_after', v_applied_quantity_after,
          'immutable_quantity_used', v_quantity_used
        )
      )
      on conflict (simulation_run_id, resource_id) do nothing;

      get diagnostics v_inserted = row_count;

      if v_inserted > 0 then
        update public.club_race_supplies s
        set
          quantity_available =
            greatest(v_applied_quantity_after, 0)::integer,
          total_used =
            coalesce(s.total_used, 0)
            + greatest(v_quantity_used, 0)::integer,
          last_used_game_date =
            case
              when v_quantity_used > 0
                then v_stage_date
              else s.last_used_game_date
            end,
          updated_at = clock_timestamp()
        where s.club_id = v_team_id
          and s.supply_key = v_supply_key;

        v_consumable_updates := v_consumable_updates + 1;
      else
        v_already_applied := v_already_applied + 1;
      end if;

    elsif v_kind = 'durable_supply_unit' then
      v_stage_uses_used := coalesce(
        nullif(v_row ->> 'stageUsesUsed', '')::numeric,
        0
      );

      if v_stage_uses_used <= 0 then
        continue;
      end if;

      v_unit_id := replace(v_resource_id, 'durable:', '')::uuid;

      select
        u.stage_uses_remaining::numeric,
        u.last_used_game_date
      into
        v_current_uses,
        v_last_used_game_date
      from public.club_race_supply_units u
      where u.id = v_unit_id
        and u.club_id = v_team_id
        and u.supply_key = v_supply_key
      for update;

      if not found then
        raise exception
          'Exact durable supply unit % was not found for owner %, key %.',
          v_unit_id,
          v_team_id,
          v_supply_key;
      end if;

      if v_last_used_game_date = v_stage_date then
        raise exception
          'Exact durable supply unit % was already used on game date %; same-day double use is forbidden.',
          v_unit_id,
          v_stage_date;
      end if;

      if v_current_uses < v_stage_uses_used then
        raise exception
          'Durable supply unit % has only % uses remaining but immutable stage use requires %.',
          v_unit_id,
          v_current_uses,
          v_stage_uses_used;
      end if;

      v_applied_uses_after :=
        greatest(v_current_uses - v_stage_uses_used, 0);

      insert into public.race_engine_stage_supply_applications (
        simulation_run_id,
        stage_id,
        race_id,
        club_id,
        resource_id,
        supply_key,
        resource_kind,
        quantity_used,
        stage_uses_used,
        applied_game_date,
        metadata
      )
      values (
        p_simulation_run_id,
        v_run.stage_id,
        v_run.race_id,
        v_team_id,
        v_resource_id,
        v_supply_key,
        v_kind,
        null,
        v_stage_uses_used,
        v_stage_date,
        jsonb_build_object(
          'source', 'phase11d2_shared_owner_exact_supply_application',
          'manifest_stage_uses_before', v_row ->> 'stageUsesBefore',
          'manifest_stage_uses_after', v_row ->> 'stageUsesAfter',
          'applied_stage_uses_before', v_current_uses,
          'applied_stage_uses_after', v_applied_uses_after,
          'immutable_stage_uses_used', v_stage_uses_used
        )
      )
      on conflict (simulation_run_id, resource_id) do nothing;

      get diagnostics v_inserted = row_count;

      if v_inserted > 0 then
        update public.club_race_supply_units u
        set
          stage_uses_remaining =
            greatest(v_applied_uses_after, 0)::integer,
          total_stage_uses =
            coalesce(u.total_stage_uses, 0)
            + greatest(v_stage_uses_used, 0)::integer,
          last_used_game_date = v_stage_date,
          retired_game_date =
            case
              when v_applied_uses_after <= 0
                then v_stage_date
              else u.retired_game_date
            end,
          status =
            case
              when v_applied_uses_after <= 0
                then 'worn_out'
              else 'ready'
            end,
          updated_at = clock_timestamp()
        where u.id = v_unit_id;

        update public.club_race_supplies s
        set
          quantity_available = (
            select count(*)::integer
            from public.club_race_supply_units u
            where u.club_id = v_team_id
              and u.supply_key = v_supply_key
              and u.status in ('ready', 'assigned')
              and u.stage_uses_remaining > 0
          ),
          total_used =
            coalesce(s.total_used, 0)
            + greatest(v_stage_uses_used, 0)::integer,
          last_used_game_date = v_stage_date,
          updated_at = clock_timestamp()
        where s.club_id = v_team_id
          and s.supply_key = v_supply_key;

        if not found then
          raise exception
            'Durable supply summary row is missing for owner %, key %.',
            v_team_id,
            v_supply_key;
        end if;

        v_durable_updates := v_durable_updates + 1;
      else
        v_already_applied := v_already_applied + 1;
      end if;
    end if;
  end loop;

  -- Keep the existing Phase 11 persistence boundary visible to diagnostics.
  for v_event in
    with rows as (
      select
        nullif(item ->> 'teamId', '')::uuid as team_id,
        item ->> 'resourceId' as resource_id,
        coalesce(
          v_run.input_snapshot_json #>>
            array[
              'preparation',
              'raceSupplies',
              item ->> 'resourceId',
              'supplyKey'
            ],
          ''
        ) as supply_key,
        coalesce(
          v_run.input_snapshot_json #>>
            array[
              'preparation',
              'raceSupplies',
              item ->> 'resourceId',
              'resourceKind'
            ],
          ''
        ) as resource_kind,
        coalesce(nullif(item ->> 'quantityUsed', '')::numeric, 0)
          as quantity_used,
        coalesce(nullif(item ->> 'stageUsesUsed', '')::numeric, 0)
          as stage_uses_used
      from jsonb_array_elements(
        coalesce(v_manifest -> 'phase9ResourceUpdates', '[]'::jsonb)
      ) item
      where item ->> 'resourceType' = 'supply'
    )
    select
      team_id,
      coalesce(
        sum(quantity_used)
          filter (where supply_key = 'bidons_water_bottles'),
        0
      )::integer as bidons,
      coalesce(
        sum(quantity_used)
          filter (where supply_key = 'energy_gels'),
        0
      )::integer as gels,
      coalesce(
        sum(quantity_used)
          filter (where supply_key = 'nutrition_packs'),
        0
      )::integer as nutrition,
      coalesce(
        sum(stage_uses_used)
          filter (where supply_key = 'race_jersey_complete'),
        0
      )::integer as jerseys,
      coalesce(
        sum(stage_uses_used)
          filter (where supply_key = 'rain_jackets'),
        0
      )::integer as jackets
    from rows
    where team_id is not null
    group by team_id
    order by team_id
  loop
    if
      v_event.bidons
      + v_event.gels
      + v_event.nutrition
      + v_event.jerseys
      + v_event.jackets
      <= 0
    then
      continue;
    end if;

    v_usage := jsonb_build_object(
      'bidons_water_bottles', v_event.bidons,
      'energy_gels', v_event.gels,
      'nutrition_packs', v_event.nutrition,
      'race_jersey_complete', v_event.jerseys,
      'rain_jackets', v_event.jackets,
      'source', 'phase11d2_shared_owner_exact_supply_application'
    );

    v_result := jsonb_build_object(
      'success', true,
      'club_id', v_event.team_id,
      'game_date', v_stage_date,
      'simulation_run_id', p_simulation_run_id,
      'requested', v_usage,
      'applied', v_usage,
      'exact_resource_ids_applied', true,
      'shared_owner_aware', true
    );

    insert into public.race_stage_supply_usage_events (
      club_id,
      race_stage_plan_id,
      idempotency_key,
      usage_json,
      result_json,
      applied_game_date
    )
    values (
      v_event.team_id,
      null,
      'phase11b:'
        || p_simulation_run_id::text
        || ':supplies:'
        || v_event.team_id::text,
      v_usage,
      v_result,
      v_stage_date
    )
    on conflict do nothing;

    v_results := v_results || jsonb_build_array(v_result);
  end loop;

  return jsonb_build_object(
    'status', 'completed',
    'simulation_run_id', p_simulation_run_id,
    'consumable_resource_updates_applied', v_consumable_updates,
    'durable_resource_updates_applied', v_durable_updates,
    'already_applied_count', v_already_applied,
    'results', v_results,
    'resource_rule', 'u23_uses_main_team_pool_first_team_priority',
    'application_rule', 'immutable_delta_and_exact_durable_ids'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_apply_health_candidates_v1(p_simulation_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_run public.race_stage_simulation_runs%rowtype;
  v_manifest jsonb;
  v_row jsonb;
  v_rider_id uuid;
  v_team_id uuid;
  v_case_code text;
  v_incident_id text;
  v_severity text;
  v_health_case_id uuid;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_created integer := 0;
  v_existing integer := 0;
  v_transient integer := 0;
  v_nonblocking integer := 0;
  v_prevented_by_health_protection integer := 0;
  v_health_incident_risk_multiplier numeric := 1;
  v_health_consequence_roll numeric := 0;
  v_old_availability text;
  v_new_availability text;
  v_minor_persistent integer := 0;
begin
  select * into v_run
  from public.race_stage_simulation_runs run
  where run.id = p_simulation_run_id
  for update;

  if not found then
    raise exception 'Unknown simulation run %', p_simulation_run_id;
  end if;

  v_manifest := coalesce(
    v_run.result_summary_json -> 'application_manifest',
    '{}'::jsonb
  );

  for v_row in
    select item
    from jsonb_array_elements(
      coalesce(v_manifest -> 'healthCaseCandidates', '[]'::jsonb)
    ) item
    order by item ->> 'riderId', item ->> 'incidentId'
  loop
    v_rider_id := nullif(v_row ->> 'riderId', '')::uuid;
    v_team_id := nullif(v_row ->> 'teamId', '')::uuid;
    v_case_code := nullif(v_row ->> 'caseCode', '');
    v_incident_id := coalesce(v_row ->> 'incidentId', '');
    v_severity := lower(coalesce(nullif(v_row ->> 'severity', ''), 'moderate'));

    if v_rider_id is null or v_team_id is null or v_case_code is null then
      raise exception 'Incomplete Phase 10 health candidate: %', v_row;
    end if;

    if v_severity not in ('minor', 'moderate', 'major') then
      raise exception 'Unsupported Phase 10 health severity % for %', v_severity, v_row;
    end if;

    if exists (
      select 1
      from public.rider_health_case_context_v1 context
      where context.rider_id = v_rider_id
        and context.source_type = 'race'
        and context.source_id = v_run.stage_id
        and context.case_code = public.health_normalize_case_code_v1(v_case_code)
        and coalesce(context.notes ->> 'phase11_incident_id', '') = v_incident_id
    ) then
      v_existing := v_existing + 1;
      continue;
    end if;

    -- Minor race injuries persist as short, non-blocking health cases.
    -- The rider may continue racing, but remains not fully fit and receives
    -- the normal daily health-condition/sharpness consequences until recovery.

    select coalesce(min(modifier.health_incident_risk_multiplier), 1::numeric)
    into v_health_incident_risk_multiplier
    from public.race_engine_get_stage_rider_preparation_modifiers_v2(v_run.stage_id) modifier
    where modifier.rider_id = v_rider_id
      and modifier.team_id = v_team_id;

    v_health_incident_risk_multiplier := greatest(0.78::numeric, least(1::numeric, coalesce(v_health_incident_risk_multiplier, 1::numeric)));
    v_health_consequence_roll := public.race_engine_hash_roll_v1(
      p_simulation_run_id::text || ':' || v_rider_id::text || ':' || v_incident_id || ':health_consequence'
    );

    if v_health_incident_risk_multiplier < 1::numeric
       and v_health_consequence_roll >= v_health_incident_risk_multiplier then
      v_results := v_results || jsonb_build_array(
        jsonb_build_object(
          'status', 'health_consequence_prevented_by_preparation',
          'rider_id', v_rider_id,
          'team_id', v_team_id,
          'case_code', v_case_code,
          'severity', v_severity,
          'stage_id', v_run.stage_id,
          'incident_id', v_incident_id,
          'health_incident_risk_multiplier', v_health_incident_risk_multiplier,
          'health_consequence_roll', v_health_consequence_roll,
          'persistent_health_case_created', false,
          'next_stage_selection_blocked', false,
          'medical_health_protection_live', true
        )
      );
      v_prevented_by_health_protection := v_prevented_by_health_protection + 1;
      continue;
    end if;

    select coalesce(rider.availability_status, 'fit')
    into v_old_availability
    from public.riders rider
    where rider.id = v_rider_id;

    v_result := public.health_create_rider_case_v1(
      v_rider_id,
      v_team_id,
      v_case_code,
      v_severity,
      'race',
      v_run.stage_id,
      nullif(v_row ->> 'bodyPart', ''),
      (
        select stage.stage_date::date
        from public.race_stages stage
        where stage.id = v_run.stage_id
      ),
      coalesce(v_row -> 'notes', '{}'::jsonb)
        || jsonb_build_object(
          'phase11_incident_id', v_incident_id,
          'phase11_simulation_run_id', p_simulation_run_id,
          'phase11_source_type', 'race_stage_incident',
          'selection_blocked_after_stage',
            coalesce((v_row ->> 'selectionBlockedAfterStage')::boolean, false),
          'phase11e_attrition_balance', true
        )
    );

    v_health_case_id := nullif(v_result ->> 'health_case_id', '')::uuid;

    if v_severity in ('minor', 'moderate') then
      -- Minor and moderate cases remain selectable. Minor cases are lighter:
      -- they do not block training/development, while moderate cases keep the
      -- catalogue's normal training/development restrictions.
      update public.rider_health_cases hc
      set selection_blocked = false,
          training_blocked = case when v_severity = 'minor' then false else hc.training_blocked end,
          development_blocked = case when v_severity = 'minor' then false else hc.development_blocked end
      where hc.id = v_health_case_id;

      update public.riders rider
      set availability_status = 'not_fully_fit',
          unavailable_until = null,
          unavailable_reason = null
      where rider.id = v_rider_id;

      v_result := v_result || jsonb_build_object(
        'next_stage_selection_blocked', false,
        'rider_availability_after_handoff', 'not_fully_fit',
        'minor_persistent_nonblocking', (v_severity = 'minor'),
        'phase11e_balance', true
      );

      if v_severity = 'minor' then
        v_minor_persistent := v_minor_persistent + 1;
      else
        v_nonblocking := v_nonblocking + 1;
      end if;
    else
      -- Major injury remains the genuine stage-race attrition path.
      v_result := v_result || jsonb_build_object(
        'next_stage_selection_blocked', true,
        'phase11e_balance', true
      );
    end if;

    select coalesce(rider.availability_status, 'fit')
    into v_new_availability
    from public.riders rider
    where rider.id = v_rider_id;

    begin
      perform public.notify_rider_status_transition(
        v_rider_id,
        (select stage.stage_date::date from public.race_stages stage where stage.id = v_run.stage_id),
        coalesce(v_old_availability, 'fit'),
        coalesce(v_new_availability, 'fit'),
        coalesce((select rider.fatigue from public.riders rider where rider.id = v_rider_id), 0),
        (select rider.unavailable_until from public.riders rider where rider.id = v_rider_id),
        (select rider.unavailable_reason from public.riders rider where rider.id = v_rider_id)
      );
    exception
      when others then
        raise warning 'race health status notification failed for rider %: %', v_rider_id, sqlerrm;
    end;

    v_results := v_results || jsonb_build_array(v_result);
    v_created := v_created + 1;
  end loop;

  return jsonb_build_object(
    'status', 'completed',
    'simulation_run_id', p_simulation_run_id,
    'created_count', v_created,
    'already_applied_count', v_existing,
    'transient_minor_count', v_transient,
    'persistent_minor_count', v_minor_persistent,
    'prevented_by_health_protection_count', v_prevented_by_health_protection,
    'moderate_selectable_count', v_nonblocking,
    'results', v_results,
    'balance_version', 'phase11f_medical_health_protection_v1'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_finalize_core_survival_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_run public.race_stage_simulation_runs%rowtype;
  v_state public.race_stage_automation_state%rowtype;
  v_manifest jsonb;
  v_output jsonb;
  v_row jsonb;
  v_stage_result_count integer := 0;
  v_point_result_count integer := 0;
  v_report_event_count integer := 0;
  v_removed_setup_report_event_count integer := 0;
  v_rider_state_count integer := 0;
  v_fatigue_result jsonb;
  v_supply_result jsonb;
  v_wear_result jsonb;
  v_health_result jsonb;
  v_classification_result jsonb;
  v_prize_payment_result jsonb;
  v_is_final_stage boolean := false;
  v_role_code text;
  v_stage_status text;
  v_start_stamina numeric;
  v_current_game_at timestamp without time zone;
  v_canonical_stage_start_game_at timestamp without time zone;
begin
  if p_stage_id is null then raise exception 'p_stage_id is required'; end if;

  perform pg_advisory_xact_lock(hashtextextended('phase11b_finalize:' || p_stage_id::text, 0));
  perform set_config('app.race_engine_writer_family', 'typescript', true);

  select * into v_state
  from public.race_stage_automation_state state
  where state.stage_id = p_stage_id
  for update;
  if not found then raise exception 'Phase 11B lifecycle state for stage % was not found.', p_stage_id; end if;

  select * into v_run
  from public.race_stage_simulation_runs run
  where run.id = v_state.simulation_run_id
    and run.stage_id = p_stage_id
    and run.engine_version = 'race_engine_ts_v1'
    and run.simulation_mode = 'deterministic_road_race_v1'
  for update;
  if not found then raise exception 'Phase 11B simulation run for stage % was not found.', p_stage_id; end if;

  
if v_run.status = 'completed'
     and (
       v_state.last_status = 'published'
       or exists (
         select 1
         from public.race_stage_authoritative_runs authority
         where authority.stage_id = p_stage_id
           and authority.simulation_run_id = v_run.id
       )
     )
  then

    return jsonb_build_object(
      'status', 'already_published',
      'stage_id', p_stage_id,
      'simulation_run_id', v_run.id
    );
  end if;

  if v_run.status <> 'running'
     or coalesce(v_run.result_summary_json ->> 'calculation_contract', '') <> 'universal_phase11b_calculated_hidden_v1'
  then
    raise exception 'Stage % does not have a running hidden Phase 11B calculation.', p_stage_id;
  end if;

  if v_state.last_status <> 'replay_live' then
    raise exception 'Stage % replay is not live/closable; current lifecycle status is %.', p_stage_id, v_state.last_status;
  end if;

  select public.get_current_game_timestamp()::timestamp without time zone,
         public.race_stage_planned_start_game_at_v1(p_stage_id)::timestamp without time zone
  into v_current_game_at, v_canonical_stage_start_game_at;

  if v_canonical_stage_start_game_at is null then
    raise exception 'Stage % canonical start time is unavailable.', p_stage_id;
  end if;

  if v_current_game_at < v_canonical_stage_start_game_at + interval '30 minutes' then
    raise exception 'Stage % official results are not due before canonical stage start + 30 game minutes.', p_stage_id;
  end if;

  if nullif(v_state.details ->> 'replay_closes_at_real', '') is null
     or clock_timestamp() < (v_state.details ->> 'replay_closes_at_real')::timestamptz
  then
    raise exception 'Stage % replay window has not closed.', p_stage_id;
  end if;

  v_manifest := coalesce(v_run.result_summary_json -> 'application_manifest', '{}'::jsonb);
  v_output := coalesce(v_run.result_summary_json -> 'output_snapshot', '{}'::jsonb);

  if coalesce(v_manifest ->> 'contractVersion', '') <> 'universal_phase11_application_manifest_v1'
     or not coalesce((v_manifest ->> 'readyForApplication')::boolean, false)
     or coalesce((v_manifest ->> 'persistenceApplied')::boolean, true)
     or coalesce(v_output ->> 'contractVersion', '') <> 'universal_race_stage_output_v1'
  then
    raise exception 'Stage % has no unapplied valid Phase 11 manifest/output.', p_stage_id;
  end if;

  -- Pre-generated route/profile report rows are setup content, not official race
  -- output. They share (stage_id,event_order) uniqueness with calculated report
  -- events, so remove only the non-run-scoped rows inside this same atomic
  -- finalization transaction. Any later failure rolls this cleanup back too.
  delete from public.race_stage_report_events report_event
  where report_event.stage_id = p_stage_id
    and nullif(report_event.metadata ->> 'simulation_run_id', '') is null
    and coalesce(report_event.metadata ->> 'output_contract', '') <> 'universal_race_stage_output_v1';
  get diagnostics v_removed_setup_report_event_count = row_count;

  -- No competing official output may exist. Historical result/point/authority rows
  -- and run-scoped report rows are never replaced.
  if exists (select 1 from public.race_stage_results result where result.stage_id = p_stage_id)
     or exists (select 1 from public.race_stage_point_results point_result where point_result.stage_id = p_stage_id)
     or exists (
       select 1
       from public.race_stage_report_events report_event
       where report_event.stage_id = p_stage_id
         and (
           nullif(report_event.metadata ->> 'simulation_run_id', '') is not null
           or report_event.metadata ->> 'output_contract' = 'universal_race_stage_output_v1'
         )
     )
     or exists (select 1 from public.race_stage_authoritative_runs authority where authority.stage_id = p_stage_id)
  then
    raise exception 'Stage % already has official output/authority; Phase 11B refuses to overwrite it.', p_stage_id;
  end if;

  -- A production finalizer starts from a clean persistence boundary. Individual
  -- application helpers are exposed only for internal reuse; if anything has
  -- already mutated this run outside this transaction, refuse to compound it.
  if exists (select 1 from public.race_stage_rider_states state_row where state_row.simulation_run_id = v_run.id)
     or exists (select 1 from public.race_engine_stage_wear_applications wear where wear.simulation_run_id = v_run.id)
     or exists (
       select 1 from public.race_stage_supply_usage_events event
       where coalesce(event.idempotency_key, '') like 'phase11b:' || v_run.id::text || ':%'
     )
     or exists (
       select 1 from public.rider_health_case_context_v1 context
       where coalesce(context.notes ->> 'phase11_simulation_run_id', '') = v_run.id::text
     )
  then
    raise exception 'Stage % already has partial Phase 11B persistence; refusing non-atomic finalization.', p_stage_id;
  end if;

  /* Phase 8 rider state handoff. */
  for v_row in
    select item
    from jsonb_array_elements(coalesce(v_manifest -> 'riderStateRows', '[]'::jsonb)) item
    order by item ->> 'riderId'
  loop
    select plan_rider ->> 'stageRole'
    into v_role_code
    from jsonb_array_elements(coalesce(v_run.input_snapshot_json -> 'stagePlans', '[]'::jsonb)) team_plan,
         jsonb_array_elements(coalesce(team_plan -> 'riders', '[]'::jsonb)) plan_rider
    where plan_rider ->> 'riderId' = v_row ->> 'riderId'
    limit 1;

    v_role_code := coalesce(nullif(v_role_code, ''), 'free_role');
    v_stage_status := case lower(coalesce(v_row ->> 'finishStatus', 'finished'))
      when 'dns' then 'dns'
      when 'dnf' then 'dnf'
      when 'otl' then 'otl'
      else 'finished'
    end;
    v_start_stamina := least(
      100::numeric,
      greatest(
        0::numeric,
        coalesce(nullif(v_row ->> 'finishStamina', '')::numeric, 0)
          + coalesce(nullif(v_row ->> 'staminaSpent', '')::numeric, 0)
      )
    );

    insert into public.race_stage_rider_states (
      simulation_run_id, race_id, stage_id, rider_id, team_id, role_code,
      start_stamina, finish_stamina, stamina_spent,
      fatigue_before_stage, fatigue_gain, fatigue_after_stage,
      stage_status, finish_position, finish_time_seconds, gap_seconds, metadata
    ) values (
      v_run.id,
      v_run.race_id,
      v_run.stage_id,
      nullif(v_row ->> 'riderId', '')::uuid,
      nullif(v_row ->> 'teamId', '')::uuid,
      v_role_code,
      v_start_stamina,
      coalesce(nullif(v_row ->> 'finishStamina', '')::numeric, 0),
      coalesce(nullif(v_row ->> 'staminaSpent', '')::numeric, 0),
      coalesce(nullif(v_row ->> 'fatigueBeforeStage', '')::numeric, 0),
      coalesce(nullif(v_row ->> 'fatigueGain', '')::numeric, 0),
      coalesce(nullif(v_row ->> 'fatigueAfterStage', '')::numeric, 0),
      v_stage_status,
      nullif(v_row ->> 'finishPosition', '')::integer,
      nullif(v_row ->> 'finishTimeSeconds', '')::integer,
      nullif(v_row ->> 'gapSeconds', '')::integer,
      jsonb_build_object(
        'source', 'phase11b_universal_application_manifest',
        'manifest_write_key', v_row ->> 'writeKey',
        'official_finish_status', lower(coalesce(v_row ->> 'finishStatus', 'finished')),
        'universal_engine_key', 'ppm_universal_race_v1',
        'universal_engine_version', '1'
      )
    )
    on conflict (simulation_run_id, rider_id) do update
    set team_id = excluded.team_id,
        role_code = excluded.role_code,
        start_stamina = excluded.start_stamina,
        finish_stamina = excluded.finish_stamina,
        stamina_spent = excluded.stamina_spent,
        fatigue_before_stage = excluded.fatigue_before_stage,
        fatigue_gain = excluded.fatigue_gain,
        fatigue_after_stage = excluded.fatigue_after_stage,
        stage_status = excluded.stage_status,
        finish_position = excluded.finish_position,
        finish_time_seconds = excluded.finish_time_seconds,
        gap_seconds = excluded.gap_seconds,
        metadata = excluded.metadata;
  end loop;

  select count(*)::integer into v_rider_state_count
  from public.race_stage_rider_states state_row
  where state_row.simulation_run_id = v_run.id;

  if v_rider_state_count <> jsonb_array_length(coalesce(v_manifest -> 'riderStateRows', '[]'::jsonb)) then
    raise exception 'Phase 11B rider-state persistence count mismatch: % stored vs % manifest.',
      v_rider_state_count,
      jsonb_array_length(coalesce(v_manifest -> 'riderStateRows', '[]'::jsonb));
  end if;

  v_fatigue_result := public.race_engine_apply_stage_fatigue_v1(v_run.id);
  v_supply_result := public.universal_race_stage_apply_phase9_supplies_v1(v_run.id);
  v_wear_result := public.race_engine_apply_stage_equipment_asset_wear_v1(v_run.id, false);
  v_wear_result := coalesce(v_wear_result, '{}'::jsonb) || jsonb_build_object(
    'equipment_compat',
    public.race_engine_apply_missing_stage_equipment_wear_v2(v_run.id)
  );
  v_health_result := public.universal_race_stage_apply_health_candidates_v1(v_run.id);

  /* Official result rows from the same immutable output. */
  insert into public.race_stage_results (
    race_id, stage_id, rider_id, team_id, rank, status,
    elapsed_seconds, gap_seconds, bonus_seconds, penalty_seconds,
    finish_points, sprint_points, mountain_points,
    rider_name_snapshot, team_name_snapshot,
    simulation_run_id, output_contract, created_at
  )
  select
    v_run.race_id,
    v_run.stage_id,
    nullif(row ->> 'riderId', '')::uuid,
    nullif(row ->> 'teamId', '')::uuid,
    nullif(row ->> 'rank', '')::integer,
    lower(coalesce(row ->> 'status', 'finished')),
    nullif(row ->> 'elapsedSeconds', '')::numeric::integer,
    nullif(row ->> 'gapSeconds', '')::numeric::integer,
    coalesce(nullif(row ->> 'bonusSeconds', '')::numeric::integer, 0),
    coalesce(nullif(row ->> 'penaltySeconds', '')::numeric::integer, 0),
    coalesce(nullif(row ->> 'finishPoints', '')::integer, 0),
    coalesce(nullif(row ->> 'sprintPoints', '')::integer, 0),
    coalesce(nullif(row ->> 'mountainPoints', '')::integer, 0),
    row ->> 'riderNameSnapshot',
    row ->> 'teamNameSnapshot',
    v_run.id,
    'run_scoped_v1',
    clock_timestamp()
  from jsonb_array_elements(coalesce(v_output #> '{publication,stageResults}', '[]'::jsonb)) row;
  get diagnostics v_stage_result_count = row_count;

  if v_stage_result_count = 0 then raise exception 'Phase 11B publication produced no stage result rows.'; end if;

  insert into public.race_stage_point_results (
    race_id, stage_id, point_id, rider_id, team_id, rank,
    points_awarded, bonus_seconds_awarded,
    rider_name_snapshot, team_name_snapshot, created_at
  )
  select
    v_run.race_id,
    v_run.stage_id,
    nullif(row ->> 'pointId', '')::uuid,
    nullif(row ->> 'riderId', '')::uuid,
    nullif(row ->> 'teamId', '')::uuid,
    nullif(row ->> 'rank', '')::integer,
    coalesce(nullif(row ->> 'pointsAwarded', '')::integer, 0),
    coalesce(nullif(row ->> 'bonusSecondsAwarded', '')::integer, 0),
    row ->> 'riderNameSnapshot',
    row ->> 'teamNameSnapshot',
    clock_timestamp()
  from jsonb_array_elements(coalesce(v_output #> '{publication,pointResults}', '[]'::jsonb)) row
  where coalesce(nullif(row ->> 'pointsAwarded', '')::integer, 0) <> 0
     or coalesce(nullif(row ->> 'bonusSecondsAwarded', '')::integer, 0) <> 0;
  get diagnostics v_point_result_count = row_count;

  insert into public.race_stage_report_events (
    race_id, stage_id, event_order, km_marker, race_time_label,
    event_type, title, description, rider_id, team_id,
    rider_name_snapshot, team_name_snapshot, metadata,
    created_at, updated_at
  )
  select
    v_run.race_id,
    v_run.stage_id,
    nullif(row ->> 'eventOrder', '')::integer,
    nullif(row ->> 'kmMarker', '')::numeric,
    null,
    case row ->> 'eventType'
      when 'race_start' then 'start'
      when 'phase_end' then 'summary'
      when 'finish_preparation' then 'summary'
      when 'race_status' then 'summary'
      when 'breakaway_formation' then 'breakaway'
      when 'peloton_control' then 'tactical_tempo'
      when 'group_split' then 'split'
      when 'late_chase' then 'tactical_chase'
      when 'bridge_attack' then 'tactical_attack'
      when 'bridge_progress' then 'tactical_chase'
      when 'bridge_merge' then 'catch'
      when 'incident' then 'tactical_incident_warning'
      when 'group_merge' then 'catch'
      else case
        when row ->> 'eventType' in (
          'attack', 'breakaway', 'catch', 'crash', 'finish', 'kom',
          'mechanical', 'neutral_start', 'split', 'sprint', 'start', 'summary',
          'tactical_attack', 'tactical_breakaway_attempt', 'tactical_chase',
          'tactical_command', 'tactical_equipment_wear',
          'tactical_incident_warning', 'tactical_leadout',
          'tactical_positioning', 'tactical_protection', 'tactical_safety',
          'tactical_sprint', 'tactical_tempo', 'weather'
        ) then row ->> 'eventType'
        else 'summary'
      end
    end,
    row ->> 'title',
    row ->> 'description',
    nullif(row ->> 'riderId', '')::uuid,
    nullif(row ->> 'teamId', '')::uuid,
    row ->> 'riderNameSnapshot',
    row ->> 'teamNameSnapshot',
    coalesce(row -> 'metadata', '{}'::jsonb) || jsonb_build_object(
      'simulation_run_id', v_run.id,
      'output_contract', 'universal_race_stage_output_v1',
      'universal_event_type', row ->> 'eventType'
    ),
    clock_timestamp(),
    clock_timestamp()
  from jsonb_array_elements(coalesce(v_output #> '{publication,reportEvents}', '[]'::jsonb)) row;
  get diagnostics v_report_event_count = row_count;

  -- Reuse the existing classification contract: the simulation run is marked
  -- completed before authority/classification writers inspect it. This remains
  -- atomic because every statement in this finalizer is in the same transaction;
  -- any later failure rolls this update back together with all persistence.
  
update public.race_stage_simulation_runs
  set status = 'completed',
      completed_at = coalesce(completed_at, clock_timestamp()),
      failed_at = null,
      error_message = null,
      updated_at = clock_timestamp()
  where id = v_run.id;


  
  -- Restore official authority/classification/points/prize application.
  insert into public.race_stage_authoritative_runs (
    stage_id,
    simulation_run_id,
    race_id,
    engine_version,
    simulation_mode,
    authority_kind,
    approved_at,
    activated_at,
    approved_by,
    contract_version,
    metadata,
    created_at,
    updated_at
  ) values (
    v_run.stage_id,
    v_run.id,
    v_run.race_id,
    'race_engine_ts_v1',
    'deterministic_road_race_v1',
    'typescript_activation',
    clock_timestamp(),
    clock_timestamp(),
    current_user,
    'race_stage_authoritative_run_v1',
    jsonb_build_object(
      'universal_engine_key', 'ppm_universal_race_v1',
      'universal_engine_version', '1',
      'universal_output_contract', 'universal_race_stage_output_v1',
      'input_hash_md5', v_run.result_summary_json ->> 'input_hash_md5',
      'output_hash_md5', v_run.result_summary_json ->> 'output_hash_md5',
      'worker_version', 'netlify_phase11b_v1',
      'legacy_calculation_used', false,
      'legacy_replay_used', false,
      'legacy_commentary_used', false,
      'phase11_persistence_applied', true
    ),
    clock_timestamp(),
    clock_timestamp()
  );

  v_classification_result :=
    public.race_engine_write_cumulative_classifications_v1(v_run.id);

  select not exists (
    select 1
    from public.race_stages later
    where later.race_id = v_run.race_id
      and later.stage_number > (
        select current_stage.stage_number
        from public.race_stages current_stage
        where current_stage.id = v_run.stage_id
      )
      and not coalesce(later.weather_cancelled, false)
  )
  into v_is_final_stage;

  perform public.race_engine_apply_international_points_after_stage_v1(
    v_run.stage_id
  );

  perform public.generate_race_prize_awards_v1(
    v_run.race_id,
    v_run.stage_id,
    v_is_final_stage
  );

  v_prize_payment_result :=
    public.race_engine_pay_prize_awards_v1(
      v_run.race_id,
      v_run.stage_id
    );

  if v_is_final_stage then
    update public.races
    set status = 'completed',
        updated_at = clock_timestamp()
    where id = v_run.race_id;

    update public.race_entry_rules
    set applications_status = 'race_finished',
        updated_at = clock_timestamp()
    where race_id = v_run.race_id;
  end if;

update public.race_stage_automation_state
  set last_status = 'published',
      last_published_at = clock_timestamp(),
      last_checked_at = clock_timestamp(),
      last_error = null,
      details = coalesce(details, '{}'::jsonb) || jsonb_build_object(
        'results_published', true,
        'results_published_at_real', clock_timestamp(),
        'phase11_persistence_applied', true,
        'official_outputs_persisted', true,
        'stage_result_count', v_stage_result_count,
        'point_result_count', v_point_result_count,
        'report_event_count', v_report_event_count,
        'removed_setup_report_event_count', v_removed_setup_report_event_count,
        'rider_state_count', v_rider_state_count,
        'is_final_stage', v_is_final_stage
      ),
      updated_at = clock_timestamp()
  where stage_id = p_stage_id;

  return jsonb_build_object(
    'status', 'published',
    'race_id', v_run.race_id,
    'stage_id', p_stage_id,
    'simulation_run_id', v_run.id,
    'stage_result_count', v_stage_result_count,
    'point_result_count', v_point_result_count,
    'report_event_count', v_report_event_count,
    'removed_setup_report_event_count', v_removed_setup_report_event_count,
    'rider_state_count', v_rider_state_count,
    'fatigue_result', v_fatigue_result,
    'supply_result', v_supply_result,
    'wear_result', v_wear_result,
    'health_result', v_health_result,
    'classification_result', v_classification_result,
    'is_final_stage', v_is_final_stage,
    'prize_payment_result', v_prize_payment_result
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_claim_next_due_v1(p_worker_id text DEFAULT 'netlify_phase11b_v1'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_control public.race_engine_runtime_control_v1%rowtype;
  v_current_game_at timestamp without time zone;
  v_stage record;
  v_claim jsonb;
  v_readiness jsonb;
  v_repair jsonb;
  v_blocked jsonb := '[]'::jsonb;
  v_survival jsonb;
begin
  v_survival := public.universal_race_stage_survival_recover_v1();
  select * into v_control from public.race_engine_runtime_control_v1 where singleton_id=true;
  if not found or not coalesce(v_control.typescript_lifecycle_enabled,false) then
    return jsonb_build_object('status','disabled','survival',v_survival);
  end if;
  select public.get_current_game_timestamp()::timestamp without time zone into v_current_game_at;
  for v_stage in
    select stage.id as stage_id,
           stage.race_id,
           race.name as race_name,
           stage.stage_number,
           stage.stage_date,
           stage.planned_start_hour_number,
           stage.planned_start_minute,
           stage.stage_date::timestamp + make_interval(hours=>coalesce(stage.planned_start_hour_number,12),mins=>coalesce(stage.planned_start_minute,0)) as stage_start_game_at
    from public.race_stages stage
    join public.races race on race.id=stage.race_id
    where not coalesce(stage.weather_cancelled,false)
      and stage.planned_start_hour_number is not null
      and (stage.stage_date::timestamp + make_interval(hours=>coalesce(stage.planned_start_hour_number,12),mins=>coalesce(stage.planned_start_minute,0))) >= v_control.typescript_activation_game_at
      and (stage.stage_date::timestamp + make_interval(hours=>coalesce(stage.planned_start_hour_number,12),mins=>coalesce(stage.planned_start_minute,0)) - make_interval(hours=>coalesce(v_control.typescript_calculation_lead_hours,3))) <= v_current_game_at
      and not exists (select 1 from public.race_stage_authoritative_runs authority where authority.stage_id=stage.id)
      and not exists (
        select 1 from public.race_stage_simulation_runs run
        where run.stage_id=stage.id
          and run.engine_version='race_engine_ts_v1'
          and run.simulation_mode='deterministic_road_race_v1'
          and run.status in ('running','completed')
          and coalesce(run.result_summary_json->>'calculation_contract','') in ('phase11b_claim_pending_v1','universal_phase11b_calculated_hidden_v1')
      )
      and not exists (
        select 1 from public.race_stage_simulation_runs failed_run
        where failed_run.stage_id=stage.id
          and failed_run.engine_version='race_engine_ts_v1'
          and failed_run.simulation_mode='deterministic_road_race_v1'
          and failed_run.status='failed'
          and failed_run.failed_at is not null
          and failed_run.failed_at > clock_timestamp()-interval '2 minutes'
          and (stage.stage_date::timestamp + make_interval(hours=>coalesce(stage.planned_start_hour_number,12),mins=>coalesce(stage.planned_start_minute,0))) > v_current_game_at + interval '15 minutes'
      )
    order by
      case when exists (
        select 1
        from public.race_stage_simulation_runs recent_failed
        where recent_failed.stage_id=stage.id
          and recent_failed.engine_version='race_engine_ts_v1'
          and recent_failed.simulation_mode='deterministic_road_race_v1'
          and recent_failed.status='failed'
          and recent_failed.failed_at is not null
          and recent_failed.failed_at > clock_timestamp()-interval '10 minutes'
      ) then 1 else 0 end,
      case when (stage.stage_date::timestamp + make_interval(hours=>coalesce(stage.planned_start_hour_number,12),mins=>coalesce(stage.planned_start_minute,0))) <= v_current_game_at + interval '15 minutes' then 0 else 1 end,
      stage.stage_date,
      stage.planned_start_hour_number,
      stage.planned_start_minute,
      stage.race_id,
      stage.stage_number
    limit 100
  loop
    v_repair := public.race_startlist_engine_self_heal_v1(v_stage.race_id);
    v_readiness := coalesce(v_repair->'readiness_after', public.race_startlist_engine_readiness_v1(v_stage.race_id));
    if coalesce((v_readiness->>'ready')::boolean,false) is not true then
      v_blocked := v_blocked || jsonb_build_array(jsonb_build_object(
        'stage_id',v_stage.stage_id,'race_id',v_stage.race_id,'race_name',v_stage.race_name,'stage_number',v_stage.stage_number,
        'reason','startlist_engine_not_ready','readiness',v_readiness,'repair_result',v_repair));
      continue;
    end if;
    begin
      v_claim := public.universal_race_stage_claim_calculation_v1(v_stage.stage_id);
    exception when others then
      v_blocked := v_blocked || jsonb_build_array(jsonb_build_object(
        'stage_id',v_stage.stage_id,'race_id',v_stage.race_id,'race_name',v_stage.race_name,'stage_number',v_stage.stage_number,
        'reason','claim_exception','sqlstate',sqlstate,'message',sqlerrm,'repair_result',v_repair));
      continue;
    end;
    if coalesce(v_claim->>'status','')='claimed' then
      return v_claim || jsonb_build_object(
        'worker_id',coalesce(nullif(p_worker_id,''),'supabase_edge_phase11b_v1'),
        'scheduler_skipped_blocks',v_blocked,
        'startlist_self_heal_applied',coalesce((v_repair->>'team_list_repair_attempted')::boolean,false) or coalesce((v_repair->>'startlist_repair_attempted')::boolean,false),
        'startlist_self_heal_result',v_repair,
        'survival',v_survival,
        'survival_mode',public.universal_race_stage_survival_mode_v1(v_stage.stage_id));
    end if;
  end loop;
  return jsonb_build_object('status','no_due_stage','current_game_at',v_current_game_at,'scheduler_skipped_blocks',v_blocked,'survival',v_survival);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_process_lifecycle_core_v1(p_max_publications integer DEFAULT 4)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_control public.race_engine_runtime_control_v1%rowtype;
  v_current_game_at timestamp without time zone;
  v_snapshot_result jsonb;
  v_state record;
  v_result jsonb;
  v_opened jsonb := '[]'::jsonb;
  v_published jsonb := '[]'::jsonb;
  v_publication_failures jsonb := '[]'::jsonb;
  v_opened_count integer := 0;
  v_published_count integer := 0;
  v_publication_failure_count integer := 0;
begin
  select * into v_control
  from public.race_engine_runtime_control_v1
  where singleton_id = true;

  if not found
     or not coalesce(v_control.typescript_lifecycle_enabled, false)
     or v_control.active_engine <> 'typescript_v1'
     or not v_control.typescript_execution_enabled
     or v_control.legacy_execution_enabled
  then
    return jsonb_build_object('status', 'disabled');
  end if;

  select public.get_current_game_timestamp()::timestamp without time zone
  into v_current_game_at;

  v_snapshot_result := public.race_engine_finalize_due_stage_plan_snapshots_v1(200, false);

  /*
   * Canonical schedule self-heal:
   * If a replay was opened under stale timing metadata but the CURRENT
   * canonical start is still in the future, hide it again.
   */
  update public.race_stage_automation_state state
  set scheduled_game_at =
        public.race_stage_planned_start_game_at_v1(state.stage_id)::timestamp without time zone,
      last_status = 'calculated_hidden',
      last_checked_at = clock_timestamp(),
      details =
        (coalesce(state.details,'{}'::jsonb)
          - 'replay_opened_at_real'
          - 'replay_opened_game_at'
          - 'replay_closes_at_real'
          - 'official_results_reveal_game_at'
          - 'historical_catchup_replay_fast_forwarded'
          - 'historical_catchup_fast_forwarded_at_real'
          - 'historical_catchup_current_game_at'
          - 'historical_catchup_rule')
        || jsonb_build_object(
             'schedule_self_healed_at_real',clock_timestamp(),
             'schedule_self_heal_reason','canonical_stage_start_moved_to_future',
             'schedule_self_heal_game_at',v_current_game_at
           ),
      updated_at = clock_timestamp()
  from public.race_stage_simulation_runs run
  where run.id = state.simulation_run_id
    and state.last_status = 'replay_live'
    and public.race_stage_planned_start_game_at_v1(state.stage_id) is not null
    and public.race_stage_planned_start_game_at_v1(state.stage_id)::timestamp without time zone > v_current_game_at
    and run.status = 'running'
    and coalesce(run.result_summary_json ->> 'calculation_contract','') = 'universal_phase11b_calculated_hidden_v1'
    and not exists (
      select 1
      from public.race_stage_authoritative_runs a
      where a.stage_id = state.stage_id
    );

  for v_state in
    select
      state.stage_id,
      state.simulation_run_id,
      state.scheduled_game_at,
      public.race_stage_planned_start_game_at_v1(state.stage_id)::timestamp without time zone as canonical_stage_start_game_at,
      state.details
    from public.race_stage_automation_state state
    join public.race_stage_simulation_runs run
      on run.id = state.simulation_run_id
    where state.last_status = 'calculated_hidden'
      and public.race_stage_planned_start_game_at_v1(state.stage_id)::timestamp without time zone <= v_current_game_at
      and run.status = 'running'
      and run.engine_version = 'race_engine_ts_v1'
      and run.simulation_mode = 'deterministic_road_race_v1'
      and coalesce(run.result_summary_json ->> 'calculation_contract', '') =
        'universal_phase11b_calculated_hidden_v1'
    order by public.race_stage_planned_start_game_at_v1(state.stage_id), state.stage_id
    for update of state skip locked
  loop
    update public.race_stage_automation_state
    set scheduled_game_at = v_state.canonical_stage_start_game_at,
        last_status = 'replay_live',
        last_checked_at = clock_timestamp(),
        details = coalesce(details, '{}'::jsonb) || jsonb_build_object(
          'replay_opened_at_real', clock_timestamp(),
          'replay_opened_game_at', v_current_game_at,
          'replay_closes_at_real',
            clock_timestamp()
              + make_interval(
                  secs => coalesce(
                    v_control.typescript_replay_duration_real_seconds,
                    900
                  )
                ),
          'official_results_reveal_game_at',
            v_state.canonical_stage_start_game_at + interval '30 minutes',
          'live_replay_minimum_game_minutes', 30
        ),
        updated_at = clock_timestamp()
    where stage_id = v_state.stage_id;

    v_opened := v_opened || jsonb_build_array(jsonb_build_object(
      'stage_id', v_state.stage_id,
      'simulation_run_id', v_state.simulation_run_id,
      'status', 'replay_live',
      'results_reveal_game_at',
        v_state.canonical_stage_start_game_at + interval '30 minutes'
    ));
    v_opened_count := v_opened_count + 1;
  end loop;

  for v_state in
    select state.stage_id
    from public.race_stage_automation_state state
    where state.last_status = 'replay_live'
      and nullif(state.details ->> 'replay_closes_at_real', '') is not null
      and (state.details ->> 'replay_closes_at_real')::timestamptz
            <= clock_timestamp()
      -- HARD PUBLICATION GATE: even if a real-time replay close timestamp is
      -- accidentally early, official outputs cannot publish until 30 in-game
      -- minutes after the scheduled stage start.
      and public.race_stage_planned_start_game_at_v1(state.stage_id)::timestamp without time zone + interval '30 minutes'
            <= v_current_game_at
    order by
      (state.details ->> 'replay_closes_at_real')::timestamptz,
      state.stage_id
    limit greatest(1, least(coalesce(p_max_publications, 4), 20))
    for update of state skip locked
  loop
    begin
      v_result := public.universal_race_stage_finalize_v1(v_state.stage_id);
      v_published := v_published || jsonb_build_array(v_result);
      v_published_count := v_published_count + 1;
    exception when others then
      update public.race_stage_automation_state
      set last_checked_at = clock_timestamp(),
          last_error = sqlerrm,
          details = coalesce(details, '{}'::jsonb) || jsonb_build_object(
            'publication_last_error', sqlerrm,
            'publication_last_failed_at_real', clock_timestamp()
          ),
          updated_at = clock_timestamp()
      where stage_id = v_state.stage_id;

      v_publication_failures :=
        v_publication_failures || jsonb_build_array(
          jsonb_build_object(
            'stage_id', v_state.stage_id,
            'status', 'publication_failed',
            'error', sqlerrm
          )
        );
      v_publication_failure_count := v_publication_failure_count + 1;
    end;
  end loop;

  return jsonb_build_object(
    'status', 'completed',
    'current_game_at', v_current_game_at,
    'stage_plan_snapshot_result', v_snapshot_result,
    'replay_opened_count', v_opened_count,
    'replay_openings', v_opened,
    'published_count', v_published_count,
    'publications', v_published,
    'publication_failure_count', v_publication_failure_count,
    'publication_failures', v_publication_failures,
    'official_result_reveal_rule', 'not_before_stage_start_plus_30_game_minutes_v1'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_quote_v1(p_club_id uuid, p_staff_id uuid)
 RETURNS TABLE(staff_id uuid, staff_name text, role_type text, coin_price integer, duration_real_days integer, current_expires_at timestamp with time zone, proposed_expires_at timestamp with time zone, is_renewal boolean, automatic_renewal boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_staff public.club_staff%rowtype;
  v_price integer; v_legacy_days integer; v_months integer; v_enabled boolean;
  v_access public.staff_advisory_access%rowtype;
  v_current_expiry timestamptz; v_base timestamptz;
  v_game_now timestamptz := public.staff_advisory_game_now_v1();
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not exists(select 1 from public.clubs c where c.id=p_club_id and c.owner_user_id=auth.uid() and c.deleted_at is null) then raise exception 'Club not found or access denied.'; end if;
  select * into v_staff from public.club_staff s where s.id=p_staff_id and s.club_id=p_club_id and s.is_active=true;
  if not found then raise exception 'This employee is not an active member of the club.'; end if;
  if v_staff.role_type::text not in ('head_coach','sport_director','team_doctor','mechanic','scout_analyst') then raise exception 'This staff role cannot be purchased as an advisor.'; end if;
  select c.coin_price,c.duration_real_days,c.duration_game_months,c.is_enabled into v_price,v_legacy_days,v_months,v_enabled from public.staff_advisory_config c where c.id=true;
  if coalesce(v_enabled,false)=false then raise exception 'Staff Advisory purchasing is currently disabled.'; end if;

  perform public.staff_advisory_reconcile_role_entitlement_v1(p_club_id,v_staff.role_type::text,now());
  select * into v_access from public.staff_advisory_access a
  where a.user_id=auth.uid() and a.club_id=p_club_id and a.role_type=v_staff.role_type::text limit 1;

  if found and v_access.entitlement_state='active' and v_access.staff_id=p_staff_id and v_access.expires_at>v_game_now then
    v_current_expiry:=v_access.expires_at;
  else v_current_expiry:=null;
  end if;
  v_base:=greatest(v_game_now,coalesce(v_current_expiry,v_game_now));
  return query select v_staff.id,v_staff.staff_name::text,v_staff.role_type::text,v_price,v_legacy_days,
    v_current_expiry,public.staff_advisory_add_game_months_v1(v_base,v_months),(v_current_expiry is not null),false;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_activate_v1(p_user_id uuid, p_club_id uuid, p_staff_id uuid, p_idempotency_key text)
 RETURNS TABLE(purchase_id uuid, advisor_staff_id uuid, advisor_staff_name text, role_type text, coins_charged integer, balance_after integer, activated_at timestamp with time zone, expires_at timestamp with time zone, is_renewal boolean, was_duplicate boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_staff public.club_staff%rowtype;
  v_config public.staff_advisory_config%rowtype;
  v_existing_access public.staff_advisory_access%rowtype;
  v_existing_purchase public.staff_advisory_purchases%rowtype;
  v_purchase_id uuid;
  v_previous_expiry timestamptz;
  v_new_expiry timestamptz;
  v_activated_at timestamptz := now();
  v_game_now timestamptz := public.staff_advisory_game_now_v1();
  v_system_key text;
  v_balance integer;
  v_is_renewal boolean := false;
begin
  if auth.role() <> 'service_role' then
    if auth.uid() is null or p_user_id is distinct from auth.uid() then
      raise exception 'Staff Advisory activation may only be performed for the authenticated user.' using errcode='42501';
    end if;
  end if;
  if p_user_id is null then raise exception 'User id is required.'; end if;
  if p_club_id is null then raise exception 'Club id is required.'; end if;
  if p_staff_id is null then raise exception 'Staff id is required.'; end if;
  if nullif(btrim(coalesce(p_idempotency_key,'')),'') is null then raise exception 'Idempotency key is required.'; end if;
  if length(p_idempotency_key)>200 then raise exception 'Idempotency key is too long.'; end if;

  if not exists(select 1 from public.clubs c where c.id=p_club_id and c.owner_user_id=p_user_id and c.deleted_at is null) then
    raise exception 'Club not found or does not belong to this user.' using errcode='42501';
  end if;

  select * into v_staff from public.club_staff s
  where s.id=p_staff_id and s.club_id=p_club_id and s.is_active=true
  for update;
  if not found then raise exception 'This employee is not an active member of the club.'; end if;

  if v_staff.role_type::text not in ('head_coach','sport_director','team_doctor','mechanic','scout_analyst') then
    raise exception 'This staff role cannot be purchased as an advisor.';
  end if;

  select * into v_config from public.staff_advisory_config cfg where cfg.id=true;
  if not found or coalesce(v_config.is_enabled,false)=false then raise exception 'Staff Advisory purchasing is currently disabled.'; end if;

  select p.* into v_existing_purchase from public.staff_advisory_purchases p
  where p.user_id=p_user_id and p.idempotency_key=p_idempotency_key for update;
  if found then
    if v_existing_purchase.club_id<>p_club_id or v_existing_purchase.role_type<>v_staff.role_type::text then
      raise exception 'Idempotency key has already been used for another Staff Advisory purchase.';
    end if;
    if v_existing_purchase.status='completed' then
      select coalesce(w.balance,0) into v_balance from public.user_wallets w where w.user_id=p_user_id;
      return query select v_existing_purchase.id,v_existing_purchase.staff_id,
        coalesce((select s.staff_name::text from public.club_staff s where s.id=v_existing_purchase.staff_id),v_staff.staff_name::text),
        v_existing_purchase.role_type::text,v_existing_purchase.coin_price,coalesce(v_balance,0),
        coalesce(v_existing_purchase.completed_at,v_existing_purchase.created_at),v_existing_purchase.new_expires_at,
        (v_existing_purchase.previous_expires_at is not null),true;
      return;
    end if;
    raise exception 'A Staff Advisory request with this idempotency key is already being processed.';
  end if;

  perform public.staff_advisory_reconcile_role_entitlement_v1(p_club_id,v_staff.role_type::text,now());

  select a.* into v_existing_access from public.staff_advisory_access a
  where a.user_id=p_user_id and a.club_id=p_club_id and a.role_type=v_staff.role_type::text
  for update;

  if found then
    if v_existing_access.entitlement_state='active' and v_existing_access.expires_at>v_game_now then
      if v_existing_access.staff_id is distinct from p_staff_id then
        raise exception 'Another active employee currently owns this advisory role slot.';
      end if;
      v_previous_expiry:=v_existing_access.expires_at;
      v_is_renewal:=true;
    elsif v_existing_access.entitlement_state='paused' and v_existing_access.remaining_paid_seconds>0 then
      v_previous_expiry:=v_game_now+make_interval(secs=>v_existing_access.remaining_paid_seconds::double precision);
      v_is_renewal:=true;
    else
      v_previous_expiry:=null;
      v_is_renewal:=false;
    end if;
  end if;

  v_new_expiry:=public.staff_advisory_add_game_months_v1(
    greatest(v_game_now,coalesce(v_previous_expiry,v_game_now)),
    v_config.duration_game_months
  );
  v_purchase_id:=gen_random_uuid();

  insert into public.staff_advisory_purchases(
    id,user_id,club_id,staff_id,role_type,idempotency_key,coin_price,duration_real_days,duration_game_months,
    previous_expires_at,new_expires_at,status
  ) values(
    v_purchase_id,p_user_id,p_club_id,p_staff_id,v_staff.role_type::text,p_idempotency_key,
    v_config.coin_price,v_config.duration_real_days,v_config.duration_game_months,v_previous_expiry,v_new_expiry,'pending'
  );

  v_system_key:='staff_advisory_purchase:'||v_purchase_id::text;
  perform public.apply_coin_delta(
    p_user_id,-v_config.coin_price,'staff_advisory_purchase',
    jsonb_build_object(
      'system_key',v_system_key,'category','staff_advisory','purchase_id',v_purchase_id,
      'club_id',p_club_id,'staff_id',p_staff_id,'staff_name',v_staff.staff_name,
      'role_type',v_staff.role_type::text,'coin_price',v_config.coin_price,
      'duration_game_months',v_config.duration_game_months,'duration_basis','game_calendar_months',
      'previous_expires_at',v_previous_expiry,'new_expires_at',v_new_expiry,
      'automatic_renewal',false,'entitlement_owner','club_role_slot'
    )
  );

  insert into public.staff_advisory_access(
    user_id,club_id,staff_id,role_type,activated_at,expires_at,last_purchase_id,
    entitlement_state,remaining_paid_seconds,paused_at,resumed_at,last_staff_id,created_at,updated_at
  ) values(
    p_user_id,p_club_id,p_staff_id,v_staff.role_type::text,v_activated_at,v_new_expiry,v_purchase_id,
    'active',0,null,case when v_is_renewal then now() else null end,p_staff_id,now(),now()
  ) on conflict on constraint staff_advisory_access_role_unique do update
  set last_staff_id=coalesce(public.staff_advisory_access.staff_id,public.staff_advisory_access.last_staff_id,excluded.staff_id),
      staff_id=excluded.staff_id,
      activated_at=excluded.activated_at,
      expires_at=excluded.expires_at,
      last_purchase_id=excluded.last_purchase_id,
      entitlement_state='active',remaining_paid_seconds=0,paused_at=null,
      resumed_at=case when public.staff_advisory_access.entitlement_state='paused' then now() else public.staff_advisory_access.resumed_at end,
      updated_at=now();

  update public.staff_advisory_purchases
  set status='completed',ledger_reference=v_system_key,completed_at=now()
  where id=v_purchase_id;

  select coalesce(w.balance,0) into v_balance from public.user_wallets w where w.user_id=p_user_id;
  return query select v_purchase_id,p_staff_id,v_staff.staff_name::text,v_staff.role_type::text,
    v_config.coin_price,coalesce(v_balance,0),v_activated_at,v_new_expiry,v_is_renewal,false;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_build_head_coach_report_v1(p_club_id uuid, p_staff_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_today date := coalesce(public.get_current_game_date_date(), current_date);
  v_total integer := 0;
  v_high_fatigue integer := 0;
  v_elevated_fatigue integer := 0;
  v_not_fully_fit integer := 0;
  v_unavailable integer := 0;
  v_plans integer := 0;
  v_manual_overrides integer := 0;
  v_covered_count integer := 0;
  v_uncovered_count integer := 0;
  v_race_rider_days integer := 0;
  v_camp_rider_days integer := 0;
  v_attention jsonb := '[]'::jsonb;
  v_summary text;
  v_recommendations jsonb := '[]'::jsonb;
  v_staff_name text;
begin
  select s.staff_name
  into v_staff_name
  from public.club_staff s
  where s.id = p_staff_id
    and s.club_id = p_club_id
  limit 1;

  select
    count(*)::integer,
    count(*) filter (where coalesce(r.fatigue, 0) >= 70)::integer,
    count(*) filter (where coalesce(r.fatigue, 0) between 50 and 69)::integer,
    count(*) filter (where coalesce(r.availability_status, 'fit') = 'not_fully_fit')::integer,
    count(*) filter (where coalesce(r.availability_status, 'fit') <> 'fit')::integer
  into
    v_total,
    v_high_fatigue,
    v_elevated_fatigue,
    v_not_fully_fit,
    v_unavailable
  from public.club_riders cr
  join public.riders r on r.id = cr.rider_id
  where cr.club_id = p_club_id;

  select
    w.scheduled_rider_days,
    w.manual_override_rider_days,
    w.covered_rider_days,
    w.uncovered_rider_days,
    w.race_rider_days,
    w.camp_rider_days
  into
    v_plans,
    v_manual_overrides,
    v_covered_count,
    v_uncovered_count,
    v_race_rider_days,
    v_camp_rider_days
  from public.staff_advisory_effective_training_window_v1(
    p_club_id,
    v_today,
    3
  ) w;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'rider_id', x.rider_id,
        'name', x.rider_name,
        'fatigue', x.fatigue,
        'availability', x.availability_status,
        'flag_reason', x.flag_reason
      )
      order by x.priority, x.fatigue desc, x.rider_name
    ),
    '[]'::jsonb
  )
  into v_attention
  from (
    select
      r.id as rider_id,
      coalesce(
        nullif(r.display_name, ''),
        nullif(trim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')), ''),
        r.id::text
      ) as rider_name,
      coalesce(r.fatigue, 0)::integer as fatigue,
      coalesce(r.availability_status, 'fit') as availability_status,
      case
        when coalesce(r.fatigue, 0) >= 70
          and coalesce(r.availability_status, 'fit') <> 'fit'
          then 'High fatigue + not fully available'
        when coalesce(r.fatigue, 0) >= 70 then 'High fatigue'
        when coalesce(r.availability_status, 'fit') <> 'fit' then 'Not fully available'
        when coalesce(r.fatigue, 0) between 50 and 69 then 'Elevated fatigue'
        else 'Monitor'
      end as flag_reason,
      case
        when coalesce(r.fatigue, 0) >= 70 then 1
        when coalesce(r.availability_status, 'fit') <> 'fit' then 2
        when coalesce(r.fatigue, 0) between 50 and 69 then 3
        else 9
      end as priority
    from public.club_riders cr
    join public.riders r on r.id = cr.rider_id
    where cr.club_id = p_club_id
      and (
        coalesce(r.fatigue, 0) >= 50
        or coalesce(r.availability_status, 'fit') <> 'fit'
      )
    order by priority, coalesce(r.fatigue, 0) desc
    limit 8
  ) x;

  if v_high_fatigue > 0 then
    v_recommendations := v_recommendations || jsonb_build_array(
      format('Review and reduce workload where appropriate for the %s rider(s) currently at high fatigue.', v_high_fatigue)
    );
  end if;

  if v_unavailable > 0 then
    v_recommendations := v_recommendations || jsonb_build_array(
      format('Review the %s rider(s) who are not fully available before assigning demanding training or race load.', v_unavailable)
    );
  end if;

  if v_plans = 0 and v_total > 0 and v_uncovered_count > 0 then
    v_recommendations := v_recommendations || jsonb_build_array(
      'No planned regular-training sessions were found in the next three game days. Review the training calendar.'
    );
  end if;

  if jsonb_array_length(v_recommendations) = 0 then
    v_recommendations := jsonb_build_array(
      'No immediate training intervention is recommended. Continue monitoring fatigue and rider availability.'
    );
  end if;

  v_summary := format(
    'Squad review: %s riders, %s at high fatigue, %s at elevated fatigue, %s not fully fit, and %s planned training sessions in the next three game days.',
    v_total, v_high_fatigue, v_elevated_fatigue, v_not_fully_fit, v_plans
  );

  return jsonb_build_object(
    'should_emit', true,
    'report_code', 'weekly_training_readiness',
    'report_variant', case
      when v_high_fatigue = 0 and v_unavailable = 0 and (v_plans > 0 or v_uncovered_count = 0)
        then 'squad_readiness'
      else 'training_readiness'
    end,
    'title', 'Head Coach Advisory — Training & Readiness',
    'summary', v_summary,
    'staff', jsonb_build_object(
      'id', p_staff_id,
      'name', v_staff_name,
      'role', 'Head Coach'
    ),
    'snapshot', jsonb_build_object(
      'squad_riders', v_total,
      'high_fatigue', v_high_fatigue,
      'elevated_fatigue', v_elevated_fatigue,
      'not_fully_fit', v_not_fully_fit,
      'unavailable', v_unavailable,
      'planned_training_sessions_next_3_game_days', v_plans,
      'manual_training_overrides_next_3_game_days', v_manual_overrides,
      'current_game_date', v_today
    ),
    'attention_riders', v_attention,
    'recommendations', v_recommendations,
    'actions', jsonb_build_array(
      jsonb_build_object('label', 'Staff Briefing Centre', 'target', '/dashboard/overview'),
      jsonb_build_object('label', 'Training page', 'target', '/dashboard/training'),
      jsonb_build_object('label', 'Team squad', 'target', '/dashboard/squad'),
      jsonb_build_object('label', 'Staff page', 'target', '/dashboard/staff')
    ),
    'visual_key', 'head_coach_training_readiness',
    'data', jsonb_build_object(
      'current_game_date', v_today,
      'total_riders', v_total,
      'high_fatigue_riders', v_high_fatigue,
      'elevated_fatigue_riders', v_elevated_fatigue,
      'not_fully_fit_riders', v_not_fully_fit,
      'unavailable_riders', v_unavailable,
      'planned_sessions_next_3_game_days', v_plans,
      'manual_overrides_next_3_game_days', v_manual_overrides,
      'riders_needing_attention', v_attention
    )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_build_sport_director_report_v1(p_club_id uuid, p_staff_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_today date := coalesce(public.get_current_game_date_date(), current_date);
  v_staff_name text;

  -- Current operational race: active today first, otherwise next future race.
  v_race_id uuid;
  v_race_name text;
  v_race_start date;
  v_race_end date;
  v_race_timing text;

  v_prep_id uuid;
  v_prep_status text;
  v_startlist_status text;
  v_startlist_done boolean := false;
  v_deadline date;
  v_deadline_status text;

  -- Existing summary counts.
  v_missing_plans integer := 0;
  v_problem_plans integer := 0;
  v_readiness_status text := null;

  -- Precise actionable stage analysis.
  v_missing_analysis jsonb := '{}'::jsonb;
  v_problem_analysis jsonb := '{}'::jsonb;
  v_actionable_missing integer := 0;
  v_actionable_problem integer := 0;
  v_past_missing integer := 0;
  v_past_problem integer := 0;
  v_next_missing_stage jsonb := null;
  v_next_problem_stage jsonb := null;

  -- Programme continuity from migration 018.
  v_programme jsonb := '{}'::jsonb;
  v_programme_status text;
  v_active_race_name text;
  v_active_race_end date;
  v_future_30 integer := 0;
  v_next_future_name text;
  v_next_future_start date;
  v_gap_days integer;

  -- Output.
  v_title text := 'Sports Director Advisory — Race Programme';
  v_variant text := 'race_programme';
  v_summary text;
  v_recommendations jsonb := '[]'::jsonb;
  v_priorities jsonb := '[]'::jsonb;
  v_issue_count integer := 0;
begin
  select s.staff_name
  into v_staff_name
  from public.club_staff s
  where s.id = p_staff_id
    and s.club_id = p_club_id
    and s.is_active = true
    and s.role_type::text = 'sport_director'
  limit 1;

  -- Programme continuity.
  v_programme :=
    public.staff_advisory_sport_director_programme_continuity_v1(p_club_id);

  v_programme_status := nullif(v_programme->>'programme_status', '');
  v_active_race_name := nullif(v_programme->>'active_race_name', '');
  v_active_race_end := nullif(v_programme->>'active_race_end_date', '')::date;
  v_future_30 :=
    coalesce((v_programme->>'future_accepted_races_next_30_game_days')::integer, 0);
  v_next_future_name := nullif(v_programme->>'next_future_race_name', '');
  v_next_future_start := nullif(v_programme->>'next_future_race_start_date', '')::date;
  v_gap_days := nullif(v_programme->>'programme_gap_days', '')::integer;

  -- Operational race: active race first, otherwise next accepted future race.
  select
    r.id,
    r.name,
    r.start_date,
    r.end_date,
    rp.id,
    rp.status,
    rp.startlist_status,
    coalesce(rp.rider_submission_deadline_on, r.start_date - 3)
  into
    v_race_id,
    v_race_name,
    v_race_start,
    v_race_end,
    v_prep_id,
    v_prep_status,
    v_startlist_status,
    v_deadline
  from public.race_team_entries rte
  join public.races r
    on r.id = rte.race_id
  left join public.race_preparations rp
    on rp.race_id = r.id
   and rp.club_id = p_club_id
  where rte.club_id = p_club_id
    and rte.status = 'accepted'
    and r.end_date >= v_today
  order by
    case
      when r.start_date <= v_today and r.end_date >= v_today then 0
      else 1
    end,
    r.start_date,
    r.name
  limit 1;

  if v_race_id is not null then
    v_race_timing :=
      case
        when v_race_start <= v_today and v_race_end >= v_today then 'active'
        when v_race_start = v_today + 1 then 'tomorrow'
        else 'future'
      end;
  end if;

  v_startlist_done :=
    lower(coalesce(v_startlist_status, '')) in (
      'submitted',
      'finalised',
      'finalized',
      'locked',
      'complete',
      'completed',
      'confirmed'
    );

  if v_deadline is not null then
    v_deadline_status :=
      case
        when v_deadline < v_today then 'passed'
        when v_deadline = v_today then 'today'
        when v_deadline <= v_today + 3 then 'approaching'
        else 'future'
      end;
  end if;

  -- Base readiness counts.
  if v_prep_id is not null and v_race_id is not null then
    begin
      select
        coalesce((to_jsonb(rr)->>'missing_stage_plans')::integer, 0),
        coalesce((to_jsonb(rr)->>'incomplete_stage_plans')::integer, 0)
          + coalesce((to_jsonb(rr)->>'saved_but_empty')::integer, 0),
        to_jsonb(rr)->>'readiness_status'
      into
        v_missing_plans,
        v_problem_plans,
        v_readiness_status
      from public.race_stage_plan_readiness_summary_v1(v_prep_id, v_race_id) rr
      limit 1;
    exception
      when others then
        v_missing_plans := 0;
        v_problem_plans := 0;
        v_readiness_status := null;
    end;

    -- Precise missing-stage analysis: ignores past stages when deciding action.
    begin
      v_missing_analysis :=
        public.staff_advisory_sport_director_missing_stage_details_v1(
          v_prep_id,
          v_race_id
        );

      v_actionable_missing :=
        coalesce((v_missing_analysis->>'actionable_missing_stage_count')::integer, 0);
      v_past_missing :=
        coalesce((v_missing_analysis->>'past_missing_stage_count')::integer, 0);
      v_next_missing_stage := v_missing_analysis->'next_missing_stage';
    exception
      when others then
        v_missing_analysis := '{}'::jsonb;
        v_actionable_missing := v_missing_plans;
        v_past_missing := 0;
        v_next_missing_stage := null;
    end;

    -- Precise incomplete-stage analysis.
    begin
      v_problem_analysis :=
        public.staff_advisory_sport_director_problem_stage_details_v1(
          v_prep_id,
          v_race_id
        );

      v_actionable_problem :=
        coalesce((v_problem_analysis->>'actionable_problem_stage_count')::integer, 0);
      v_past_problem :=
        coalesce((v_problem_analysis->>'past_problem_stage_count')::integer, 0);
      v_next_problem_stage := v_problem_analysis->'next_problem_stage';
    exception
      when others then
        v_problem_analysis := '{}'::jsonb;
        v_actionable_problem := v_problem_plans;
        v_past_problem := 0;
        v_next_problem_stage := null;
    end;
  end if;

  -- ==========================================================
  -- Ranked priorities
  -- ==========================================================

  -- Priority 1: no accepted race at all/current operational race.
  if v_race_id is null then
    v_issue_count := v_issue_count + 1;
    v_priorities := v_priorities || jsonb_build_array(
      jsonb_build_object(
        'priority', 1,
        'code', 'programme_empty',
        'label', 'Review race programme',
        'detail', 'No accepted current or upcoming race is available.'
      )
    );

    v_recommendations := v_recommendations || jsonb_build_array(
      'Review race applications and invitations because no accepted current or upcoming race is available.'
    );
  end if;

  -- Priority 2: programme continuity.
  if v_programme_status = 'no_next_race_after_active' then
    v_issue_count := v_issue_count + 1;
    v_priorities := v_priorities || jsonb_build_array(
      jsonb_build_object(
        'priority', 2,
        'code', 'no_next_race_after_active',
        'label', 'Plan the programme after the current race',
        'detail', format(
          'After %s ends on %s, no accepted race is scheduled inside the next 30 game days.',
          coalesce(v_active_race_name, 'the current race'),
          coalesce(v_active_race_end::text, 'its scheduled end date')
        )
      )
    );

    v_recommendations := v_recommendations || jsonb_build_array(
      format(
        'After %s, no accepted race is currently scheduled inside the next 30 game days. Review applications and invitations if this is not intentional.',
        coalesce(v_active_race_name, 'the current race')
      )
    );
  elsif v_programme_status = 'long_break' then
    v_issue_count := v_issue_count + 1;
    v_priorities := v_priorities || jsonb_build_array(
      jsonb_build_object(
        'priority', 2,
        'code', 'long_programme_break',
        'label', 'Review long programme break',
        'detail', format(
          '%s game days separate the programme from %s on %s.',
          coalesce(v_gap_days, 0),
          coalesce(v_next_future_name, 'the next accepted race'),
          coalesce(v_next_future_start::text, 'a future date')
        )
      )
    );

    v_recommendations := v_recommendations || jsonb_build_array(
      format(
        'The next accepted race is %s on %s, leaving a %s-game-day break. Keep it if the break is intentional for training or recovery.',
        coalesce(v_next_future_name, 'the next race'),
        coalesce(v_next_future_start::text, 'a future date'),
        coalesce(v_gap_days, 0)
      )
    );
  end if;

  -- Priority 3: preparation package absent.
  if v_race_id is not null and v_prep_id is null then
    v_issue_count := v_issue_count + 1;
    v_priorities := v_priorities || jsonb_build_array(
      jsonb_build_object(
        'priority', 3,
        'code', 'race_preparation_missing',
        'label', 'Create race preparation',
        'detail', format(
          '%s has no race-preparation package.',
          coalesce(v_race_name, 'The current/next accepted race')
        )
      )
    );

    v_recommendations := v_recommendations || jsonb_build_array(
      format(
        'Create the race-preparation package for %s.',
        coalesce(v_race_name, 'the current/next accepted race')
      )
    );
  end if;

  -- Priority 4: startlist deadline is actionable only when unresolved.
  if v_race_id is not null
     and not v_startlist_done
     and v_deadline_status in ('passed', 'today', 'approaching') then
    v_issue_count := v_issue_count + 1;
    v_priorities := v_priorities || jsonb_build_array(
      jsonb_build_object(
        'priority', 4,
        'code', 'startlist_deadline',
        'label', 'Finalise startlist',
        'detail', case
          when v_deadline_status = 'passed'
            then format('The rider-submission deadline passed on %s.', v_deadline)
          when v_deadline_status = 'today'
            then format('The rider-submission deadline is today (%s).', v_deadline)
          else format('The rider-submission deadline is approaching on %s.', v_deadline)
        end
      )
    );

    v_recommendations := v_recommendations || jsonb_build_array(
      case
        when v_deadline_status = 'passed'
          then 'The startlist is still unresolved after the rider-submission deadline. Review it immediately.'
        when v_deadline_status = 'today'
          then 'Finalise and submit the rider list today.'
        else 'Finalise the rider list before the upcoming submission deadline.'
      end
    );
  end if;

  -- Priority 5: actionable missing stages.
  if v_actionable_missing > 0 then
    v_issue_count := v_issue_count + 1;
    v_priorities := v_priorities || jsonb_build_array(
      jsonb_build_object(
        'priority', 5,
        'code', 'stage_plans_missing',
        'label', case
          when v_actionable_missing = 1
            then 'Complete 1 missing stage plan'
          else format('Complete %s missing stage plans', v_actionable_missing)
        end,
        'detail', case
          when v_next_missing_stage is not null
               and jsonb_typeof(v_next_missing_stage) = 'object'
            then format(
              'Stage %s on %s is the next missing plan.',
              coalesce(v_next_missing_stage->>'stage_number', '?'),
              coalesce(v_next_missing_stage->>'stage_date', 'unknown date')
            )
          else 'One or more future/current stage plans are missing.'
        end
      )
    );

    v_recommendations := v_recommendations || jsonb_build_array(
      case
        when v_actionable_missing = 1
          then 'Complete the remaining actionable missing stage plan.'
        else format(
          'Complete the %s actionable missing stage plans, starting with the most urgent stage.',
          v_actionable_missing
        )
      end
    );
  end if;

  -- Priority 6: actionable incomplete stages.
  if v_actionable_problem > 0 then
    v_issue_count := v_issue_count + 1;
    v_priorities := v_priorities || jsonb_build_array(
      jsonb_build_object(
        'priority', 6,
        'code', 'stage_plans_incomplete',
        'label', case
          when v_actionable_problem = 1
            then 'Review 1 incomplete stage plan'
          else format('Review %s incomplete stage plans', v_actionable_problem)
        end,
        'detail', case
          when v_next_problem_stage is not null
               and jsonb_typeof(v_next_problem_stage) = 'object'
            then format(
              'Stage %s on %s is the next incomplete/problem plan.',
              coalesce(v_next_problem_stage->>'stage_number', '?'),
              coalesce(v_next_problem_stage->>'stage_date', 'unknown date')
            )
          else 'One or more future/current stage plans are incomplete or empty.'
        end
      )
    );

    v_recommendations := v_recommendations || jsonb_build_array(
      case
        when v_actionable_problem = 1
          then 'Review and complete the remaining actionable incomplete stage plan.'
        else format(
          'Review and complete the %s actionable incomplete stage plans.',
          v_actionable_problem
        )
      end
    );
  end if;

  -- ==========================================================
  -- Summary / positive variant
  -- ==========================================================
  if v_issue_count = 0 and v_race_id is not null then
    v_title := 'Sports Director Advisory — Race Preparation Ready';
    v_variant := 'race_preparation_ready';

    v_summary := format(
      '%s is in order. The startlist is %s, no actionable stage-plan problem is detected, and the programme continues with %s%s.',
      coalesce(v_race_name, 'The current/next race'),
      coalesce(v_startlist_status, 'ready'),
      coalesce(v_next_future_name, 'the next accepted race'),
      case
        when v_next_future_start is not null
          then format(' on %s', v_next_future_start)
        else ''
      end
    );

    v_recommendations := jsonb_build_array(
      'No immediate Sports Director intervention is required. Continue monitoring the race programme and preparation status.'
    );
  else
    v_title := 'Sports Director Advisory — Race Programme';
    v_variant := 'race_programme';

    if v_race_id is null then
      v_summary := format(
        'Race programme review: no accepted current/upcoming race is available; %s future accepted race(s) start inside the next 30 game days.',
        v_future_30
      );
    elsif v_race_timing = 'active' then
      v_summary := format(
        'Current race: %s (%s–%s). Next accepted future race: %s%s. %s management priority item(s) require review.',
        v_race_name,
        v_race_start,
        v_race_end,
        coalesce(v_next_future_name, 'none currently scheduled'),
        case
          when v_next_future_start is not null
            then format(' on %s', v_next_future_start)
          else ''
        end,
        v_issue_count
      );
    else
      v_summary := format(
        'Next race: %s on %s. Programme status: %s. %s management priority item(s) require review.',
        v_race_name,
        v_race_start,
        coalesce(v_programme_status, 'unknown'),
        v_issue_count
      );
    end if;
  end if;

  return jsonb_build_object(
    'should_emit', true,
    'report_code', 'weekly_race_programme',
    'report_variant', v_variant,
    'title', v_title,
    'summary', v_summary,
    'staff', jsonb_build_object(
      'id', p_staff_id,
      'name', v_staff_name,
      'role', 'Sports Director'
    ),
    'data', jsonb_build_object(
      'current_game_date', v_today,

      'current_focus_race_id', v_race_id,
      'current_focus_race_name', v_race_name,
      'current_focus_race_start_date', v_race_start,
      'current_focus_race_end_date', v_race_end,
      'current_focus_race_timing', v_race_timing,

      -- Backward-compatible keys used by the current notification template.
      'next_race_id', v_race_id,
      'next_race_name', v_race_name,
      'next_race_start_date', v_race_start,

      'race_preparation_id', v_prep_id,
      'race_preparation_status', v_prep_status,
      'startlist_status', v_startlist_status,
      'startlist_done', v_startlist_done,
      'rider_submission_deadline_on', v_deadline,
      'deadline_status', v_deadline_status,

      'missing_stage_plans', v_missing_plans,
      'problem_stage_plans', v_problem_plans,
      'actionable_missing_stage_plans', v_actionable_missing,
      'actionable_problem_stage_plans', v_actionable_problem,
      'past_missing_stage_plans', v_past_missing,
      'past_problem_stage_plans', v_past_problem,
      'readiness_status', v_readiness_status,
      'next_missing_stage', v_next_missing_stage,
      'next_problem_stage', v_next_problem_stage,

      'programme_status', v_programme_status,
      'active_race_name', v_active_race_name,
      'active_race_end_date', v_active_race_end,
      'future_accepted_races_next_30_game_days', v_future_30,
      'next_future_race_name', v_next_future_name,
      'next_future_race_start_date', v_next_future_start,
      'programme_gap_days', v_gap_days,

      -- Backward-compatible aggregate key.
      'accepted_races_next_30_game_days', v_future_30,

      'management_priority_count', v_issue_count
    ),
    'management_priorities', v_priorities,
    'recommendations', v_recommendations,
    'actions', jsonb_build_array(
      jsonb_build_object('label', 'Staff Briefing Centre', 'target', '/dashboard/overview'),
      jsonb_build_object('label', 'Race Preparation', 'target', '/dashboard/race-preparation'),
      jsonb_build_object('label', 'Races', 'target', '/dashboard/races'),
      jsonb_build_object('label', 'Staff page', 'target', '/dashboard/staff')
    ),
    'visual_key', 'sport_director_race_programme',
    'image_url',
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Sport%20Director%20Advisory.png'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_build_team_doctor_report_v1(p_club_id uuid, p_staff_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_today date := coalesce(public.get_current_game_date_date(), current_date);
  v_staff_name text;

  v_injured integer := 0;
  v_sick integer := 0;
  v_active_cases integer := 0;
  v_recovering_cases integer := 0;

  v_total_base_days integer := 0;
  v_total_final_days integer := 0;
  v_total_days_saved integer := 0;
  v_max_reduction_pct numeric := 0;

  v_cases jsonb := '[]'::jsonb;
  v_summary text;
  v_recommendations jsonb := '[]'::jsonb;
  v_variant text := 'medical_treatment_report';
begin
  select s.staff_name
  into v_staff_name
  from public.club_staff s
  where s.id = p_staff_id
    and s.club_id = p_club_id
    and s.is_active = true
    and s.role_type::text = 'team_doctor'
  limit 1;

  select
    count(*) filter (where lower(coalesce(h.availability_status, '')) = 'injured')::integer,
    count(*) filter (where lower(coalesce(h.availability_status, '')) = 'sick')::integer,
    count(*) filter (where h.health_case_id is not null)::integer,
    count(*) filter (where lower(coalesce(h.case_status, '')) = 'recovering')::integer,
    coalesce(sum(h.selected_base_days) filter (where h.health_case_id is not null), 0)::integer,
    coalesce(sum(h.final_recovery_days) filter (where h.health_case_id is not null), 0)::integer,
    coalesce(sum(greatest(coalesce(h.selected_base_days, 0) - coalesce(h.final_recovery_days, 0), 0))
      filter (where h.health_case_id is not null), 0)::integer,
    coalesce(max(h.total_reduction_pct) filter (where h.health_case_id is not null), 0)
  into
    v_injured,
    v_sick,
    v_active_cases,
    v_recovering_cases,
    v_total_base_days,
    v_total_final_days,
    v_total_days_saved,
    v_max_reduction_pct
  from public.get_club_health_overview(p_club_id) h
  where lower(coalesce(h.availability_status, '')) in ('injured', 'sick')
     or h.health_case_id is not null;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'rider_id', x.rider_id,
        'rider_name', x.display_name,
        'country_code', x.country_code,
        'availability_status', x.availability_status,

        'health_case_id', x.health_case_id,
        'case_type', x.case_type,
        'case_code', x.case_code,
        'case_label',
          coalesce(
            nullif(x.health_notes #>> '{calculation,display_name}', ''),
            initcap(replace(coalesce(x.case_code, x.case_type, 'medical case'), '_', ' '))
          ),
        'severity', x.severity,
        'body_part', x.body_part,
        'case_status', x.case_status,
        'started_on', x.started_on,

        'unavailable_until', x.unavailable_until,
        'expected_full_recovery_on', x.expected_full_recovery_on,
        'days_remaining',
          case
            when x.expected_full_recovery_on is not null
              then greatest(x.expected_full_recovery_on - v_today, 0)
            else null
          end,

        'base_min_days', x.base_min_days,
        'base_max_days', x.base_max_days,
        'selected_base_days', x.selected_base_days,

        'medical_staff_reduction_pct', x.medical_staff_reduction_pct,
        'infrastructure_reduction_pct', x.infrastructure_reduction_pct,
        'total_reduction_pct', x.total_reduction_pct,
        'final_recovery_days', x.final_recovery_days,

        'recovery_days_saved',
          greatest(
            coalesce(x.selected_base_days, 0) -
            coalesce(x.final_recovery_days, 0),
            0
          ),

        'treatment_impact',
          case
            when x.selected_base_days is not null
             and x.final_recovery_days is not null
             and x.selected_base_days > x.final_recovery_days
              then format(
                'Medical support reduces this case from %s to %s game days, saving %s full game day%s.',
                x.selected_base_days,
                x.final_recovery_days,
                x.selected_base_days - x.final_recovery_days,
                case when x.selected_base_days - x.final_recovery_days = 1 then '' else 's' end
              )
            when coalesce(x.total_reduction_pct, 0) > 0
             and x.final_recovery_days is not null
              then format(
                'Medical support applies a %s%% recovery-duration reduction. Because this is a short case, whole-day rounding keeps the adjusted duration at %s game day%s.',
                round(x.total_reduction_pct, 2),
                x.final_recovery_days,
                case when x.final_recovery_days = 1 then '' else 's' end
              )
            when x.final_recovery_days is not null
              then format(
                'Current adjusted recovery duration is %s game day%s.',
                x.final_recovery_days,
                case when x.final_recovery_days = 1 then '' else 's' end
              )
            else
              'No precise adjusted recovery duration is stored for this case.'
          end,

        'unavailable_reason', x.unavailable_reason,
        'health_notes', x.health_notes
      )
      order by
        x.expected_full_recovery_on nulls last,
        x.display_name
    ),
    '[]'::jsonb
  )
  into v_cases
  from public.get_club_health_overview(p_club_id) x
  where lower(coalesce(x.availability_status, '')) in ('injured', 'sick')
     or x.health_case_id is not null;

  if v_active_cases = 0 and v_injured = 0 and v_sick = 0 then
    v_variant := 'medical_status_stable';
    v_summary :=
      'No active injury or sickness case currently requires medical treatment.';

    v_recommendations := jsonb_build_array(
      'No active medical treatment case requires intervention. Continue normal medical monitoring and prevention.'
    );
  else
    if v_total_days_saved > 0 then
      v_summary := format(
        'Medical review: %s injured, %s sick, %s active/recovering health case%s. Current medical support is saving %s full recovery game day%s across the listed cases.',
        v_injured,
        v_sick,
        v_active_cases,
        case when v_active_cases = 1 then '' else 's' end,
        v_total_days_saved,
        case when v_total_days_saved = 1 then '' else 's' end
      );
    elsif v_max_reduction_pct > 0 then
      v_summary := format(
        'Medical review: %s injured, %s sick, %s active/recovering health case%s. Medical support is applying up to %s%% recovery-duration reduction; these short cases currently round to the same whole-day duration.',
        v_injured,
        v_sick,
        v_active_cases,
        case when v_active_cases = 1 then '' else 's' end,
        round(v_max_reduction_pct, 2)
      );
    else
      v_summary := format(
        'Medical review: %s injured, %s sick, %s active/recovering health case%s. No recovery-duration reduction is currently being applied.',
        v_injured,
        v_sick,
        v_active_cases,
        case when v_active_cases = 1 then '' else 's' end
      );
    end if;

    if v_injured > 0 then
      v_recommendations := v_recommendations || jsonb_build_array(
        case
          when v_injured = 1
            then '1 rider is currently injured. Review the treatment plan and expected return before race or training selection.'
          else format(
            '%s riders are currently injured. Review their treatment plans and expected return dates before race or training selection.',
            v_injured
          )
        end
      );
    end if;

    if v_sick > 0 then
      v_recommendations := v_recommendations || jsonb_build_array(
        case
          when v_sick = 1
            then '1 rider is currently sick. Follow the expected recovery date before returning the rider to normal workload.'
          else format(
            '%s riders are currently sick. Follow their expected recovery dates before returning them to normal workload.',
            v_sick
          )
        end
      );
    end if;

    if v_total_days_saved > 0 then
      v_recommendations := v_recommendations || jsonb_build_array(
        format(
          'Current medical staff and infrastructure effects are reducing the listed recovery periods by %s game day%s in total.',
          v_total_days_saved,
          case when v_total_days_saved = 1 then '' else 's' end
        )
      );
    end if;
  end if;

  return jsonb_build_object(
    'should_emit', true,
    'report_code', 'weekly_medical_treatment',
    'report_variant', v_variant,
    'title', 'Team Doctor Advisory — Medical & Treatment Report',
    'summary', v_summary,
    'staff', jsonb_build_object(
      'id', p_staff_id,
      'name', v_staff_name,
      'role', 'Team Doctor'
    ),
    'data', jsonb_build_object(
      'current_game_date', v_today,
      'injured_riders', v_injured,
      'sick_riders', v_sick,
      'active_or_recovering_health_cases', v_active_cases,
      'recovering_cases', v_recovering_cases,
      'total_selected_base_recovery_days', v_total_base_days,
      'total_adjusted_recovery_days', v_total_final_days,
      'total_recovery_days_saved', v_total_days_saved,
      'max_recovery_reduction_pct', round(v_max_reduction_pct, 2),
      'health_cases', v_cases
    ),
    'recommendations', v_recommendations,
    'actions', jsonb_build_array(
      jsonb_build_object('label', 'Staff Briefing Centre', 'target', '/dashboard/overview'),
      jsonb_build_object('label', 'Squad', 'target', '/dashboard/squad'),
      jsonb_build_object('label', 'Staff', 'target', '/dashboard/staff')
    ),
    'visual_key', 'team_doctor_medical_treatment'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_build_mechanic_report_v1(p_club_id uuid, p_staff_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_staff_name text;
  v_total integer := 0;
  v_ready integer := 0;
  v_maintenance integer := 0;
  v_critical integer := 0;
  v_avg numeric := 0;
  v_pending_jobs integer := 0;

  v_empty_supplies integer := 0;
  v_low_supplies integer := 0;

  v_problem_items jsonb := '[]'::jsonb;
  v_supply_rows jsonb := '[]'::jsonb;
  v_category_summary jsonb := '[]'::jsonb;
  v_mechanic_effects jsonb := '{}'::jsonb;

  v_summary text;
  v_recommendations jsonb := '[]'::jsonb;
  v_variant text := 'equipment_workshop_review';
begin
  select s.staff_name
  into v_staff_name
  from public.club_staff s
  where s.id = p_staff_id
    and s.club_id = p_club_id
    and s.is_active = true
    and s.role_type::text = 'mechanic'
  limit 1;

  select
    count(*)::integer,
    count(*) filter (where status = 'ready')::integer,
    count(*) filter (
      where status in ('worn', 'in_maintenance')
         or condition_percent < 70
    )::integer,
    count(*) filter (
      where condition_percent < 30
        and status not in ('sold', 'discarded')
    )::integer,
    coalesce(round(avg(condition_percent), 1), 0)
  into
    v_total,
    v_ready,
    v_maintenance,
    v_critical,
    v_avg
  from public.club_equipment_inventory
  where club_id = p_club_id
    and status not in ('sold', 'discarded');

  select count(*)::integer
  into v_pending_jobs
  from public.club_equipment_maintenance_jobs
  where club_id = p_club_id
    and status = 'pending';

  -- Exact equipment items needing attention.
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'equipment_id', x.id,
        'equipment_category', x.equipment_category,
        'category_label', initcap(replace(x.equipment_category, '_', ' ')),
        'display_name', x.display_name,
        'condition_percent', x.condition_percent,
        'status', x.status,
        'status_label', initcap(replace(x.status, '_', ' ')),
        'total_race_days', x.total_race_days,
        'last_used_game_date', x.last_used_game_date,
        'priority',
          case
            when x.condition_percent < 30 then 'critical'
            when x.status = 'in_maintenance' then 'in_maintenance'
            when x.condition_percent < 50 then 'high'
            else 'watch'
          end
      )
      order by x.condition_percent asc, x.display_name
    ),
    '[]'::jsonb
  )
  into v_problem_items
  from (
    select
      id,
      equipment_category,
      display_name,
      condition_percent,
      status,
      total_race_days,
      last_used_game_date
    from public.club_equipment_inventory
    where club_id = p_club_id
      and status not in ('sold', 'discarded')
      and (
        condition_percent < 70
        or status in ('worn', 'in_maintenance')
      )
    order by condition_percent asc, display_name
    limit 12
  ) x;

  -- Category overview.
  with cats(category, label, sort_order) as (
    values
      ('frame'::text, 'Frames'::text, 1),
      ('wheelset', 'Wheelsets', 2),
      ('tires', 'Tires', 3),
      ('groupset', 'Groupsets', 4),
      ('helmet', 'Helmets', 5),
      ('shoes', 'Shoes', 6)
  ),
  stats as (
    select
      c.category,
      c.label,
      c.sort_order,
      count(e.id)::integer as owned_count,
      count(e.id) filter (where e.status = 'ready')::integer as ready_count,
      count(e.id) filter (
        where e.status in ('worn', 'in_maintenance')
           or e.condition_percent < 70
      )::integer as attention_count,
      coalesce(round(avg(e.condition_percent), 1), 0) as average_condition_percent
    from cats c
    left join public.club_equipment_inventory e
      on e.club_id = p_club_id
     and e.equipment_category = c.category
     and e.status not in ('sold', 'discarded')
    group by c.category, c.label, c.sort_order
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'equipment_category', category,
        'display_name', label,
        'owned_count', owned_count,
        'ready_count', ready_count,
        'attention_count', attention_count,
        'average_condition_percent', average_condition_percent
      )
      order by sort_order
    ),
    '[]'::jsonb
  )
  into v_category_summary
  from stats;

  -- Canonical five race supplies.
  -- Thresholds deliberately match the existing Free/core low-stock logic.
  with supply_defs(
    supply_key,
    display_name,
    warning_threshold,
    sort_order
  ) as (
    values
      ('bidons_water_bottles'::text, 'Bidons / Water Bottles'::text, 10::integer, 1),
      ('energy_gels', 'Energy Gels', 10, 2),
      ('nutrition_packs', 'Nutrition Packs', 20, 3),
      ('race_jersey_complete', 'Race Jersey Complete', 3, 4),
      ('rain_jackets', 'Rain Jackets', 3, 5)
  ),
  canonical as (
    select
      sd.supply_key,
      sd.display_name,
      sd.warning_threshold,
      sd.sort_order,
      coalesce(crs.quantity_available, 0)::integer as quantity_available,
      coalesce(crs.total_purchased, 0)::integer as total_purchased,
      coalesce(crs.total_used, 0)::integer as total_used,
      crs.last_used_game_date
    from supply_defs sd
    left join public.club_race_supplies crs
      on crs.club_id = p_club_id
     and crs.supply_key = sd.supply_key
  )
  select
    count(*) filter (where quantity_available = 0)::integer,
    count(*) filter (
      where quantity_available > 0
        and quantity_available <= warning_threshold
    )::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'supply_key', supply_key,
          'display_name', display_name,
          'quantity_available', quantity_available,
          'warning_threshold', warning_threshold,
          'total_purchased', total_purchased,
          'total_used', total_used,
          'last_used_game_date', last_used_game_date,
          'stock_status',
            case
              when quantity_available = 0 then 'empty'
              when quantity_available <= warning_threshold then 'low'
              else 'ok'
            end,
          'stock_status_label',
            case
              when quantity_available = 0 then 'Empty'
              when quantity_available <= warning_threshold then 'Low'
              else 'OK'
            end
        )
        order by sort_order
      ),
      '[]'::jsonb
    )
  into
    v_empty_supplies,
    v_low_supplies,
    v_supply_rows
  from canonical;

  -- Use the real mechanic-effect calculator when available.
  begin
    select coalesce(
      public.equipment_get_mechanic_effects_v1(
        p_club_id,
        null::uuid[]
      ),
      '{}'::jsonb
    )
    into v_mechanic_effects;
  exception when others then
    v_mechanic_effects := '{}'::jsonb;
  end;

  if v_critical > 0 then
    v_recommendations := v_recommendations || jsonb_build_array(
      case
        when v_critical = 1
          then '1 equipment item is below 30% condition and should receive immediate workshop attention.'
        else format(
          '%s equipment items are below 30%% condition and should receive immediate workshop attention.',
          v_critical
        )
      end
    );
  end if;

  if v_maintenance > 0 then
    v_recommendations := v_recommendations || jsonb_build_array(
      case
        when v_maintenance = 1
          then '1 equipment item is worn, in maintenance, or below 70% condition. Review its workshop priority.'
        else format(
          '%s equipment items are worn, in maintenance, or below 70%% condition. Review workshop priorities.',
          v_maintenance
        )
      end
    );
  end if;

  if v_pending_jobs > 0 then
    v_recommendations := v_recommendations || jsonb_build_array(
      case
        when v_pending_jobs = 1
          then '1 maintenance job is pending in the workshop queue.'
        else format(
          '%s maintenance jobs are pending in the workshop queue.',
          v_pending_jobs
        )
      end
    );
  end if;

  if v_empty_supplies > 0 or v_low_supplies > 0 then
    v_recommendations := v_recommendations || jsonb_build_array(
      format(
        'Race-supply review: %s empty and %s low stock type%s. The normal Free low-stock warning remains independent of this advisory.',
        v_empty_supplies,
        v_low_supplies,
        case when v_empty_supplies + v_low_supplies = 1 then '' else 's' end
      )
    );
  end if;

  if v_maintenance = 0
     and v_critical = 0
     and v_pending_jobs = 0
     and v_empty_supplies = 0
     and v_low_supplies = 0
  then
    v_variant := 'workshop_ready';
    v_summary := format(
      'Workshop review: all %s active equipment items are in acceptable condition, average condition is %s%%, no maintenance job is pending, and all five race-supply types are above their warning thresholds.',
      v_total,
      v_avg
    );

    v_recommendations := jsonb_build_array(
      'No immediate workshop intervention is required. Continue normal equipment monitoring before race preparation.'
    );
  else
    v_summary := format(
      'Workshop review: %s active equipment items, %s ready, average condition %s%%, %s needing attention, %s critical, %s pending maintenance jobs, %s empty supply types and %s low supply types.',
      v_total,
      v_ready,
      v_avg,
      v_maintenance,
      v_critical,
      v_pending_jobs,
      v_empty_supplies,
      v_low_supplies
    );
  end if;

  return jsonb_build_object(
    'should_emit', true,
    'report_code', 'weekly_equipment_workshop_review',
    'report_variant', v_variant,
    'title', 'Chief Mechanic Advisory — Equipment & Workshop Review',
    'summary', v_summary,
    'image_url', 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Chief%20Mechanic%20Advisory.png',
    'staff', jsonb_build_object(
      'id', p_staff_id,
      'name', v_staff_name,
      'role', 'Chief Mechanic'
    ),
    'data', jsonb_build_object(
      'total_items', v_total,
      'ready_items', v_ready,
      'average_condition_percent', v_avg,
      'maintenance_needed', v_maintenance,
      'critical_items', v_critical,
      'pending_maintenance_jobs', v_pending_jobs,
      'empty_supply_types', v_empty_supplies,
      'low_supply_types', v_low_supplies,
      'equipment_needing_attention', v_problem_items,
      'equipment_categories', v_category_summary,
      'race_supplies', v_supply_rows,
      'mechanic_effects', v_mechanic_effects
    ),
    'recommendations', v_recommendations,
    'actions', jsonb_build_array(
      jsonb_build_object(
        'label', 'Staff Briefing Centre',
        'target', '/dashboard/overview'
      ),
      jsonb_build_object(
        'label', 'Equipment',
        'target', '/dashboard/equipment'
      ),
      jsonb_build_object(
        'label', 'Maintenance',
        'target', '/dashboard/equipment?tab=maintenance'
      ),
      jsonb_build_object(
        'label', 'Race Supplies',
        'target', '/dashboard/equipment?tab=race-supplies'
      )
    ),
    'visual_key', 'chief_mechanic_equipment_workshop'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_build_scout_report_v1(p_club_id uuid, p_staff_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_staff_name text;
  v_total integer := 0;
  v_recent integer := 0;
  v_high_potential integer := 0;
  v_active_tasks integer := 0;
  v_recent_reports jsonb := '[]'::jsonb;
  v_active_task_rows jsonb := '[]'::jsonb;
  v_summary text;
  v_recommendations jsonb := '[]'::jsonb;
  v_variant text := 'recruitment_review';
begin
  select s.staff_name
  into v_staff_name
  from public.club_staff s
  where s.id = p_staff_id
    and s.club_id = p_club_id
    and s.is_active = true
    and s.role_type::text = 'scout_analyst'
  limit 1;

  select
    count(*)::integer,
    count(*) filter (
      where rsr.created_at >= now() - interval '7 days'
    )::integer,
    count(*) filter (
      where nullif(rsr.report_json #>> '{potential,exact}', '')::numeric >= 65
    )::integer
  into
    v_total,
    v_recent,
    v_high_potential
  from public.rider_scout_reports rsr
  where rsr.club_id = p_club_id;

  select count(*)::integer
  into v_active_tasks
  from public.rider_scout_tasks rst
  where rst.club_id = p_club_id
    and rst.status in ('queued', 'active', 'in_progress', 'pending');

  select coalesce(
    jsonb_agg(to_jsonb(x) order by x.completed_real_at desc nulls last),
    '[]'::jsonb
  )
  into v_recent_reports
  from (
    select
      rsr.id as report_id,
      rsr.rider_id,
      coalesce(
        nullif(trim(concat_ws(' ', r.first_name, r.last_name)), ''),
        nullif(r.display_name, ''),
        nullif(rsr.report_json->>'rider_name', ''),
        'Unknown rider'
      ) as rider_name,
      r.first_name as rider_first_name,
      r.last_name as rider_last_name,
      nullif(trim(concat_ws(' ', r.first_name, r.last_name)), '') as rider_full_name,
      r.country_code as rider_country_code,
      rsr.scout_staff_id,
      coalesce(cs.staff_name, v_staff_name, 'Scout') as scout_name,
      rsr.created_at as completed_real_at,
      coalesce(
        rsr.created_at_game_ts,
        rsr.scouted_on_game_date::timestamp
      ) as completed_game_at,
      rsr.scouted_on_game_date,
      rsr.precision_score,
      rsr.precision_tier,
      rsr.review_status,
      coalesce(
        rsr.report_json #>> '{overall,label}',
        rsr.report_json #>> '{overall,exact}',
        '—'
      ) as overall_label,
      nullif(rsr.report_json #>> '{overall,exact}', '')::numeric as overall_exact,
      nullif(rsr.report_json #>> '{potential,exact}', '')::numeric as potential_exact,
      case
        when nullif(rsr.report_json #>> '{potential,exact}', '')::numeric >= 80 then 'Elite'
        when nullif(rsr.report_json #>> '{potential,exact}', '')::numeric >= 65 then 'High'
        when nullif(rsr.report_json #>> '{potential,exact}', '')::numeric >= 45 then 'Medium'
        when nullif(rsr.report_json #>> '{potential,exact}', '')::numeric >= 25 then 'Low'
        else 'Very Low'
      end as potential_label,
      (
        select coalesce(jsonb_agg(z.label order by z.val desc), '[]'::jsonb)
        from (
          select
            initcap(replace(e.key, '_', ' ')) as label,
            nullif(e.value->>'exact', '')::numeric as val
          from jsonb_each(coalesce(rsr.report_json->'attributes', '{}'::jsonb)) e
          where e.value ? 'exact'
            and nullif(e.value->>'exact', '') is not null
          order by nullif(e.value->>'exact', '')::numeric desc
          limit 3
        ) z
      ) as strengths,
      nullif(rsr.report_json->>'notes', '') as notes,
      '/dashboard/external-riders/' || rsr.rider_id::text as rider_profile_path
    from public.rider_scout_reports rsr
    left join public.riders r
      on r.id = rsr.rider_id
    left join public.club_staff cs
      on cs.id = rsr.scout_staff_id
    where rsr.club_id = p_club_id
    order by rsr.created_at desc
    limit 8
  ) x;

  select coalesce(
    jsonb_agg(to_jsonb(x) order by x.completes_at_game_ts nulls last),
    '[]'::jsonb
  )
  into v_active_task_rows
  from (
    select
      rst.id as task_id,
      rst.rider_id,
      coalesce(
        nullif(trim(concat_ws(' ', r.first_name, r.last_name)), ''),
        nullif(r.display_name, ''),
        'Unknown rider'
      ) as rider_name,
      r.first_name as rider_first_name,
      r.last_name as rider_last_name,
      nullif(trim(concat_ws(' ', r.first_name, r.last_name)), '') as rider_full_name,
      r.country_code as rider_country_code,
      rst.scout_staff_id,
      coalesce(cs.staff_name, v_staff_name, 'Scout') as scout_name,
      rst.status,
      rst.precision_score,
      rst.precision_tier,
      rst.duration_hours,
      rst.started_at_game_ts,
      rst.completes_at_game_ts,
      rst.is_paid,
      rst.coin_cost,
      '/dashboard/external-riders/' || rst.rider_id::text as rider_profile_path
    from public.rider_scout_tasks rst
    left join public.riders r
      on r.id = rst.rider_id
    left join public.club_staff cs
      on cs.id = rst.scout_staff_id
    where rst.club_id = p_club_id
      and rst.status in ('queued', 'active', 'in_progress', 'pending')
    order by rst.completes_at_game_ts nulls last
    limit 8
  ) x;

  if v_recent = 0 then
    v_variant := 'scouting_activity_gap';
    v_recommendations := v_recommendations || jsonb_build_array(
      'No scouting report was completed in the last seven real-life days. Review the current scouting assignment and consider starting a new target if the scout is idle.'
    );
  else
    v_recommendations := v_recommendations || jsonb_build_array(
      format(
        '%s scouting report%s completed in the last seven real-life days. Review the newest intelligence before choosing the next target.',
        v_recent,
        case when v_recent = 1 then ' was' else 's were' end
      )
    );
  end if;

  if v_high_potential > 0 then
    v_recommendations := v_recommendations || jsonb_build_array(
      format(
        '%s known report%s currently fall in the High or Elite potential bands. Revisit these riders when planning recruitment priorities.',
        v_high_potential,
        case when v_high_potential = 1 then '' else 's' end
      )
    );
  end if;

  if v_active_tasks = 0 then
    v_recommendations := v_recommendations || jsonb_build_array(
      'No active scouting assignment is currently recorded for the club.'
    );
  end if;

  v_summary := format(
    'Recruitment review: %s completed scouting reports, %s completed in the last seven real-life days, %s High or Elite potential reports, and %s active scouting assignment%s.',
    v_total,
    v_recent,
    v_high_potential,
    v_active_tasks,
    case when v_active_tasks = 1 then '' else 's' end
  );

  return jsonb_build_object(
    'should_emit', true,
    'report_code', 'weekly_recruitment_review',
    'report_variant', v_variant,
    'title', 'Scout Advisory — Recruitment & Scouting Review',
    'summary', v_summary,
    'image_url', 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Chief%20Scout%20Advisory.png',
    'staff', jsonb_build_object(
      'id', p_staff_id,
      'name', v_staff_name,
      'role', 'Scout'
    ),
    'data', jsonb_build_object(
      'completed_reports', v_total,
      'reports_last_7_real_days', v_recent,
      'high_or_elite_potential_reports', v_high_potential,
      'active_scouting_tasks', v_active_tasks,
      'recent_known_reports', v_recent_reports,
      'active_tasks', v_active_task_rows
    ),
    'recommendations', v_recommendations,
    'actions', jsonb_build_array(
      jsonb_build_object(
        'label', 'Staff Briefing Centre',
        'target', '/dashboard/overview'
      ),
      jsonb_build_object(
        'label', 'Scouting',
        'target', '/dashboard/scouting'
      )
    ),
    'visual_key', 'scout_recruitment_review'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_generate_one_due_report_v1(p_access_id uuid, p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_access public.staff_advisory_access%rowtype;
  v_staff public.club_staff%rowtype;
  v_report jsonb;
  v_report_code text;
  v_period_key text;
  v_notification_type text;
  v_report_id uuid;
  v_notification_id bigint;
  v_event_key text;
  v_payload jsonb;
  v_title text;
  v_summary text;
  v_action_url text;
  v_advisor_rating integer;
begin
  select *
  into v_access
  from public.staff_advisory_access a
  where a.id = p_access_id;

  if not found then
    return jsonb_build_object('status', 'skipped', 'reason', 'access_not_found');
  end if;

  if v_access.expires_at <= public.staff_advisory_game_now_v1() then
    return jsonb_build_object('status', 'skipped', 'reason', 'advisor_expired');
  end if;

  select *
  into v_staff
  from public.club_staff s
  where s.id = v_access.staff_id
    and s.club_id = v_access.club_id
    and s.is_active = true
    and s.role_type::text = v_access.role_type;

  if not found then
    return jsonb_build_object('status', 'skipped', 'reason', 'advisor_staff_not_active_or_role_changed');
  end if;

  -- All scheduled Staff Advisory reports use one real-life ISO-week period.
  -- Team Doctor condition/event advisories are handled separately by the
  -- medical event scanner; the regular Medical & Treatment Report is weekly.
  v_period_key := to_char(current_date, 'IYYY-"W"IW');

  case v_access.role_type
    when 'head_coach' then
      v_report := public.staff_advisory_build_head_coach_report_v1(v_access.club_id, v_access.staff_id);
    when 'sport_director' then
      v_report := public.staff_advisory_build_sport_director_report_v1(v_access.club_id, v_access.staff_id);
    when 'team_doctor' then
      v_report := public.staff_advisory_build_team_doctor_report_v1(v_access.club_id, v_access.staff_id);
    when 'mechanic' then
      v_report := public.staff_advisory_build_mechanic_report_v1(v_access.club_id, v_access.staff_id);
    when 'scout_analyst' then
      v_report := public.staff_advisory_build_scout_report_v1(v_access.club_id, v_access.staff_id);
    else
      return jsonb_build_object('status', 'skipped', 'reason', 'unsupported_role');
  end case;

  if coalesce((v_report->>'should_emit')::boolean, false) = false then
    return jsonb_build_object(
      'status', 'skipped',
      'reason', 'no_meaningful_report',
      'role_type', v_access.role_type,
      'period_key', v_period_key
    );
  end if;

  v_report_code := nullif(v_report->>'report_code', '');
  v_title := coalesce(nullif(v_report->>'title', ''), 'Staff Advisory');
  v_summary := coalesce(nullif(v_report->>'summary', ''), 'Advisor report available.');

  if v_report_code is null then
    raise exception 'Staff Advisory report builder returned no report_code for role %', v_access.role_type;
  end if;

  if not p_force and exists (
    select 1
    from public.staff_advisory_reports r
    where r.access_id = v_access.id
      and r.report_code = v_report_code
      and r.report_period_key = v_period_key
  ) then
    return jsonb_build_object(
      'status', 'skipped',
      'reason', 'already_generated',
      'role_type', v_access.role_type,
      'report_code', v_report_code,
      'period_key', v_period_key
    );
  end if;

  v_advisor_rating := round(
    case v_access.role_type
      when 'head_coach' then (v_staff.expertise + v_staff.efficiency + v_staff.potential) / 3.0
      when 'sport_director' then (v_staff.expertise + v_staff.efficiency + v_staff.leadership) / 3.0
      when 'team_doctor' then (v_staff.expertise + v_staff.efficiency + v_staff.experience) / 3.0
      when 'mechanic' then (v_staff.expertise + v_staff.efficiency + v_staff.experience) / 3.0
      when 'scout_analyst' then (v_staff.expertise + v_staff.efficiency + v_staff.experience) / 3.0
      else 0
    end
  )::integer;

  v_payload :=
    coalesce(v_report, '{}'::jsonb)
    || jsonb_build_object(
      'advisor_report', true,
      'advisor_role', v_access.role_type,
      'advisor_staff_id', v_access.staff_id,
      'advisor_staff_name', v_staff.staff_name,
      'advisor_rating', v_advisor_rating,
      'advisory_access_id', v_access.id,
      'report_code', v_report_code,
      'report_period_key', v_period_key,
      'club_id', v_access.club_id
    )
    || case
         when v_access.role_type = 'team_doctor' then
           jsonb_build_object('image_url', 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Team%20Doctor%20Advisory.png')
         else '{}'::jsonb
       end;

  insert into public.staff_advisory_reports (
    user_id,
    club_id,
    staff_id,
    role_type,
    access_id,
    report_code,
    report_period_key,
    title,
    summary,
    report_json
  )
  values (
    v_access.user_id,
    v_access.club_id,
    v_access.staff_id,
    v_access.role_type,
    v_access.id,
    v_report_code,
    v_period_key,
    v_title,
    v_summary,
    v_payload
  )
  on conflict (access_id, report_code, report_period_key)
  do nothing
  returning id into v_report_id;

  if v_report_id is null then
    return jsonb_build_object(
      'status', 'skipped',
      'reason', 'already_generated',
      'role_type', v_access.role_type,
      'report_code', v_report_code,
      'period_key', v_period_key
    );
  end if;

  v_notification_type := public.staff_advisory_notification_type_v1(v_access.role_type);

  if v_notification_type is null then
    raise exception 'No Staff Advisory notification type configured for role %', v_access.role_type;
  end if;

  v_event_key := format(
    'staff_advisory:%s:%s:%s:%s',
    v_access.id,
    v_access.role_type,
    v_report_code,
    v_period_key
  );

  v_action_url := format(
    '#/dashboard/notifications?advisor_staff_id=%s&advisor_role=%s&mode=advisor',
    v_access.staff_id,
    v_access.role_type
  );

  v_notification_id := public.create_game_notification_for_user(
    v_access.user_id,
    v_notification_type,
    v_title,
    v_summary,
    v_action_url,
    v_payload || jsonb_build_object('event_key', v_event_key),
    null,
    null
  );

  update public.staff_advisory_reports r
  set notification_id = v_notification_id
  where r.id = v_report_id;

  return jsonb_build_object(
    'status', 'generated',
    'report_id', v_report_id,
    'notification_id', v_notification_id,
    'role_type', v_access.role_type,
    'report_code', v_report_code,
    'period_key', v_period_key,
    'advisor_staff_id', v_access.staff_id
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_generate_due_reports_v1(p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  rec record;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_generated integer := 0;
  v_skipped integer := 0;
  v_failed integer := 0;
begin
  for rec in
    select a.id
    from public.staff_advisory_access a
    join public.club_staff s
      on s.id = a.staff_id
     and s.club_id = a.club_id
    join public.clubs c
      on c.id = a.club_id
    where a.entitlement_state = 'active'
      and a.expires_at > public.staff_advisory_game_now_v1()
      and s.is_active = true
      and s.role_type::text = a.role_type
      and c.deleted_at is null
      and c.is_active = true
    order by a.id
  loop
    begin
      v_result := public.staff_advisory_generate_one_due_report_v1(rec.id, p_force);
      if v_result->>'status' = 'generated' then v_generated := v_generated + 1;
      else v_skipped := v_skipped + 1;
      end if;
      v_results := v_results || jsonb_build_array(v_result);
    exception when others then
      v_failed := v_failed + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'status','failed','access_id',rec.id,'error',sqlerrm,'sqlstate',sqlstate
      ));
    end;
  end loop;
  return jsonb_build_object(
    'generated',v_generated,'skipped',v_skipped,'failed',v_failed,
    'results',v_results,'ran_at',now()
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_after_access_change_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.entitlement_state = 'active'
     and new.staff_id is not null
     and new.expires_at > public.staff_advisory_game_now_v1()
     and (
       tg_op = 'INSERT'
       or old.staff_id is distinct from new.staff_id
       or old.expires_at is distinct from new.expires_at
       or old.entitlement_state is distinct from new.entitlement_state
     )
  then
    begin
      perform public.staff_advisory_generate_one_due_report_v1(new.id, false);
    exception when others then
      raise warning 'Staff Advisory initial/resumed report failed for access %: %',new.id,sqlerrm;
    end;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_emit_head_coach_event_v1(p_access_id uuid, p_event_code text, p_title text, p_summary text, p_report_variant text, p_snapshot jsonb, p_attention_riders jsonb, p_recommendations jsonb, p_visual_key text, p_signature text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_access public.staff_advisory_access%rowtype;
  v_staff public.club_staff%rowtype;
  v_report_id uuid;
  v_notification_id bigint;
  v_period_key text;
  v_payload jsonb;
  v_action_url text;
  v_advisor_rating integer;
begin
  select * into v_access
  from public.staff_advisory_access
  where id = p_access_id
    and role_type = 'head_coach'
    and expires_at > public.staff_advisory_game_now_v1();

  if not found then
    return jsonb_build_object('status', 'skipped', 'reason', 'advisor_not_active');
  end if;

  select * into v_staff
  from public.club_staff
  where id = v_access.staff_id
    and club_id = v_access.club_id
    and is_active = true
    and role_type::text = 'head_coach';

  if not found then
    return jsonb_build_object('status', 'skipped', 'reason', 'head_coach_not_active');
  end if;

  v_advisor_rating :=
    round((v_staff.expertise + v_staff.efficiency + v_staff.potential) / 3.0)::integer;

  v_period_key :=
    'EVENT-' || p_event_code || '-' ||
    to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');

  v_action_url := format(
    '#/dashboard/notifications?advisor_staff_id=%s&advisor_role=head_coach&mode=advisor',
    v_access.staff_id
  );

  v_payload := jsonb_build_object(
    'advisor_report', true,
    'advisor_role', 'head_coach',
    'advisor_staff_id', v_access.staff_id,
    'advisor_staff_name', v_staff.staff_name,
    'advisor_rating', v_advisor_rating,
    'advisory_access_id', v_access.id,
    'club_id', v_access.club_id,
    'report_code', p_event_code,
    'report_period_key', v_period_key,
    'report_variant', p_report_variant,
    'title', p_title,
    'summary', p_summary,
    'staff', jsonb_build_object(
      'id', v_staff.id,
      'name', v_staff.staff_name,
      'role', 'Head Coach'
    ),
    'snapshot', coalesce(p_snapshot, '{}'::jsonb),
    'attention_riders', coalesce(p_attention_riders, '[]'::jsonb),
    'recommendations', coalesce(p_recommendations, '[]'::jsonb),
    'actions', jsonb_build_array(
      jsonb_build_object('label', 'Staff Briefing Centre', 'target', '/dashboard/overview'),
      jsonb_build_object('label', 'Training page', 'target', '/dashboard/training'),
      jsonb_build_object('label', 'Team squad', 'target', '/dashboard/squad'),
      jsonb_build_object('label', 'Staff page', 'target', '/dashboard/staff')
    ),
    'visual_key', p_visual_key,
    'event_signature', p_signature,
    'generated_at', now()
  );

  insert into public.staff_advisory_reports (
    user_id,
    club_id,
    staff_id,
    role_type,
    access_id,
    report_code,
    report_period_key,
    title,
    summary,
    report_json
  )
  values (
    v_access.user_id,
    v_access.club_id,
    v_access.staff_id,
    'head_coach',
    v_access.id,
    p_event_code,
    v_period_key,
    p_title,
    p_summary,
    v_payload
  )
  returning id into v_report_id;

  v_notification_id := public.create_game_notification_for_user(
    v_access.user_id,
    'ADVISOR_HEAD_COACH_REPORT',
    p_title,
    p_summary,
    v_action_url,
    v_payload,
    null,
    null
  );

  update public.staff_advisory_reports
  set notification_id = v_notification_id
  where id = v_report_id;

  return jsonb_build_object(
    'status', 'generated',
    'event_code', p_event_code,
    'report_id', v_report_id,
    'notification_id', v_notification_id
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_scan_head_coach_events_v1(p_access_id uuid, p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_access public.staff_advisory_access%rowtype;
  v_today date := coalesce(public.get_current_game_date_date(), current_date);
  v_total integer := 0;
  v_high_count integer := 0;
  v_elevated_count integer := 0;
  v_unavailable_count integer := 0;
  v_plan_count integer := 0;
  v_manual_overrides integer := 0;
  v_covered_count integer := 0;
  v_uncovered_count integer := 0;
  v_race_rider_days integer := 0;
  v_camp_rider_days integer := 0;
  v_health_block_rider_days integer := 0;
  v_unavailable_rider_days integer := 0;

  v_high_riders jsonb := '[]'::jsonb;
  v_elevated_riders jsonb := '[]'::jsonb;
  v_unavailable_riders jsonb := '[]'::jsonb;

  v_high_signature text := '';
  v_elevated_signature text := '';
  v_unavailable_signature text := '';
  v_gap_signature text := '';

  v_prev record;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_should_notify boolean;
begin
  select * into v_access
  from public.staff_advisory_access a
  where a.id = p_access_id
    and a.role_type = 'head_coach'
    and a.expires_at > public.staff_advisory_game_now_v1();

  if not found then
    return jsonb_build_object('status', 'skipped', 'reason', 'advisor_not_active');
  end if;

  select count(*)::integer
  into v_total
  from public.club_riders cr
  where cr.club_id = v_access.club_id;

  -- HIGH FATIGUE >= 70
  select
    count(*)::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'rider_id', x.rider_id,
          'name', x.rider_name,
          'fatigue', x.fatigue,
          'availability', x.availability_status,
          'flag_reason', 'High fatigue'
        )
        order by x.fatigue desc, x.rider_name
      ),
      '[]'::jsonb
    ),
    coalesce(string_agg(x.rider_id::text, ',' order by x.rider_id::text), '')
  into v_high_count, v_high_riders, v_high_signature
  from (
    select
      r.id as rider_id,
      coalesce(nullif(r.display_name, ''), trim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')), r.id::text) as rider_name,
      coalesce(r.fatigue, 0)::integer as fatigue,
      coalesce(r.availability_status, 'fit') as availability_status
    from public.club_riders cr
    join public.riders r on r.id = cr.rider_id
    where cr.club_id = v_access.club_id
      and coalesce(r.fatigue, 0) >= 70
  ) x;

  -- ELEVATED FATIGUE 50-69
  select
    count(*)::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'rider_id', x.rider_id,
          'name', x.rider_name,
          'fatigue', x.fatigue,
          'availability', x.availability_status,
          'flag_reason', 'Elevated fatigue'
        )
        order by x.fatigue desc, x.rider_name
      ),
      '[]'::jsonb
    ),
    coalesce(string_agg(x.rider_id::text, ',' order by x.rider_id::text), '')
  into v_elevated_count, v_elevated_riders, v_elevated_signature
  from (
    select
      r.id as rider_id,
      coalesce(nullif(r.display_name, ''), trim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')), r.id::text) as rider_name,
      coalesce(r.fatigue, 0)::integer as fatigue,
      coalesce(r.availability_status, 'fit') as availability_status
    from public.club_riders cr
    join public.riders r on r.id = cr.rider_id
    where cr.club_id = v_access.club_id
      and coalesce(r.fatigue, 0) between 50 and 69
  ) x;

  -- UNAVAILABLE / NOT FULLY FIT
  select
    count(*)::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'rider_id', x.rider_id,
          'name', x.rider_name,
          'fatigue', x.fatigue,
          'availability', x.availability_status,
          'flag_reason', 'Not fully available'
        )
        order by x.fatigue desc, x.rider_name
      ),
      '[]'::jsonb
    ),
    coalesce(string_agg(x.rider_id::text || ':' || x.availability_status, ',' order by x.rider_id::text), '')
  into v_unavailable_count, v_unavailable_riders, v_unavailable_signature
  from (
    select
      r.id as rider_id,
      coalesce(nullif(r.display_name, ''), trim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')), r.id::text) as rider_name,
      coalesce(r.fatigue, 0)::integer as fatigue,
      coalesce(r.availability_status, 'fit') as availability_status
    from public.club_riders cr
    join public.riders r on r.id = cr.rider_id
    where cr.club_id = v_access.club_id
      and coalesce(r.availability_status, 'fit') <> 'fit'
  ) x;

  -- TRAINING WINDOW — use the same effective schedule sources as the Training page/processor.
  select
    w.scheduled_rider_days,
    w.manual_override_rider_days,
    w.covered_rider_days,
    w.uncovered_rider_days,
    w.race_rider_days,
    w.camp_rider_days,
    w.health_block_rider_days,
    w.unavailable_rider_days
  into
    v_plan_count,
    v_manual_overrides,
    v_covered_count,
    v_uncovered_count,
    v_race_rider_days,
    v_camp_rider_days,
    v_health_block_rider_days,
    v_unavailable_rider_days
  from public.staff_advisory_effective_training_window_v1(
    v_access.club_id,
    v_today,
    3
  ) w;

  v_gap_signature := case
    when v_total > 0 and v_plan_count = 0 and v_uncovered_count > 0 then v_today::text
    else ''
  end;

  -- ==========================================================
  -- HIGH FATIGUE
  -- ==========================================================
  select * into v_prev
  from public.staff_advisory_event_state
  where access_id = v_access.id
    and event_code = 'hc_high_fatigue_alert';

  v_should_notify :=
    v_high_count > 0
    and (
      p_force
      or not found
      or coalesce(v_prev.condition_active, false) = false
      or coalesce(v_prev.last_signature, '') <> v_high_signature
    );

  if v_should_notify then
    v_result := public.staff_advisory_emit_head_coach_event_v1(
      v_access.id,
      'hc_high_fatigue_alert',
      'Head Coach Advisory — High Fatigue Alert',
      format(
        '%s rider(s) are at high fatigue. Highest current fatigue: %s. Immediate workload review is recommended.',
        v_high_count,
        coalesce((v_high_riders->0->>'fatigue')::integer, 0)
      ),
      'high_fatigue',
      jsonb_build_object(
        'squad_riders', v_total,
        'affected_riders', v_high_count,
        'highest_fatigue', coalesce((v_high_riders->0->>'fatigue')::integer, 0),
        'current_game_date', v_today
      ),
      v_high_riders,
      jsonb_build_array(
        'Review the affected riders before the next demanding training session.',
        'Reduce or adjust workload where fatigue and upcoming race commitments make recovery a priority.'
      ),
      'head_coach_high_fatigue',
      v_high_signature
    );
    v_results := v_results || jsonb_build_array(v_result);
  end if;

  insert into public.staff_advisory_event_state(
    access_id, event_code, condition_active, last_signature, last_notified_at, last_checked_at, state_json
  )
  values(
    v_access.id,
    'hc_high_fatigue_alert',
    v_high_count > 0,
    v_high_signature,
    case when v_should_notify then now() else null end,
    now(),
    jsonb_build_object('affected_riders', v_high_count)
  )
  on conflict (access_id, event_code) do update
  set condition_active = excluded.condition_active,
      last_signature = excluded.last_signature,
      last_notified_at = case
        when v_should_notify then now()
        else public.staff_advisory_event_state.last_notified_at
      end,
      last_checked_at = now(),
      state_json = excluded.state_json,
      updated_at = now();

  -- ==========================================================
  -- ELEVATED FATIGUE WATCH
  -- ==========================================================
  select * into v_prev
  from public.staff_advisory_event_state
  where access_id = v_access.id
    and event_code = 'hc_fatigue_watch';

  v_should_notify :=
    v_elevated_count > 0
    and (
      p_force
      or not found
      or coalesce(v_prev.condition_active, false) = false
      or coalesce(v_prev.last_signature, '') <> v_elevated_signature
    );

  if v_should_notify then
    v_result := public.staff_advisory_emit_head_coach_event_v1(
      v_access.id,
      'hc_fatigue_watch',
      'Head Coach Advisory — Fatigue Watch',
      format(
        '%s rider(s) are currently in the elevated fatigue band (50–69). Monitor the trend before workload increases further.',
        v_elevated_count
      ),
      'elevated_fatigue',
      jsonb_build_object(
        'squad_riders', v_total,
        'affected_riders', v_elevated_count,
        'highest_fatigue', coalesce((v_elevated_riders->0->>'fatigue')::integer, 0),
        'current_game_date', v_today
      ),
      v_elevated_riders,
      jsonb_build_array(
        'Monitor the affected riders through the next training block.',
        'Avoid unnecessary workload increases if fatigue continues to rise.'
      ),
      'head_coach_fatigue_watch',
      v_elevated_signature
    );
    v_results := v_results || jsonb_build_array(v_result);
  end if;

  insert into public.staff_advisory_event_state(
    access_id, event_code, condition_active, last_signature, last_notified_at, last_checked_at, state_json
  )
  values(
    v_access.id,
    'hc_fatigue_watch',
    v_elevated_count > 0,
    v_elevated_signature,
    case when v_should_notify then now() else null end,
    now(),
    jsonb_build_object('affected_riders', v_elevated_count)
  )
  on conflict (access_id, event_code) do update
  set condition_active = excluded.condition_active,
      last_signature = excluded.last_signature,
      last_notified_at = case
        when v_should_notify then now()
        else public.staff_advisory_event_state.last_notified_at
      end,
      last_checked_at = now(),
      state_json = excluded.state_json,
      updated_at = now();

  -- ==========================================================
  -- RIDER AVAILABILITY
  -- ==========================================================
  select * into v_prev
  from public.staff_advisory_event_state
  where access_id = v_access.id
    and event_code = 'hc_rider_availability';

  v_should_notify :=
    v_unavailable_count > 0
    and (
      p_force
      or not found
      or coalesce(v_prev.condition_active, false) = false
      or coalesce(v_prev.last_signature, '') <> v_unavailable_signature
    );

  if v_should_notify then
    v_result := public.staff_advisory_emit_head_coach_event_v1(
      v_access.id,
      'hc_rider_availability',
      'Head Coach Advisory — Rider Availability',
      format(
        '%s rider(s) are not fully available for normal training load. Review recovery status before the next intensive block.',
        v_unavailable_count
      ),
      'rider_availability',
      jsonb_build_object(
        'squad_riders', v_total,
        'affected_riders', v_unavailable_count,
        'current_game_date', v_today
      ),
      v_unavailable_riders,
      jsonb_build_array(
        'Review the affected riders before assigning demanding training.',
        'Coordinate workload decisions with their current health and recovery status.'
      ),
      'head_coach_rider_availability',
      v_unavailable_signature
    );
    v_results := v_results || jsonb_build_array(v_result);
  end if;

  insert into public.staff_advisory_event_state(
    access_id, event_code, condition_active, last_signature, last_notified_at, last_checked_at, state_json
  )
  values(
    v_access.id,
    'hc_rider_availability',
    v_unavailable_count > 0,
    v_unavailable_signature,
    case when v_should_notify then now() else null end,
    now(),
    jsonb_build_object('affected_riders', v_unavailable_count)
  )
  on conflict (access_id, event_code) do update
  set condition_active = excluded.condition_active,
      last_signature = excluded.last_signature,
      last_notified_at = case
        when v_should_notify then now()
        else public.staff_advisory_event_state.last_notified_at
      end,
      last_checked_at = now(),
      state_json = excluded.state_json,
      updated_at = now();

  -- ==========================================================
  -- TRAINING SCHEDULE GAP
  -- ==========================================================
  select * into v_prev
  from public.staff_advisory_event_state
  where access_id = v_access.id
    and event_code = 'hc_training_schedule_gap';

  v_should_notify :=
    v_total > 0
    and v_plan_count = 0
    and v_uncovered_count > 0
    and (
      p_force
      or not found
      or coalesce(v_prev.condition_active, false) = false
      or coalesce(v_prev.last_signature, '') <> v_gap_signature
    );

  if v_should_notify then
    v_result := public.staff_advisory_emit_head_coach_event_v1(
      v_access.id,
      'hc_training_schedule_gap',
      'Head Coach Advisory — Training Schedule Gap',
      format(
        'No regular training sessions or intentional race/recovery blocks are scheduled from %s through %s. Review the training calendar before the next race block.',
        public.staff_advisory_game_date_label_v1(v_today),
        public.staff_advisory_game_date_label_v1(v_today + 2)
      ),
      'training_schedule_gap',
      jsonb_build_object(
        'squad_riders', v_total,
        'window_start', v_today,
        'window_end', v_today + 2,
        'planned_sessions', v_plan_count,
        'manual_overrides', v_manual_overrides,
        'covered_rider_days', v_covered_count,
        'uncovered_rider_days', v_uncovered_count,
        'race_rider_days', v_race_rider_days,
        'camp_rider_days', v_camp_rider_days,
        'health_block_rider_days', v_health_block_rider_days,
        'unavailable_rider_days', v_unavailable_rider_days,
        'window_start_label', public.staff_advisory_game_date_label_v1(v_today),
        'window_end_label', public.staff_advisory_game_date_label_v1(v_today + 2)
      ),
      '[]'::jsonb,
      jsonb_build_array(
        'Review the next three game days in the training calendar.',
        'Confirm that the empty training window is intentional.'
      ),
      'head_coach_training_schedule_gap',
      v_gap_signature
    );
    v_results := v_results || jsonb_build_array(v_result);
  end if;

  insert into public.staff_advisory_event_state(
    access_id, event_code, condition_active, last_signature, last_notified_at, last_checked_at, state_json
  )
  values(
    v_access.id,
    'hc_training_schedule_gap',
    (v_total > 0 and v_plan_count = 0 and v_uncovered_count > 0),
    v_gap_signature,
    case when v_should_notify then now() else null end,
    now(),
    jsonb_build_object(
      'planned_sessions', v_plan_count,
      'window_start', v_today,
      'window_end', v_today + 2
    )
  )
  on conflict (access_id, event_code) do update
  set condition_active = excluded.condition_active,
      last_signature = excluded.last_signature,
      last_notified_at = case
        when v_should_notify then now()
        else public.staff_advisory_event_state.last_notified_at
      end,
      last_checked_at = now(),
      state_json = excluded.state_json,
      updated_at = now();

  return jsonb_build_object(
    'status', 'checked',
    'access_id', v_access.id,
    'generated_count', jsonb_array_length(v_results),
    'results', v_results,
    'snapshot', jsonb_build_object(
      'high_fatigue', v_high_count,
      'elevated_fatigue', v_elevated_count,
      'unavailable', v_unavailable_count,
      'planned_sessions_next_3_game_days', v_plan_count
    )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_scan_all_head_coach_events_v1(p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  rec record;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_generated integer := 0;
begin
  for rec in
    select a.id
    from public.staff_advisory_access a
    join public.club_staff s
      on s.id = a.staff_id
     and s.club_id = a.club_id
    join public.clubs c
      on c.id = a.club_id
    where a.role_type = 'head_coach'
      and a.expires_at > public.staff_advisory_game_now_v1()
      and s.is_active = true
      and s.role_type::text = 'head_coach'
      and c.deleted_at is null
      and c.is_active = true
  loop
    begin
      v_result := public.staff_advisory_scan_head_coach_events_v1(rec.id, p_force);
      v_generated := v_generated + coalesce((v_result->>'generated_count')::integer, 0);
      v_results := v_results || jsonb_build_array(v_result);
    exception
      when others then
        v_results := v_results || jsonb_build_array(
          jsonb_build_object(
            'status', 'failed',
            'access_id', rec.id,
            'error', sqlerrm,
            'sqlstate', sqlstate
          )
        );
    end;
  end loop;

  return jsonb_build_object(
    'generated_count', v_generated,
    'results', v_results,
    'checked_at', now()
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_run_hourly_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_due jsonb;
  v_head_coach_events jsonb;
  v_sport_director_events jsonb;
  v_sport_director_eligibility jsonb;
  v_team_doctor_events jsonb;
  v_mechanic_events jsonb;
  v_mechanic_eligibility jsonb;
  v_scout_events jsonb;
begin
  v_due:=public.staff_advisory_generate_due_reports_v1(false);
  v_head_coach_events:=public.staff_advisory_scan_all_head_coach_events_v1(false);
  v_sport_director_events:=public.staff_advisory_scan_all_sport_director_events_v1(false);
  v_sport_director_eligibility:=public.staff_advisory_scan_all_sport_director_race_eligibility_v1(false);
  v_team_doctor_events:=public.staff_advisory_scan_all_team_doctor_events_v1(false);
  v_mechanic_events:=public.staff_advisory_scan_all_mechanic_events_v1(false);
  v_mechanic_eligibility:=public.staff_advisory_scan_all_mechanic_race_eligibility_v1(false);
  v_scout_events:=public.staff_advisory_scan_all_scout_events_v1(false);
  return jsonb_build_object('scheduled_reports',v_due,'head_coach_events',v_head_coach_events,'sport_director_events',v_sport_director_events,'sport_director_race_eligibility',v_sport_director_eligibility,'team_doctor_events',v_team_doctor_events,'mechanic_events',v_mechanic_events,'mechanic_race_eligibility',v_mechanic_eligibility,'scout_events',v_scout_events,'ran_at',now());
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_notify_head_coach_skill_change_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);

  v_skill_key text;
  v_skill_label text;
  v_old_value numeric;
  v_new_value numeric;
  v_delta numeric;

  v_club record;
  v_access record;
  v_rider_name text;
  v_title text;
  v_message text;
  v_period_key text;
  v_action_url text;
  v_payload jsonb;
  v_notification_id bigint;
  v_report_id uuid;

  v_skills constant jsonb := jsonb_build_array(
    jsonb_build_object('key', 'sprint',     'label', 'Sprint'),
    jsonb_build_object('key', 'climbing',   'label', 'Climbing'),
    jsonb_build_object('key', 'flat',       'label', 'Flat'),
    jsonb_build_object('key', 'hills',      'label', 'Hills'),
    jsonb_build_object('key', 'time_trial', 'label', 'Time Trial'),
    jsonb_build_object('key', 'endurance',  'label', 'Endurance'),
    jsonb_build_object('key', 'teamwork',   'label', 'Teamwork'),
    jsonb_build_object('key', 'race_iq',    'label', 'Race IQ'),
    jsonb_build_object('key', 'recovery',   'label', 'Recovery')
  );

  v_skill jsonb;
begin
  if old is not distinct from new then
    return new;
  end if;

  -- Full canonical name FIRST. display_name is only a fallback.
  v_rider_name := coalesce(
    nullif(trim(concat_ws(
      ' ',
      nullif(trim(coalesce(new.first_name, '')), ''),
      nullif(trim(coalesce(new.last_name, '')), '')
    )), ''),
    nullif(trim(coalesce(new.display_name, '')), ''),
    new.id::text
  );

  for v_club in
    select distinct cr.club_id
    from public.club_riders cr
    where cr.rider_id = new.id
  loop
    select
      a.id as access_id,
      a.user_id,
      a.club_id,
      a.staff_id,
      s.staff_name,
      round((s.expertise + s.efficiency + s.potential) / 3.0)::integer as advisor_rating
    into v_access
    from public.staff_advisory_access a
    join public.club_staff s
      on s.id = a.staff_id
     and s.club_id = a.club_id
    where a.club_id = v_club.club_id
      and a.role_type = 'head_coach'
      and a.expires_at > public.staff_advisory_game_now_v1()
      and s.is_active = true
      and s.role_type::text = 'head_coach'
    order by a.created_at desc
    limit 1;

    if not found then
      continue;
    end if;

    for v_skill in
      select value
      from jsonb_array_elements(v_skills)
    loop
      v_skill_key := v_skill->>'key';
      v_skill_label := v_skill->>'label';

      if not (v_old ? v_skill_key) or not (v_new ? v_skill_key) then
        continue;
      end if;

      begin
        v_old_value := nullif(v_old->>v_skill_key, '')::numeric;
        v_new_value := nullif(v_new->>v_skill_key, '')::numeric;
      exception
        when invalid_text_representation then
          continue;
      end;

      if v_old_value is null
         or v_new_value is null
         or v_old_value = v_new_value then
        continue;
      end if;

      v_delta := v_new_value - v_old_value;

      if abs(v_delta) < 1 then
        continue;
      end if;

      v_title := 'Head Coach Advisory — Rider Skill Change';

      if v_delta > 0 then
        v_message := format(
          '%s improved %s from %s to %s (+%s).',
          v_rider_name,
          v_skill_label,
          trim(to_char(v_old_value, 'FM999999990.##')),
          trim(to_char(v_new_value, 'FM999999990.##')),
          trim(to_char(v_delta, 'FM999999990.##'))
        );
      else
        v_message := format(
          '%s''s %s decreased from %s to %s (%s).',
          v_rider_name,
          v_skill_label,
          trim(to_char(v_old_value, 'FM999999990.##')),
          trim(to_char(v_new_value, 'FM999999990.##')),
          trim(to_char(v_delta, 'FM999999990.##'))
        );
      end if;

      v_period_key := format(
        'SKILL-%s-%s-%s-%s-%s',
        new.id,
        v_skill_key,
        trim(to_char(v_old_value, 'FM999999990.##')),
        trim(to_char(v_new_value, 'FM999999990.##')),
        to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS')
      );

      v_action_url := format(
        '#/dashboard/notifications?advisor_staff_id=%s&advisor_role=head_coach&mode=advisor',
        v_access.staff_id
      );

      v_payload := jsonb_build_object(
        'advisor_report', true,
        'advisor_role', 'head_coach',
        'advisor_staff_id', v_access.staff_id,
        'advisor_staff_name', v_access.staff_name,
        'advisor_rating', v_access.advisor_rating,
        'advisory_access_id', v_access.access_id,
        'club_id', v_access.club_id,

        'report_code', 'hc_rider_skill_change',
        'report_period_key', v_period_key,
        'report_variant', 'rider_skill_change',

        'rider_id', new.id,
        'rider_first_name', nullif(trim(coalesce(new.first_name, '')), ''),
        'rider_last_name', nullif(trim(coalesce(new.last_name, '')), ''),
        'rider_full_name', v_rider_name,
        'rider_name', v_rider_name,
        'rider_country_code', nullif(trim(coalesce(new.country_code, '')), ''),
        'rider_scope', 'internal',
        'rider_profile_path', '/dashboard/my-riders/' || new.id::text,

        'skill_key', v_skill_key,
        'skill_label', v_skill_label,
        'old_value', v_old_value,
        'new_value', v_new_value,
        'delta', v_delta,
        'direction', case when v_delta > 0 then 'up' else 'down' end,

        'current_game_date', public.get_current_game_date_date(),
        'title', v_title,
        'summary', v_message,
        'image_url', 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Head%20Coach%20Advisory.png',
        'visual_key', 'head_coach_advisory',

        'actions', jsonb_build_array(
          jsonb_build_object(
            'label', 'Open rider',
            'target', '/dashboard/my-riders/' || new.id::text
          ),
          jsonb_build_object(
            'label', 'Training page',
            'target', '/dashboard/training'
          ),
          jsonb_build_object(
            'label', 'Staff Briefing Centre',
            'target', '/dashboard/overview'
          )
        ),
        'generated_at', now()
      );

      insert into public.staff_advisory_reports (
        user_id,
        club_id,
        staff_id,
        role_type,
        access_id,
        report_code,
        report_period_key,
        title,
        summary,
        report_json
      )
      values (
        v_access.user_id,
        v_access.club_id,
        v_access.staff_id,
        'head_coach',
        v_access.access_id,
        'hc_rider_skill_change',
        v_period_key,
        v_title,
        v_message,
        v_payload
      )
      returning id into v_report_id;

      v_notification_id := public.create_game_notification_for_user(
        v_access.user_id,
        'ADVISOR_HEAD_COACH_REPORT',
        v_title,
        v_message,
        v_action_url,
        v_payload,
        null,
        null
      );

      update public.staff_advisory_reports
      set notification_id = v_notification_id
      where id = v_report_id;
    end loop;
  end loop;

  return new;
exception
  when others then
    raise warning
      'Head Coach skill-change advisory failed for rider %: %',
      new.id,
      sqlerrm;
    return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_emit_sport_director_event_v1(p_access_id uuid, p_event_code text, p_title text, p_summary text, p_report_variant text, p_data jsonb, p_recommendations jsonb, p_visual_key text, p_signature text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_access public.staff_advisory_access%rowtype;
  v_staff public.club_staff%rowtype;
  v_report_id uuid;
  v_notification_id bigint;
  v_period_key text;
  v_payload jsonb;
  v_action_url text;
  v_advisor_rating integer;

  v_enriched_data jsonb := coalesce(p_data, '{}'::jsonb);
  v_dynamic_summary text := p_summary;
  v_dynamic_recommendations jsonb := coalesce(p_recommendations, '[]'::jsonb);

  v_prep_id uuid;
  v_race_id uuid;

  -- Missing-stage enrichment
  v_stage_details jsonb;
  v_next_stage jsonb;
  v_actionable_count integer := 0;
  v_past_count integer := 0;
  v_next_stage_number text;
  v_next_stage_date text;
  v_next_stage_time text;
  v_next_stage_urgency text;
  v_plan_word text;

  -- Incomplete/problem-stage enrichment
  v_problem_details jsonb;
  v_next_problem jsonb;
  v_problem_actionable integer := 0;
  v_problem_past integer := 0;
  v_problem_number text;
  v_problem_date text;
  v_problem_urgency text;
  v_problem_status text;
  v_problem_issues jsonb;
  v_problem_word text;
  v_issue_text text;
begin
  select * into v_access
  from public.staff_advisory_access
  where id = p_access_id
    and role_type = 'sport_director'
    and expires_at > public.staff_advisory_game_now_v1();

  if not found then
    return jsonb_build_object('status', 'skipped', 'reason', 'advisor_not_active');
  end if;

  select * into v_staff
  from public.club_staff
  where id = v_access.staff_id
    and club_id = v_access.club_id
    and is_active = true
    and role_type::text = 'sport_director';

  if not found then
    return jsonb_build_object('status', 'skipped', 'reason', 'sport_director_not_active');
  end if;

  -- ==========================================================
  -- Existing precise missing-stage enrichment
  -- ==========================================================
  if p_event_code = 'sd_stage_plans_missing' then
    begin
      v_prep_id := nullif(v_enriched_data->>'race_preparation_id', '')::uuid;
      v_race_id := nullif(v_enriched_data->>'next_race_id', '')::uuid;

      if v_prep_id is not null and v_race_id is not null then
        v_stage_details :=
          public.staff_advisory_sport_director_missing_stage_details_v1(
            v_prep_id,
            v_race_id
          );

        v_next_stage := v_stage_details->'next_missing_stage';
        v_actionable_count :=
          coalesce((v_stage_details->>'actionable_missing_stage_count')::integer, 0);
        v_past_count :=
          coalesce((v_stage_details->>'past_missing_stage_count')::integer, 0);

        v_enriched_data :=
          v_enriched_data
          || jsonb_build_object(
            'missing_stage_analysis', v_stage_details,
            'missing_stage_details', coalesce(v_stage_details->'missing_stages', '[]'::jsonb),
            'next_missing_stage', v_next_stage
          );

        if v_next_stage is not null
           and jsonb_typeof(v_next_stage) = 'object'
           and nullif(v_next_stage->>'stage_number', '') is not null then

          v_next_stage_number := v_next_stage->>'stage_number';
          v_next_stage_date := v_next_stage->>'stage_date';
          v_next_stage_time := nullif(v_next_stage->>'stage_start_time_label', '');
          v_next_stage_urgency := v_next_stage->>'urgency';
          v_plan_word := case when v_actionable_count = 1 then 'stage plan is' else 'stage plans are' end;

          if v_next_stage_urgency = 'today' then
            v_dynamic_summary := format(
              '%s %s still missing for %s. Stage %s is today%s and is the most urgent missing plan.',
              v_actionable_count,
              v_plan_word,
              coalesce(v_enriched_data->>'next_race_name', 'the next race'),
              v_next_stage_number,
              case
                when v_next_stage_time is not null and v_next_stage_time <> 'unknown'
                  then format(' at %s (%s)', v_next_stage_time, v_next_stage_date)
                else format(' (%s)', v_next_stage_date)
              end
            );

            v_dynamic_recommendations := jsonb_build_array(
              format(
                'Create and save the plan for Stage %s first because the stage is today%s.',
                v_next_stage_number,
                case
                  when v_next_stage_time is not null and v_next_stage_time <> 'unknown'
                    then format(' at %s', v_next_stage_time)
                  else ''
                end
              )
            );

          elsif v_next_stage_urgency = 'tomorrow' then
            v_dynamic_summary := format(
              '%s %s still missing for %s. Stage %s is tomorrow%s and should be prepared next.',
              v_actionable_count,
              v_plan_word,
              coalesce(v_enriched_data->>'next_race_name', 'the next race'),
              v_next_stage_number,
              case
                when v_next_stage_time is not null and v_next_stage_time <> 'unknown'
                  then format(' at %s (%s)', v_next_stage_time, v_next_stage_date)
                else format(' (%s)', v_next_stage_date)
              end
            );

            v_dynamic_recommendations := jsonb_build_array(
              format(
                'Prepare and save the plan for Stage %s before tomorrow%s.',
                v_next_stage_number,
                case
                  when v_next_stage_time is not null and v_next_stage_time <> 'unknown'
                    then format(' at %s', v_next_stage_time)
                  else ''
                end
              )
            );

          else
            v_dynamic_summary := format(
              '%s %s still missing for %s. The next missing plan is Stage %s on %s%s.',
              v_actionable_count,
              v_plan_word,
              coalesce(v_enriched_data->>'next_race_name', 'the next race'),
              v_next_stage_number,
              v_next_stage_date,
              case
                when v_next_stage_time is not null and v_next_stage_time <> 'unknown'
                  then format(' at %s', v_next_stage_time)
                else ''
              end
            );

            v_dynamic_recommendations := jsonb_build_array(
              format(
                'Complete the Stage %s plan before %s%s.',
                v_next_stage_number,
                v_next_stage_date,
                case
                  when v_next_stage_time is not null and v_next_stage_time <> 'unknown'
                    then format(' at %s', v_next_stage_time)
                  else ''
                end
              )
            );
          end if;

          if v_actionable_count > 1 then
            v_dynamic_recommendations :=
              v_dynamic_recommendations || jsonb_build_array(
                format(
                  '%s other actionable missing stage %s also require preparation.',
                  v_actionable_count - 1,
                  case when v_actionable_count - 1 = 1 then 'plan' else 'plans' end
                )
              );
          end if;

          if v_past_count > 0 then
            v_dynamic_recommendations :=
              v_dynamic_recommendations || jsonb_build_array(
                case
                  when v_past_count = 1 then
                    '1 older missing stage plan belongs to a past stage and does not require a new race-preparation action.'
                  else
                    format(
                      '%s older missing stage plans belong to past stages and do not require a new race-preparation action.',
                      v_past_count
                    )
                end
              );
          end if;

        elsif v_past_count > 0 then
          v_dynamic_summary := case
            when v_past_count = 1 then
              format(
                '1 historical stage plan is recorded as missing for %s, but no future missing stage currently requires action.',
                coalesce(v_enriched_data->>'next_race_name', 'the race')
              )
            else
              format(
                '%s historical stage plans are recorded as missing for %s, but no future missing stage currently requires action.',
                v_past_count,
                coalesce(v_enriched_data->>'next_race_name', 'the race')
              )
          end;

          v_dynamic_recommendations := jsonb_build_array(
            'No future missing stage plan was found. Historical missing-stage records do not require a new race-preparation action.'
          );
        end if;
      end if;
    exception
      when others then
        v_enriched_data := coalesce(p_data, '{}'::jsonb);
        v_dynamic_summary := p_summary;
        v_dynamic_recommendations := coalesce(p_recommendations, '[]'::jsonb);
    end;
  end if;

  -- ==========================================================
  -- NEW precise incomplete/problem-stage enrichment
  -- ==========================================================
  if p_event_code = 'sd_stage_plans_incomplete' then
    begin
      v_prep_id := nullif(v_enriched_data->>'race_preparation_id', '')::uuid;
      v_race_id := nullif(v_enriched_data->>'next_race_id', '')::uuid;

      if v_prep_id is not null and v_race_id is not null then
        v_problem_details :=
          public.staff_advisory_sport_director_problem_stage_details_v1(
            v_prep_id,
            v_race_id
          );

        v_next_problem := v_problem_details->'next_problem_stage';
        v_problem_actionable :=
          coalesce((v_problem_details->>'actionable_problem_stage_count')::integer, 0);
        v_problem_past :=
          coalesce((v_problem_details->>'past_problem_stage_count')::integer, 0);

        v_enriched_data :=
          v_enriched_data
          || jsonb_build_object(
            'problem_stage_analysis', v_problem_details,
            'problem_stage_details', coalesce(v_problem_details->'problem_stages', '[]'::jsonb),
            'next_problem_stage', v_next_problem
          );

        if v_next_problem is not null
           and jsonb_typeof(v_next_problem) = 'object'
           and nullif(v_next_problem->>'stage_number', '') is not null then

          v_problem_number := v_next_problem->>'stage_number';
          v_problem_date := v_next_problem->>'stage_date';
          v_problem_urgency := v_next_problem->>'urgency';
          v_problem_status := v_next_problem->>'readiness_status';
          v_problem_issues := coalesce(v_next_problem->'issues', '[]'::jsonb);
          v_problem_word := case when v_problem_actionable = 1 then 'stage plan needs' else 'stage plans need' end;

          select string_agg(value, ' ')
          into v_issue_text
          from jsonb_array_elements_text(v_problem_issues);

          if v_problem_status = 'saved_but_empty' then
            if v_problem_urgency = 'today' then
              v_dynamic_summary := format(
                '%s %s attention for %s. Stage %s is today (%s), but its saved plan contains no usable rider-plan data.',
                v_problem_actionable,
                v_problem_word,
                coalesce(v_enriched_data->>'next_race_name', 'the next race'),
                v_problem_number,
                v_problem_date
              );
            elsif v_problem_urgency = 'tomorrow' then
              v_dynamic_summary := format(
                '%s %s attention for %s. Stage %s is tomorrow (%s), but its saved plan contains no usable rider-plan data.',
                v_problem_actionable,
                v_problem_word,
                coalesce(v_enriched_data->>'next_race_name', 'the next race'),
                v_problem_number,
                v_problem_date
              );
            else
              v_dynamic_summary := format(
                '%s %s attention for %s. Stage %s on %s has been saved but contains no usable rider-plan data.',
                v_problem_actionable,
                v_problem_word,
                coalesce(v_enriched_data->>'next_race_name', 'the next race'),
                v_problem_number,
                v_problem_date
              );
            end if;

            v_dynamic_recommendations := jsonb_build_array(
              format(
                'Open Stage %s and add the required rider-plan data before relying on this plan.',
                v_problem_number
              )
            );

          else
            if v_problem_urgency = 'today' then
              v_dynamic_summary := format(
                '%s %s attention for %s. Stage %s is today (%s) and its plan is incomplete.%s',
                v_problem_actionable,
                v_problem_word,
                coalesce(v_enriched_data->>'next_race_name', 'the next race'),
                v_problem_number,
                v_problem_date,
                case when coalesce(v_issue_text, '') <> '' then ' ' || v_issue_text else '' end
              );
            elsif v_problem_urgency = 'tomorrow' then
              v_dynamic_summary := format(
                '%s %s attention for %s. Stage %s is tomorrow (%s) and its plan is incomplete.%s',
                v_problem_actionable,
                v_problem_word,
                coalesce(v_enriched_data->>'next_race_name', 'the next race'),
                v_problem_number,
                v_problem_date,
                case when coalesce(v_issue_text, '') <> '' then ' ' || v_issue_text else '' end
              );
            else
              v_dynamic_summary := format(
                '%s %s attention for %s. Stage %s on %s has an incomplete plan.%s',
                v_problem_actionable,
                v_problem_word,
                coalesce(v_enriched_data->>'next_race_name', 'the next race'),
                v_problem_number,
                v_problem_date,
                case when coalesce(v_issue_text, '') <> '' then ' ' || v_issue_text else '' end
              );
            end if;

            v_dynamic_recommendations := jsonb_build_array(
              format(
                'Review Stage %s and complete the missing rider roles, equipment or tactical information identified in the plan.',
                v_problem_number
              )
            );
          end if;

          if v_problem_actionable > 1 then
            v_dynamic_recommendations :=
              v_dynamic_recommendations || jsonb_build_array(
                format(
                  '%s additional actionable %s also need review.',
                  v_problem_actionable - 1,
                  case when v_problem_actionable - 1 = 1 then 'stage plan' else 'stage plans' end
                )
              );
          end if;

          if v_problem_past > 0 then
            v_dynamic_recommendations :=
              v_dynamic_recommendations || jsonb_build_array(
                case
                  when v_problem_past = 1 then
                    '1 older problem stage plan belongs to a past stage and does not require a new preparation action.'
                  else
                    format(
                      '%s older problem stage plans belong to past stages and do not require a new preparation action.',
                      v_problem_past
                    )
                end
              );
          end if;

        elsif v_problem_past > 0 then
          v_dynamic_summary := case
            when v_problem_past = 1 then
              format(
                '1 historical problem stage plan remains recorded for %s, but no future incomplete stage plan currently requires action.',
                coalesce(v_enriched_data->>'next_race_name', 'the race')
              )
            else
              format(
                '%s historical problem stage plans remain recorded for %s, but no future incomplete stage plan currently requires action.',
                v_problem_past,
                coalesce(v_enriched_data->>'next_race_name', 'the race')
              )
          end;

          v_dynamic_recommendations := jsonb_build_array(
            'No future incomplete stage plan currently requires action.'
          );
        end if;
      end if;
    exception
      when others then
        v_enriched_data := coalesce(p_data, '{}'::jsonb);
        v_dynamic_summary := p_summary;
        v_dynamic_recommendations := coalesce(p_recommendations, '[]'::jsonb);
    end;
  end if;

  v_advisor_rating :=
    round((v_staff.expertise + v_staff.efficiency + v_staff.leadership) / 3.0)::integer;

  v_period_key :=
    'EVENT-' || p_event_code || '-' ||
    to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');

  v_action_url := format(
    '#/dashboard/notifications?advisor_staff_id=%s&advisor_role=sport_director&mode=advisor',
    v_access.staff_id
  );

  v_payload := jsonb_build_object(
    'advisor_report', true,
    'advisor_role', 'sport_director',
    'advisor_staff_id', v_access.staff_id,
    'advisor_staff_name', v_staff.staff_name,
    'advisor_rating', v_advisor_rating,
    'advisory_access_id', v_access.id,
    'club_id', v_access.club_id,
    'report_code', p_event_code,
    'report_period_key', v_period_key,
    'report_variant', p_report_variant,
    'title', p_title,
    'summary', v_dynamic_summary,
    'staff', jsonb_build_object(
      'id', v_staff.id,
      'name', v_staff.staff_name,
      'role', 'Sports Director'
    ),
    'data', v_enriched_data,
    'recommendations', v_dynamic_recommendations,
    'actions', jsonb_build_array(
      jsonb_build_object('label', 'Staff Briefing Centre', 'target', '/dashboard/overview'),
      jsonb_build_object('label', 'Race Preparation', 'target', '/dashboard/race-preparation'),
      jsonb_build_object('label', 'Races', 'target', '/dashboard/races'),
      jsonb_build_object('label', 'Staff page', 'target', '/dashboard/staff')
    ),
    'visual_key', p_visual_key,
    'image_url',
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Sport%20Director%20Advisory.png',
    'event_signature', p_signature,
    'generated_at', now()
  );

  insert into public.staff_advisory_reports (
    user_id,
    club_id,
    staff_id,
    role_type,
    access_id,
    report_code,
    report_period_key,
    title,
    summary,
    report_json
  )
  values (
    v_access.user_id,
    v_access.club_id,
    v_access.staff_id,
    'sport_director',
    v_access.id,
    p_event_code,
    v_period_key,
    p_title,
    v_dynamic_summary,
    v_payload
  )
  returning id into v_report_id;

  v_notification_id := public.create_game_notification_for_user(
    v_access.user_id,
    'ADVISOR_SPORT_DIRECTOR_REPORT',
    p_title,
    v_dynamic_summary,
    v_action_url,
    v_payload,
    null,
    null
  );

  update public.staff_advisory_reports
  set notification_id = v_notification_id
  where id = v_report_id;

  return jsonb_build_object(
    'status', 'generated',
    'event_code', p_event_code,
    'report_id', v_report_id,
    'notification_id', v_notification_id,
    'data', v_enriched_data
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_scan_sport_director_events_v1(p_access_id uuid, p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_access public.staff_advisory_access%rowtype;
  v_report jsonb;
  v_data jsonb;
  v_today date := coalesce(public.get_current_game_date_date(), current_date);

  v_upcoming_count integer := 0;
  v_next_race_id uuid;
  v_next_race_name text;
  v_next_race_start date;
  v_days_until_race integer;
  v_race_urgency text;
  v_prep_id uuid;
  v_prep_status text;
  v_startlist_status text;
  v_startlist_done boolean := false;
  v_deadline date;
  v_deadline_status text;
  v_missing_plans integer := 0;
  v_problem_plans integer := 0;
  v_readiness_status text;

  v_prev public.staff_advisory_event_state%rowtype;
  v_prev_found boolean := false;
  v_should_notify boolean := false;
  v_signature text;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
begin
  select * into v_access
  from public.staff_advisory_access
  where id = p_access_id
    and role_type = 'sport_director'
    and expires_at > public.staff_advisory_game_now_v1();

  if not found then
    return jsonb_build_object('status', 'skipped', 'reason', 'advisor_not_active');
  end if;

  v_report := public.staff_advisory_build_sport_director_report_v1(
    v_access.club_id,
    v_access.staff_id
  );
  v_data := coalesce(v_report->'data', '{}'::jsonb);

  v_upcoming_count := coalesce((v_data->>'accepted_races_next_30_game_days')::integer, 0);
  v_next_race_id := nullif(v_data->>'next_race_id', '')::uuid;
  v_next_race_name := nullif(v_data->>'next_race_name', '');
  v_next_race_start := nullif(v_data->>'next_race_start_date', '')::date;
  v_prep_id := nullif(v_data->>'race_preparation_id', '')::uuid;
  v_prep_status := nullif(v_data->>'race_preparation_status', '');
  v_startlist_status := nullif(v_data->>'startlist_status', '');
  v_startlist_done := coalesce((v_data->>'startlist_done')::boolean, false);
  v_deadline := nullif(v_data->>'rider_submission_deadline_on', '')::date;
  v_deadline_status := nullif(v_data->>'deadline_status', '');
  v_missing_plans := coalesce((v_data->>'missing_stage_plans')::integer, 0);
  v_problem_plans := coalesce((v_data->>'problem_stage_plans')::integer, 0);
  v_readiness_status := nullif(v_data->>'readiness_status', '');

  if v_next_race_start is not null then
    v_days_until_race := v_next_race_start - v_today;

    v_race_urgency :=
      case
        when v_days_until_race < 0 then 'race_started'
        when v_days_until_race = 0 then 'today'
        when v_days_until_race = 1 then 'tomorrow'
        when v_days_until_race between 2 and 3 then 'imminent'
        when v_days_until_race between 4 and 7 then 'upcoming'
        else 'early'
      end;
  end if;

  -- ==========================================================
  -- RACE PROGRAMME GAP
  -- ==========================================================
  select * into v_prev
  from public.staff_advisory_event_state
  where access_id = v_access.id
    and event_code = 'sd_race_programme_gap';
  v_prev_found := found;

  v_signature := format('upcoming:%s', v_upcoming_count);

  v_should_notify :=
    v_upcoming_count = 0
    and (
      p_force
      or not v_prev_found
      or coalesce(v_prev.condition_active, false) = false
      or coalesce(v_prev.last_signature, '') <> v_signature
    );

  if v_should_notify then
    v_result := public.staff_advisory_emit_sport_director_event_v1(
      v_access.id,
      'sd_race_programme_gap',
      'Sports Director Advisory — Race Programme Gap',
      'No accepted race was found in the next 30 game days. Review race applications and invitations to avoid a programme gap.',
      'race_programme_gap',
      jsonb_build_object(
        'current_game_date', v_today,
        'accepted_races_next_30_game_days', v_upcoming_count
      ),
      jsonb_build_array(
        'No accepted race was found in the next 30 game days.',
        'Review applications and invitations to avoid an empty programme window.'
      ),
      'sport_director_race_programme_gap',
      v_signature
    );
    v_results := v_results || jsonb_build_array(v_result);
  end if;

  insert into public.staff_advisory_event_state(
    access_id, event_code, condition_active, last_signature,
    last_notified_at, last_checked_at, state_json
  )
  values(
    v_access.id,
    'sd_race_programme_gap',
    v_upcoming_count = 0,
    v_signature,
    case when v_should_notify then now() else null end,
    now(),
    jsonb_build_object('accepted_races_next_30_game_days', v_upcoming_count)
  )
  on conflict (access_id, event_code) do update
  set condition_active = excluded.condition_active,
      last_signature = excluded.last_signature,
      last_notified_at = case
        when v_should_notify then now()
        else public.staff_advisory_event_state.last_notified_at
      end,
      last_checked_at = now(),
      state_json = excluded.state_json,
      updated_at = now();

  -- ==========================================================
  -- RACE PREPARATION MISSING — ACTIONABLE WINDOW ONLY
  -- ==========================================================
  select * into v_prev
  from public.staff_advisory_event_state
  where access_id = v_access.id
    and event_code = 'sd_race_preparation_missing';
  v_prev_found := found;

  v_signature := format(
    'race:%s|prep:%s|start:%s|days:%s|urgency:%s',
    coalesce(v_next_race_id::text, 'none'),
    coalesce(v_prep_id::text, 'none'),
    coalesce(v_next_race_start::text, 'none'),
    coalesce(v_days_until_race::text, 'none'),
    coalesce(v_race_urgency, 'none')
  );

  v_should_notify :=
    v_next_race_id is not null
    and v_prep_id is null
    and v_next_race_start is not null
    and v_days_until_race <= 7
    and (
      p_force
      or not v_prev_found
      or coalesce(v_prev.condition_active, false) = false
      or coalesce(v_prev.last_signature, '') <> v_signature
    );

  if v_should_notify then
    v_result := public.staff_advisory_emit_sport_director_event_v1(
      v_access.id,
      'sd_race_preparation_missing',
      'Sports Director Advisory — Race Preparation Missing',
      case
        when v_race_urgency = 'race_started' then format(
          '%s has already started, but no race-preparation package is recorded. Review the race setup immediately.',
          coalesce(v_next_race_name, 'The next accepted race')
        )
        when v_race_urgency = 'today' then format(
          '%s starts today, but no race-preparation package has been created.',
          coalesce(v_next_race_name, 'The next accepted race')
        )
        when v_race_urgency = 'tomorrow' then format(
          '%s starts tomorrow (%s), but no race-preparation package has been created.',
          coalesce(v_next_race_name, 'The next accepted race'),
          v_next_race_start
        )
        when v_race_urgency = 'imminent' then format(
          '%s starts in %s game days (%s), but no race-preparation package has been created.',
          coalesce(v_next_race_name, 'The next accepted race'),
          v_days_until_race,
          v_next_race_start
        )
        else format(
          '%s starts in %s game days (%s). Race preparation has not been started yet.',
          coalesce(v_next_race_name, 'The next accepted race'),
          v_days_until_race,
          v_next_race_start
        )
      end,
      'race_preparation_missing',
      jsonb_build_object(
        'current_game_date', v_today,
        'next_race_id', v_next_race_id,
        'next_race_name', v_next_race_name,
        'next_race_start_date', v_next_race_start,
        'days_until_race', v_days_until_race,
        'race_urgency', v_race_urgency,
        'race_preparation_id', v_prep_id,
        'race_preparation_status', v_prep_status,
        'startlist_status', v_startlist_status,
        'rider_submission_deadline_on', v_deadline,
        'deadline_status', v_deadline_status
      ),
      case
        when v_race_urgency = 'race_started' then jsonb_build_array(
          'Open Race Preparation immediately and verify whether the race can still be managed correctly.',
          'Check rider selection and any remaining stage-specific preparation without delay.'
        )
        when v_race_urgency = 'today' then jsonb_build_array(
          'Create the race-preparation package immediately.',
          'Review the startlist and stage plans before today’s race activity.'
        )
        when v_race_urgency = 'tomorrow' then jsonb_build_array(
          'Create the race-preparation package now.',
          'Complete the startlist and first-stage planning before tomorrow.'
        )
        when v_race_urgency = 'imminent' then jsonb_build_array(
          format(
            'Create the race-preparation package within the next game day; only %s game days remain before the race.',
            v_days_until_race
          ),
          'After creating it, review the rider list and stage-plan readiness.'
        )
        else jsonb_build_array(
          format(
            'Start race preparation soon; the race begins in %s game days.',
            v_days_until_race
          ),
          'Use the remaining preparation window to complete rider selection and stage plans.'
        )
      end,
      'sport_director_race_preparation_missing',
      v_signature
    );

    v_results := v_results || jsonb_build_array(v_result);
  end if;

  insert into public.staff_advisory_event_state(
    access_id, event_code, condition_active, last_signature,
    last_notified_at, last_checked_at, state_json
  )
  values(
    v_access.id,
    'sd_race_preparation_missing',
    (
      v_next_race_id is not null
      and v_prep_id is null
      and v_next_race_start is not null
      and v_days_until_race <= 7
    ),
    v_signature,
    case when v_should_notify then now() else null end,
    now(),
    jsonb_build_object(
      'next_race_id', v_next_race_id,
      'next_race_name', v_next_race_name,
      'next_race_start_date', v_next_race_start,
      'days_until_race', v_days_until_race,
      'race_urgency', v_race_urgency,
      'race_preparation_id', v_prep_id
    )
  )
  on conflict (access_id, event_code) do update
  set condition_active = excluded.condition_active,
      last_signature = excluded.last_signature,
      last_notified_at = case
        when v_should_notify then now()
        else public.staff_advisory_event_state.last_notified_at
      end,
      last_checked_at = now(),
      state_json = excluded.state_json,
      updated_at = now();

  -- ==========================================================
  -- STARTLIST DEADLINE ALERT — ACTIONABLE ONLY
  -- ==========================================================
  select * into v_prev
  from public.staff_advisory_event_state
  where access_id = v_access.id
    and event_code = 'sd_startlist_deadline_alert';
  v_prev_found := found;

  v_signature := format(
    'race:%s|deadline:%s|status:%s|startlist:%s|done:%s',
    coalesce(v_next_race_id::text, 'none'),
    coalesce(v_deadline::text, 'none'),
    coalesce(v_deadline_status, 'none'),
    coalesce(v_startlist_status, 'none'),
    v_startlist_done
  );

  v_should_notify :=
    v_next_race_id is not null
    and v_deadline is not null
    and v_deadline <= v_today + 3
    and not v_startlist_done
    and (
      p_force
      or not v_prev_found
      or coalesce(v_prev.condition_active, false) = false
      or coalesce(v_prev.last_signature, '') <> v_signature
    );

  if v_should_notify then
    v_result := public.staff_advisory_emit_sport_director_event_v1(
      v_access.id,
      'sd_startlist_deadline_alert',
      'Sports Director Advisory — Startlist Deadline Alert',
      case
        when v_deadline < v_today then format(
          'The rider-submission deadline for %s passed on %s and the startlist is not confirmed as submitted.',
          coalesce(v_next_race_name, 'the next race'),
          v_deadline
        )
        when v_deadline = v_today then format(
          'The rider-submission deadline for %s is today (%s). The startlist still needs to be finalised.',
          coalesce(v_next_race_name, 'the next race'),
          v_deadline
        )
        else format(
          'The rider-submission deadline for %s is approaching on %s. The startlist still needs to be finalised.',
          coalesce(v_next_race_name, 'the next race'),
          v_deadline
        )
      end,
      'startlist_deadline_alert',
      jsonb_build_object(
        'current_game_date', v_today,
        'next_race_id', v_next_race_id,
        'next_race_name', v_next_race_name,
        'next_race_start_date', v_next_race_start,
        'race_preparation_id', v_prep_id,
        'race_preparation_status', v_prep_status,
        'startlist_status', v_startlist_status,
        'startlist_done', v_startlist_done,
        'rider_submission_deadline_on', v_deadline,
        'deadline_status', v_deadline_status
      ),
      jsonb_build_array(
        case
          when v_deadline < v_today
            then 'The deadline has passed and the startlist is still unresolved. Review Race Preparation immediately.'
          when v_deadline = v_today
            then 'Finalise and submit the rider list today.'
          else 'Finalise the rider list before the upcoming deadline.'
        end
      ),
      'sport_director_startlist_deadline_alert',
      v_signature
    );
    v_results := v_results || jsonb_build_array(v_result);
  end if;

  insert into public.staff_advisory_event_state(
    access_id, event_code, condition_active, last_signature,
    last_notified_at, last_checked_at, state_json
  )
  values(
    v_access.id,
    'sd_startlist_deadline_alert',
    (
      v_next_race_id is not null
      and v_deadline is not null
      and v_deadline <= v_today + 3
      and not v_startlist_done
    ),
    v_signature,
    case when v_should_notify then now() else null end,
    now(),
    jsonb_build_object(
      'next_race_id', v_next_race_id,
      'rider_submission_deadline_on', v_deadline,
      'deadline_status', v_deadline_status,
      'startlist_status', v_startlist_status,
      'startlist_done', v_startlist_done
    )
  )
  on conflict (access_id, event_code) do update
  set condition_active = excluded.condition_active,
      last_signature = excluded.last_signature,
      last_notified_at = case
        when v_should_notify then now()
        else public.staff_advisory_event_state.last_notified_at
      end,
      last_checked_at = now(),
      state_json = excluded.state_json,
      updated_at = now();

  -- ==========================================================
  -- STAGE PLANS MISSING
  -- ==========================================================
  select * into v_prev
  from public.staff_advisory_event_state
  where access_id = v_access.id
    and event_code = 'sd_stage_plans_missing';
  v_prev_found := found;

  v_signature := format(
    'race:%s|missing:%s|readiness:%s',
    coalesce(v_next_race_id::text, 'none'),
    v_missing_plans,
    coalesce(v_readiness_status, 'none')
  );

  v_should_notify :=
    v_next_race_id is not null
    and v_prep_id is not null
    and v_missing_plans > 0
    and (
      p_force
      or not v_prev_found
      or coalesce(v_prev.condition_active, false) = false
      or coalesce(v_prev.last_signature, '') <> v_signature
    );

  if v_should_notify then
    v_result := public.staff_advisory_emit_sport_director_event_v1(
      v_access.id,
      'sd_stage_plans_missing',
      'Sports Director Advisory — Stage Plans Missing',
      format(
        '%s stage plan(s) are still missing for %s.',
        v_missing_plans,
        coalesce(v_next_race_name, 'the next race')
      ),
      'stage_plans_missing',
      jsonb_build_object(
        'current_game_date', v_today,
        'next_race_id', v_next_race_id,
        'next_race_name', v_next_race_name,
        'next_race_start_date', v_next_race_start,
        'race_preparation_id', v_prep_id,
        'race_preparation_status', v_prep_status,
        'startlist_status', v_startlist_status,
        'missing_stage_plans', v_missing_plans,
        'problem_stage_plans', v_problem_plans,
        'readiness_status', v_readiness_status
      ),
      jsonb_build_array(
        format(
          '%s stage plan(s) are still missing. Open the race preparation and create the missing plans.',
          v_missing_plans
        )
      ),
      'sport_director_stage_plans_missing',
      v_signature
    );
    v_results := v_results || jsonb_build_array(v_result);
  end if;

  insert into public.staff_advisory_event_state(
    access_id, event_code, condition_active, last_signature,
    last_notified_at, last_checked_at, state_json
  )
  values(
    v_access.id,
    'sd_stage_plans_missing',
    (v_next_race_id is not null and v_prep_id is not null and v_missing_plans > 0),
    v_signature,
    case when v_should_notify then now() else null end,
    now(),
    jsonb_build_object(
      'next_race_id', v_next_race_id,
      'missing_stage_plans', v_missing_plans,
      'readiness_status', v_readiness_status
    )
  )
  on conflict (access_id, event_code) do update
  set condition_active = excluded.condition_active,
      last_signature = excluded.last_signature,
      last_notified_at = case
        when v_should_notify then now()
        else public.staff_advisory_event_state.last_notified_at
      end,
      last_checked_at = now(),
      state_json = excluded.state_json,
      updated_at = now();

  -- ==========================================================
  -- STAGE PLANS INCOMPLETE
  -- ==========================================================
  select * into v_prev
  from public.staff_advisory_event_state
  where access_id = v_access.id
    and event_code = 'sd_stage_plans_incomplete';
  v_prev_found := found;

  v_signature := format(
    'race:%s|problem:%s|readiness:%s',
    coalesce(v_next_race_id::text, 'none'),
    v_problem_plans,
    coalesce(v_readiness_status, 'none')
  );

  v_should_notify :=
    v_next_race_id is not null
    and v_prep_id is not null
    and v_problem_plans > 0
    and (
      p_force
      or not v_prev_found
      or coalesce(v_prev.condition_active, false) = false
      or coalesce(v_prev.last_signature, '') <> v_signature
    );

  if v_should_notify then
    v_result := public.staff_advisory_emit_sport_director_event_v1(
      v_access.id,
      'sd_stage_plans_incomplete',
      'Sports Director Advisory — Stage Plans Incomplete',
      format(
        '%s stage plan(s) for %s are saved but incomplete or empty.',
        v_problem_plans,
        coalesce(v_next_race_name, 'the next race')
      ),
      'stage_plans_incomplete',
      jsonb_build_object(
        'current_game_date', v_today,
        'next_race_id', v_next_race_id,
        'next_race_name', v_next_race_name,
        'next_race_start_date', v_next_race_start,
        'race_preparation_id', v_prep_id,
        'race_preparation_status', v_prep_status,
        'startlist_status', v_startlist_status,
        'missing_stage_plans', v_missing_plans,
        'problem_stage_plans', v_problem_plans,
        'readiness_status', v_readiness_status
      ),
      jsonb_build_array(
        format(
          '%s stage plan(s) are saved but incomplete or empty. Review and complete them before the race.',
          v_problem_plans
        )
      ),
      'sport_director_stage_plans_incomplete',
      v_signature
    );
    v_results := v_results || jsonb_build_array(v_result);
  end if;

  insert into public.staff_advisory_event_state(
    access_id, event_code, condition_active, last_signature,
    last_notified_at, last_checked_at, state_json
  )
  values(
    v_access.id,
    'sd_stage_plans_incomplete',
    (v_next_race_id is not null and v_prep_id is not null and v_problem_plans > 0),
    v_signature,
    case when v_should_notify then now() else null end,
    now(),
    jsonb_build_object(
      'next_race_id', v_next_race_id,
      'problem_stage_plans', v_problem_plans,
      'readiness_status', v_readiness_status
    )
  )
  on conflict (access_id, event_code) do update
  set condition_active = excluded.condition_active,
      last_signature = excluded.last_signature,
      last_notified_at = case
        when v_should_notify then now()
        else public.staff_advisory_event_state.last_notified_at
      end,
      last_checked_at = now(),
      state_json = excluded.state_json,
      updated_at = now();

  return jsonb_build_object(
    'status', 'checked',
    'access_id', v_access.id,
    'generated_count', jsonb_array_length(v_results),
    'results', v_results,
    'snapshot', jsonb_build_object(
      'accepted_races_next_30_game_days', v_upcoming_count,
      'next_race_id', v_next_race_id,
      'next_race_name', v_next_race_name,
      'next_race_start_date', v_next_race_start,
      'days_until_race', v_days_until_race,
      'race_urgency', v_race_urgency,
      'race_preparation_id', v_prep_id,
      'startlist_status', v_startlist_status,
      'startlist_done', v_startlist_done,
      'rider_submission_deadline_on', v_deadline,
      'deadline_status', v_deadline_status,
      'missing_stage_plans', v_missing_plans,
      'problem_stage_plans', v_problem_plans
    )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_scan_all_sport_director_events_v1(p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  rec record;
  v_main jsonb;
  v_continuity jsonb;
  v_results jsonb := '[]'::jsonb;
  v_generated integer := 0;
begin
  for rec in
    select a.id
    from public.staff_advisory_access a
    join public.club_staff s
      on s.id = a.staff_id
     and s.club_id = a.club_id
    join public.clubs c
      on c.id = a.club_id
    where a.role_type = 'sport_director'
      and a.expires_at > public.staff_advisory_game_now_v1()
      and s.is_active = true
      and s.role_type::text = 'sport_director'
      and c.deleted_at is null
      and c.is_active = true
  loop
    begin
      -- Original scanner retains Race Preparation Missing, deadline,
      -- missing stages, incomplete stages, and the absolute empty-programme case.
      v_main := public.staff_advisory_scan_sport_director_events_v1(rec.id, p_force);

      -- New continuity scanner adds active-race/no-next-race and long-break cases.
      v_continuity := public.staff_advisory_scan_sport_director_programme_continuity_v1(
        rec.id,
        p_force
      );

      v_generated := v_generated
        + coalesce((v_main->>'generated_count')::integer, 0)
        + case when coalesce((v_continuity->>'generated')::boolean, false) then 1 else 0 end;

      v_results := v_results || jsonb_build_array(
        jsonb_build_object(
          'access_id', rec.id,
          'standard_events', v_main,
          'programme_continuity', v_continuity
        )
      );
    exception
      when others then
        v_results := v_results || jsonb_build_array(
          jsonb_build_object(
            'status', 'failed',
            'access_id', rec.id,
            'error', sqlerrm,
            'sqlstate', sqlstate
          )
        );
    end;
  end loop;

  return jsonb_build_object(
    'generated_count', v_generated,
    'results', v_results,
    'checked_at', now()
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_sport_director_problem_stage_details_v1(p_race_preparation_id uuid, p_race_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_today date := coalesce(public.get_current_game_date_date(), current_date);
  v_ui jsonb;
  v_result jsonb;
begin
  v_ui := public.get_race_stage_plan_readiness_ui_v1(
    p_race_preparation_id,
    p_race_id
  );

  with raw as (
    select
      e.value as stage_json,
      nullif(e.value->>'stage_id', '')::uuid as stage_id,
      nullif(e.value->>'race_stage_plan_id', '')::uuid as stage_plan_id,
      coalesce((e.value->>'stage_number')::integer, 0) as stage_number,
      nullif(e.value->>'stage_date', '')::date as stage_date,
      nullif(e.value->>'status', '') as stage_plan_status,
      nullif(e.value->>'readiness_status', '') as readiness_status,
      nullif(e.value->>'readiness_label', '') as readiness_label,
      nullif(e.value->>'recommended_action', '') as recommended_action,
      coalesce((e.value->>'rider_role_count')::integer, 0) as rider_role_count,
      coalesce((e.value->>'rider_equipment_count')::integer, 0) as rider_equipment_count,
      coalesce((e.value->>'rider_supply_count')::integer, 0) as rider_supply_count,
      coalesce((e.value->>'rider_individual_tactic_count')::integer, 0) as rider_individual_tactic_count,
      coalesce((e.value->>'team_tactic_rider_count')::integer, 0) as team_tactic_rider_count,
      coalesce((e.value->>'has_saved_plan')::boolean, false) as has_saved_plan,
      coalesce((e.value->>'has_core_rider_plan')::boolean, false) as has_core_rider_plan,
      coalesce((e.value->>'has_supply_plan')::boolean, false) as has_supply_plan,
      coalesce((e.value->>'has_tactical_plan')::boolean, false) as has_tactical_plan,
      coalesce((e.value->>'is_placeholder')::boolean, false) as is_placeholder,
      coalesce((e.value->>'is_usable_for_engine')::boolean, false) as is_usable_for_engine
    from jsonb_array_elements(coalesce(v_ui->'stages', '[]'::jsonb)) e
    where e.value->>'readiness_status' in ('saved_but_empty', 'incomplete_stage_plan')
  ),
  classified as (
    select
      r.*,
      case
        when r.stage_date < v_today then 'past'
        when r.stage_date = v_today then 'today'
        when r.stage_date = v_today + 1 then 'tomorrow'
        else 'future'
      end as urgency,
      case
        when r.stage_date < v_today then 4
        when r.stage_date = v_today then 1
        when r.stage_date = v_today + 1 then 2
        else 3
      end as urgency_order,
      case
        when r.readiness_status = 'saved_but_empty' then
          jsonb_build_array(
            'No usable rider-plan data is saved for this stage.'
          )
        else (
          select coalesce(jsonb_agg(x.issue order by x.ord), '[]'::jsonb)
          from (
            values
              (1, case when r.rider_role_count = 0 then 'Rider roles are missing.' end),
              (2, case when r.rider_equipment_count = 0 then 'Rider equipment assignments are missing.' end),
              (3, case when not r.has_tactical_plan then 'Tactical instructions are missing.' end),
              (4, case when r.rider_supply_count = 0 then 'No rider supplies are assigned.' end)
          ) as x(ord, issue)
          where x.issue is not null
        )
      end as issues
    from raw r
  ),
  ordered as (
    select *
    from classified
    order by urgency_order, stage_date, stage_number
  ),
  actionable as (
    select *
    from ordered
    where urgency <> 'past'
  ),
  next_problem as (
    select *
    from actionable
    order by urgency_order, stage_date, stage_number
    limit 1
  )
  select jsonb_build_object(
    'problem_stage_count', (select count(*)::integer from ordered),
    'actionable_problem_stage_count', (select count(*)::integer from actionable),
    'past_problem_stage_count', (
      select count(*)::integer from ordered where urgency = 'past'
    ),
    'today_problem_stage_count', (
      select count(*)::integer from ordered where urgency = 'today'
    ),
    'tomorrow_problem_stage_count', (
      select count(*)::integer from ordered where urgency = 'tomorrow'
    ),
    'future_problem_stage_count', (
      select count(*)::integer from ordered where urgency = 'future'
    ),
    'next_problem_stage', coalesce(
      (
        select jsonb_build_object(
          'stage_id', n.stage_id,
          'stage_plan_id', n.stage_plan_id,
          'stage_number', n.stage_number,
          'stage_date', n.stage_date,
          'urgency', n.urgency,
          'stage_plan_status', n.stage_plan_status,
          'readiness_status', n.readiness_status,
          'readiness_label', n.readiness_label,
          'recommended_action', n.recommended_action,
          'rider_role_count', n.rider_role_count,
          'rider_equipment_count', n.rider_equipment_count,
          'rider_supply_count', n.rider_supply_count,
          'rider_individual_tactic_count', n.rider_individual_tactic_count,
          'team_tactic_rider_count', n.team_tactic_rider_count,
          'has_core_rider_plan', n.has_core_rider_plan,
          'has_supply_plan', n.has_supply_plan,
          'has_tactical_plan', n.has_tactical_plan,
          'is_usable_for_engine', n.is_usable_for_engine,
          'issues', n.issues
        )
        from next_problem n
      ),
      'null'::jsonb
    ),
    'problem_stages', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'stage_id', o.stage_id,
            'stage_plan_id', o.stage_plan_id,
            'stage_number', o.stage_number,
            'stage_date', o.stage_date,
            'urgency', o.urgency,
            'stage_plan_status', o.stage_plan_status,
            'readiness_status', o.readiness_status,
            'readiness_label', o.readiness_label,
            'recommended_action', o.recommended_action,
            'rider_role_count', o.rider_role_count,
            'rider_equipment_count', o.rider_equipment_count,
            'rider_supply_count', o.rider_supply_count,
            'rider_individual_tactic_count', o.rider_individual_tactic_count,
            'team_tactic_rider_count', o.team_tactic_rider_count,
            'has_saved_plan', o.has_saved_plan,
            'has_core_rider_plan', o.has_core_rider_plan,
            'has_supply_plan', o.has_supply_plan,
            'has_tactical_plan', o.has_tactical_plan,
            'is_usable_for_engine', o.is_usable_for_engine,
            'issues', o.issues
          )
          order by o.urgency_order, o.stage_date, o.stage_number
        )
        from ordered o
      ),
      '[]'::jsonb
    )
  )
  into v_result;

  return coalesce(v_result, jsonb_build_object(
    'problem_stage_count', 0,
    'actionable_problem_stage_count', 0,
    'past_problem_stage_count', 0,
    'today_problem_stage_count', 0,
    'tomorrow_problem_stage_count', 0,
    'future_problem_stage_count', 0,
    'next_problem_stage', null,
    'problem_stages', '[]'::jsonb
  ));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_sport_director_programme_continuity_v1(p_club_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_today date := coalesce(public.get_current_game_date_date(), current_date);
  v_active_race_id uuid;
  v_active_race_name text;
  v_active_start date;
  v_active_end date;
  v_future_30_count integer := 0;
  v_next_future_id uuid;
  v_next_future_name text;
  v_next_future_start date;
  v_next_future_end date;
  v_days_until_next integer;
  v_gap_days integer;
  v_status text;
begin
  -- Accepted race active on the current game date.
  select r.id, r.name, r.start_date, r.end_date
  into v_active_race_id, v_active_race_name, v_active_start, v_active_end
  from public.race_team_entries rte
  join public.races r on r.id = rte.race_id
  where rte.club_id = p_club_id
    and rte.status = 'accepted'
    and r.start_date <= v_today
    and r.end_date >= v_today
  order by r.start_date desc, r.name
  limit 1;

  -- Future accepted races that actually START inside the next 30 game days.
  select count(*)::integer
  into v_future_30_count
  from public.race_team_entries rte
  join public.races r on r.id = rte.race_id
  where rte.club_id = p_club_id
    and rte.status = 'accepted'
    and r.start_date > v_today
    and r.start_date <= v_today + 30;

  -- Next accepted race after today, even if beyond 30 days, so the advisor
  -- can explain the true length of the break.
  select r.id, r.name, r.start_date, r.end_date
  into v_next_future_id, v_next_future_name, v_next_future_start, v_next_future_end
  from public.race_team_entries rte
  join public.races r on r.id = rte.race_id
  where rte.club_id = p_club_id
    and rte.status = 'accepted'
    and r.start_date > v_today
  order by r.start_date, r.name
  limit 1;

  if v_next_future_start is not null then
    v_days_until_next := v_next_future_start - v_today;

    if v_active_end is not null then
      -- Number of completely race-free days between current race end and next start.
      v_gap_days := greatest(v_next_future_start - v_active_end - 1, 0);
    else
      v_gap_days := greatest(v_next_future_start - v_today, 0);
    end if;
  end if;

  v_status := case
    when v_active_race_id is not null and v_future_30_count = 0
      then 'no_next_race_after_active'
    when v_next_future_start is not null and coalesce(v_gap_days, 0) > 14
      then 'long_break'
    else 'healthy'
  end;

  return jsonb_build_object(
    'current_game_date', v_today,
    'programme_status', v_status,
    'active_race_id', v_active_race_id,
    'active_race_name', v_active_race_name,
    'active_race_start_date', v_active_start,
    'active_race_end_date', v_active_end,
    'future_accepted_races_next_30_game_days', v_future_30_count,
    'next_future_race_id', v_next_future_id,
    'next_future_race_name', v_next_future_name,
    'next_future_race_start_date', v_next_future_start,
    'next_future_race_end_date', v_next_future_end,
    'days_until_next_future_race', v_days_until_next,
    'programme_gap_days', v_gap_days
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_scan_sport_director_programme_continuity_v1(p_access_id uuid, p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_access public.staff_advisory_access%rowtype;
  v_data jsonb;
  v_status text;
  v_active_name text;
  v_active_end date;
  v_future_30 integer := 0;
  v_next_name text;
  v_next_start date;
  v_gap_days integer;
  v_condition_active boolean := false;
  v_prev public.staff_advisory_event_state%rowtype;
  v_prev_found boolean := false;
  v_signature text;
  v_should_notify boolean := false;
  v_summary text;
  v_recommendations jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  select * into v_access
  from public.staff_advisory_access
  where id = p_access_id
    and role_type = 'sport_director'
    and expires_at > public.staff_advisory_game_now_v1();

  if not found then
    return jsonb_build_object('status', 'skipped', 'reason', 'advisor_not_active');
  end if;

  -- Paid access is not enough by itself: assigned employee must still exist
  -- and remain active in the Sports Director role.
  if not exists (
    select 1
    from public.club_staff s
    where s.id = v_access.staff_id
      and s.club_id = v_access.club_id
      and s.is_active = true
      and s.role_type::text = 'sport_director'
  ) then
    return jsonb_build_object('status', 'skipped', 'reason', 'sport_director_not_active');
  end if;

  v_data := public.staff_advisory_sport_director_programme_continuity_v1(v_access.club_id);
  v_status := nullif(v_data->>'programme_status', '');
  v_active_name := nullif(v_data->>'active_race_name', '');
  v_active_end := nullif(v_data->>'active_race_end_date', '')::date;
  v_future_30 := coalesce((v_data->>'future_accepted_races_next_30_game_days')::integer, 0);
  v_next_name := nullif(v_data->>'next_future_race_name', '');
  v_next_start := nullif(v_data->>'next_future_race_start_date', '')::date;
  v_gap_days := nullif(v_data->>'programme_gap_days', '')::integer;

  v_condition_active := v_status in ('no_next_race_after_active', 'long_break');

  v_signature := format(
    'status:%s|active:%s|active_end:%s|future30:%s|next:%s|next_start:%s|gap:%s',
    coalesce(v_status, 'none'),
    coalesce(v_active_name, 'none'),
    coalesce(v_active_end::text, 'none'),
    v_future_30,
    coalesce(v_next_name, 'none'),
    coalesce(v_next_start::text, 'none'),
    coalesce(v_gap_days::text, 'none')
  );

  select * into v_prev
  from public.staff_advisory_event_state
  where access_id = v_access.id
    and event_code = 'sd_race_programme_continuity_gap';
  v_prev_found := found;

  v_should_notify :=
    v_condition_active
    and (
      p_force
      or not v_prev_found
      or coalesce(v_prev.condition_active, false) = false
      or coalesce(v_prev.last_signature, '') <> v_signature
    );

  if v_should_notify then
    if v_status = 'no_next_race_after_active' then
      v_summary := format(
        '%s is currently in progress, but no accepted race is scheduled after it inside the next 30 game days.',
        coalesce(v_active_name, 'The current race')
      );

      v_recommendations := jsonb_build_array(
        format(
          'The current race ends on %s. Review applications and invitations for the following programme window.',
          coalesce(v_active_end::text, 'its scheduled end date')
        ),
        'If the empty period is intentional for training or recovery, no action is required.'
      );
    else
      v_summary := format(
        'The next accepted race is %s on %s, leaving a %s-game-day break in the race programme.',
        coalesce(v_next_name, 'the next race'),
        coalesce(v_next_start::text, 'a future date'),
        coalesce(v_gap_days, 0)
      );

      v_recommendations := jsonb_build_array(
        'Review available race applications and invitations if this long break is not intentional.',
        'A long break can be deliberately used for training or recovery; the Sports Director will not enter a race automatically.'
      );
    end if;

    v_result := public.staff_advisory_emit_sport_director_event_v1(
      v_access.id,
      'sd_race_programme_gap',
      'Sports Director Advisory — Race Programme Gap',
      v_summary,
      'race_programme_gap',
      v_data,
      v_recommendations,
      'sport_director_race_programme_gap',
      v_signature
    );
  else
    v_result := jsonb_build_object(
      'status', 'not_generated',
      'condition_active', v_condition_active,
      'programme_status', v_status
    );
  end if;

  -- Separate state key keeps this deeper continuity check from interfering
  -- with the original empty-programme state used by migration 012/017.
  insert into public.staff_advisory_event_state(
    access_id,
    event_code,
    condition_active,
    last_signature,
    last_notified_at,
    last_checked_at,
    state_json
  )
  values(
    v_access.id,
    'sd_race_programme_continuity_gap',
    v_condition_active,
    v_signature,
    case when v_should_notify then now() else null end,
    now(),
    v_data
  )
  on conflict (access_id, event_code) do update
  set condition_active = excluded.condition_active,
      last_signature = excluded.last_signature,
      last_notified_at = case
        when v_should_notify then now()
        else public.staff_advisory_event_state.last_notified_at
      end,
      last_checked_at = now(),
      state_json = excluded.state_json,
      updated_at = now();

  return jsonb_build_object(
    'status', 'checked',
    'access_id', v_access.id,
    'condition_active', v_condition_active,
    'programme_status', v_status,
    'generated', v_should_notify,
    'result', v_result,
    'snapshot', v_data
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_emit_team_doctor_event_v1(p_access_id uuid, p_report_code text, p_title text, p_summary text, p_report_variant text, p_data jsonb, p_recommendations jsonb, p_event_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_access public.staff_advisory_access%rowtype;
  v_staff public.club_staff%rowtype;
  v_report_id uuid;
  v_notification_id bigint;
  v_period_key text;
  v_payload jsonb;
  v_action_url text;
  v_advisor_rating integer;
begin
  select * into v_access
  from public.staff_advisory_access
  where id = p_access_id
    and role_type = 'team_doctor'
    and expires_at > public.staff_advisory_game_now_v1();

  if not found then
    return jsonb_build_object('status','skipped','reason','advisor_not_active');
  end if;

  select * into v_staff
  from public.club_staff
  where id = v_access.staff_id
    and club_id = v_access.club_id
    and is_active = true
    and role_type::text = 'team_doctor';

  if not found then
    return jsonb_build_object('status','skipped','reason','team_doctor_not_active');
  end if;

  v_advisor_rating :=
    round((v_staff.expertise + v_staff.efficiency + v_staff.experience) / 3.0)::integer;

  v_period_key :=
    'EVENT-' || p_report_code || '-' ||
    to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');

  v_action_url := format(
    '#/dashboard/notifications?advisor_staff_id=%s&advisor_role=team_doctor&mode=advisor',
    v_access.staff_id
  );

  v_payload := jsonb_build_object(
    'advisor_report', true,
    'advisor_role', 'team_doctor',
    'advisor_staff_id', v_access.staff_id,
    'advisor_staff_name', v_staff.staff_name,
    'advisor_rating', v_advisor_rating,
    'advisory_access_id', v_access.id,
    'club_id', v_access.club_id,
    'report_code', p_report_code,
    'report_period_key', v_period_key,
    'report_variant', p_report_variant,
    'title', p_title,
    'summary', p_summary,
    'data', coalesce(p_data, '{}'::jsonb),
    'recommendations', coalesce(p_recommendations, '[]'::jsonb),
    'image_url', 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Team%20Doctor%20Advisory.png',
    'event_key', p_event_key,
    'generated_at', now()
  );

  insert into public.staff_advisory_reports (
    user_id, club_id, staff_id, role_type, access_id,
    report_code, report_period_key, title, summary, report_json
  )
  values (
    v_access.user_id, v_access.club_id, v_access.staff_id, 'team_doctor',
    v_access.id, p_report_code, v_period_key, p_title, p_summary, v_payload
  )
  returning id into v_report_id;

  v_notification_id := public.create_game_notification_for_user(
    v_access.user_id,
    'ADVISOR_TEAM_DOCTOR_REPORT',
    p_title,
    p_summary,
    v_action_url,
    v_payload,
    null,
    null
  );

  update public.staff_advisory_reports
  set notification_id = v_notification_id
  where id = v_report_id;

  return jsonb_build_object(
    'status','generated',
    'report_id',v_report_id,
    'notification_id',v_notification_id,
    'report_code',p_report_code
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_scan_team_doctor_events_v1(p_access_id uuid, p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_access public.staff_advisory_access%rowtype;
  v_today date := coalesce(public.get_current_game_date_date(), current_date);
  h record;
  s public.staff_advisory_medical_case_state%rowtype;
  old_state record;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_generated integer := 0;
  v_days_saved integer;
  v_summary text;
  v_recs jsonb;
  v_data jsonb;
  v_event_key text;
  v_current_status text;
  v_rider_name text;
  v_case_label text;
begin
  select * into v_access
  from public.staff_advisory_access
  where id = p_access_id
    and role_type = 'team_doctor'
    and expires_at > public.staff_advisory_game_now_v1();

  if not found then
    return jsonb_build_object('status','skipped','reason','advisor_not_active');
  end if;

  -- Process every real active/recovering injury or sickness case.
  for h in
    select *
    from public.get_club_health_overview(v_access.club_id)
    where health_case_id is not null
      and lower(coalesce(case_type,'')) in ('injury','sickness')
      and lower(coalesce(case_status,'')) in ('active','recovering')
  loop
    select * into s
    from public.staff_advisory_medical_case_state
    where access_id = v_access.id
      and health_case_id = h.health_case_id;

    v_days_saved :=
      greatest(coalesce(h.selected_base_days,0) - coalesce(h.final_recovery_days,0),0);

    v_case_label := coalesce(
      nullif(h.health_notes #>> '{calculation,display_name}', ''),
      initcap(replace(coalesce(h.case_code,h.case_type,'medical case'),'_',' '))
    );

    v_data := jsonb_build_object(
      'rider_id', h.rider_id,
      'rider_name', h.display_name,
      'country_code', h.country_code,
      'health_case_id', h.health_case_id,
      'case_type', h.case_type,
      'case_code', h.case_code,
      'case_label', v_case_label,
      'severity', h.severity,
      'body_part', h.body_part,
      'case_status', h.case_status,
      'started_on', h.started_on,
      'availability_status', h.availability_status,
      'unavailable_until', h.unavailable_until,
      'expected_full_recovery_on', h.expected_full_recovery_on,
      'base_min_days', h.base_min_days,
      'base_max_days', h.base_max_days,
      'selected_base_days', h.selected_base_days,
      'medical_staff_reduction_pct', h.medical_staff_reduction_pct,
      'infrastructure_reduction_pct', h.infrastructure_reduction_pct,
      'total_reduction_pct', h.total_reduction_pct,
      'final_recovery_days', h.final_recovery_days,
      'recovery_days_saved', v_days_saved,
      'health_notes', h.health_notes
    );

    -- Initial paid medical treatment advisory.
    if not found or s.initial_advisory_sent_at is null or p_force then
      v_event_key := format(
        'team_doctor_case:%s:%s:initial',
        v_access.id,
        h.health_case_id
      );

      if lower(h.case_type) = 'injury' then
        v_summary := format(
          '%s has a %s %s%s. Expected full recovery is %s after %s adjusted recovery game day%s.',
          h.display_name,
          coalesce(h.severity,''),
          v_case_label,
          case when h.body_part is not null then format(' affecting the %s', h.body_part) else '' end,
          coalesce(h.expected_full_recovery_on::text,'not yet confirmed'),
          coalesce(h.final_recovery_days,0),
          case when coalesce(h.final_recovery_days,0)=1 then '' else 's' end
        );
      else
        v_summary := format(
          '%s is being treated for %s (%s). Expected full recovery is %s after %s adjusted recovery game day%s.',
          h.display_name,
          v_case_label,
          coalesce(h.severity,'severity not specified'),
          coalesce(h.expected_full_recovery_on::text,'not yet confirmed'),
          coalesce(h.final_recovery_days,0),
          case when coalesce(h.final_recovery_days,0)=1 then '' else 's' end
        );
      end if;

      v_recs := jsonb_build_array(
        case
          when lower(h.case_type)='injury'
            then 'Keep the rider out of blocked training/race activity until the medical case permits a safe return.'
          else 'Follow the expected recovery date before returning the rider to normal training and race workload.'
        end,
        case
          when v_days_saved > 0 then format(
            'Medical staff and infrastructure reduce this recovery from %s to %s game days, saving %s game day%s.',
            h.selected_base_days, h.final_recovery_days, v_days_saved,
            case when v_days_saved=1 then '' else 's' end
          )
          else
            case
              when coalesce(h.total_reduction_pct,0) > 0 then format(
                'Current medical support applies a %s%% recovery-duration reduction. Whole-day rounding keeps this short case at %s game day%s.',
                round(h.total_reduction_pct,2),
                coalesce(h.final_recovery_days,0),
                case when coalesce(h.final_recovery_days,0)=1 then '' else 's' end
              )
              else 'No recovery-duration reduction is currently applied to this case.'
            end
        end
      );

      v_result := public.staff_advisory_emit_team_doctor_event_v1(
        v_access.id,
        case when lower(h.case_type)='injury'
          then 'td_injury_treatment_plan'
          else 'td_sickness_treatment_plan' end,
        case when lower(h.case_type)='injury'
          then 'Team Doctor Advisory — Injury Treatment Plan'
          else 'Team Doctor Advisory — Illness Treatment Plan' end,
        v_summary,
        case when lower(h.case_type)='injury'
          then 'injury_treatment_plan'
          else 'sickness_treatment_plan' end,
        v_data,
        v_recs,
        v_event_key
      );

      if v_result->>'status'='generated' then
        v_generated := v_generated + 1;
        v_results := v_results || jsonb_build_array(v_result);
      end if;
    end if;

    -- Material recovery-date/duration change.
    if found
       and s.last_expected_full_recovery_on is not null
       and h.expected_full_recovery_on is not null
       and (
         h.expected_full_recovery_on <> s.last_expected_full_recovery_on
         or coalesce(h.final_recovery_days,-1) <> coalesce(s.last_final_recovery_days,-1)
       )
    then
      if h.expected_full_recovery_on > s.last_expected_full_recovery_on
         or coalesce(h.final_recovery_days,0) > coalesce(s.last_final_recovery_days,0)
      then
        v_event_key := format(
          'team_doctor_case:%s:%s:setback:%s:%s',
          v_access.id,h.health_case_id,h.expected_full_recovery_on,
          coalesce(h.final_recovery_days,-1)
        );

        v_summary := format(
          '%s''s expected recovery has been delayed from %s to %s%s.',
          h.display_name,
          s.last_expected_full_recovery_on,
          h.expected_full_recovery_on,
          case
            when coalesce(h.final_recovery_days,-1) <> coalesce(s.last_final_recovery_days,-1)
              then format(
                '; adjusted recovery changed from %s to %s game days',
                coalesce(s.last_final_recovery_days,0),
                coalesce(h.final_recovery_days,0)
              )
            else ''
          end
        );

        v_result := public.staff_advisory_emit_team_doctor_event_v1(
          v_access.id,
          'td_recovery_setback',
          'Team Doctor Advisory — Recovery Setback',
          v_summary,
          'recovery_setback',
          v_data || jsonb_build_object(
            'previous_expected_full_recovery_on',s.last_expected_full_recovery_on,
            'previous_final_recovery_days',s.last_final_recovery_days
          ),
          jsonb_build_array(
            'Review the rider’s current medical case before planning a return to full training or racing.'
          ),
          v_event_key
        );
      else
        v_event_key := format(
          'team_doctor_case:%s:%s:improvement:%s:%s',
          v_access.id,h.health_case_id,h.expected_full_recovery_on,
          coalesce(h.final_recovery_days,-1)
        );

        v_summary := format(
          '%s''s expected recovery has improved from %s to %s%s.',
          h.display_name,
          s.last_expected_full_recovery_on,
          h.expected_full_recovery_on,
          case
            when coalesce(h.final_recovery_days,-1) <> coalesce(s.last_final_recovery_days,-1)
              then format(
                '; adjusted recovery changed from %s to %s game days',
                coalesce(s.last_final_recovery_days,0),
                coalesce(h.final_recovery_days,0)
              )
            else ''
          end
        );

        v_result := public.staff_advisory_emit_team_doctor_event_v1(
          v_access.id,
          'td_recovery_improvement',
          'Team Doctor Advisory — Recovery Improvement',
          v_summary,
          'recovery_improvement',
          v_data || jsonb_build_object(
            'previous_expected_full_recovery_on',s.last_expected_full_recovery_on,
            'previous_final_recovery_days',s.last_final_recovery_days
          ),
          jsonb_build_array(
            'Continue the current treatment approach and reassess the rider before restoring full workload.'
          ),
          v_event_key
        );
      end if;

      if v_result->>'status'='generated' then
        v_generated := v_generated + 1;
        v_results := v_results || jsonb_build_array(v_result);
      end if;
    end if;

    insert into public.staff_advisory_medical_case_state (
      access_id,rider_id,health_case_id,case_type,case_code,severity,body_part,
      started_on,last_case_status,last_availability_status,
      last_expected_full_recovery_on,last_final_recovery_days,
      last_total_reduction_pct,initial_advisory_sent_at,last_change_advisory_sent_at,
      clearance_advisory_sent_at,is_current,snapshot_json,first_seen_at,last_seen_at,updated_at
    )
    values (
      v_access.id,h.rider_id,h.health_case_id,h.case_type,h.case_code,h.severity,h.body_part,
      h.started_on,h.case_status,h.availability_status,h.expected_full_recovery_on,
      h.final_recovery_days,h.total_reduction_pct,
      case when not found or s.initial_advisory_sent_at is null or p_force
        then now() else s.initial_advisory_sent_at end,
      case
        when found and (
          h.expected_full_recovery_on is distinct from s.last_expected_full_recovery_on
          or h.final_recovery_days is distinct from s.last_final_recovery_days
        ) then now()
        else s.last_change_advisory_sent_at
      end,
      s.clearance_advisory_sent_at,
      true,v_data,
      coalesce(s.first_seen_at,now()),now(),now()
    )
    on conflict (access_id,health_case_id) do update
    set case_type=excluded.case_type,
        case_code=excluded.case_code,
        severity=excluded.severity,
        body_part=excluded.body_part,
        last_case_status=excluded.last_case_status,
        last_availability_status=excluded.last_availability_status,
        last_expected_full_recovery_on=excluded.last_expected_full_recovery_on,
        last_final_recovery_days=excluded.last_final_recovery_days,
        last_total_reduction_pct=excluded.last_total_reduction_pct,
        initial_advisory_sent_at=coalesce(
          public.staff_advisory_medical_case_state.initial_advisory_sent_at,
          excluded.initial_advisory_sent_at
        ),
        last_change_advisory_sent_at=greatest(
          public.staff_advisory_medical_case_state.last_change_advisory_sent_at,
          excluded.last_change_advisory_sent_at
        ),
        is_current=true,
        snapshot_json=excluded.snapshot_json,
        last_seen_at=now(),
        updated_at=now();
  end loop;

  -- Previously tracked cases no longer active/recovering:
  -- only emit clearance when the rider is actually FIT now.
  for old_state in
    select ms.*
    from public.staff_advisory_medical_case_state ms
    where ms.access_id = v_access.id
      and ms.is_current = true
      and not exists (
        select 1
        from public.get_club_health_overview(v_access.club_id) h2
        where h2.health_case_id = ms.health_case_id
          and lower(coalesce(h2.case_status,'')) in ('active','recovering')
      )
  loop
    select
      coalesce(r.availability_status,'fit'),
      r.display_name
    into v_current_status, v_rider_name
    from public.riders r
    join public.club_riders cr on cr.rider_id = r.id
    where r.id = old_state.rider_id
      and cr.club_id = v_access.club_id
    limit 1;

    if lower(coalesce(v_current_status,'')) = 'fit'
       and old_state.clearance_advisory_sent_at is null
    then
      v_event_key := format(
        'team_doctor_case:%s:%s:medical_clearance',
        v_access.id,old_state.health_case_id
      );

      v_summary := format(
        '%s has completed recovery from %s and is medically available again.',
        coalesce(v_rider_name,'The rider'),
        replace(coalesce(old_state.case_code,old_state.case_type,'the medical case'),'_',' ')
      );

      v_result := public.staff_advisory_emit_team_doctor_event_v1(
        v_access.id,
        'td_medical_clearance',
        'Team Doctor Advisory — Medical Clearance',
        v_summary,
        'medical_clearance',
        old_state.snapshot_json || jsonb_build_object(
          'availability_status','fit',
          'cleared_on_game_date',v_today
        ),
        jsonb_build_array(
          'The rider is medically available again. Reintroduce full training and race workload according to your sporting plan.'
        ),
        v_event_key
      );

      if v_result->>'status'='generated' then
        v_generated := v_generated + 1;
        v_results := v_results || jsonb_build_array(v_result);
      end if;

      update public.staff_advisory_medical_case_state
      set clearance_advisory_sent_at=now(),
          is_current=false,
          last_availability_status='fit',
          updated_at=now()
      where id=old_state.id;
    else
      update public.staff_advisory_medical_case_state
      set is_current=false,
          last_availability_status=v_current_status,
          updated_at=now()
      where id=old_state.id;
    end if;
  end loop;

  return jsonb_build_object(
    'status','checked',
    'access_id',v_access.id,
    'generated_count',v_generated,
    'results',v_results,
    'checked_game_date',v_today
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_scan_all_team_doctor_events_v1(p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  rec record;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_generated integer := 0;
begin
  for rec in
    select a.id
    from public.staff_advisory_access a
    join public.club_staff s
      on s.id=a.staff_id and s.club_id=a.club_id
    join public.clubs c on c.id=a.club_id
    where a.role_type='team_doctor'
      and a.expires_at > public.staff_advisory_game_now_v1()
      and s.is_active=true
      and s.role_type::text='team_doctor'
      and c.deleted_at is null
      and c.is_active=true
  loop
    begin
      v_result := public.staff_advisory_scan_team_doctor_events_v1(rec.id,p_force);
      v_generated := v_generated + coalesce((v_result->>'generated_count')::integer,0);
      v_results := v_results || jsonb_build_array(v_result);
    exception when others then
      v_results := v_results || jsonb_build_array(
        jsonb_build_object('status','failed','access_id',rec.id,'error',sqlerrm,'sqlstate',sqlstate)
      );
    end;
  end loop;

  return jsonb_build_object(
    'generated_count',v_generated,
    'results',v_results,
    'checked_at',now()
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_emit_mechanic_event_v1(p_access_id uuid, p_report_code text, p_title text, p_summary text, p_report_variant text, p_data jsonb, p_recommendations jsonb, p_event_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_access public.staff_advisory_access%rowtype;
  v_staff public.club_staff%rowtype;
  v_report_id uuid;
  v_notification_id bigint;
  v_period_key text;
  v_payload jsonb;
  v_action_url text;
  v_advisor_rating integer;
begin
  select *
  into v_access
  from public.staff_advisory_access
  where id = p_access_id
    and role_type = 'mechanic'
    and expires_at > public.staff_advisory_game_now_v1();

  if not found then
    return jsonb_build_object(
      'status','skipped',
      'reason','advisor_not_active'
    );
  end if;

  select *
  into v_staff
  from public.club_staff
  where id = v_access.staff_id
    and club_id = v_access.club_id
    and is_active = true
    and role_type::text = 'mechanic';

  if not found then
    return jsonb_build_object(
      'status','skipped',
      'reason','chief_mechanic_not_active'
    );
  end if;

  v_advisor_rating :=
    round(
      (
        v_staff.expertise +
        v_staff.efficiency +
        v_staff.experience
      ) / 3.0
    )::integer;

  v_period_key :=
    'EVENT-' || p_report_code || '-' ||
    to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');

  v_action_url := format(
    '#/dashboard/notifications?advisor_staff_id=%s&advisor_role=mechanic&mode=advisor',
    v_access.staff_id
  );

  v_payload := jsonb_build_object(
    'advisor_report', true,
    'advisor_role', 'mechanic',
    'advisor_staff_id', v_access.staff_id,
    'advisor_staff_name', v_staff.staff_name,
    'advisor_rating', v_advisor_rating,
    'advisory_access_id', v_access.id,
    'club_id', v_access.club_id,
    'report_code', p_report_code,
    'report_period_key', v_period_key,
    'report_variant', p_report_variant,
    'title', p_title,
    'summary', p_summary,
    'data', coalesce(p_data, '{}'::jsonb),
    'recommendations', coalesce(p_recommendations, '[]'::jsonb),
    'image_url', 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Chief%20Mechanic%20Advisory.png',
    'event_key', p_event_key,
    'generated_at', now()
  );

  insert into public.staff_advisory_reports (
    user_id,
    club_id,
    staff_id,
    role_type,
    access_id,
    report_code,
    report_period_key,
    title,
    summary,
    report_json
  )
  values (
    v_access.user_id,
    v_access.club_id,
    v_access.staff_id,
    'mechanic',
    v_access.id,
    p_report_code,
    v_period_key,
    p_title,
    p_summary,
    v_payload
  )
  returning id into v_report_id;

  v_notification_id := public.create_game_notification_for_user(
    v_access.user_id,
    'ADVISOR_CHIEF_MECHANIC_REPORT',
    p_title,
    p_summary,
    v_action_url,
    v_payload,
    null,
    null
  );

  update public.staff_advisory_reports
  set notification_id = v_notification_id
  where id = v_report_id;

  return jsonb_build_object(
    'status','generated',
    'report_id',v_report_id,
    'notification_id',v_notification_id,
    'report_code',p_report_code
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_scan_mechanic_events_v1(p_access_id uuid, p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_access public.staff_advisory_access%rowtype;

  v_attention integer := 0;
  v_critical integer := 0;
  v_pending_jobs integer := 0;
  v_problem_items jsonb := '[]'::jsonb;

  v_signature text;
  v_state public.staff_advisory_event_state%rowtype;

  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_generated integer := 0;

  v_summary text;
  v_recommendations jsonb;
  v_event_key text;
begin
  select *
  into v_access
  from public.staff_advisory_access
  where id = p_access_id
    and role_type = 'mechanic'
    and expires_at > public.staff_advisory_game_now_v1();

  if not found then
    return jsonb_build_object(
      'status','skipped',
      'reason','advisor_not_active'
    );
  end if;

  select
    count(*) filter (
      where status in ('worn','in_maintenance')
         or condition_percent < 70
    )::integer,
    count(*) filter (
      where condition_percent < 30
        and status not in ('sold','discarded')
    )::integer
  into
    v_attention,
    v_critical
  from public.club_equipment_inventory
  where club_id = v_access.club_id
    and status not in ('sold','discarded');

  select count(*)::integer
  into v_pending_jobs
  from public.club_equipment_maintenance_jobs
  where club_id = v_access.club_id
    and status = 'pending';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'equipment_id', x.id,
        'equipment_category', x.equipment_category,
        'category_label', initcap(replace(x.equipment_category,'_',' ')),
        'display_name', x.display_name,
        'condition_percent', x.condition_percent,
        'status', x.status,
        'status_label', initcap(replace(x.status,'_',' ')),
        'total_race_days', x.total_race_days,
        'last_used_game_date', x.last_used_game_date,
        'priority',
          case
            when x.condition_percent < 30 then 'critical'
            when x.status = 'in_maintenance' then 'in_maintenance'
            when x.condition_percent < 50 then 'high'
            else 'watch'
          end
      )
      order by x.condition_percent, x.display_name
    ),
    '[]'::jsonb
  )
  into v_problem_items
  from (
    select
      id,
      equipment_category,
      display_name,
      condition_percent,
      status,
      total_race_days,
      last_used_game_date
    from public.club_equipment_inventory
    where club_id = v_access.club_id
      and status not in ('sold','discarded')
      and (
        status in ('worn','in_maintenance')
        or condition_percent < 70
      )
    order by condition_percent, display_name
    limit 12
  ) x;

  v_signature := md5(
    concat_ws(
      '|',
      v_attention::text,
      v_critical::text,
      v_pending_jobs::text,
      v_problem_items::text
    )
  );

  select *
  into v_state
  from public.staff_advisory_event_state
  where access_id = v_access.id
    and event_code = 'mechanic_equipment_condition_priority';

  -- Active condition: equipment genuinely needs workshop attention.
  if v_attention > 0 then
    if not found
       or v_state.condition_active = false
       or v_state.last_signature is distinct from v_signature
       or p_force
    then
      v_summary := format(
        'Workshop priority review: %s equipment item%s require attention, including %s critical item%s below 30%% condition. %s maintenance job%s are currently pending.',
        v_attention,
        case when v_attention = 1 then '' else 's' end,
        v_critical,
        case when v_critical = 1 then '' else 's' end,
        v_pending_jobs,
        case when v_pending_jobs = 1 then '' else 's' end
      );

      v_recommendations := jsonb_build_array(
        case
          when v_critical > 0
            then 'Handle critical equipment first before assigning it to another race setup.'
          else 'Review the listed equipment and prioritize maintenance before condition deteriorates further.'
        end
      );

      v_event_key := format(
        'chief_mechanic:%s:equipment_condition:%s',
        v_access.id,
        v_signature
      );

      v_result := public.staff_advisory_emit_mechanic_event_v1(
        v_access.id,
        'mechanic_equipment_condition_priority',
        'Chief Mechanic Advisory — Equipment Condition Priority',
        v_summary,
        'equipment_condition_priority',
        jsonb_build_object(
          'equipment_needing_attention_count', v_attention,
          'critical_items', v_critical,
          'pending_maintenance_jobs', v_pending_jobs,
          'equipment_needing_attention', v_problem_items
        ),
        v_recommendations,
        v_event_key
      );

      if v_result->>'status' = 'generated' then
        v_generated := v_generated + 1;
        v_results := v_results || jsonb_build_array(v_result);
      end if;
    end if;

    insert into public.staff_advisory_event_state (
      access_id,
      event_code,
      condition_active,
      last_signature,
      last_notified_at,
      last_checked_at,
      state_json,
      updated_at
    )
    values (
      v_access.id,
      'mechanic_equipment_condition_priority',
      true,
      v_signature,
      case
        when not found
          or v_state.condition_active = false
          or v_state.last_signature is distinct from v_signature
          or p_force
        then now()
        else v_state.last_notified_at
      end,
      now(),
      jsonb_build_object(
        'equipment_needing_attention_count', v_attention,
        'critical_items', v_critical,
        'pending_maintenance_jobs', v_pending_jobs,
        'equipment_needing_attention', v_problem_items
      ),
      now()
    )
    on conflict (access_id,event_code) do update
    set
      condition_active = true,
      last_signature = excluded.last_signature,
      last_notified_at = coalesce(
        excluded.last_notified_at,
        public.staff_advisory_event_state.last_notified_at
      ),
      last_checked_at = now(),
      state_json = excluded.state_json,
      updated_at = now();

  else
    -- Positive resolution only if this advisory previously had an active problem.
    if found and v_state.condition_active = true then
      v_event_key := format(
        'chief_mechanic:%s:workshop_readiness_restored:%s',
        v_access.id,
        to_char(clock_timestamp(),'YYYYMMDDHH24MISS')
      );

      v_result := public.staff_advisory_emit_mechanic_event_v1(
        v_access.id,
        'mechanic_workshop_readiness_restored',
        'Chief Mechanic Advisory — Workshop Readiness Restored',
        'The previously flagged equipment-condition problem has cleared. No active durable equipment item is currently worn, in maintenance, or below 70% condition.',
        'workshop_readiness_restored',
        jsonb_build_object(
          'equipment_needing_attention_count', 0,
          'critical_items', 0,
          'pending_maintenance_jobs', v_pending_jobs,
          'equipment_needing_attention', '[]'::jsonb
        ),
        jsonb_build_array(
          'No immediate equipment-condition intervention is required. Continue normal workshop monitoring.'
        ),
        v_event_key
      );

      if v_result->>'status' = 'generated' then
        v_generated := v_generated + 1;
        v_results := v_results || jsonb_build_array(v_result);
      end if;
    end if;

    insert into public.staff_advisory_event_state (
      access_id,
      event_code,
      condition_active,
      last_signature,
      last_notified_at,
      last_checked_at,
      state_json,
      updated_at
    )
    values (
      v_access.id,
      'mechanic_equipment_condition_priority',
      false,
      v_signature,
      v_state.last_notified_at,
      now(),
      jsonb_build_object(
        'equipment_needing_attention_count', 0,
        'critical_items', 0,
        'pending_maintenance_jobs', v_pending_jobs,
        'equipment_needing_attention', '[]'::jsonb
      ),
      now()
    )
    on conflict (access_id,event_code) do update
    set
      condition_active = false,
      last_signature = excluded.last_signature,
      last_checked_at = now(),
      state_json = excluded.state_json,
      updated_at = now();
  end if;

  return jsonb_build_object(
    'status','checked',
    'access_id',v_access.id,
    'generated_count',v_generated,
    'results',v_results,
    'equipment_needing_attention_count',v_attention,
    'critical_items',v_critical,
    'pending_maintenance_jobs',v_pending_jobs
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_scan_all_mechanic_events_v1(p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  rec record;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_generated integer := 0;
begin
  for rec in
    select a.id
    from public.staff_advisory_access a
    join public.club_staff s
      on s.id = a.staff_id
     and s.club_id = a.club_id
    join public.clubs c
      on c.id = a.club_id
    where a.role_type = 'mechanic'
      and a.expires_at > public.staff_advisory_game_now_v1()
      and s.is_active = true
      and s.role_type::text = 'mechanic'
      and c.deleted_at is null
      and c.is_active = true
  loop
    begin
      v_result :=
        public.staff_advisory_scan_mechanic_events_v1(
          rec.id,
          p_force
        );

      v_generated :=
        v_generated +
        coalesce(
          (v_result->>'generated_count')::integer,
          0
        );

      v_results :=
        v_results ||
        jsonb_build_array(v_result);

    exception when others then
      v_results :=
        v_results ||
        jsonb_build_array(
          jsonb_build_object(
            'status','failed',
            'access_id',rec.id,
            'error',sqlerrm,
            'sqlstate',sqlstate
          )
        );
    end;
  end loop;

  return jsonb_build_object(
    'generated_count',v_generated,
    'results',v_results,
    'checked_at',now()
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_validate_point_contract_legacy_v1(p_stage_id uuid, p_input_snapshot jsonb DEFAULT NULL::jsonb, p_universal_result jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_stage record;
  v_start_count integer := 0;
  v_finish_count integer := 0;
  v_sprint_count integer := 0;
  v_kom_count integer := 0;
  v_total_point_count integer := 0;
  v_expected_scoring_rows integer := 0;
  v_invalid_canonical_row_count integer := 0;
  v_json_sprint_count integer := 0;
  v_json_kom_count integer := 0;
  v_canonical_structure_ok boolean := false;

  v_input_checked boolean := p_input_snapshot is not null;
  v_input_point_count integer := 0;
  v_input_distinct_point_count integer := 0;
  v_input_mismatch_count integer := 0;
  v_input_ok boolean := true;

  v_output_checked boolean := p_universal_result is not null;
  v_output_row_count integer := 0;
  v_output_expected_mismatch_count integer := 0;
  v_output_unknown_row_count integer := 0;
  v_output_duplicate_rider_count integer := 0;
  v_output_ok boolean := true;
begin
  if p_stage_id is null then
    return jsonb_build_object(
      'status', 'point_contract_invalid',
      'reason', 'stage_id_required'
    );
  end if;

  select
    stage.id,
    stage.distance_km,
    coalesce(stage.intermediate_sprints_json, '[]'::jsonb) as intermediate_sprints_json,
    coalesce(stage.mountain_climbs_json, '[]'::jsonb) as mountain_climbs_json
  into v_stage
  from public.race_stages stage
  where stage.id = p_stage_id;

  if not found then
    return jsonb_build_object(
      'status', 'point_contract_invalid',
      'reason', 'stage_not_found',
      'stage_id', p_stage_id
    );
  end if;

  if jsonb_typeof(v_stage.intermediate_sprints_json) = 'array' then
    v_json_sprint_count := jsonb_array_length(v_stage.intermediate_sprints_json);
  end if;
  if jsonb_typeof(v_stage.mountain_climbs_json) = 'array' then
    v_json_kom_count := jsonb_array_length(v_stage.mountain_climbs_json);
  end if;

  select
    count(*) filter (where upper(point.point_type) = 'START')::integer,
    count(*) filter (where upper(point.point_type) = 'FINISH')::integer,
    count(*) filter (
      where upper(point.point_type) in ('INTERMEDIATE_SPRINT', 'BONUS_SPRINT')
    )::integer,
    count(*) filter (where upper(point.point_type) = 'KOM')::integer,
    count(*)::integer,
    coalesce(sum(
      case
        when upper(point.point_type) = 'START' then 0
        else greatest(
          case when jsonb_typeof(point.points_scheme) = 'array'
            then jsonb_array_length(point.points_scheme) else 0 end,
          case when jsonb_typeof(point.time_bonus_seconds) = 'array'
            then jsonb_array_length(point.time_bonus_seconds) else 0 end
        )
      end
    ), 0)::integer,
    count(*) filter (
      where
        upper(point.point_type) not in (
          'START', 'FINISH', 'INTERMEDIATE_SPRINT', 'BONUS_SPRINT', 'KOM'
        )
        or point.km_from_start < 0
        or point.km_from_start > v_stage.distance_km
        or jsonb_typeof(point.points_scheme) <> 'array'
        or jsonb_typeof(point.time_bonus_seconds) <> 'array'
        or (
          upper(point.point_type) <> 'START'
          and greatest(
            case when jsonb_typeof(point.points_scheme) = 'array'
              then jsonb_array_length(point.points_scheme) else 0 end,
            case when jsonb_typeof(point.time_bonus_seconds) = 'array'
              then jsonb_array_length(point.time_bonus_seconds) else 0 end
          ) <= 0
        )
    )::integer
  into
    v_start_count,
    v_finish_count,
    v_sprint_count,
    v_kom_count,
    v_total_point_count,
    v_expected_scoring_rows,
    v_invalid_canonical_row_count
  from public.race_stage_points point
  where point.stage_id = p_stage_id;

  -- Canonical race_stage_points is authoritative once present.
  -- Current stage JSON counts are diagnostic only because stage JSON may be
  -- edited after the frozen canonical point contract was created.
  v_canonical_structure_ok :=
    v_start_count = 1
    and v_finish_count = 1
    and v_total_point_count >= 2
    and v_invalid_canonical_row_count = 0;

  if v_input_checked then
    if jsonb_typeof(p_input_snapshot -> 'points') <> 'array' then
      v_input_ok := false;
      v_input_mismatch_count := 1;
    else
      select
        count(*)::integer,
        count(distinct input_point.item ->> 'pointId')::integer
      into v_input_point_count, v_input_distinct_point_count
      from jsonb_array_elements(p_input_snapshot -> 'points') as input_point(item);

      select count(*)::integer
      into v_input_mismatch_count
      from public.race_stage_points canonical
      where canonical.stage_id = p_stage_id
        and not exists (
          select 1
          from jsonb_array_elements(p_input_snapshot -> 'points') as input_point(item)
          where input_point.item ->> 'pointId' = canonical.id::text
            and input_point.item ->> 'stageId' = p_stage_id::text
            and upper(coalesce(input_point.item ->> 'pointType', '')) = upper(canonical.point_type)
            and coalesce(input_point.item -> 'pointsScheme', '[]'::jsonb) = canonical.points_scheme
            and coalesce(input_point.item -> 'timeBonusSeconds', '[]'::jsonb) = canonical.time_bonus_seconds
            and nullif(input_point.item ->> 'kmFromStart', '')::numeric = canonical.km_from_start
        );

      v_input_mismatch_count := v_input_mismatch_count + (
        select count(*)::integer
        from jsonb_array_elements(p_input_snapshot -> 'points') as input_point(item)
        where not exists (
          select 1
          from public.race_stage_points canonical
          where canonical.stage_id = p_stage_id
            and canonical.id::text = input_point.item ->> 'pointId'
        )
      );

      v_input_ok :=
        v_input_point_count = v_total_point_count
        and v_input_distinct_point_count = v_total_point_count
        and v_input_mismatch_count = 0;
    end if;
  end if;

  if v_output_checked then
    if jsonb_typeof(p_universal_result #> '{publication,pointResults}') <> 'array' then
      v_output_ok := false;
      v_output_expected_mismatch_count := 1;
    else
      select count(*)::integer
      into v_output_row_count
      from jsonb_array_elements(
        p_universal_result #> '{publication,pointResults}'
      ) as output_row(item);

      with canonical_scoring as (
        select
          point.id as point_id,
          point.points_scheme,
          point.time_bonus_seconds,
          greatest(
            jsonb_array_length(point.points_scheme),
            jsonb_array_length(point.time_bonus_seconds)
          ) as expected_slots
        from public.race_stage_points point
        where point.stage_id = p_stage_id
          and upper(point.point_type) <> 'START'
      ),
      expected as (
        select
          scoring.point_id,
          rank_number,
          coalesce((scoring.points_scheme ->> (rank_number - 1))::integer, 0) as expected_points,
          coalesce((scoring.time_bonus_seconds ->> (rank_number - 1))::integer, 0) as expected_bonus
        from canonical_scoring scoring
        cross join lateral generate_series(1, scoring.expected_slots) as rank_number
      ),
      actual as (
        select
          output_row.item ->> 'pointId' as point_id,
          nullif(output_row.item ->> 'rank', '')::integer as rank_number,
          coalesce(nullif(output_row.item ->> 'pointsAwarded', '')::integer, 0) as points_awarded,
          coalesce(nullif(output_row.item ->> 'bonusSecondsAwarded', '')::integer, 0) as bonus_seconds_awarded,
          output_row.item ->> 'riderId' as rider_id
        from jsonb_array_elements(
          p_universal_result #> '{publication,pointResults}'
        ) as output_row(item)
      )
      select count(*)::integer
      into v_output_expected_mismatch_count
      from expected expected_row
      where (
        select count(*)
        from actual actual_row
        where actual_row.point_id = expected_row.point_id::text
          and actual_row.rank_number = expected_row.rank_number
          and actual_row.points_awarded = expected_row.expected_points
          and actual_row.bonus_seconds_awarded = expected_row.expected_bonus
      ) <> 1;

      with canonical_scoring as (
        select
          point.id as point_id,
          greatest(
            jsonb_array_length(point.points_scheme),
            jsonb_array_length(point.time_bonus_seconds)
          ) as expected_slots
        from public.race_stage_points point
        where point.stage_id = p_stage_id
          and upper(point.point_type) <> 'START'
      ),
      actual as (
        select
          output_row.item ->> 'pointId' as point_id,
          nullif(output_row.item ->> 'rank', '')::integer as rank_number,
          output_row.item ->> 'riderId' as rider_id
        from jsonb_array_elements(
          p_universal_result #> '{publication,pointResults}'
        ) as output_row(item)
      )
      select count(*)::integer
      into v_output_unknown_row_count
      from actual actual_row
      where actual_row.point_id is null
         or actual_row.rider_id is null
         or not exists (
           select 1
           from canonical_scoring scoring
           where scoring.point_id::text = actual_row.point_id
             and actual_row.rank_number between 1 and scoring.expected_slots
         );

      select count(*)::integer
      into v_output_duplicate_rider_count
      from (
        select
          output_row.item ->> 'pointId' as point_id,
          output_row.item ->> 'riderId' as rider_id,
          count(*) as row_count
        from jsonb_array_elements(
          p_universal_result #> '{publication,pointResults}'
        ) as output_row(item)
        group by
          output_row.item ->> 'pointId',
          output_row.item ->> 'riderId'
        having count(*) <> 1
      ) duplicate_rows;

      v_output_ok :=
        v_output_row_count = v_expected_scoring_rows
        and v_output_expected_mismatch_count = 0
        and v_output_unknown_row_count = 0
        and v_output_duplicate_rider_count = 0;
    end if;
  end if;

  return jsonb_build_object(
    'status', case
      when v_canonical_structure_ok
       and (not v_input_checked or v_input_ok)
       and (not v_output_checked or v_output_ok)
        then 'point_contract_ready'
      else 'point_contract_invalid'
    end,
    'stage_id', p_stage_id,
    'canonical', jsonb_build_object(
      'ready', v_canonical_structure_ok,
      'start_count', v_start_count,
      'finish_count', v_finish_count,
      'sprint_count', v_sprint_count,
      'kom_count', v_kom_count,
      'total_point_count', v_total_point_count,
      'expected_scoring_rows', v_expected_scoring_rows,
      'invalid_row_count', v_invalid_canonical_row_count
    ),
    'stage_json_diagnostic', jsonb_build_object(
      'sprint_count', v_json_sprint_count,
      'kom_count', v_json_kom_count,
      'canonical_vs_stage_json_drift',
        v_sprint_count <> v_json_sprint_count or v_kom_count <> v_json_kom_count
    ),
    'input', jsonb_build_object(
      'checked', v_input_checked,
      'ready', v_input_ok,
      'point_count', v_input_point_count,
      'distinct_point_count', v_input_distinct_point_count,
      'mismatch_count', v_input_mismatch_count
    ),
    'output', jsonb_build_object(
      'checked', v_output_checked,
      'ready', v_output_ok,
      'row_count', v_output_row_count,
      'expected_row_count', v_expected_scoring_rows,
      'expected_mismatch_count', v_output_expected_mismatch_count,
      'unknown_row_count', v_output_unknown_row_count,
      'duplicate_rider_count', v_output_duplicate_rider_count
    )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_prepare_point_contract_trigger_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_validation jsonb;
begin
  if new.engine_version = 'race_engine_ts_v1'
     and new.simulation_mode = 'deterministic_road_race_v1'
     and coalesce(new.result_summary_json ->> 'calculation_contract', '') = 'phase11b_claim_pending_v1'
  then
    perform public.sync_race_stage_points_from_stage_json_v1(new.stage_id, false);

    v_validation := public.universal_race_stage_validate_point_contract_v1(
      new.stage_id,
      null,
      null
    );

    if coalesce(v_validation ->> 'status', '') <> 'point_contract_ready' then
      raise exception using
        errcode = 'P0001',
        message = format(
          'Phase 11 point contract is not ready for stage %s: %s',
          new.stage_id,
          v_validation::text
        );
    end if;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_validate_hidden_submission_trigger_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_validation jsonb;
begin
  if new.engine_version = 'race_engine_ts_v1'
     and new.simulation_mode = 'deterministic_road_race_v1'
     and coalesce(new.result_summary_json ->> 'calculation_contract', '') = 'universal_phase11b_calculated_hidden_v1'
     and coalesce(old.result_summary_json ->> 'calculation_contract', '') is distinct from 'universal_phase11b_calculated_hidden_v1'
  then
    v_validation := public.universal_race_stage_validate_point_contract_v1(
      new.stage_id,
      new.input_snapshot_json,
      new.result_summary_json -> 'output_snapshot'
    );

    if coalesce(v_validation ->> 'status', '') <> 'point_contract_ready' then
      raise exception using
        errcode = 'P0001',
        message = format(
          'Phase 11 sporting-integrity point validation failed for stage %s: %s',
          new.stage_id,
          v_validation::text
        );
    end if;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_validate_authority_trigger_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_run public.race_stage_simulation_runs%rowtype;
  v_validation jsonb;
  v_expected_persisted_rows integer := 0;
  v_actual_persisted_rows integer := 0;
  v_persisted_mismatch_count integer := 0;
begin
  if new.engine_version = 'race_engine_ts_v1'
     and new.simulation_mode = 'deterministic_road_race_v1'
  then
    select run.*
    into v_run
    from public.race_stage_simulation_runs run
    where run.id = new.simulation_run_id
      and run.stage_id = new.stage_id;

    if not found then
      raise exception 'Authoritative Phase 11 run % for stage % was not found.',
        new.simulation_run_id,
        new.stage_id;
    end if;

    v_validation := public.universal_race_stage_validate_point_contract_v1(
      new.stage_id,
      v_run.input_snapshot_json,
      v_run.result_summary_json -> 'output_snapshot'
    );

    if coalesce(v_validation ->> 'status', '') <> 'point_contract_ready' then
      raise exception using
        errcode = 'P0001',
        message = format(
          'Phase 11 authority activation blocked by sporting-integrity validation for stage %s: %s',
          new.stage_id,
          v_validation::text
        );
    end if;

    v_expected_persisted_rows := coalesce(
      (v_validation #>> '{canonical,expected_scoring_rows}')::integer,
      0
    );

    select count(*)::integer
    into v_actual_persisted_rows
    from public.race_stage_point_results result
    where result.stage_id = new.stage_id;

    with expected as (
      select
        point.id as point_id,
        rank_number,
        coalesce((point.points_scheme ->> (rank_number - 1))::integer, 0) as expected_points,
        coalesce((point.time_bonus_seconds ->> (rank_number - 1))::integer, 0) as expected_bonus
      from public.race_stage_points point
      cross join lateral generate_series(
        1,
        greatest(
          jsonb_array_length(point.points_scheme),
          jsonb_array_length(point.time_bonus_seconds)
        )
      ) as rank_number
      where point.stage_id = new.stage_id
        and upper(point.point_type) <> 'START'
    )
    select count(*)::integer
    into v_persisted_mismatch_count
    from expected expected_row
    where (
      select count(*)
      from public.race_stage_point_results result
      where result.stage_id = new.stage_id
        and result.point_id = expected_row.point_id
        and result.rank = expected_row.rank_number
        and result.points_awarded = expected_row.expected_points
        and result.bonus_seconds_awarded = expected_row.expected_bonus
    ) <> 1;

    if v_actual_persisted_rows <> v_expected_persisted_rows
       or v_persisted_mismatch_count <> 0
    then
      raise exception using
        errcode = 'P0001',
        message = format(
          'Phase 11 authority activation blocked because persisted point rows are incomplete for stage %s (expected=%s actual=%s mismatches=%s).',
          new.stage_id,
          v_expected_persisted_rows,
          v_actual_persisted_rows,
          v_persisted_mismatch_count
        );
    end if;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_activate_parent_race_trigger_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  update public.races race
  set status = 'active',
      updated_at = clock_timestamp()
  where race.id = new.race_id
    and race.is_stage_race
    and race.status = 'scheduled';

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_emit_scout_event_v1(p_access_id uuid, p_report_code text, p_title text, p_summary text, p_report_variant text, p_data jsonb, p_recommendations jsonb, p_event_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_access public.staff_advisory_access%rowtype;
  v_staff public.club_staff%rowtype;
  v_report_id uuid;
  v_notification_id bigint;
  v_period_key text;
  v_payload jsonb;
  v_action_url text;
  v_advisor_rating integer;
begin
  select *
  into v_access
  from public.staff_advisory_access
  where id = p_access_id
    and role_type = 'scout_analyst'
    and expires_at > public.staff_advisory_game_now_v1();

  if not found then
    return jsonb_build_object('status','skipped','reason','advisor_not_active');
  end if;

  select *
  into v_staff
  from public.club_staff
  where id = v_access.staff_id
    and club_id = v_access.club_id
    and is_active = true
    and role_type::text = 'scout_analyst';

  if not found then
    return jsonb_build_object('status','skipped','reason','scout_not_active');
  end if;

  v_advisor_rating := round(
    (v_staff.expertise + v_staff.efficiency + v_staff.experience) / 3.0
  )::integer;

  v_period_key := 'EVENT-' || p_report_code || '-' || p_event_key;

  if exists (
    select 1
    from public.staff_advisory_reports r
    where r.access_id = v_access.id
      and r.report_code = p_report_code
      and r.report_json->>'event_key' = p_event_key
  ) then
    return jsonb_build_object(
      'status','skipped',
      'reason','already_generated',
      'event_key',p_event_key
    );
  end if;

  v_action_url := format(
    '#/dashboard/notifications?advisor_staff_id=%s&advisor_role=scout_analyst&mode=advisor',
    v_access.staff_id
  );

  v_payload := jsonb_build_object(
    'advisor_report', true,
    'advisor_role', 'scout_analyst',
    'advisor_staff_id', v_access.staff_id,
    'advisor_staff_name', v_staff.staff_name,
    'advisor_rating', v_advisor_rating,
    'advisory_access_id', v_access.id,
    'club_id', v_access.club_id,
    'report_code', p_report_code,
    'report_period_key', v_period_key,
    'report_variant', p_report_variant,
    'title', p_title,
    'summary', p_summary,
    'image_url', 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Chief%20Scout%20Advisory.png',
    'data', coalesce(p_data, '{}'::jsonb),
    'recommendations', coalesce(p_recommendations, '[]'::jsonb),
    'actions', jsonb_build_array(
      jsonb_build_object('label','Scouting','target','/dashboard/scouting')
    ),
    'event_key', p_event_key,
    'visual_key', 'scout_priority_prospect',
    'generated_at', now()
  );

  insert into public.staff_advisory_reports (
    user_id,
    club_id,
    staff_id,
    role_type,
    access_id,
    report_code,
    report_period_key,
    title,
    summary,
    report_json
  )
  values (
    v_access.user_id,
    v_access.club_id,
    v_access.staff_id,
    'scout_analyst',
    v_access.id,
    p_report_code,
    v_period_key,
    p_title,
    p_summary,
    v_payload
  )
  returning id into v_report_id;

  v_notification_id := public.create_game_notification_for_user(
    v_access.user_id,
    'ADVISOR_SCOUT_REPORT',
    p_title,
    p_summary,
    v_action_url,
    v_payload,
    null,
    null
  );

  update public.staff_advisory_reports
  set notification_id = v_notification_id
  where id = v_report_id;

  return jsonb_build_object(
    'status','generated',
    'report_id',v_report_id,
    'notification_id',v_notification_id,
    'report_code',p_report_code,
    'event_key',p_event_key
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_scan_scout_events_v1(p_access_id uuid, p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_access public.staff_advisory_access%rowtype;
  rec record;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_generated integer := 0;
  v_potential_label text;
  v_strengths jsonb;
  v_summary text;
  v_recommendations jsonb;
  v_event_key text;
begin
  select *
  into v_access
  from public.staff_advisory_access
  where id = p_access_id
    and role_type = 'scout_analyst'
    and expires_at > public.staff_advisory_game_now_v1();

  if not found then
    return jsonb_build_object('status','skipped','reason','advisor_not_active');
  end if;

  for rec in
    select
      rsr.id as scout_report_id,
      rsr.rider_id,
      coalesce(
        nullif(trim(concat_ws(' ', r.first_name, r.last_name)), ''),
        nullif(r.display_name, ''),
        nullif(rsr.report_json->>'rider_name', ''),
        'Unknown rider'
      ) as rider_name,
      r.first_name as rider_first_name,
      r.last_name as rider_last_name,
      nullif(trim(concat_ws(' ', r.first_name, r.last_name)), '') as rider_full_name,
      r.country_code as rider_country_code,
      rsr.created_at as completed_real_at,
      coalesce(rsr.created_at_game_ts, rsr.scouted_on_game_date::timestamp) as completed_game_at,
      rsr.scouted_on_game_date,
      rsr.precision_score,
      rsr.precision_tier,
      rsr.review_status,
      coalesce(
        rsr.report_json #>> '{overall,label}',
        rsr.report_json #>> '{overall,exact}',
        '—'
      ) as overall_label,
      nullif(rsr.report_json #>> '{overall,exact}', '')::numeric as overall_exact,
      nullif(rsr.report_json #>> '{potential,exact}', '')::numeric as potential_exact,
      nullif(rsr.report_json->>'notes', '') as notes,
      rsr.report_json
    from public.rider_scout_reports rsr
    left join public.riders r
      on r.id = rsr.rider_id
    where rsr.club_id = v_access.club_id
      and rsr.created_at >= v_access.activated_at
      and nullif(rsr.report_json #>> '{potential,exact}', '')::numeric >= 65
      and (
        p_force
        or not exists (
          select 1
          from public.staff_advisory_reports sar
          where sar.access_id = v_access.id
            and sar.report_code = 'scout_priority_prospect'
            and sar.report_json #>> '{data,source_scout_report_id}' = rsr.id::text
        )
      )
    order by rsr.created_at
  loop
    v_potential_label := case
      when rec.potential_exact >= 80 then 'Elite'
      else 'High'
    end;

    select coalesce(jsonb_agg(z.label order by z.val desc), '[]'::jsonb)
    into v_strengths
    from (
      select
        initcap(replace(e.key, '_', ' ')) as label,
        nullif(e.value->>'exact', '')::numeric as val
      from jsonb_each(coalesce(rec.report_json->'attributes', '{}'::jsonb)) e
      where e.value ? 'exact'
        and nullif(e.value->>'exact', '') is not null
      order by nullif(e.value->>'exact', '')::numeric desc
      limit 3
    ) z;

    v_summary := format(
      '%s has been identified in the %s potential band. The completed scouting report rates current overall as %s with a potential score of %s.',
      rec.rider_name,
      v_potential_label,
      rec.overall_label,
      trim(to_char(rec.potential_exact, 'FM999990.0'))
    );

    v_recommendations := jsonb_build_array(
      format(
        'Review %s in the Scouting page and compare the report against your current squad needs before making a recruitment decision.',
        rec.rider_name
      )
    );

    v_event_key := rec.scout_report_id::text;

    v_result := public.staff_advisory_emit_scout_event_v1(
      v_access.id,
      'scout_priority_prospect',
      'Scout Advisory — Priority Prospect',
      v_summary,
      'priority_prospect',
      jsonb_build_object(
        'source_scout_report_id', rec.scout_report_id,
        'rider_id', rec.rider_id,
        'rider_name', rec.rider_name,
        'rider_first_name', rec.rider_first_name,
        'rider_last_name', rec.rider_last_name,
        'rider_full_name', rec.rider_full_name,
        'rider_country_code', rec.rider_country_code,
        'completed_real_at', rec.completed_real_at,
        'completed_game_at', rec.completed_game_at,
        'scouted_on_game_date', rec.scouted_on_game_date,
        'overall_label', rec.overall_label,
        'overall_exact', rec.overall_exact,
        'potential_label', v_potential_label,
        'potential_exact', rec.potential_exact,
        'precision_score', rec.precision_score,
        'precision_tier', rec.precision_tier,
        'review_status', rec.review_status,
        'strengths', v_strengths,
        'notes', rec.notes,
        'rider_profile_path', '/dashboard/external-riders/' || rec.rider_id::text
      ),
      v_recommendations,
      v_event_key
    );

    if v_result->>'status' = 'generated' then
      v_generated := v_generated + 1;
      v_results := v_results || jsonb_build_array(v_result);
    end if;
  end loop;

  return jsonb_build_object(
    'status','checked',
    'access_id',v_access.id,
    'generated_count',v_generated,
    'results',v_results,
    'checked_at',now()
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_scan_all_scout_events_v1(p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  rec record;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_generated integer := 0;
begin
  for rec in
    select a.id
    from public.staff_advisory_access a
    join public.club_staff s
      on s.id = a.staff_id
     and s.club_id = a.club_id
    join public.clubs c
      on c.id = a.club_id
    where a.role_type = 'scout_analyst'
      and a.expires_at > public.staff_advisory_game_now_v1()
      and s.is_active = true
      and s.role_type::text = 'scout_analyst'
      and c.deleted_at is null
      and c.is_active = true
  loop
    begin
      v_result := public.staff_advisory_scan_scout_events_v1(rec.id, p_force);
      v_generated := v_generated + coalesce((v_result->>'generated_count')::integer, 0);
      v_results := v_results || jsonb_build_array(v_result);
    exception when others then
      v_results := v_results || jsonb_build_array(
        jsonb_build_object(
          'status','failed',
          'access_id',rec.id,
          'error',sqlerrm,
          'sqlstate',sqlstate
        )
      );
    end;
  end loop;

  return jsonb_build_object(
    'generated_count',v_generated,
    'results',v_results,
    'checked_at',now()
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_season_transition_status_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_current_season integer;
  v_current_month integer;
  v_current_day integer;
  v_timeline_id uuid;
  v_is_armed boolean;
  v_source integer;
  v_target integer;
  v_completed boolean;
begin
  select g.season_number, g.month_number, g.day_number
  into v_current_season, v_current_month, v_current_day
  from public.get_current_game_date() g;

  select c.timeline_id, c.is_armed, c.armed_source_season, c.armed_target_season
  into v_timeline_id, v_is_armed, v_source, v_target
  from public.season_transition_control_v1 c
  where c.id = true;

  select exists (
    select 1
    from public.season_transition_runs_v1 r
    where r.timeline_id = v_timeline_id
      and r.source_season = v_source
      and r.target_season = v_target
      and r.status = 'completed'
  ) into v_completed;

  return jsonb_build_object(
    'timeline_id', v_timeline_id,
    'current_season', v_current_season,
    'current_month', v_current_month,
    'current_day', v_current_day,
    'is_armed', coalesce(v_is_armed, false),
    'armed_source_season', v_source,
    'armed_target_season', v_target,
    'armed_pair_already_completed', coalesce(v_completed, false)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.season_transition_boundary_gate_v1(p_old_date date, p_new_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_source integer;
  v_target integer;
  v_timeline_id uuid;
  v_is_armed boolean;
  v_armed_source integer;
  v_armed_target integer;
  v_completed boolean := false;
begin
  if p_old_date is null or p_new_date is null then
    raise exception 'season_transition_boundary_gate_v1 requires both dates';
  end if;

  v_source := public.season_from_game_date(p_old_date);
  v_target := public.season_from_game_date(p_new_date);

  if v_target <= v_source then
    return jsonb_build_object(
      'allowed', true,
      'boundary_crossed', false,
      'source_season', v_source,
      'target_season', v_target
    );
  end if;

  if v_target <> v_source + 1 then
    return jsonb_build_object(
      'allowed', false,
      'boundary_crossed', true,
      'reason', 'invalid_season_jump',
      'source_season', v_source,
      'target_season', v_target
    );
  end if;

  select c.timeline_id, c.is_armed, c.armed_source_season, c.armed_target_season
  into v_timeline_id, v_is_armed, v_armed_source, v_armed_target
  from public.season_transition_control_v1 c
  where c.id = true;

  if v_timeline_id is null then
    return jsonb_build_object(
      'allowed', false,
      'boundary_crossed', true,
      'reason', 'transition_control_missing',
      'source_season', v_source,
      'target_season', v_target
    );
  end if;

  select exists (
    select 1
    from public.season_transition_runs_v1 r
    where r.timeline_id = v_timeline_id
      and r.source_season = v_source
      and r.target_season = v_target
      and r.status = 'completed'
  ) into v_completed;

  if v_completed then
    return jsonb_build_object(
      'allowed', false,
      'boundary_crossed', true,
      'reason', 'transition_already_completed_in_current_timeline',
      'timeline_id', v_timeline_id,
      'source_season', v_source,
      'target_season', v_target
    );
  end if;

  if not coalesce(v_is_armed, false)
     or v_armed_source is distinct from v_source
     or v_armed_target is distinct from v_target then
    return jsonb_build_object(
      'allowed', false,
      'boundary_crossed', true,
      'reason', 'season_transition_not_armed',
      'timeline_id', v_timeline_id,
      'source_season', v_source,
      'target_season', v_target,
      'armed_source_season', v_armed_source,
      'armed_target_season', v_armed_target
    );
  end if;

  return jsonb_build_object(
    'allowed', true,
    'boundary_crossed', true,
    'reason', 'season_transition_armed',
    'timeline_id', v_timeline_id,
    'source_season', v_source,
    'target_season', v_target
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_arm_season_transition_v1(p_source_season integer, p_target_season integer, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_current_season integer;
  v_current_month integer;
  v_current_day integer;
  v_timeline_id uuid;
  v_completed boolean;
  v_failed_attempt_exists boolean;
  v_recovery_window boolean;
  v_blockers text;
begin
  if p_source_season is null or p_source_season <= 0 then
    raise exception 'source season must be a positive integer';
  end if;
  if p_target_season is distinct from p_source_season + 1 then
    raise exception 'target season must equal source season + 1';
  end if;

  select string_agg(component_key || ':' || status, ', ' order by display_order)
  into v_blockers
  from public.season_transition_component_readiness_v1
  where required=true and status<>'ready';

  if v_blockers is not null then
    raise exception 'Season transition cannot be armed; required components not ready: %', v_blockers;
  end if;

  select g.season_number,g.month_number,g.day_number
  into v_current_season,v_current_month,v_current_day
  from public.get_current_game_date() g;

  select c.timeline_id into v_timeline_id
  from public.season_transition_control_v1 c
  where c.id=true
  for update;

  select exists(
    select 1 from public.season_transition_runs_v1 r
    where r.timeline_id=v_timeline_id and r.source_season=p_source_season
      and r.target_season=p_target_season and r.status='completed'
  ) into v_completed;

  if v_completed then
    raise exception 'Transition % -> % already completed in current timeline %',p_source_season,p_target_season,v_timeline_id;
  end if;

  select exists(
    select 1 from public.season_transition_runs_v1 r
    where r.timeline_id=v_timeline_id and r.source_season=p_source_season
      and r.target_season=p_target_season and r.status='failed'
  ) into v_failed_attempt_exists;

  v_recovery_window:=v_current_season=p_target_season
    and v_current_month=1 and v_current_day in(1,2) and v_failed_attempt_exists;

  if v_current_season<>p_source_season and not v_recovery_window then
    raise exception 'Cannot arm transition % -> % while current season is % (recovery window=%)',
      p_source_season,p_target_season,v_current_season,v_recovery_window;
  end if;

  update public.season_transition_control_v1
  set is_armed=true,armed_source_season=p_source_season,armed_target_season=p_target_season,
      armed_at=now(),armed_note=p_note,updated_at=now()
  where id=true;

  return public.get_season_transition_status_v1();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_disarm_season_transition_v1(p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.season_transition_control_v1
  set is_armed = false,
      armed_source_season = null,
      armed_target_season = null,
      armed_at = null,
      armed_note = p_note,
      updated_at = now()
  where id = true;

  return public.get_season_transition_status_v1();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_start_new_season_transition_timeline_v1(p_expected_current_season integer, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_current_season integer;
  v_old_timeline uuid;
  v_new_timeline uuid := gen_random_uuid();
  v_running_count integer;
begin
  if p_expected_current_season is null or p_expected_current_season <= 0 then
    raise exception 'expected current season must be a positive integer';
  end if;

  select g.season_number into v_current_season
  from public.get_current_game_date() g;

  if v_current_season is distinct from p_expected_current_season then
    raise exception 'Current season is %, expected %', v_current_season, p_expected_current_season;
  end if;

  select c.timeline_id into v_old_timeline
  from public.season_transition_control_v1 c
  where c.id = true
  for update;

  if exists (
    select 1
    from public.season_transition_control_v1 c
    where c.id = true and c.is_armed = true
  ) then
    raise exception 'Cannot rotate season-transition timeline while a transition is armed.';
  end if;

  select count(*) into v_running_count
  from public.season_transition_runs_v1 r
  where r.timeline_id = v_old_timeline
    and r.status = 'running';

  if v_running_count > 0 then
    raise exception 'Cannot rotate timeline while % transition run(s) are still running.', v_running_count;
  end if;

  update public.season_transition_timeline_history_v1
  set closed_at = now(),
      closed_game_date = public.get_current_game_date_date(),
      close_note = coalesce(p_note, 'Timeline closed by admin reset/rewind')
  where timeline_id = v_old_timeline
    and closed_at is null;

  insert into public.season_transition_timeline_history_v1 (
    timeline_id, opened_game_date, open_note
  ) values (
    v_new_timeline,
    public.get_current_game_date_date(),
    coalesce(p_note, 'New timeline opened after intentional game-world reset/rewind')
  );

  update public.season_transition_control_v1
  set timeline_id = v_new_timeline,
      is_armed = false,
      armed_source_season = null,
      armed_target_season = null,
      armed_at = null,
      armed_note = coalesce(p_note, 'New timeline started'),
      updated_at = now()
  where id = true;

  return public.get_season_transition_status_v1();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_sporting_competition_transition_v1(p_transition_run_id uuid, p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_snapshot_count integer;
  v_canonical_count integer;
  v_logged integer;
  v_changed integer;
begin
  if p_transition_run_id is null then
    raise exception 'transition_run_id is required';
  end if;
  if p_target_season is distinct from p_source_season + 1 then
    raise exception 'target season must equal source season + 1';
  end if;

  if not exists (
    select 1 from public.season_transition_runs_v1 r
    where r.id=p_transition_run_id
      and r.source_season=p_source_season
      and r.target_season=p_target_season
      and r.status='running'
  ) then
    raise exception 'matching running season transition % not found', p_transition_run_id;
  end if;

  select count(*), count(*) filter(where ranking_version='canonical_team_ranking_v1')
  into v_snapshot_count, v_canonical_count
  from public.team_ranking_season_snapshots
  where season_number=p_source_season;

  if v_snapshot_count=0 or v_snapshot_count<>v_canonical_count then
    raise exception 'canonical season snapshot required for season % (rows %, canonical %)',
      p_source_season,v_snapshot_count,v_canonical_count;
  end if;

  if exists (
    select 1 from public.competition_transition_movements_v1 m
    where m.transition_run_id=p_transition_run_id
  ) then
    raise exception 'competition transition already has movement rows for run %', p_transition_run_id;
  end if;

  insert into public.competition_transition_movements_v1 (
    transition_run_id,source_season,target_season,phase,
    club_id,club_name,country_code,source_tier,source_division,
    source_position,source_total,international_points,completed_race_count,
    race_reputation_value,playoff_pool,playoff_pool_rank,playoff_winner,
    movement_type,target_tier,target_division,reason
  )
  select
    p_transition_run_id,p_source_season,p_target_season,'sporting',
    p.club_id,p.club_name,p.country_code,p.source_tier,p.source_division,
    p.source_position,p.source_total,p.international_points,p.completed_race_count,
    p.race_reputation_value,p.playoff_pool,p.playoff_pool_rank,p.playoff_winner,
    p.movement_type,p.target_tier,p.target_division,p.reason
  from public.preview_competition_transition_v1(p_source_season,true) p
  where p.movement_type<>'stay';

  get diagnostics v_logged=row_count;

  update public.clubs c
  set
    club_tier = p.target_tier::public.club_tier,
    tier2_division = case when p.target_tier='proteam' then p.target_division else null end,
    tier3_division = case when p.target_tier='continental' then p.target_division else null end,
    amateur_division = case when p.target_tier='amateur' then p.target_division else null end
  from public.preview_competition_transition_v1(p_source_season,true) p
  where c.id=p.club_id
    and p.movement_type in ('direct_promotion','playoff_promotion','cap_reallocation_promotion','relegated');

  get diagnostics v_changed=row_count;

  if exists (
    select 1 from public.clubs c
    where c.deleted_at is null
      and c.club_tier::text in ('worldteam','proteam','continental','amateur')
      and (
        (c.club_tier::text='worldteam' and (c.tier2_division is not null or c.tier3_division is not null or c.amateur_division is not null)) or
        (c.club_tier::text='proteam' and (c.tier2_division is null or c.tier3_division is not null or c.amateur_division is not null)) or
        (c.club_tier::text='continental' and (c.tier2_division is not null or c.tier3_division is null or c.amateur_division is not null)) or
        (c.club_tier::text='amateur' and (c.tier2_division is not null or c.tier3_division is not null or c.amateur_division is null))
      )
  ) then
    raise exception 'division consistency failed after sporting transition';
  end if;

  return jsonb_build_object(
    'ok',true,
    'source_season',p_source_season,
    'target_season',p_target_season,
    'sporting_rows_logged',v_logged,
    'clubs_tier_changed',v_changed
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rebalance_competition_structure_for_transition_v1(p_transition_run_id uuid, p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_needed integer;
  v_excess integer;
  v_changed integer := 0;
  v_total_changed integer := 0;
  v_div text;
  v_target_tier text;
  v_source_tier text;
  v_candidate record;
  v_metric record;
  v_relegation_target text;
begin
  if p_target_season is distinct from p_source_season + 1 then
    raise exception 'target season must equal source season + 1';
  end if;

  if not exists (
    select 1 from public.season_transition_runs_v1 r
    where r.id=p_transition_run_id and r.status='running'
  ) then
    raise exception 'matching running season transition not found';
  end if;

  -- Normalize current division columns by country after sporting moves.
  update public.clubs c
  set tier2_division=null,tier3_division=null,amateur_division=null
  where c.deleted_at is null and c.club_tier='worldteam';

  update public.clubs c
  set tier2_division=public.get_expected_tier2_division_for_country(c.country_code),tier3_division=null,amateur_division=null
  where c.deleted_at is null and c.club_tier='proteam';

  update public.clubs c
  set tier2_division=null,tier3_division=public.get_expected_tier3_division_for_country(c.country_code),amateur_division=null
  where c.deleted_at is null and c.club_tier='continental';

  update public.clubs c
  set tier2_division=null,tier3_division=null,amateur_division=public.safe_get_amateur_division_for_country(c.country_code)
  where c.deleted_at is null and c.club_tier='amateur';

  if exists (
    select 1 from public.clubs c
    where c.deleted_at is null
      and c.club_tier::text in ('proteam','continental','amateur')
      and (
        (c.club_tier='proteam' and c.tier2_division is null) or
        (c.club_tier='continental' and c.tier3_division is null) or
        (c.club_tier='amateur' and c.amateur_division is null)
      )
  ) then
    raise exception 'unmapped country prevents structural competition balance';
  end if;

  -- WORLD: exactly 25 active clubs.
  select greatest(25-count(*),0) into v_needed
  from public.clubs c
  where c.deleted_at is null and c.is_active=true and c.club_tier='worldteam';

  for v_candidate in
    select c.id,c.name,c.country_code,c.club_tier::text as source_tier,c.tier2_division::text as source_division,
           coalesce(s.international_points,s.points::numeric,0) as pts,
           coalesce(s.completed_race_count,0) as races,
           coalesce(s.race_reputation_value,0) as rep
    from public.clubs c
    left join public.team_ranking_season_snapshots s on s.season_number=p_source_season and s.club_id=c.id
    where v_needed>0
      and c.deleted_at is null and c.is_active=true and c.is_ai=true and c.club_tier='proteam'
      and not exists(select 1 from public.competition_transition_movements_v1 m where m.transition_run_id=p_transition_run_id and m.club_id=c.id)
    order by pts desc,races desc,rep desc,lower(c.name),c.id
    limit v_needed
  loop
    insert into public.competition_transition_movements_v1(
      transition_run_id,source_season,target_season,phase,club_id,club_name,country_code,
      source_tier,source_division,international_points,completed_race_count,race_reputation_value,
      movement_type,target_tier,target_division,reason
    ) values (
      p_transition_run_id,p_source_season,p_target_season,'structural_fill',v_candidate.id,v_candidate.name,v_candidate.country_code,
      v_candidate.source_tier,v_candidate.source_division,v_candidate.pts,v_candidate.races,v_candidate.rep,
      'administrative_promotion','worldteam','WORLD','AI structural fill to keep WorldTeam at exactly 25 active clubs'
    );
    update public.clubs set club_tier='worldteam',tier2_division=null,tier3_division=null,amateur_division=null where id=v_candidate.id;
    v_total_changed:=v_total_changed+1;
  end loop;

  select greatest(count(*)-25,0) into v_excess
  from public.clubs c
  where c.deleted_at is null and c.is_active=true and c.club_tier='worldteam';

  for v_candidate in
    select c.id,c.name,c.country_code,c.club_tier::text as source_tier,'WORLD'::text as source_division,
           coalesce(s.international_points,s.points::numeric,0) as pts,
           coalesce(s.completed_race_count,0) as races,
           coalesce(s.race_reputation_value,0) as rep
    from public.clubs c
    left join public.team_ranking_season_snapshots s on s.season_number=p_source_season and s.club_id=c.id
    where v_excess>0
      and c.deleted_at is null and c.is_active=true and c.is_ai=true and c.club_tier='worldteam'
      and not exists(select 1 from public.competition_transition_movements_v1 m where m.transition_run_id=p_transition_run_id and m.club_id=c.id)
    order by pts asc,races asc,rep asc,lower(c.name) desc,c.id desc
    limit v_excess
  loop
    v_relegation_target:=public.get_expected_tier2_division_for_country(v_candidate.country_code);
    insert into public.competition_transition_movements_v1(
      transition_run_id,source_season,target_season,phase,club_id,club_name,country_code,
      source_tier,source_division,international_points,completed_race_count,race_reputation_value,
      movement_type,target_tier,target_division,reason
    ) values (
      p_transition_run_id,p_source_season,p_target_season,'structural_trim',v_candidate.id,v_candidate.name,v_candidate.country_code,
      v_candidate.source_tier,v_candidate.source_division,v_candidate.pts,v_candidate.races,v_candidate.rep,
      'administrative_relegation','proteam',v_relegation_target,'AI structural trim to keep WorldTeam at exactly 25 active clubs'
    );
    update public.clubs set club_tier='proteam',tier2_division=v_relegation_target,tier3_division=null,amateur_division=null where id=v_candidate.id;
    v_total_changed:=v_total_changed+1;
  end loop;

  -- PRO: each regional division 20..25 active clubs.
  foreach v_div in array array['PRO_WEST','PRO_EAST'] loop
    select greatest(20-count(*),0) into v_needed
    from public.clubs c
    where c.deleted_at is null and c.is_active=true and c.club_tier='proteam' and c.tier2_division::text=v_div;

    for v_candidate in
      select c.id,c.name,c.country_code,c.club_tier::text as source_tier,c.tier3_division::text as source_division,
             coalesce(s.international_points,s.points::numeric,0) as pts,
             coalesce(s.completed_race_count,0) as races,
             coalesce(s.race_reputation_value,0) as rep
      from public.clubs c
      left join public.team_ranking_season_snapshots s on s.season_number=p_source_season and s.club_id=c.id
      where v_needed>0
        and c.deleted_at is null and c.is_active=true and c.is_ai=true and c.club_tier='continental'
        and public.get_expected_tier2_division_for_country(c.country_code)=v_div
        and not exists(select 1 from public.competition_transition_movements_v1 m where m.transition_run_id=p_transition_run_id and m.club_id=c.id)
      order by pts desc,races desc,rep desc,lower(c.name),c.id
      limit v_needed
    loop
      insert into public.competition_transition_movements_v1(
        transition_run_id,source_season,target_season,phase,club_id,club_name,country_code,
        source_tier,source_division,international_points,completed_race_count,race_reputation_value,
        movement_type,target_tier,target_division,reason
      ) values (
        p_transition_run_id,p_source_season,p_target_season,'structural_fill',v_candidate.id,v_candidate.name,v_candidate.country_code,
        v_candidate.source_tier,v_candidate.source_division,v_candidate.pts,v_candidate.races,v_candidate.rep,
        'administrative_promotion','proteam',v_div,'AI structural fill to maintain Pro division minimum of 20 active clubs'
      );
      update public.clubs set club_tier='proteam',tier2_division=v_div,tier3_division=null,amateur_division=null where id=v_candidate.id;
      v_total_changed:=v_total_changed+1;
    end loop;

    select greatest(count(*)-25,0) into v_excess
    from public.clubs c
    where c.deleted_at is null and c.is_active=true and c.club_tier='proteam' and c.tier2_division::text=v_div;

    for v_candidate in
      select c.id,c.name,c.country_code,c.club_tier::text as source_tier,c.tier2_division::text as source_division,
             coalesce(s.international_points,s.points::numeric,0) as pts,
             coalesce(s.completed_race_count,0) as races,
             coalesce(s.race_reputation_value,0) as rep
      from public.clubs c
      left join public.team_ranking_season_snapshots s on s.season_number=p_source_season and s.club_id=c.id
      where v_excess>0
        and c.deleted_at is null and c.is_active=true and c.is_ai=true and c.club_tier='proteam' and c.tier2_division::text=v_div
        and not exists(select 1 from public.competition_transition_movements_v1 m where m.transition_run_id=p_transition_run_id and m.club_id=c.id)
      order by pts asc,races asc,rep asc,lower(c.name) desc,c.id desc
      limit v_excess
    loop
      v_relegation_target:=public.get_expected_tier3_division_for_country(v_candidate.country_code);
      insert into public.competition_transition_movements_v1(
        transition_run_id,source_season,target_season,phase,club_id,club_name,country_code,
        source_tier,source_division,international_points,completed_race_count,race_reputation_value,
        movement_type,target_tier,target_division,reason
      ) values (
        p_transition_run_id,p_source_season,p_target_season,'structural_trim',v_candidate.id,v_candidate.name,v_candidate.country_code,
        v_candidate.source_tier,v_candidate.source_division,v_candidate.pts,v_candidate.races,v_candidate.rep,
        'administrative_relegation','continental',v_relegation_target,'AI structural trim to maintain Pro division maximum of 25 active clubs'
      );
      update public.clubs set club_tier='continental',tier2_division=null,tier3_division=v_relegation_target,amateur_division=null where id=v_candidate.id;
      v_total_changed:=v_total_changed+1;
    end loop;
  end loop;

  -- CONTINENTAL: each regional division 20..25 active clubs.
  foreach v_div in array array['CONTINENTAL_EUROPE','CONTINENTAL_AMERICA','CONTINENTAL_ASIA','CONTINENTAL_AFRICA','CONTINENTAL_OCEANIA'] loop
    select greatest(20-count(*),0) into v_needed
    from public.clubs c
    where c.deleted_at is null and c.is_active=true and c.club_tier='continental' and c.tier3_division::text=v_div;

    for v_candidate in
      select c.id,c.name,c.country_code,c.club_tier::text as source_tier,c.amateur_division::text as source_division,
             coalesce(s.international_points,s.points::numeric,0) as pts,
             coalesce(s.completed_race_count,0) as races,
             coalesce(s.race_reputation_value,0) as rep
      from public.clubs c
      left join public.team_ranking_season_snapshots s on s.season_number=p_source_season and s.club_id=c.id
      where v_needed>0
        and c.deleted_at is null and c.is_active=true and c.is_ai=true and c.club_tier='amateur'
        and public.get_expected_tier3_division_for_country(c.country_code)=v_div
        and not exists(select 1 from public.competition_transition_movements_v1 m where m.transition_run_id=p_transition_run_id and m.club_id=c.id)
      order by pts desc,races desc,rep desc,lower(c.name),c.id
      limit v_needed
    loop
      insert into public.competition_transition_movements_v1(
        transition_run_id,source_season,target_season,phase,club_id,club_name,country_code,
        source_tier,source_division,international_points,completed_race_count,race_reputation_value,
        movement_type,target_tier,target_division,reason
      ) values (
        p_transition_run_id,p_source_season,p_target_season,'structural_fill',v_candidate.id,v_candidate.name,v_candidate.country_code,
        v_candidate.source_tier,v_candidate.source_division,v_candidate.pts,v_candidate.races,v_candidate.rep,
        'administrative_promotion','continental',v_div,'AI structural fill to maintain Continental division minimum of 20 active clubs'
      );
      update public.clubs set club_tier='continental',tier2_division=null,tier3_division=v_div,amateur_division=null where id=v_candidate.id;
      v_total_changed:=v_total_changed+1;
    end loop;

    select greatest(count(*)-25,0) into v_excess
    from public.clubs c
    where c.deleted_at is null and c.is_active=true and c.club_tier='continental' and c.tier3_division::text=v_div;

    for v_candidate in
      select c.id,c.name,c.country_code,c.club_tier::text as source_tier,c.tier3_division::text as source_division,
             coalesce(s.international_points,s.points::numeric,0) as pts,
             coalesce(s.completed_race_count,0) as races,
             coalesce(s.race_reputation_value,0) as rep
      from public.clubs c
      left join public.team_ranking_season_snapshots s on s.season_number=p_source_season and s.club_id=c.id
      where v_excess>0
        and c.deleted_at is null and c.is_active=true and c.is_ai=true and c.club_tier='continental' and c.tier3_division::text=v_div
        and not exists(select 1 from public.competition_transition_movements_v1 m where m.transition_run_id=p_transition_run_id and m.club_id=c.id)
      order by pts asc,races asc,rep asc,lower(c.name) desc,c.id desc
      limit v_excess
    loop
      v_relegation_target:=public.safe_get_amateur_division_for_country(v_candidate.country_code);
      insert into public.competition_transition_movements_v1(
        transition_run_id,source_season,target_season,phase,club_id,club_name,country_code,
        source_tier,source_division,international_points,completed_race_count,race_reputation_value,
        movement_type,target_tier,target_division,reason
      ) values (
        p_transition_run_id,p_source_season,p_target_season,'structural_trim',v_candidate.id,v_candidate.name,v_candidate.country_code,
        v_candidate.source_tier,v_candidate.source_division,v_candidate.pts,v_candidate.races,v_candidate.rep,
        'administrative_relegation','amateur',v_relegation_target,'AI structural trim to maintain Continental division maximum of 25 active clubs'
      );
      update public.clubs set club_tier='amateur',tier2_division=null,tier3_division=null,amateur_division=v_relegation_target where id=v_candidate.id;
      v_total_changed:=v_total_changed+1;
    end loop;
  end loop;

  -- Hard structural checks. Do not silently continue with an invalid pyramid.
  if (select count(*) from public.clubs where deleted_at is null and is_active=true and club_tier='worldteam') <> 25 then
    raise exception 'structural balance failed: WorldTeam is not exactly 25 active clubs';
  end if;

  if exists (
    select 1 from (values ('PRO_WEST'),('PRO_EAST')) d(division)
    where (select count(*) from public.clubs c where c.deleted_at is null and c.is_active=true and c.club_tier='proteam' and c.tier2_division::text=d.division) not between 20 and 25
  ) then
    raise exception 'structural balance failed: a Pro division is outside 20..25 active clubs';
  end if;

  if exists (
    select 1 from (values ('CONTINENTAL_EUROPE'),('CONTINENTAL_AMERICA'),('CONTINENTAL_ASIA'),('CONTINENTAL_AFRICA'),('CONTINENTAL_OCEANIA')) d(division)
    where (select count(*) from public.clubs c where c.deleted_at is null and c.is_active=true and c.club_tier='continental' and c.tier3_division::text=d.division) not between 20 and 25
  ) then
    raise exception 'structural balance failed: a Continental division is outside 20..25 active clubs';
  end if;

  return jsonb_build_object('ok',true,'administrative_movements',v_total_changed);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.run_competition_season_transition_v1(p_transition_run_id uuid, p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sporting jsonb; v_inactive jsonb; v_balance jsonb; v_movement_count integer;
begin
  v_sporting:=public.apply_sporting_competition_transition_v1(p_transition_run_id,p_source_season,p_target_season);
  v_inactive:=public.process_inactive_clubs_for_season_transition_v1(p_transition_run_id,p_source_season,p_target_season,true);
  v_balance:=public.rebalance_competition_structure_for_transition_v1(p_transition_run_id,p_source_season,p_target_season);
  update public.clubs c set season_points=0
  where c.deleted_at is null and c.club_tier::text in ('worldteam','proteam','continental','amateur');
  select count(*) into v_movement_count from public.competition_transition_movements_v1 where transition_run_id=p_transition_run_id;
  return jsonb_build_object(
    'ok',true,'source_season',p_source_season,'target_season',p_target_season,
    'sporting',v_sporting,'inactive_clubs',v_inactive,'structural_balance',v_balance,'movement_audit_rows',v_movement_count
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.execute_season_transition_components_v1(p_transition_run_id uuid, p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_race_calendar jsonb; v_retirements jsonb; v_snapshot integer; v_snapshot_check jsonb; v_rankings_history jsonb; v_competition jsonb;
  v_rider_contracts jsonb; v_staff_contracts jsonb; v_ai_rosters jsonb; v_sponsors jsonb; v_developing_team jsonb; v_finances_rewards jsonb;
  v_fresh_state jsonb; v_result jsonb;
begin
  if exists(select 1 from public.season_transition_component_readiness_v1 where required=true and status<>'ready') then
    raise exception 'execute_season_transition_components_v1: transition readiness gate is not fully green';
  end if;
  perform set_config('app.season_transition_active','1',true); perform set_config('app.season_transition_coin_reason','',true);
  begin
    v_race_calendar:=public.run_race_calendar_season_transition_v1(p_transition_run_id,p_source_season,p_target_season);
    v_retirements:=public.run_retirement_season_transition_v1(p_source_season,p_target_season);
    v_snapshot:=public.snapshot_team_rankings_for_season_v1(p_source_season);
    v_snapshot_check:=public.verify_season_transition_source_snapshot_v1(p_source_season);
    update public.season_transition_runs_v1 set snapshot_rows=v_snapshot where id=p_transition_run_id;
    v_rankings_history:=public.run_rankings_history_season_transition_v1(p_transition_run_id,p_source_season,p_target_season);
    v_competition:=public.run_competition_season_transition_v1(p_transition_run_id,p_source_season,p_target_season);
    v_rider_contracts:=public.process_rider_contract_season_expiry_v1(p_transition_run_id,p_source_season,p_target_season);
    v_staff_contracts:=public.process_staff_contract_season_expiry_v1(p_transition_run_id,p_source_season,p_target_season);
    v_ai_rosters:=public.run_ai_roster_season_transition_v1(p_transition_run_id,p_source_season,p_target_season);
    v_sponsors:=public.process_sponsors_for_season_transition_v1(p_transition_run_id,p_source_season,p_target_season);
    v_developing_team:=public.run_developing_team_season_transition_v1(p_transition_run_id,p_source_season,p_target_season);
    v_finances_rewards:=public.run_finances_rewards_season_transition_v1(p_transition_run_id,p_source_season,p_target_season);
    v_fresh_state:=public.verify_new_season_fresh_state_v1(p_source_season,p_target_season);

    v_result:=jsonb_build_object('race_calendar',v_race_calendar,'retirements',v_retirements,'canonical_snapshot_rows',v_snapshot,
      'source_snapshot_reconciliation',v_snapshot_check,'rankings_history',v_rankings_history,'competition_transition',v_competition,
      'rider_contracts',v_rider_contracts,'staff_contracts',v_staff_contracts,'ai_rosters',v_ai_rosters,'sponsors',v_sponsors,
      'developing_team',v_developing_team,'finances_rewards',v_finances_rewards,'new_season_fresh_state',v_fresh_state,'persistence_guard_active',true);
    perform set_config('app.season_transition_coin_reason','',true); perform set_config('app.season_transition_active','0',true); return v_result;
  exception when others then
    perform set_config('app.season_transition_coin_reason','',true); perform set_config('app.season_transition_active','0',true); raise;
  end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.guard_retired_rider_terminal_status_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if old.availability_status='retired' then
    new.availability_status:='retired';
    new.unavailable_until:=null;
    new.unavailable_reason:=null;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.guard_retired_rider_roster_membership_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_status text;
begin
  select r.availability_status into v_status
  from public.riders r where r.id=new.rider_id;

  if v_status='retired' then
    raise exception 'Retired rider % cannot be added to a club roster',new.rider_id using errcode='P0001';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.guard_retired_rider_active_contract_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_status text;
begin
  if new.status::text='active' then
    select r.availability_status into v_status
    from public.riders r where r.id=new.rider_id;
    if v_status='retired' then
      raise exception 'Retired rider % cannot have an active contract',new.rider_id using errcode='P0001';
    end if;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.run_retirement_season_transition_v1(p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_result jsonb;
  v_pending integer;
  v_wrong_status integer;
  v_rostered integer;
  v_active_contracts integer;
  v_open_market integer;
begin
  if p_target_season is distinct from p_source_season+1 then
    raise exception 'target season must equal source season + 1';
  end if;

  -- Idempotent safety finalization. If Dec 31 daily processing already completed it,
  -- this simply has no remaining decisions to process.
  v_result:=public.finalize_retirements_for_season(p_source_season,true);

  select count(*) into v_pending
  from public.retirement_decisions
  where season_number=p_source_season and status in ('planned','announced');

  select count(*) into v_wrong_status
  from public.retirement_decisions rd
  join public.riders r on r.id=rd.subject_id
  where rd.season_number=p_source_season
    and rd.subject_type='rider'
    and rd.status='finalized'
    and r.availability_status<>'retired';

  select count(*) into v_rostered
  from public.club_riders cr
  join public.retirement_decisions rd
    on rd.subject_type='rider' and rd.subject_id=cr.rider_id
  where rd.season_number=p_source_season and rd.status='finalized';

  select count(*) into v_active_contracts
  from public.rider_contracts rc
  join public.retirement_decisions rd
    on rd.subject_type='rider' and rd.subject_id=rc.rider_id
  where rd.season_number=p_source_season
    and rd.status='finalized'
    and rc.status='active';

  select
    (select count(*) from public.rider_transfer_listings l join public.retirement_decisions rd on rd.subject_type='rider' and rd.subject_id=l.rider_id where rd.season_number=p_source_season and rd.status='finalized' and l.status in ('listed','club_accepted'))+
    (select count(*) from public.rider_transfer_offers o join public.retirement_decisions rd on rd.subject_type='rider' and rd.subject_id=o.rider_id where rd.season_number=p_source_season and rd.status='finalized' and o.status in ('open','club_accepted'))+
    (select count(*) from public.rider_transfer_negotiations n join public.retirement_decisions rd on rd.subject_type='rider' and rd.subject_id=n.rider_id where rd.season_number=p_source_season and rd.status='finalized' and n.status in ('open','accepted'))+
    (select count(*) from public.rider_free_agents f join public.retirement_decisions rd on rd.subject_type='rider' and rd.subject_id=f.rider_id where rd.season_number=p_source_season and rd.status='finalized' and f.status='available')
  into v_open_market;

  if v_pending<>0 or v_wrong_status<>0 or v_rostered<>0 or v_active_contracts<>0 or v_open_market<>0 then
    raise exception 'retirement transition invariant failed: pending=%, wrong_status=%, rostered=%, active_contracts=%, open_market=%',
      v_pending,v_wrong_status,v_rostered,v_active_contracts,v_open_market;
  end if;

  return jsonb_build_object(
    'ok',true,
    'source_season',p_source_season,
    'target_season',p_target_season,
    'finalizer',v_result,
    'pending_decisions',v_pending,
    'wrong_status',v_wrong_status,
    'rostered_retirees',v_rostered,
    'active_contracts_for_retirees',v_active_contracts,
    'open_market_state_for_retirees',v_open_market
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_due_rider_contract_starts_v1(p_game_date date DEFAULT NULL::date, p_transition_run_id uuid DEFAULT NULL::uuid, p_source_season integer DEFAULT NULL::integer, p_target_season integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_date date:=coalesce(p_game_date,public.get_current_game_date_date());
  r record;
  v_role public.rider_role;
  v_started integer:=0;
  v_roster_changes integer:=0;
begin
  for r in
    select rc.id as contract_id,rc.rider_id,rc.club_id,rc.starts_on,rc.expires_on,
           rc.salary_weekly,rc.end_season_number
    from public.rider_contracts rc
    join public.riders rd on rd.id=rc.rider_id
    join public.clubs c on c.id=rc.club_id
    where rc.status='active'
      and rc.starts_on<=v_date
      and rc.expires_on>=v_date
      and rd.availability_status<>'retired'
      and c.deleted_at is null
      and not exists(
        select 1 from public.club_riders cr
        where cr.rider_id=rc.rider_id and cr.club_id=rc.club_id
      )
    order by rc.starts_on,rc.rider_id
  loop
    select cr.assigned_role into v_role
    from public.club_riders cr
    where cr.rider_id=r.rider_id
    order by cr.created_at nulls last
    limit 1;

    delete from public.club_riders where rider_id=r.rider_id;

    insert into public.club_riders(club_id,rider_id,assigned_role)
    values(r.club_id,r.rider_id,coalesce(v_role,'Domestique'::public.rider_role));

    update public.rider_free_agents
    set status='signed',updated_at=now()
    where rider_id=r.rider_id and status='available';

    perform public.sync_rider_contract_snapshot(r.rider_id);

    insert into public.rider_contract_transition_audit_v1(
      transition_run_id,source_season,target_season,rider_id,contract_id,club_id,
      action,action_game_date,metadata
    ) values(
      p_transition_run_id,p_source_season,p_target_season,r.rider_id,r.contract_id,r.club_id,
      'contract_started',v_date,jsonb_build_object('starts_on',r.starts_on,'expires_on',r.expires_on)
    );
    insert into public.rider_contract_transition_audit_v1(
      transition_run_id,source_season,target_season,rider_id,contract_id,club_id,
      action,action_game_date,metadata
    ) values(
      p_transition_run_id,p_source_season,p_target_season,r.rider_id,r.contract_id,r.club_id,
      'roster_assigned',v_date,jsonb_build_object('reason','active_contract_effective')
    );

    v_started:=v_started+1;
    v_roster_changes:=v_roster_changes+1;
  end loop;

  return jsonb_build_object('ok',true,'game_date',v_date,'contracts_started_or_reconciled',v_started,'roster_changes',v_roster_changes);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_rider_contract_season_expiry_v1(p_transition_run_id uuid, p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_source_end date:=public.get_game_date_for_season_end(p_source_season);
  v_target_start date:=make_date(1999+p_target_season,1,1);
  v_target_end date:=public.get_game_date_for_season_end(p_target_season);
  r record;
  v_age integer;
  v_desired_tier text;
  v_expected integer;
  v_min_salary integer;
  v_duration smallint;
  v_expired integer:=0;
  v_free_agents integer:=0;
  v_roster_removed integer:=0;
begin
  if p_target_season is distinct from p_source_season+1 then
    raise exception 'target season must equal source season + 1';
  end if;
  if not exists(select 1 from public.season_transition_runs_v1 x where x.id=p_transition_run_id and x.status='running') then
    raise exception 'running transition not found';
  end if;

  for r in
    select rc.id as contract_id,rc.rider_id,rc.club_id,rc.salary_weekly,rc.expires_on,
           c.club_tier::text as club_tier,rd.birth_date,rd.overall,rd.potential,rd.availability_status
    from public.rider_contracts rc
    join public.clubs c on c.id=rc.club_id
    join public.riders rd on rd.id=rc.rider_id
    where rc.status='active'
      and rc.expires_on<=v_source_end
    order by rc.rider_id
    for update of rc
  loop
    update public.rider_contracts
    set status='expired',
        notes_json=coalesce(notes_json,'{}'::jsonb)||jsonb_build_object(
          'expired_by_season_transition',true,
          'expired_source_season',p_source_season,
          'target_season',p_target_season,
          'processed_at',now()
        ),
        updated_at=now()
    where id=r.contract_id and status='active';

    update public.rider_payroll_state ps
    set payroll_status=case
          when coalesce(ps.outstanding_salary_debt,0)+coalesce(ps.outstanding_breach_fine,0)>0
            then 'released_unpaid'::public.rider_payroll_status
          else 'settled'::public.rider_payroll_status
        end,
        settled_at=case
          when coalesce(ps.outstanding_salary_debt,0)+coalesce(ps.outstanding_breach_fine,0)=0 then now()
          else ps.settled_at
        end,
        updated_at=now()
    where ps.contract_id=r.contract_id;

    insert into public.rider_contract_transition_audit_v1(
      transition_run_id,source_season,target_season,rider_id,contract_id,club_id,
      action,action_game_date,metadata
    ) values(
      p_transition_run_id,p_source_season,p_target_season,r.rider_id,r.contract_id,r.club_id,
      'contract_expired',v_target_start,jsonb_build_object('contract_expires_on',r.expires_on)
    );
    v_expired:=v_expired+1;

    -- Remove only the old club relationship. A due target-season contract is applied below.
    if exists(select 1 from public.club_riders cr where cr.rider_id=r.rider_id and cr.club_id=r.club_id) then
      delete from public.club_riders where rider_id=r.rider_id and club_id=r.club_id;
      insert into public.rider_contract_transition_audit_v1(
        transition_run_id,source_season,target_season,rider_id,contract_id,club_id,
        action,action_game_date,metadata
      ) values(
        p_transition_run_id,p_source_season,p_target_season,r.rider_id,r.contract_id,r.club_id,
        'roster_removed',v_target_start,jsonb_build_object('reason','contract_expired')
      );
      v_roster_removed:=v_roster_removed+1;
    end if;

    -- Natural expiry creates a free agent only if retirement does not apply and
    -- there is no other contract already covering Jan 1.
    if r.availability_status<>'retired'
       and not exists(
         select 1 from public.rider_contracts nx
         where nx.rider_id=r.rider_id
           and nx.status='active'
           and nx.starts_on<=v_target_start
           and nx.expires_on>=v_target_start
       ) then
      v_age:=public.get_age_years_on_game_date(r.birth_date);
      v_desired_tier:=case coalesce(r.club_tier,'proteam')
        when 'amateur' then 'amateur'
        when 'continental' then 'continental'
        else 'proteam'
      end;
      v_expected:=greatest(coalesce(r.salary_weekly,0),250);
      v_min_salary:=greatest(floor(v_expected*0.90)::integer,100);
      v_duration:=public.suggest_initial_contract_seasons(
        coalesce(v_age,25),coalesce(r.overall,50)::smallint,coalesce(r.potential,50)::smallint
      );

      insert into public.rider_free_agents(
        rider_id,source_type,source_club_id,desired_tier,
        expected_salary_weekly,min_acceptable_salary_weekly,preferred_duration_seasons,
        available_from_game_date,expires_on_game_date,status
      ) values(
        r.rider_id,'contract_expired',r.club_id,v_desired_tier,
        v_expected,v_min_salary,v_duration,v_target_start,v_target_end,'available'
      )
      on conflict on constraint rider_free_agents_rider_id_key
      do update set
        source_type=excluded.source_type,
        source_club_id=excluded.source_club_id,
        desired_tier=excluded.desired_tier,
        expected_salary_weekly=excluded.expected_salary_weekly,
        min_acceptable_salary_weekly=excluded.min_acceptable_salary_weekly,
        preferred_duration_seasons=excluded.preferred_duration_seasons,
        available_from_game_date=excluded.available_from_game_date,
        expires_on_game_date=excluded.expires_on_game_date,
        status='available',
        updated_at=now();

      delete from public.rider_free_agent_negotiations n
      using public.rider_free_agents fa
      where fa.rider_id=r.rider_id and n.free_agent_id=fa.id;

      update public.rider_transfer_listings set status='expired'
      where rider_id=r.rider_id and status in ('listed','club_accepted');
      update public.rider_transfer_offers set status='expired'
      where rider_id=r.rider_id and status in ('open','club_accepted');
      update public.rider_transfer_negotiations set status='expired'
      where rider_id=r.rider_id and status in ('open','accepted');

      insert into public.rider_contract_transition_audit_v1(
        transition_run_id,source_season,target_season,rider_id,contract_id,club_id,
        action,action_game_date,metadata
      ) values(
        p_transition_run_id,p_source_season,p_target_season,r.rider_id,r.contract_id,r.club_id,
        'free_agent_created',v_target_start,jsonb_build_object(
          'source_type','contract_expired','expires_on_game_date',v_target_end,
          'expected_salary_weekly',v_expected
        )
      );
      v_free_agents:=v_free_agents+1;
    end if;

    perform public.sync_rider_contract_snapshot(r.rider_id);
  end loop;

  -- Jan-1 contracts become effective after expiries.
  perform public.process_due_rider_contract_starts_v1(
    v_target_start,p_transition_run_id,p_source_season,p_target_season
  );

  -- Wage totals must reflect the new roster/contract state.
  for r in select id from public.clubs where deleted_at is null loop
    perform public.recompute_club_wage_total(r.id);
  end loop;

  return jsonb_build_object(
    'ok',true,
    'source_season',p_source_season,
    'target_season',p_target_season,
    'contracts_expired',v_expired,
    'roster_rows_removed',v_roster_removed,
    'free_agents_created',v_free_agents,
    'target_start',v_target_start
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_team_ensure_ai_jerseys_v1(p_race_id uuid, p_team_id uuid, p_required integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_required integer := greatest(coalesce(p_required, 0), 0);
  v_owner uuid;
  v_is_ai boolean := false;
  v_before integer := 0;
  v_after integer := 0;
  v_game_date date;
begin
  v_owner := public.universal_race_resource_owner_club_v1(p_team_id);

  select
    coalesce(t.is_ai_filler, false)
      or coalesce(c.is_ai, false)
  into v_is_ai
  from public.race_participant_teams_v1 t
  join public.clubs c
    on c.id = t.club_id
  where t.race_id = p_race_id
    and t.club_id = p_team_id
  limit 1;

  if not coalesce(v_is_ai, false) then
    return jsonb_build_object(
      'status', 'not_ai',
      'team_id', p_team_id,
      'resource_owner_club_id', v_owner
    );
  end if;

  if v_owner is null then
    raise exception 'Could not resolve physical resource owner for team %.', p_team_id;
  end if;

  perform public.sync_race_supply_units_from_summary_v1(v_owner);

  select count(*)::integer
  into v_before
  from public.club_race_supply_units u
  where u.club_id = v_owner
    and u.supply_key = 'race_jersey_complete'
    and u.status in ('ready', 'assigned')
    and u.stage_uses_remaining > 0;

  if v_before < v_required then
    begin
      v_game_date := public.get_current_game_date_date();
    exception when others then
      v_game_date := null;
    end;

    insert into public.club_race_supplies (
      club_id,
      supply_key,
      display_name,
      quantity_available,
      total_purchased,
      total_used,
      last_purchased_game_date,
      metadata
    )
    values (
      v_owner,
      'race_jersey_complete',
      'Race Jersey Complete',
      v_required,
      v_required,
      0,
      v_game_date,
      jsonb_build_object(
        'source', 'ai_mandatory_race_jersey_provisioning_v2_shared_owner',
        'race_id', p_race_id,
        'sporting_team_id', p_team_id,
        'resource_owner_club_id', v_owner,
        'auto_provisioned', true,
        'last_auto_provisioned_at', clock_timestamp()
      )
    )
    on conflict (club_id, supply_key) do update
    set
      quantity_available = greatest(
        public.club_race_supplies.quantity_available,
        excluded.quantity_available
      ),
      total_purchased =
        public.club_race_supplies.total_purchased
        + greatest(
            excluded.quantity_available
            - greatest(public.club_race_supplies.quantity_available, v_before),
            0
          ),
      last_purchased_game_date = coalesce(
        excluded.last_purchased_game_date,
        public.club_race_supplies.last_purchased_game_date
      ),
      metadata =
        coalesce(public.club_race_supplies.metadata, '{}'::jsonb)
        || excluded.metadata,
      updated_at = clock_timestamp();

    perform public.sync_race_supply_units_from_summary_v1(v_owner);
  end if;

  select count(*)::integer
  into v_after
  from public.club_race_supply_units u
  where u.club_id = v_owner
    and u.supply_key = 'race_jersey_complete'
    and u.status in ('ready', 'assigned')
    and u.stage_uses_remaining > 0;

  return jsonb_build_object(
    'status', case when v_after >= v_required then 'ready' else 'failed' end,
    'team_id', p_team_id,
    'resource_owner_club_id', v_owner,
    'required_owner_pool', v_required,
    'usable_before', v_before,
    'usable_after', v_after,
    'automatic', true
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_mandatory_race_jersey_warning_v1(p_user_id uuid, p_race_id uuid, p_stage_id uuid, p_team_id uuid, p_required integer, p_available integer)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_race text;
  v_team text;
  v_stage integer;
  v_missing integer;
  v_ratio numeric;
  v_prep numeric;
  v_energy numeric;
  v_fatigue numeric;
  v_id bigint;
begin
  if p_user_id is null then return null; end if;
  select name into v_race from public.races where id=p_race_id;
  select name into v_team from public.clubs where id=p_team_id;
  select stage_number into v_stage from public.race_stages where id=p_stage_id;
  v_missing:=greatest(coalesce(p_required,0)-coalesce(p_available,0),0);
  v_ratio:=case when coalesce(p_required,0)>0 then least(1::numeric,v_missing::numeric/p_required::numeric) else 0 end;
  v_prep:=round(30*v_ratio,2);
  v_energy:=round(8*v_ratio,2);
  v_fatigue:=round(15*v_ratio,2);

  select public.ppm_create_user_notification_direct_v1(
    p_user_id,
    'RACE_JERSEYS_MANDATORY_WARNING',
    'Race Jersey shortage — performance penalty risk',
    format('%s has %s usable Race Jersey Kits for %s riders in %s — Stage %s. The team will still participate. If the shortage remains, the current penalty is -%s%% positive preparation bonuses, +%s%% in-stage energy cost and +%s%% post-stage fatigue. Add %s kit%s to remove the full shortage.',
      coalesce(v_team,'Your team'),coalesce(p_available,0),coalesce(p_required,0),coalesce(v_race,'the race'),coalesce(v_stage,0),v_prep,v_energy,v_fatigue,v_missing,case when v_missing=1 then '' else 's' end),
    '/dashboard/equipment?tab=race-supplies',
    jsonb_build_object(
      'mandatory',false,'performance_penalty',true,'advisor_notification',false,
      'event_type','race_jersey_shortage_warning',
      'risk','performance_penalty',
      'race_id',p_race_id,'race_name',v_race,'stage_id',p_stage_id,'stage_number',v_stage,
      'team_id',p_team_id,'team_name',v_team,
      'required_jersey_units',coalesce(p_required,0),
      'available_jersey_units',coalesce(p_available,0),
      'missing_jersey_units',v_missing,
      'shortage_ratio',round(v_ratio,6),
      'preparation_bonus_reduction_pct',v_prep,
      'energy_cost_penalty_pct',v_energy,
      'post_stage_fatigue_penalty_pct',v_fatigue,
      'team_remains_in_race',true,
      'consequence','proportional_race_performance_penalty',
      'race_supplies_path','/dashboard/equipment?tab=race-supplies',
      'race_path','/dashboard/races/'||p_race_id::text,
      'image_url','https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/mandatory%20race%20jersey.png'
    ),
    'mandatory_jersey_warning:'||p_race_id::text||':'||p_stage_id::text||':'||p_team_id::text
  ) into v_id;
  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_due_mandatory_race_jersey_notifications_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_date date := public.get_current_game_date_date();

  x record;
  req record;

  v_owner uuid;
  v_req integer;
  v_avail integer;
  v_checked integer := 0;
  v_short integer := 0;
  v_other_short integer := 0;

  v_shortages jsonb;
begin
  for x in
    with next_stage as (
      select distinct on (t.race_id, t.club_id)
        t.race_id,
        t.club_id as team_id,
        public.universal_race_resource_owner_club_v1(t.club_id)
          as resource_owner_club_id,
        s.id as stage_id,
        s.stage_number,
        s.stage_date
      from public.race_participant_teams_v1 t
      join public.races r
        on r.id = t.race_id
      join public.race_stages s
        on s.race_id = t.race_id
      where lower(coalesce(r.status, 'scheduled')) in ('scheduled', 'active')
        and lower(coalesce(t.status, 'accepted')) = 'accepted'
        and s.stage_date::date between v_date and v_date + 7
        and not coalesce(s.weather_cancelled, false)
        and not exists (
          select 1
          from public.race_stage_authoritative_runs a
          where a.stage_id = s.id
        )
        and not public.universal_race_team_disqualified_for_stage_v1(
          t.race_id,
          t.club_id,
          s.stage_number
        )
      order by
        t.race_id,
        t.club_id,
        s.stage_date,
        s.stage_number,
        s.id
    )
    select
      n.*,
      owner.owner_user_id,
      coalesce(c.is_ai, false) as participating_is_ai
    from next_stage n
    join public.clubs owner
      on owner.id = n.resource_owner_club_id
    join public.clubs c
      on c.id = n.team_id
    where owner.owner_user_id is not null
      and coalesce(c.is_ai, false) = false
  loop
    v_owner := x.resource_owner_club_id;

    -- Safe reconciliation of already-owned summary stock to durable units.
    perform public.sync_race_supply_units_from_summary_v1(v_owner);

    v_req := public.universal_race_team_required_jerseys_v1(
      x.race_id,
      x.team_id
    );

    if v_req > 0 then
      v_avail :=
        public.universal_race_stage_effective_supply_available_v1(
          x.stage_id,
          x.team_id,
          'race_jersey_complete'
        );

      v_checked := v_checked + 1;

      if v_avail < v_req then
        perform public.create_mandatory_race_jersey_warning_v1(
          x.owner_user_id,
          x.race_id,
          x.stage_id,
          x.team_id,
          v_req,
          v_avail
        );

        v_short := v_short + 1;
      end if;
    end if;

    -- Race-specific warnings for all OTHER planned race supplies.
    v_shortages := '[]'::jsonb;

    for req in
      select
        p.supply_key,
        p.required_quantity,
        public.universal_race_stage_effective_supply_available_v1(
          x.stage_id,
          x.team_id,
          p.supply_key
        ) as available_quantity
      from public.universal_race_stage_planned_supplies_v1(
        x.stage_id,
        x.team_id
      ) p
      where p.supply_key <> 'race_jersey_complete'
        and p.required_quantity > 0
      order by p.supply_key
    loop
      if req.available_quantity < req.required_quantity then
        v_shortages :=
          v_shortages
          || jsonb_build_array(
            jsonb_build_object(
              'supply_key', req.supply_key,
              'supply_name',
                case req.supply_key
                  when 'bidons_water_bottles' then 'Bidons / Water Bottles'
                  when 'energy_gels' then 'Energy Gels'
                  when 'nutrition_packs' then 'Nutrition Packs'
                  when 'rain_jackets' then 'Rain Jackets'
                  else req.supply_key
                end,
              'required_quantity', req.required_quantity,
              'available_quantity', req.available_quantity,
              'missing_quantity',
                req.required_quantity - req.available_quantity,
              'sporting_team_id', x.team_id,
              'resource_owner_club_id', v_owner,
              'first_team_priority_applied', true
            )
          );
      end if;
    end loop;

    if jsonb_array_length(v_shortages) > 0 then
      perform public.create_race_supplies_low_notification_v1(
        x.owner_user_id,
        x.race_id,
        x.team_id,
        v_shortages,
        'shared_race_supply_warning:'
          || x.race_id::text
          || ':'
          || x.stage_id::text
          || ':'
          || x.team_id::text
      );

      v_other_short := v_other_short + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'status', 'completed',
    'current_game_date', v_date,
    'teams_checked', v_checked,
    'shortage_warnings_processed', v_short,
    'other_race_supply_shortage_warnings_processed', v_other_short,
    'mandatory', true,
    'advisor_notification', false,
    'warning_horizon_game_days', 7,
    'resource_rule', 'u23_uses_main_team_pool_first_team_priority'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_filter_phase9_eligible_v1(p_stage_id uuid, p_phase9 jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_race uuid;
  v_no integer;
  v jsonb := coalesce(p_phase9, '{}'::jsonb);
  a jsonb;
  o jsonb;
begin
  select race_id, stage_number
  into v_race, v_no
  from public.race_stages
  where id = p_stage_id;

  if v_race is null then
    return v;
  end if;

  select coalesce(jsonb_agg(i.value order by i.ord), '[]'::jsonb)
  into a
  from jsonb_array_elements(
    coalesce(v -> 'riderModifiers', '[]'::jsonb)
  ) with ordinality i(value, ord)
  where nullif(i.value ->> 'team_id', '') is null
     or not public.universal_race_team_disqualified_for_stage_v1(
       v_race,
       (i.value ->> 'team_id')::uuid,
       v_no
     );

  v := jsonb_set(v, '{riderModifiers}', a, true);

  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
  into o
  from jsonb_each(
    coalesce(v #> '{preparation,equipment}', '{}'::jsonb)
  ) e
  where coalesce(
          nullif(e.value ->> 'sportingTeamId', ''),
          nullif(e.value ->> 'teamId', '')
        ) is null
     or not public.universal_race_team_disqualified_for_stage_v1(
       v_race,
       coalesce(
         nullif(e.value ->> 'sportingTeamId', ''),
         nullif(e.value ->> 'teamId', '')
       )::uuid,
       v_no
     );

  v := jsonb_set(v, '{preparation,equipment}', o, true);

  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
  into o
  from jsonb_each(
    coalesce(v #> '{preparation,staff}', '{}'::jsonb)
  ) e
  where nullif(e.value ->> 'teamId', '') is null
     or not public.universal_race_team_disqualified_for_stage_v1(
       v_race,
       (e.value ->> 'teamId')::uuid,
       v_no
     );

  v := jsonb_set(v, '{preparation,staff}', o, true);

  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
  into o
  from jsonb_each(
    coalesce(v #> '{preparation,assets}', '{}'::jsonb)
  ) e
  where coalesce(
          nullif(e.value ->> 'sportingTeamId', ''),
          nullif(e.value ->> 'teamId', '')
        ) is null
     or not public.universal_race_team_disqualified_for_stage_v1(
       v_race,
       coalesce(
         nullif(e.value ->> 'sportingTeamId', ''),
         nullif(e.value ->> 'teamId', '')
       )::uuid,
       v_no
     );

  v := jsonb_set(v, '{preparation,assets}', o, true);

  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
  into o
  from jsonb_each(
    coalesce(v #> '{preparation,raceSupplies}', '{}'::jsonb)
  ) e
  where coalesce(
          nullif(e.value ->> 'sportingTeamId', ''),
          nullif(e.value ->> 'teamId', '')
        ) is null
     or not public.universal_race_team_disqualified_for_stage_v1(
       v_race,
       coalesce(
         nullif(e.value ->> 'sportingTeamId', ''),
         nullif(e.value ->> 'teamId', '')
       )::uuid,
       v_no
     );

  v := jsonb_set(v, '{preparation,raceSupplies}', o, true);

  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
  into o
  from jsonb_each(
    coalesce(v #> '{preparation,standardizedBonuses,teams}', '{}'::jsonb)
  ) e
  where e.key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or not public.universal_race_team_disqualified_for_stage_v1(
       v_race,
       e.key::uuid,
       v_no
     );

  v := jsonb_set(
    v,
    '{preparation,standardizedBonuses,teams}',
    o,
    true
  );

  return v;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_enrich_rider_json_v1(p_value jsonb, p_default_scope text DEFAULT 'internal'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_type text;
  v_result jsonb;
  v_key text;
  v_item jsonb;
  v_rider_id uuid;
  v_rider record;
  v_full_name text;
  v_scope text;
begin
  if p_value is null then
    return null;
  end if;

  v_type := jsonb_typeof(p_value);

  if v_type = 'array' then
    select coalesce(
      jsonb_agg(
        public.staff_advisory_enrich_rider_json_v1(value, p_default_scope)
      ),
      '[]'::jsonb
    )
    into v_result
    from jsonb_array_elements(p_value);

    return v_result;
  end if;

  if v_type <> 'object' then
    return p_value;
  end if;

  v_result := '{}'::jsonb;

  for v_key, v_item in
    select key, value
    from jsonb_each(p_value)
  loop
    v_result :=
      v_result ||
      jsonb_build_object(
        v_key,
        public.staff_advisory_enrich_rider_json_v1(
          v_item,
          p_default_scope
        )
      );
  end loop;

  if coalesce(v_result->>'rider_id', '') ~*
     '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    v_rider_id := (v_result->>'rider_id')::uuid;

    select
      r.id,
      r.first_name,
      r.last_name,
      r.display_name,
      r.country_code
    into v_rider
    from public.riders r
    where r.id = v_rider_id
    limit 1;

    if found then
      v_full_name :=
        nullif(
          trim(
            concat_ws(
              ' ',
              nullif(trim(coalesce(v_rider.first_name, '')), ''),
              nullif(trim(coalesce(v_rider.last_name, '')), '')
            )
          ),
          ''
        );

      if v_full_name is null then
        v_full_name := nullif(trim(coalesce(v_rider.display_name, '')), '');
      end if;

      v_scope :=
        coalesce(
          nullif(trim(v_result->>'rider_scope'), ''),
          nullif(trim(p_default_scope), ''),
          'internal'
        );

      v_result :=
        v_result ||
        jsonb_build_object(
          'rider_first_name', nullif(trim(coalesce(v_rider.first_name, '')), ''),
          'rider_last_name', nullif(trim(coalesce(v_rider.last_name, '')), ''),
          'rider_full_name', v_full_name,
          'rider_country_code', nullif(trim(coalesce(v_rider.country_code, '')), ''),
          'rider_scope', v_scope,
          'rider_profile_path',
            case
              when v_scope = 'external'
                then '/dashboard/external-riders/' || v_rider.id::text
              else '/dashboard/my-riders/' || v_rider.id::text
            end
        );
    end if;
  end if;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_primary_rider_object_v1(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  v_candidate jsonb;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return null;
  end if;

  if jsonb_typeof(p_payload->'data') = 'object'
     and nullif(p_payload->'data'->>'rider_id', '') is not null
  then
    return p_payload->'data';
  end if;

  if jsonb_typeof(p_payload->'snapshot') = 'object'
     and nullif(p_payload->'snapshot'->>'rider_id', '') is not null
  then
    return p_payload->'snapshot';
  end if;

  if jsonb_typeof(p_payload->'attention_riders') = 'array'
     and jsonb_array_length(p_payload->'attention_riders') = 1
  then
    v_candidate := p_payload->'attention_riders'->0;
    if jsonb_typeof(v_candidate) = 'object'
       and nullif(v_candidate->>'rider_id', '') is not null
    then
      return v_candidate;
    end if;
  end if;

  if jsonb_typeof(p_payload #> '{data,health_cases}') = 'array'
     and jsonb_array_length(p_payload #> '{data,health_cases}') = 1
  then
    v_candidate := p_payload #> '{data,health_cases,0}';
    if jsonb_typeof(v_candidate) = 'object'
       and nullif(v_candidate->>'rider_id', '') is not null
    then
      return v_candidate;
    end if;
  end if;

  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_expand_primary_rider_text_v1(p_text text, p_payload jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  v_obj jsonb;
  v_old_name text;
  v_full_name text;
begin
  if p_text is null or btrim(p_text) = '' then
    return p_text;
  end if;

  v_obj := public.staff_advisory_primary_rider_object_v1(p_payload);
  if v_obj is null then
    return p_text;
  end if;

  v_full_name := nullif(btrim(v_obj->>'rider_full_name'), '');
  v_old_name :=
    coalesce(
      nullif(btrim(v_obj->>'rider_name'), ''),
      nullif(btrim(v_obj->>'name'), ''),
      nullif(btrim(v_obj->>'display_name'), '')
    );

  if v_full_name is null
     or v_old_name is null
     or v_full_name = v_old_name
  then
    return p_text;
  end if;

  return replace(p_text, v_old_name, v_full_name);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_enrich_notification_riders_trg_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_code text;
  v_scope text;
  v_summary text;
begin
  select nt.code
  into v_code
  from public.notification_types nt
  where nt.id = new.type_id;

  if v_code not in (
    'ADVISOR_HEAD_COACH_REPORT',
    'ADVISOR_SPORT_DIRECTOR_REPORT',
    'ADVISOR_TEAM_DOCTOR_REPORT',
    'ADVISOR_CHIEF_MECHANIC_REPORT',
    'ADVISOR_SCOUT_REPORT'
  ) then
    return new;
  end if;

  v_scope :=
    case
      when v_code = 'ADVISOR_SCOUT_REPORT' then 'external'
      else 'internal'
    end;

  new.payload_json :=
    public.staff_advisory_enrich_rider_json_v1(
      coalesce(new.payload_json, '{}'::jsonb),
      v_scope
    );

  new.message :=
    public.staff_advisory_expand_primary_rider_text_v1(
      new.message,
      new.payload_json
    );

  v_summary := new.payload_json->>'summary';

  if v_summary is not null then
    new.payload_json :=
      jsonb_set(
        new.payload_json,
        '{summary}',
        to_jsonb(
          public.staff_advisory_expand_primary_rider_text_v1(
            v_summary,
            new.payload_json
          )
        ),
        true
      );
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_enrich_report_riders_trg_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_scope text;
begin
  if new.role_type not in (
    'head_coach',
    'sport_director',
    'team_doctor',
    'mechanic',
    'scout_analyst'
  ) then
    return new;
  end if;

  v_scope :=
    case
      when new.role_type = 'scout_analyst' then 'external'
      else 'internal'
    end;

  new.report_json :=
    public.staff_advisory_enrich_rider_json_v1(
      coalesce(new.report_json, '{}'::jsonb),
      v_scope
    );

  new.summary :=
    public.staff_advisory_expand_primary_rider_text_v1(
      new.summary,
      new.report_json
    );

  if new.report_json ? 'summary' then
    new.report_json :=
      jsonb_set(
        new.report_json,
        '{summary}',
        to_jsonb(
          public.staff_advisory_expand_primary_rider_text_v1(
            new.report_json->>'summary',
            new.report_json
          )
        ),
        true
      );
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.dry_run_rider_contract_season_transition_v1(p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_timeline uuid;
  v_run_id uuid:=gen_random_uuid();
  v_retirements jsonb;
  v_snapshot_rows integer;
  v_competition jsonb;
  v_first jsonb;
  v_second jsonb;
  v_payload jsonb;
  v_expired_audit_first integer;
  v_expired_audit_second integer;
  v_bad_status integer;
  v_bad_roster integer;
  v_bad_free_agent integer;
  v_bad_payroll integer;
  v_active_expiring_remaining integer;
  v_multiple_rosters integer;
  v_target_active_missing_roster integer;
  v_retired_active_contracts integer;
  v_snapshot_mismatch integer;
begin
  if p_target_season is distinct from p_source_season+1 then
    raise exception 'target season must equal source season + 1';
  end if;

  select timeline_id into v_timeline
  from public.season_transition_control_v1
  where id=true;

  if v_timeline is null then
    raise exception 'season transition timeline missing';
  end if;

  begin
    insert into public.season_transition_runs_v1(
      id,timeline_id,source_season,target_season,status,metadata
    ) values(
      v_run_id,v_timeline,p_source_season,p_target_season,'running',
      jsonb_build_object('dry_run',true,'component','rider_contracts')
    );

    v_retirements:=public.run_retirement_season_transition_v1(p_source_season,p_target_season);
    v_snapshot_rows:=public.snapshot_team_rankings_for_season_v1(p_source_season);
    v_competition:=public.run_competition_season_transition_v1(v_run_id,p_source_season,p_target_season);
    v_first:=public.process_rider_contract_season_expiry_v1(v_run_id,p_source_season,p_target_season);

    select count(*) into v_expired_audit_first
    from public.rider_contract_transition_audit_v1 a
    where a.transition_run_id=v_run_id and a.action='contract_expired';

    select count(*) into v_bad_status
    from public.rider_contract_transition_audit_v1 a
    join public.rider_contracts rc on rc.id=a.contract_id
    where a.transition_run_id=v_run_id
      and a.action='contract_expired'
      and rc.status<>'expired';

    select count(*) into v_bad_roster
    from public.rider_contract_transition_audit_v1 a
    join public.club_riders cr on cr.rider_id=a.rider_id and cr.club_id=a.club_id
    where a.transition_run_id=v_run_id
      and a.action='contract_expired';

    select count(*) into v_bad_free_agent
    from public.rider_contract_transition_audit_v1 a
    join public.riders r on r.id=a.rider_id
    where a.transition_run_id=v_run_id
      and a.action='contract_expired'
      and r.availability_status<>'retired'
      and not exists(
        select 1 from public.rider_contracts nx
        where nx.rider_id=a.rider_id
          and nx.status='active'
          and nx.starts_on<=make_date(1999+p_target_season,1,1)
          and nx.expires_on>=make_date(1999+p_target_season,1,1)
      )
      and not exists(
        select 1 from public.rider_free_agents fa
        where fa.rider_id=a.rider_id
          and fa.status='available'
          and fa.source_type='contract_expired'
          and fa.available_from_game_date=make_date(1999+p_target_season,1,1)
      );

    select count(*) into v_bad_payroll
    from public.rider_contract_transition_audit_v1 a
    join public.rider_payroll_state ps on ps.contract_id=a.contract_id
    where a.transition_run_id=v_run_id
      and a.action='contract_expired'
      and (
        (coalesce(ps.outstanding_salary_debt,0)+coalesce(ps.outstanding_breach_fine,0)>0 and ps.payroll_status<>'released_unpaid')
        or
        (coalesce(ps.outstanding_salary_debt,0)+coalesce(ps.outstanding_breach_fine,0)=0 and ps.payroll_status<>'settled')
      );

    select count(*) into v_active_expiring_remaining
    from public.rider_contracts rc
    where rc.status='active'
      and rc.expires_on<=public.get_game_date_for_season_end(p_source_season);

    select count(*) into v_multiple_rosters
    from (
      select rider_id from public.club_riders group by rider_id having count(distinct club_id)>1
    ) x;

    select count(*) into v_target_active_missing_roster
    from public.rider_contracts rc
    join public.clubs c on c.id=rc.club_id
    join public.riders r on r.id=rc.rider_id
    where rc.status='active'
      and rc.starts_on<=make_date(1999+p_target_season,1,1)
      and rc.expires_on>=make_date(1999+p_target_season,1,1)
      and c.deleted_at is null
      and r.availability_status<>'retired'
      and not exists(
        select 1 from public.club_riders cr
        where cr.rider_id=rc.rider_id and cr.club_id=rc.club_id
      );

    select count(*) into v_retired_active_contracts
    from public.rider_contracts rc
    join public.riders r on r.id=rc.rider_id
    where rc.status='active' and r.availability_status='retired';

    select count(*) into v_snapshot_mismatch
    from public.rider_contracts rc
    join public.riders r on r.id=rc.rider_id
    join public.clubs c on c.id=rc.club_id
    where rc.status='active'
      and c.deleted_at is null
      and not public.is_national_team_club_v1(c.id)
      and (
        r.salary is distinct from rc.salary_weekly
        or r.contract_expires_at is distinct from rc.expires_on
        or r.contract_expires_season is distinct from rc.end_season_number
      );

    v_second:=public.process_rider_contract_season_expiry_v1(v_run_id,p_source_season,p_target_season);

    select count(*) into v_expired_audit_second
    from public.rider_contract_transition_audit_v1 a
    where a.transition_run_id=v_run_id and a.action='contract_expired';

    v_payload:=jsonb_build_object(
      'ok',
        v_bad_status=0 and v_bad_roster=0 and v_bad_free_agent=0 and
        v_bad_payroll=0 and v_active_expiring_remaining=0 and
        v_multiple_rosters=0 and v_target_active_missing_roster=0 and
        v_retired_active_contracts=0 and v_snapshot_mismatch=0 and
        coalesce((v_second->>'contracts_expired')::integer,-1)=0 and
        v_expired_audit_second=v_expired_audit_first,
      'source_season',p_source_season,
      'target_season',p_target_season,
      'canonical_snapshot_rows',v_snapshot_rows,
      'retirements',v_retirements,
      'competition',v_competition,
      'first_contract_pass',v_first,
      'second_contract_pass',v_second,
      'expired_audit_first',v_expired_audit_first,
      'expired_audit_after_second',v_expired_audit_second,
      'bad_contract_status',v_bad_status,
      'expired_rider_still_on_old_roster',v_bad_roster,
      'missing_expected_free_agent',v_bad_free_agent,
      'bad_payroll_resolution',v_bad_payroll,
      'active_expiring_contracts_remaining',v_active_expiring_remaining,
      'riders_on_multiple_rosters',v_multiple_rosters,
      'target_active_contract_missing_roster',v_target_active_missing_roster,
      'retired_riders_with_active_contract',v_retired_active_contracts,
      'active_contract_snapshot_mismatch',v_snapshot_mismatch
    );

    raise exception using message='__PPM_ITEM4_DRYRUN_ROLLBACK__';
  exception when others then
    if sqlerrm='__PPM_ITEM4_DRYRUN_ROLLBACK__' then
      return v_payload;
    end if;
    raise;
  end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_force_mandatory_jersey_phase9_v1(p_stage_id uuid, p_phase9 jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_race_id uuid;
  v_stage_number integer;
  v_stage_date date;

  v_result jsonb := coalesce(p_phase9, '{}'::jsonb);
  v_supplies jsonb := '{}'::jsonb;
  v_assignments jsonb := '{}'::jsonb;

  v_required_count integer := 0;
  v_assignment_count integer := 0;
  v_shortage_detail jsonb := '[]'::jsonb;
begin
  if p_stage_id is null then
    raise exception using
      errcode = '22023',
      message =
        'universal_race_stage_force_mandatory_jersey_phase9_v1: stage_id is required';
  end if;

  select
    stage.race_id,
    stage.stage_number,
    stage.stage_date::date
  into
    v_race_id,
    v_stage_number,
    v_stage_date
  from public.race_stages stage
  where stage.id = p_stage_id;

  if v_race_id is null then
    raise exception using
      errcode = 'P0002',
      message = format('Stage %s was not found.', p_stage_id);
  end if;

  if jsonb_typeof(v_result -> 'preparation') is distinct from 'object' then
    v_result := jsonb_set(
      v_result,
      '{preparation}',
      '{}'::jsonb,
      true
    );
  end if;

  v_supplies := coalesce(
    v_result #> '{preparation,raceSupplies}',
    '{}'::jsonb
  );

  if jsonb_typeof(v_supplies) is distinct from 'object' then
    v_supplies := '{}'::jsonb;
  end if;

  select coalesce(
    jsonb_object_agg(entry.key, entry.value order by entry.key),
    '{}'::jsonb
  )
  into v_supplies
  from jsonb_each(v_supplies) entry
  where not (
    entry.value ->> 'resourceKind' = 'durable_supply_unit'
    and entry.value ->> 'supplyKey' = 'race_jersey_complete'
  );

  with eligible_riders as (
    select
      rider.team_id as sporting_team_id,
      public.universal_race_resource_owner_club_v1(rider.team_id)
        as resource_owner_club_id,
      rider.rider_id,
      rider.start_number,
      (
        case
          when coalesce(c.club_type, 'main') = 'developing'
            then public.universal_race_main_team_reserved_supply_v1(
              p_stage_id,
              public.universal_race_resource_owner_club_v1(rider.team_id),
              'race_jersey_complete'
            )
          else 0
        end
        + public.universal_race_prior_same_team_jersey_reservations_v1(
            p_stage_id,
            rider.team_id
          )
      ) as first_team_reserved_units,
      row_number() over (
        partition by rider.team_id
        order by
          rider.start_number nulls last,
          rider.rider_id
      ) as sporting_team_allocation_rank
    from public.race_participant_riders_v1 rider
    join public.clubs c
      on c.id = rider.team_id
    where rider.race_id = v_race_id
      and not public.universal_race_team_disqualified_for_stage_v1(
        v_race_id,
        rider.team_id,
        v_stage_number
      )
  ),
  eligible_owners as (
    select distinct resource_owner_club_id
    from eligible_riders
    where resource_owner_club_id is not null
  ),
  usable_units as (
    select
      unit.club_id as resource_owner_club_id,
      unit.id as unit_id,
      unit.max_stage_uses,
      unit.stage_uses_remaining,
      unit.created_at,
      row_number() over (
        partition by unit.club_id
        order by
          unit.stage_uses_remaining asc,
          unit.created_at asc,
          unit.id asc
      ) as owner_allocation_rank
    from public.club_race_supply_units unit
    join eligible_owners owner
      on owner.resource_owner_club_id = unit.club_id
    where unit.supply_key = 'race_jersey_complete'
      and unit.status in ('ready', 'assigned')
      and unit.stage_uses_remaining > 0
      and (
        unit.last_used_game_date is null
        or unit.last_used_game_date <> v_stage_date
      )
  ),
  assignments as (
    select
      rider.sporting_team_id,
      rider.resource_owner_club_id,
      rider.rider_id,
      rider.first_team_reserved_units,
      unit.unit_id,
      unit.max_stage_uses,
      unit.stage_uses_remaining
    from eligible_riders rider
    join usable_units unit
      on unit.resource_owner_club_id = rider.resource_owner_club_id
     and unit.owner_allocation_rank =
       rider.first_team_reserved_units
       + rider.sporting_team_allocation_rank
  ),
  team_counts as (
    select
      rider.sporting_team_id,
      count(*)::integer as required_count
    from eligible_riders rider
    group by rider.sporting_team_id
  ),
  assigned_counts as (
    select
      assignment.sporting_team_id,
      count(*)::integer as assigned_count
    from assignments assignment
    group by assignment.sporting_team_id
  ),
  shortages as (
    select
      required.sporting_team_id,
      required.required_count,
      coalesce(assigned.assigned_count, 0) as assigned_count,
      required.required_count - coalesce(assigned.assigned_count, 0)
        as missing_count
    from team_counts required
    left join assigned_counts assigned
      on assigned.sporting_team_id = required.sporting_team_id
    where coalesce(assigned.assigned_count, 0) <> required.required_count
  )
  select
    coalesce(
      (
        select jsonb_object_agg(
          'durable:' || assignment.unit_id::text,
          jsonb_build_object(
            'source', 'phase11d2_mandatory_race_jersey_shared_owner',
            'teamId', assignment.resource_owner_club_id,
            'sportingTeamId', assignment.sporting_team_id,
            'riderId', assignment.rider_id,
            'supplyKey', 'race_jersey_complete',
            'maxStageUses', assignment.max_stage_uses,
            'resourceKind', 'durable_supply_unit',
            'allocationRule',
              'first_team_reserved_then_prior_same_day_then_lowest_uses_remaining_then_created_at_then_id',
            'selectedStageUses', 1,
            'stageUsesRemaining', assignment.stage_uses_remaining,
            'mandatory', true,
            'firstTeamReservedUnits',
              assignment.first_team_reserved_units,
            'ruleVersion',
              'phase11d2_same_day_reservation_v2'
          )
          order by assignment.unit_id::text
        )
        from assignments assignment
      ),
      '{}'::jsonb
    ),
    (select count(*)::integer from eligible_riders),
    (select count(*)::integer from assignments),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'team_id', shortage.sporting_team_id,
            'required', shortage.required_count,
            'assigned', shortage.assigned_count,
            'missing', shortage.missing_count
          )
          order by shortage.sporting_team_id
        )
        from shortages shortage
      ),
      '[]'::jsonb
    )
  into
    v_assignments,
    v_required_count,
    v_assignment_count,
    v_shortage_detail;

  v_supplies := v_supplies || v_assignments;

  v_result := jsonb_set(
    v_result,
    '{preparation,raceSupplies}',
    v_supplies,
    true
  );

  v_result := jsonb_set(
    v_result,
    '{mandatoryJerseyContinuity}',
    jsonb_build_object(
      'applied', true,
      'ruleVersion', 'phase11d2_same_day_reservation_v2',
      'requiredRiderCount', v_required_count,
      'assignedDurableJerseyCount', v_assignment_count,
      'missingRaceJerseyCount', greatest(v_required_count-v_assignment_count,0),
      'shortageTeams', v_shortage_detail,
      'allRidersAllowedToRace', true,
      'shortagePenaltyRule', 'optional_race_jersey_performance_penalty_v1',
      'selectedStageUsesPerRider', 1,
      'physicalOwnerRule', 'developing_team_uses_parent_club',
      'firstTeamPriority', true,
      'priorSameSportingTeamReservation', true,
      'sameGameDateUnitReuseAllowed', false,
      'stagePlanToggleIgnored', true,
      'phase9BonusModelChanged', false
    ),
    true
  );

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_staff_contract_season_expiry_v1(p_transition_run_id uuid, p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_source_end date:=public.get_game_date_for_season_end(p_source_season);
  v_target_start date:=make_date(1999+p_target_season,1,1);
  v_target_start_ts timestamp:=make_timestamp(1999+p_target_season,1,1,0,0,0);
  r record;
  v_candidate_id uuid;
  v_candidate_action text;
  v_expired integer:=0;
  v_candidates integer:=0;
begin
  if p_target_season is distinct from p_source_season+1 then
    raise exception 'target season must equal source season + 1';
  end if;

  if not exists(
    select 1 from public.season_transition_runs_v1 x
    where x.id=p_transition_run_id and x.status='running'
  ) then
    raise exception 'running transition not found';
  end if;

  for r in
    select cs.*
    from public.club_staff cs
    join public.clubs c on c.id=cs.club_id
    where cs.is_active=true
      and cs.contract_expires_at is not null
      and cs.contract_expires_at<=v_source_end
      and c.deleted_at is null
    order by cs.id
    for update of cs
  loop
    update public.club_staff
    set is_active=false,
        notes=coalesce(notes,'{}'::jsonb)||jsonb_build_object(
          'contract_expired_by_season_transition',true,
          'expired_source_season',p_source_season,
          'target_season',p_target_season,
          'expired_on_game_date',v_source_end
        ),
        updated_at=now()
    where id=r.id and is_active=true;

    insert into public.staff_contract_transition_audit_v1(
      transition_run_id,source_season,target_season,staff_id,club_id,
      action,action_game_date,metadata
    ) values(
      p_transition_run_id,p_source_season,p_target_season,r.id,r.club_id,
      'staff_contract_expired',v_target_start,
      jsonb_build_object('contract_expires_at',r.contract_expires_at,'role_type',r.role_type)
    );
    v_expired:=v_expired+1;

    if not exists(
      select 1 from public.retirement_decisions rd
      where rd.subject_type='staff'
        and rd.subject_id=r.id
        and rd.status='finalized'
        and rd.season_number<=p_source_season
    ) then
      v_candidate_id:=null;
      v_candidate_action:='staff_market_candidate_created';

      -- Preferred path: restore the exact market row this employee was hired from.
      begin
        v_candidate_id:=nullif(r.notes->>'hired_from_candidate_id','')::uuid;
      exception when others then
        v_candidate_id:=null;
      end;

      if v_candidate_id is not null
         and not exists(select 1 from public.staff_candidates sc where sc.id=v_candidate_id) then
        v_candidate_id:=null;
      end if;

      -- Fallback for legacy rows: reuse the unique profile if it already exists.
      if v_candidate_id is null then
        select sc.id into v_candidate_id
        from public.staff_candidates sc
        where sc.role_type=r.role_type
          and sc.staff_name=r.staff_name
          and sc.specialization is not distinct from r.specialization
          and sc.salary_weekly=r.salary_weekly
        order by sc.created_at asc
        limit 1;
      end if;

      if v_candidate_id is not null then
        update public.staff_candidates sc
        set role_type=r.role_type,
            specialization=r.specialization,
            staff_name=r.staff_name,
            country_code=r.country_code,
            expertise=r.expertise,
            experience=r.experience,
            potential=r.potential,
            leadership=r.leadership,
            efficiency=r.efficiency,
            loyalty=r.loyalty,
            salary_weekly=r.salary_weekly,
            is_available=true,
            notes=coalesce(sc.notes,'{}'::jsonb)||jsonb_build_object(
              'source','expired_club_staff_contract',
              'former_club_staff_id',r.id,
              'source_club_id',r.club_id,
              'source_season',p_source_season,
              'available_from_season',p_target_season,
              'reactivated_from_employment',true
            ),
            first_name=r.first_name,
            last_name=r.last_name,
            listed_at_game_ts=v_target_start_ts,
            expires_at_game_ts=v_target_start_ts+interval '72 hours',
            birth_date=r.birth_date,
            market_region=public.staff_market_region_from_country(r.country_code),
            updated_at=now()
        where sc.id=v_candidate_id;
        v_candidate_action:='staff_market_candidate_reactivated';
      else
        insert into public.staff_candidates(
          role_type,specialization,staff_name,country_code,
          expertise,experience,potential,leadership,efficiency,loyalty,
          salary_weekly,is_available,notes,first_name,last_name,
          listed_at_game_ts,expires_at_game_ts,birth_date,market_region,
          created_at,updated_at
        ) values(
          r.role_type,r.specialization,r.staff_name,r.country_code,
          r.expertise,r.experience,r.potential,r.leadership,r.efficiency,r.loyalty,
          r.salary_weekly,true,
          jsonb_build_object(
            'source','expired_club_staff_contract',
            'former_club_staff_id',r.id,
            'source_club_id',r.club_id,
            'source_season',p_source_season,
            'available_from_season',p_target_season,
            'reactivated_from_employment',false
          ),
          r.first_name,r.last_name,
          v_target_start_ts,
          v_target_start_ts+interval '72 hours',
          r.birth_date,
          public.staff_market_region_from_country(r.country_code),
          now(),now()
        ) returning id into v_candidate_id;
      end if;

      insert into public.staff_contract_transition_audit_v1(
        transition_run_id,source_season,target_season,staff_id,club_id,
        action,action_game_date,metadata
      ) values(
        p_transition_run_id,p_source_season,p_target_season,r.id,r.club_id,
        v_candidate_action,v_target_start,
        jsonb_build_object('market_lifetime_hours',72,'role_type',r.role_type,'candidate_id',v_candidate_id)
      );
      v_candidates:=v_candidates+1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok',true,
    'source_season',p_source_season,
    'target_season',p_target_season,
    'staff_contracts_expired',v_expired,
    'staff_market_candidates_created_or_reactivated',v_candidates,
    'target_start',v_target_start
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.dry_run_staff_contract_season_transition_v1(p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_timeline uuid;
  v_run_id uuid:=gen_random_uuid();
  v_ret jsonb;
  v_first jsonb;
  v_second jsonb;
  v_payload jsonb;
  v_audit_first integer;
  v_audit_second integer;
  v_still_active integer;
  v_missing_candidate integer;
  v_retired_candidate integer;
  v_duplicate_candidate integer;
  v_continuing_before integer;
  v_continuing_after integer;
begin
  if p_target_season is distinct from p_source_season+1 then
    raise exception 'target season must equal source season + 1';
  end if;

  select timeline_id into v_timeline from public.season_transition_control_v1 where id=true;

  begin
    insert into public.season_transition_runs_v1(
      id,timeline_id,source_season,target_season,status,metadata
    ) values(
      v_run_id,v_timeline,p_source_season,p_target_season,'running',
      jsonb_build_object('dry_run',true,'component','staff_contracts')
    );

    select count(*) into v_continuing_before
    from public.club_staff cs join public.clubs c on c.id=cs.club_id
    where cs.is_active=true
      and cs.contract_expires_at>public.get_game_date_for_season_end(p_source_season)
      and c.deleted_at is null;

    v_ret:=public.run_retirement_season_transition_v1(p_source_season,p_target_season);
    v_first:=public.process_staff_contract_season_expiry_v1(v_run_id,p_source_season,p_target_season);

    select count(*) into v_audit_first
    from public.staff_contract_transition_audit_v1 a
    where a.transition_run_id=v_run_id and a.action='staff_contract_expired';

    select count(*) into v_still_active
    from public.staff_contract_transition_audit_v1 a
    join public.club_staff cs on cs.id=a.staff_id
    where a.transition_run_id=v_run_id and a.action='staff_contract_expired' and cs.is_active=true;

    select count(*) into v_missing_candidate
    from public.staff_contract_transition_audit_v1 a
    where a.transition_run_id=v_run_id
      and a.action='staff_contract_expired'
      and not exists(
        select 1 from public.retirement_decisions rd
        where rd.subject_type='staff' and rd.subject_id=a.staff_id
          and rd.status='finalized' and rd.season_number<=p_source_season
      )
      and not exists(
        select 1 from public.staff_candidates sc
        where sc.is_available=true and coalesce(sc.notes->>'former_club_staff_id','')=a.staff_id::text
      );

    select count(*) into v_retired_candidate
    from public.staff_candidates sc
    join public.retirement_decisions rd
      on rd.subject_type='staff' and coalesce(sc.notes->>'former_club_staff_id','')=rd.subject_id::text
    where sc.is_available=true and rd.status='finalized' and rd.season_number<=p_source_season;

    select count(*) into v_duplicate_candidate
    from (
      select sc.notes->>'former_club_staff_id' as former_id
      from public.staff_candidates sc
      where sc.is_available=true and sc.notes ? 'former_club_staff_id'
      group by sc.notes->>'former_club_staff_id'
      having count(*)>1
    ) d;

    select count(*) into v_continuing_after
    from public.club_staff cs join public.clubs c on c.id=cs.club_id
    where cs.is_active=true
      and cs.contract_expires_at>public.get_game_date_for_season_end(p_source_season)
      and c.deleted_at is null;

    v_second:=public.process_staff_contract_season_expiry_v1(v_run_id,p_source_season,p_target_season);

    select count(*) into v_audit_second
    from public.staff_contract_transition_audit_v1 a
    where a.transition_run_id=v_run_id and a.action='staff_contract_expired';

    v_payload:=jsonb_build_object(
      'ok',
        v_still_active=0 and v_missing_candidate=0 and v_retired_candidate=0 and
        v_duplicate_candidate=0 and v_continuing_after=v_continuing_before and
        coalesce((v_second->>'staff_contracts_expired')::integer,-1)=0 and
        coalesce((v_second->>'staff_market_candidates_created_or_reactivated')::integer,-1)=0 and
        v_audit_second=v_audit_first,
      'source_season',p_source_season,
      'target_season',p_target_season,
      'retirements',v_ret,
      'first_pass',v_first,
      'second_pass',v_second,
      'expiry_audit_first',v_audit_first,
      'expiry_audit_after_second',v_audit_second,
      'expired_staff_still_active',v_still_active,
      'missing_market_candidate',v_missing_candidate,
      'retired_staff_recycled_to_market',v_retired_candidate,
      'duplicate_former_staff_candidates',v_duplicate_candidate,
      'continuing_active_before',v_continuing_before,
      'continuing_active_after',v_continuing_after
    );

    raise exception using message='__PPM_ITEM5_DRYRUN_ROLLBACK__';
  exception when others then
    if sqlerrm='__PPM_ITEM5_DRYRUN_ROLLBACK__' then return v_payload; end if;
    raise;
  end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.dry_run_ai_roster_post_transition_preflight_v1(p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_timeline uuid;
  v_run_id uuid:=gen_random_uuid();
  v_payload jsonb;
  v_hist_non_national jsonb;
  v_hist_national jsonb;
  v_non_nat_clubs integer;
  v_non_nat_below_8 integer;
  v_non_nat_below_10 integer;
  v_non_nat_zero integer;
  v_nat_clubs integer;
  v_nat_below_8 integer;
  v_nat_below_10 integer;
  v_nat_zero integer;
  v_nat_mismatch integer;
  v_retired_rostered integer;
  v_missing_contract integer;
begin
  if p_target_season is distinct from p_source_season+1 then
    raise exception 'target season must equal source season + 1';
  end if;
  select timeline_id into v_timeline from public.season_transition_control_v1 where id=true;

  begin
    insert into public.season_transition_runs_v1(
      id,timeline_id,source_season,target_season,status,metadata
    ) values(
      v_run_id,v_timeline,p_source_season,p_target_season,'running',
      jsonb_build_object('dry_run',true,'component','ai_roster_preflight')
    );

    perform public.run_retirement_season_transition_v1(p_source_season,p_target_season);
    perform public.snapshot_team_rankings_for_season_v1(p_source_season);
    perform public.run_competition_season_transition_v1(v_run_id,p_source_season,p_target_season);
    perform public.process_rider_contract_season_expiry_v1(v_run_id,p_source_season,p_target_season);
    perform public.process_staff_contract_season_expiry_v1(v_run_id,p_source_season,p_target_season);

    with sizes as (
      select c.id,c.club_tier::text as tier,count(cr.rider_id)::int as roster_size
      from public.clubs c
      left join public.club_riders cr on cr.club_id=c.id
      where c.deleted_at is null and c.is_ai=true and c.club_type='main'
        and not public.is_national_team_club_v1(c.id)
      group by c.id,c.club_tier
    ), h as (
      select tier,roster_size,count(*)::int as clubs
      from sizes group by tier,roster_size order by tier,roster_size
    )
    select coalesce(jsonb_agg(jsonb_build_object('tier',tier,'roster_size',roster_size,'clubs',clubs)),'[]'::jsonb)
    into v_hist_non_national from h;

    with sizes as (
      select c.id,c.club_tier::text as tier,count(cr.rider_id)::int as roster_size
      from public.clubs c
      left join public.club_riders cr on cr.club_id=c.id
      where c.deleted_at is null and c.is_ai=true and c.club_type='main'
        and public.is_national_team_club_v1(c.id)
      group by c.id,c.club_tier
    ), h as (
      select tier,roster_size,count(*)::int as clubs
      from sizes group by tier,roster_size order by tier,roster_size
    )
    select coalesce(jsonb_agg(jsonb_build_object('tier',tier,'roster_size',roster_size,'clubs',clubs)),'[]'::jsonb)
    into v_hist_national from h;

    with sizes as (
      select c.id,count(cr.rider_id)::int as n
      from public.clubs c left join public.club_riders cr on cr.club_id=c.id
      where c.deleted_at is null and c.is_ai=true and c.club_type='main'
        and not public.is_national_team_club_v1(c.id)
      group by c.id
    )
    select count(*)::int,count(*) filter(where n<8)::int,count(*) filter(where n<10)::int,count(*) filter(where n=0)::int
    into v_non_nat_clubs,v_non_nat_below_8,v_non_nat_below_10,v_non_nat_zero
    from sizes;

    with sizes as (
      select c.id,count(cr.rider_id)::int as n
      from public.clubs c left join public.club_riders cr on cr.club_id=c.id
      where c.deleted_at is null and c.is_ai=true and c.club_type='main'
        and public.is_national_team_club_v1(c.id)
      group by c.id
    )
    select count(*)::int,count(*) filter(where n<8)::int,count(*) filter(where n<10)::int,count(*) filter(where n=0)::int
    into v_nat_clubs,v_nat_below_8,v_nat_below_10,v_nat_zero
    from sizes;

    select count(*)::int into v_nat_mismatch
    from public.club_riders cr
    join public.clubs c on c.id=cr.club_id
    join public.riders r on r.id=cr.rider_id
    where c.deleted_at is null and public.is_national_team_club_v1(c.id)
      and upper(coalesce(r.country_code,''))<>upper(coalesce(c.country_code,''));

    select count(*)::int into v_retired_rostered
    from public.club_riders cr join public.riders r on r.id=cr.rider_id
    where r.availability_status='retired';

    select count(*)::int into v_missing_contract
    from public.club_riders cr
    join public.clubs c on c.id=cr.club_id
    where c.deleted_at is null and c.is_ai=true and c.club_type='main'
      and not public.is_national_team_club_v1(c.id)
      and not exists(
        select 1 from public.rider_contracts rc
        where rc.rider_id=cr.rider_id and rc.club_id=cr.club_id and rc.status='active'
          and rc.starts_on<=make_date(1999+p_target_season,1,1)
          and rc.expires_on>=make_date(1999+p_target_season,1,1)
      );

    v_payload:=jsonb_build_object(
      'ok',true,
      'source_season',p_source_season,'target_season',p_target_season,
      'non_national_ai',jsonb_build_object(
        'clubs',v_non_nat_clubs,'below_8',v_non_nat_below_8,'below_10',v_non_nat_below_10,'zero_roster',v_non_nat_zero,
        'histogram',v_hist_non_national
      ),
      'national_ai',jsonb_build_object(
        'clubs',v_nat_clubs,'below_8',v_nat_below_8,'below_10',v_nat_below_10,'zero_roster',v_nat_zero,
        'nationality_mismatch_rows',v_nat_mismatch,'histogram',v_hist_national
      ),
      'retired_riders_still_rostered',v_retired_rostered,
      'non_national_ai_roster_missing_target_contract',v_missing_contract
    );

    raise exception using message='__PPM_ITEM6_PREFLIGHT_ROLLBACK__';
  exception when others then
    if sqlerrm='__PPM_ITEM6_PREFLIGHT_ROLLBACK__' then return v_payload; end if;
    raise;
  end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ai_transition_sign_free_agent_v1(p_transition_run_id uuid, p_source_season integer, p_target_season integer, p_club_id uuid, p_free_agent_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_start date:=make_date(1999+p_target_season,1,1);
  v_fa public.rider_free_agents%rowtype;
  v_rider public.riders%rowtype;
  v_duration smallint;
  v_end_season integer;
  v_salary integer;
  v_contract_id uuid;
begin
  select * into v_fa
  from public.rider_free_agents
  where id=p_free_agent_id and status='available'
  for update;
  if not found then raise exception 'available free agent not found'; end if;

  select * into v_rider from public.riders where id=v_fa.rider_id for update;
  if not found or v_rider.availability_status='retired' then
    raise exception 'free-agent rider is not signable';
  end if;

  if exists(select 1 from public.rider_contracts where rider_id=v_fa.rider_id and status='active') then
    raise exception 'rider already has active contract';
  end if;
  if exists(select 1 from public.club_riders where rider_id=v_fa.rider_id) then
    raise exception 'rider already belongs to a roster';
  end if;
  if not public.market_ai_club_rider_country_eligible_v1(p_club_id,v_fa.rider_id) then
    raise exception 'rider is not country-eligible for club';
  end if;

  v_duration:=greatest(1,least(coalesce(v_fa.preferred_duration_seasons,1),5))::smallint;
  v_end_season:=p_target_season+v_duration-1;
  v_salary:=greatest(coalesce(v_fa.expected_salary_weekly,0),coalesce(v_fa.min_acceptable_salary_weekly,0),1);

  insert into public.club_riders(club_id,rider_id,assigned_role)
  values(p_club_id,v_fa.rider_id,coalesce(v_rider.role,'Domestique'::public.rider_role));

  insert into public.rider_contracts(
    rider_id,club_id,salary_weekly,signed_at,starts_on,expires_on,duration_seasons,
    status,signed_morale,notes_json,start_season_number,end_season_number,
    acquisition_type,acquisition_game_date,acquisition_market_value,
    acquisition_source_free_agent_id,free_agent_signing_bonus,free_agent_agent_fee
  ) values(
    v_fa.rider_id,p_club_id,v_salary,now(),v_start,
    public.get_game_date_for_season_end(v_end_season),v_duration,
    'active'::public.rider_contract_status,v_rider.morale,
    jsonb_build_object(
      'source','season_transition_ai_roster_free_agent_v1',
      'transition_run_id',p_transition_run_id,
      'source_season',p_source_season,
      'target_season',p_target_season,
      'free_agent_id',v_fa.id
    ),
    p_target_season,v_end_season,'free_agent',v_start,v_rider.market_value,
    v_fa.id,0,0
  ) returning id into v_contract_id;

  insert into public.rider_payroll_state(
    contract_id,rider_id,club_id,payroll_status,missed_payment_weeks,
    outstanding_salary_debt,outstanding_breach_fine,release_due_to_nonpayment,last_paid_on
  ) values(
    v_contract_id,v_fa.rider_id,p_club_id,'active'::public.rider_payroll_status,0,0,0,false,null
  ) on conflict(contract_id) do nothing;

  update public.rider_free_agents
  set status='signed',updated_at=now()
  where id=v_fa.id;

  delete from public.rider_free_agent_negotiations where free_agent_id=v_fa.id;
  perform public.sync_rider_contract_snapshot(v_fa.rider_id);

  insert into public.ai_roster_transition_audit_v1(
    transition_run_id,source_season,target_season,club_id,rider_id,action,action_game_date,metadata
  ) values(
    p_transition_run_id,p_source_season,p_target_season,p_club_id,v_fa.rider_id,
    'free_agent_signed',v_start,
    jsonb_build_object('free_agent_id',v_fa.id,'contract_id',v_contract_id,'salary_weekly',v_salary,'duration_seasons',v_duration)
  );

  return v_fa.rider_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ai_transition_generate_rider_v1(p_transition_run_id uuid, p_source_season integer, p_target_season integer, p_club_id uuid, p_desired_role rider_role)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_start date:=make_date(1999+p_target_season,1,1);
  v_country text;
  v_profile public.team_tier_balance_profiles%rowtype;
  v_first text;
  v_last text;
  v_age integer;
  v_birth date;
  v_target integer;
  v_min integer;
  v_max integer;
  v_sprint integer;
  v_climbing integer;
  v_tt integer;
  v_endurance integer;
  v_flat integer;
  v_recovery integer;
  v_resistance integer;
  v_iq integer;
  v_teamwork integer;
  v_potential integer;
  v_salary integer;
  v_market bigint;
  v_rider_id uuid;
  v_contract_id uuid;
  v_role public.rider_role:=coalesce(p_desired_role,'Domestique'::public.rider_role);
begin
  select c.country_code into v_country from public.clubs c where c.id=p_club_id and c.deleted_at is null;
  if v_country is null then raise exception 'AI club country missing'; end if;

  select * into v_profile
  from public.team_tier_balance_profiles
  where tier_key=public._get_club_balance_tier_key(p_club_id);
  if not found then
    select * into v_profile from public.team_tier_balance_profiles where tier_key='amateur';
  end if;

  v_first:=public.pick_generated_rider_first_name(v_country);
  v_last:=public.pick_generated_rider_last_name(v_country);

  v_age:=case
    when v_role='Leader'::public.rider_role then public.rand_int(25,32)
    when v_role='Sprinter'::public.rider_role then public.rand_int(22,30)
    when v_role='Climber'::public.rider_role then public.rand_int(22,30)
    when v_role='Breakaway'::public.rider_role then public.rand_int(23,31)
    else public.rand_int(21,32)
  end;
  v_birth:=(v_start-(v_age||' years')::interval-(public.rand_int(0,364)||' days')::interval)::date;

  v_target:=public._clamp_int(
    v_profile.avg_overall_target + case when v_role='Leader'::public.rider_role then public.rand_int(3,6) else public.rand_int(-3,3) end,
    v_profile.rider_min_overall,
    case when v_role='Leader'::public.rider_role then v_profile.rare_cap_overall else v_profile.rider_max_overall end
  );
  v_min:=v_profile.rider_min_overall;
  v_max:=case when v_role='Leader'::public.rider_role then v_profile.rare_cap_overall else v_profile.rider_max_overall end;

  v_sprint:=v_target+public.rand_int(-4,4);
  v_climbing:=v_target+public.rand_int(-4,4);
  v_tt:=v_target+public.rand_int(-4,4);
  v_endurance:=v_target+public.rand_int(-3,4);
  v_flat:=v_target+public.rand_int(-3,4);
  v_recovery:=v_target+public.rand_int(-3,4);
  v_resistance:=v_target+public.rand_int(-3,4);
  v_iq:=v_target+public.rand_int(-3,4);
  v_teamwork:=v_target+public.rand_int(-3,4);

  if v_role='Leader'::public.rider_role then
    v_endurance:=v_endurance+5; v_recovery:=v_recovery+4; v_resistance:=v_resistance+4; v_iq:=v_iq+6;
  elsif v_role='Sprinter'::public.rider_role then
    v_sprint:=v_sprint+8; v_flat:=v_flat+5; v_climbing:=v_climbing-5; v_tt:=v_tt-3;
  elsif v_role='Climber'::public.rider_role then
    v_climbing:=v_climbing+8; v_recovery:=v_recovery+4; v_flat:=v_flat-3; v_sprint:=v_sprint-4;
  elsif v_role='Domestique'::public.rider_role then
    v_teamwork:=v_teamwork+8; v_endurance:=v_endurance+4; v_resistance:=v_resistance+4; v_iq:=v_iq+3;
  elsif v_role='Breakaway'::public.rider_role then
    v_endurance:=v_endurance+7; v_resistance:=v_resistance+6; v_flat:=v_flat+3; v_iq:=v_iq+3;
  else
    v_flat:=v_flat+4; v_endurance:=v_endurance+3; v_teamwork:=v_teamwork+3;
  end if;

  v_sprint:=public._clamp_int(v_sprint,v_min,v_max);
  v_climbing:=public._clamp_int(v_climbing,v_min,v_max);
  v_tt:=public._clamp_int(v_tt,v_min,v_max);
  v_endurance:=public._clamp_int(v_endurance,v_min,v_max);
  v_flat:=public._clamp_int(v_flat,v_min,v_max);
  v_recovery:=public._clamp_int(v_recovery,v_min,v_max);
  v_resistance:=public._clamp_int(v_resistance,v_min,v_max);
  v_iq:=public._clamp_int(v_iq,v_min,v_max);
  v_teamwork:=public._clamp_int(v_teamwork,v_min,v_max);

  v_potential:=public.rand_int(v_profile.potential_min,v_profile.potential_max);
  v_salary:=case when v_role='Leader'::public.rider_role
    then public.rand_int(v_profile.leader_salary_min,v_profile.leader_salary_max)
    else public.rand_int(v_profile.normal_salary_min,v_profile.normal_salary_max)
  end;
  v_market:=public.rand_int(
    greatest(1,floor(v_profile.squad_market_value_min::numeric/10*0.7)::int),
    greatest(1,floor(v_profile.squad_market_value_max::numeric/10*1.2)::int)
  )::bigint;

  insert into public.riders(
    country_code,first_name,last_name,role,sprint,climbing,time_trial,endurance,flat,recovery,resistance,race_iq,teamwork,
    morale,potential,birth_date,salary,contract_expires_at,contract_expires_season,release_requested,market_value,
    asking_price,asking_price_manual,asking_price_updated_at,fatigue,fatigue_updated_on,consecutive_heavy_days,availability_status
  ) values(
    v_country,v_first,v_last,v_role,v_sprint::smallint,v_climbing::smallint,v_tt::smallint,v_endurance::smallint,v_flat::smallint,
    v_recovery::smallint,v_resistance::smallint,v_iq::smallint,v_teamwork::smallint,
    public.rand_int(50,70)::smallint,v_potential::smallint,v_birth,v_salary,
    public.get_game_date_for_season_end(p_target_season+1),p_target_season+1,false,v_market,
    null,false,now(),0,v_start,0,'fit'
  ) returning id into v_rider_id;

  insert into public.club_riders(club_id,rider_id,assigned_role)
  values(p_club_id,v_rider_id,v_role);

  insert into public.rider_contracts(
    rider_id,club_id,salary_weekly,signed_at,starts_on,expires_on,duration_seasons,status,signed_morale,notes_json,
    start_season_number,end_season_number,acquisition_type,acquisition_game_date,acquisition_market_value
  )
  select v_rider_id,p_club_id,v_salary,now(),v_start,public.get_game_date_for_season_end(p_target_season+1),2,
         'active'::public.rider_contract_status,r.morale,
         jsonb_build_object('source','season_transition_ai_roster_generated_v1','transition_run_id',p_transition_run_id),
         p_target_season,p_target_season+1,'generated',v_start,v_market
  from public.riders r where r.id=v_rider_id
  returning id into v_contract_id;

  insert into public.rider_payroll_state(
    contract_id,rider_id,club_id,payroll_status,missed_payment_weeks,outstanding_salary_debt,outstanding_breach_fine,release_due_to_nonpayment,last_paid_on
  ) values(v_contract_id,v_rider_id,p_club_id,'active'::public.rider_payroll_status,0,0,0,false,null)
  on conflict(contract_id) do nothing;

  perform public.sync_rider_contract_snapshot(v_rider_id);

  insert into public.ai_roster_transition_audit_v1(
    transition_run_id,source_season,target_season,club_id,rider_id,action,action_game_date,metadata
  ) values(
    p_transition_run_id,p_source_season,p_target_season,p_club_id,v_rider_id,'rider_generated',v_start,
    jsonb_build_object('role',v_role,'country_code',v_country,'contract_id',v_contract_id,'salary_weekly',v_salary)
  );

  return v_rider_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_ai_rosters_for_season_transition_core_v1(p_transition_run_id uuid, p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_start date:=make_date(1999+p_target_season,1,1);
  v_target_end date:=public.get_game_date_for_season_end(p_target_season);
  r record;
  v_target integer;
  v_count integer;
  v_desired_role public.rider_role;
  v_fa_id uuid;
  v_signed integer:=0;
  v_generated integer:=0;
  v_mismatch_removed integer:=0;
  v_clubs_filled integer:=0;
  v_before integer;
  v_after integer;
  v_expected integer;
  v_min_salary integer;
  v_duration smallint;
  v_tier text;
begin
  if p_target_season is distinct from p_source_season+1 then raise exception 'target season must equal source season + 1'; end if;
  if not exists(select 1 from public.season_transition_runs_v1 x where x.id=p_transition_run_id and x.status='running') then
    raise exception 'running transition not found';
  end if;

  -- National-team country integrity: remove invalid assignments and any continuing contract to that national team.
  for r in
    select cr.club_id,cr.rider_id,c.club_tier::text as club_tier
    from public.club_riders cr
    join public.clubs c on c.id=cr.club_id
    join public.riders rd on rd.id=cr.rider_id
    where c.deleted_at is null and c.is_ai=true and c.owner_user_id is null
      and public.is_national_team_club_v1(c.id)
      and upper(coalesce(rd.country_code,''))<>upper(coalesce(c.country_code,''))
  loop
    delete from public.club_riders where club_id=r.club_id and rider_id=r.rider_id;

    update public.rider_contracts
    set status='terminated',
        notes_json=coalesce(notes_json,'{}'::jsonb)||jsonb_build_object(
          'terminated_reason','national_team_country_mismatch_cleanup',
          'transition_run_id',p_transition_run_id
        ),updated_at=now()
    where rider_id=r.rider_id and club_id=r.club_id and status='active';

    if not exists(select 1 from public.club_riders where rider_id=r.rider_id)
       and not exists(select 1 from public.rider_contracts where rider_id=r.rider_id and status='active')
       and not exists(select 1 from public.riders rd where rd.id=r.rider_id and rd.availability_status='retired') then
      select greatest(coalesce(rd.salary,0),250),
             public.suggest_initial_contract_seasons(public.get_age_years_on_game_date(rd.birth_date),coalesce(rd.overall,50)::smallint,coalesce(rd.potential,50)::smallint)
      into v_expected,v_duration
      from public.riders rd where rd.id=r.rider_id;
      v_min_salary:=greatest(floor(v_expected*0.90)::integer,100);
      v_tier:=case r.club_tier when 'amateur' then 'amateur' when 'continental' then 'continental' else 'proteam' end;

      insert into public.rider_free_agents(
        rider_id,source_type,source_club_id,desired_tier,expected_salary_weekly,min_acceptable_salary_weekly,
        preferred_duration_seasons,available_from_game_date,expires_on_game_date,status
      ) values(r.rider_id,'released',r.club_id,v_tier,v_expected,v_min_salary,v_duration,v_start,v_target_end,'available')
      on conflict on constraint rider_free_agents_rider_id_key do update set
        source_type='released',source_club_id=excluded.source_club_id,desired_tier=excluded.desired_tier,
        expected_salary_weekly=excluded.expected_salary_weekly,min_acceptable_salary_weekly=excluded.min_acceptable_salary_weekly,
        preferred_duration_seasons=excluded.preferred_duration_seasons,available_from_game_date=excluded.available_from_game_date,
        expires_on_game_date=excluded.expires_on_game_date,status='available',updated_at=now();
    end if;

    perform public.sync_rider_contract_snapshot(r.rider_id);
    insert into public.ai_roster_transition_audit_v1(
      transition_run_id,source_season,target_season,club_id,rider_id,action,action_game_date,metadata
    ) values(p_transition_run_id,p_source_season,p_target_season,r.club_id,r.rider_id,'nationality_mismatch_removed',v_start,'{}'::jsonb);
    v_mismatch_removed:=v_mismatch_removed+1;
  end loop;

  -- Fill AI main clubs to their existing tier-profile target (currently 10), never beyond hard cap 18.
  for r in
    select c.id as club_id,c.club_tier::text as club_tier
    from public.clubs c
    where c.deleted_at is null and c.is_ai=true and c.owner_user_id is null and c.club_type='main'
    order by c.id
  loop
    select least(18,coalesce(p.target_roster_size,10)) into v_target
    from public.team_tier_balance_profiles p
    where p.tier_key=public._get_club_balance_tier_key(r.club_id);
    v_target:=coalesce(v_target,10);

    select count(*) into v_before from public.club_riders where club_id=r.club_id;
    v_count:=v_before;

    while v_count<v_target loop
      with desired as (
        select sr.rider_role,count(*)::int as desired_count,min(sr.slot_no) as first_slot
        from public.starting_roster_role_profiles sr
        group by sr.rider_role
      ), current_counts as (
        select cr.assigned_role as rider_role,count(*)::int as current_count
        from public.club_riders cr where cr.club_id=r.club_id group by cr.assigned_role
      )
      select d.rider_role into v_desired_role
      from desired d left join current_counts cc on cc.rider_role=d.rider_role
      order by greatest(d.desired_count-coalesce(cc.current_count,0),0) desc,d.first_slot asc
      limit 1;
      v_desired_role:=coalesce(v_desired_role,'Domestique'::public.rider_role);

      select fa.id into v_fa_id
      from public.rider_free_agents fa
      join public.riders rd on rd.id=fa.rider_id
      join public.team_tier_balance_profiles p on p.tier_key=public._get_club_balance_tier_key(r.club_id)
      where fa.status='available'
        and fa.available_from_game_date<=v_start and fa.expires_on_game_date>=v_start
        and rd.availability_status<>'retired'
        and not exists(select 1 from public.club_riders cr where cr.rider_id=fa.rider_id)
        and not exists(select 1 from public.rider_contracts rc where rc.rider_id=fa.rider_id and rc.status='active')
        and public.market_ai_club_rider_country_eligible_v1(r.club_id,fa.rider_id)
        and coalesce(rd.overall,p.avg_overall_target) between p.rider_min_overall and p.rare_cap_overall
      order by
        case when rd.role=v_desired_role then 0 else 1 end,
        case when rd.availability_status in ('fit','not_fully_fit') then 0 else 1 end,
        abs(coalesce(rd.overall,p.avg_overall_target)-p.avg_overall_target),
        coalesce(rd.potential,50) desc,
        fa.expected_salary_weekly asc,
        fa.id
      limit 1
      for update of fa skip locked;

      if v_fa_id is not null then
        perform public.ai_transition_sign_free_agent_v1(p_transition_run_id,p_source_season,p_target_season,r.club_id,v_fa_id);
        v_signed:=v_signed+1;
      else
        perform public.ai_transition_generate_rider_v1(p_transition_run_id,p_source_season,p_target_season,r.club_id,v_desired_role);
        v_generated:=v_generated+1;
      end if;

      v_count:=v_count+1;
      v_fa_id:=null;
    end loop;

    select count(*) into v_after from public.club_riders where club_id=r.club_id;
    if v_after>v_before then v_clubs_filled:=v_clubs_filled+1; end if;
    perform public.recompute_club_wage_total(r.club_id);
  end loop;

  return jsonb_build_object(
    'ok',true,'source_season',p_source_season,'target_season',p_target_season,
    'nationality_mismatches_removed',v_mismatch_removed,
    'free_agents_signed',v_signed,'riders_generated',v_generated,'clubs_filled',v_clubs_filled
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_ai_roster_contracts_for_transition_v1(p_transition_run_id uuid, p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_start date:=make_date(1999+p_target_season,1,1);
  r record;
  v_salary integer;
  v_contract_id uuid;
  v_created integer:=0;
begin
  for r in
    select cr.club_id,cr.rider_id,c.club_tier,rd.salary,rd.overall,rd.potential,rd.birth_date,rd.morale,rd.market_value
    from public.club_riders cr
    join public.clubs c on c.id=cr.club_id
    join public.riders rd on rd.id=cr.rider_id
    where c.deleted_at is null and c.is_ai=true and c.owner_user_id is null and c.club_type='main'
      and rd.availability_status<>'retired'
      and not exists(
        select 1 from public.rider_contracts rc
        where rc.rider_id=cr.rider_id and rc.club_id=cr.club_id and rc.status='active'
          and rc.starts_on<=v_start and rc.expires_on>=v_start
      )
      and not exists(select 1 from public.rider_contracts rc where rc.rider_id=cr.rider_id and rc.status='active')
    order by cr.club_id,cr.rider_id
  loop
    v_salary:=greatest(1,coalesce(nullif(r.salary,0),public.calculate_initial_rider_weekly_salary(
      r.club_tier,coalesce(r.overall,50)::smallint,coalesce(public.get_age_years_on_game_date(r.birth_date),25),coalesce(r.potential,50)::smallint
    )));

    insert into public.rider_contracts(
      rider_id,club_id,salary_weekly,signed_at,starts_on,expires_on,duration_seasons,status,signed_morale,notes_json,
      start_season_number,end_season_number,acquisition_type,acquisition_game_date,acquisition_market_value
    ) values(
      r.rider_id,r.club_id,v_salary,now(),v_start,public.get_game_date_for_season_end(p_target_season+1),2,
      'active'::public.rider_contract_status,r.morale,
      jsonb_build_object('source','season_transition_ai_existing_roster_contract_v1','transition_run_id',p_transition_run_id),
      p_target_season,p_target_season+1,'generated',v_start,r.market_value
    ) returning id into v_contract_id;

    insert into public.rider_payroll_state(
      contract_id,rider_id,club_id,payroll_status,missed_payment_weeks,outstanding_salary_debt,outstanding_breach_fine,release_due_to_nonpayment,last_paid_on
    ) values(v_contract_id,r.rider_id,r.club_id,'active'::public.rider_payroll_status,0,0,0,false,null)
    on conflict(contract_id) do nothing;

    perform public.sync_rider_contract_snapshot(r.rider_id);
    insert into public.ai_roster_transition_audit_v1(
      transition_run_id,source_season,target_season,club_id,rider_id,action,action_game_date,metadata
    ) values(
      p_transition_run_id,p_source_season,p_target_season,r.club_id,r.rider_id,'existing_roster_contract_created',v_start,
      jsonb_build_object('contract_id',v_contract_id,'salary_weekly',v_salary)
    );
    v_created:=v_created+1;
  end loop;
  return jsonb_build_object('ok',true,'contracts_created',v_created);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_ai_race_selectable_minimum_v1(p_transition_run_id uuid, p_source_season integer, p_target_season integer, p_min_selectable integer DEFAULT 8)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
  v_start date:=make_date(1999+p_target_season,1,1);
  v_roster integer;
  v_selectable integer;
  v_fa_id uuid;
  v_desired_role public.rider_role;
  v_added integer:=0;
  v_clubs integer:=0;
begin
  for r in
    select c.id as club_id
    from public.clubs c
    where c.deleted_at is null and c.is_ai=true and c.owner_user_id is null and c.club_type='main'
    order by c.id
  loop
    select count(*) into v_roster from public.club_riders where club_id=r.club_id;
    select count(*) into v_selectable
    from public.club_riders cr join public.riders rd on rd.id=cr.rider_id
    where cr.club_id=r.club_id
      and rd.availability_status not in ('injured','sick','retired')
      and not exists(
        select 1 from public.rider_health_cases hc
        where hc.rider_id=rd.id and hc.status in ('active','recovering') and hc.selection_blocked=true
      );

    if v_selectable<p_min_selectable then v_clubs:=v_clubs+1; end if;

    while v_selectable<p_min_selectable and v_roster<18 loop
      with desired as (
        select sr.rider_role,count(*)::int as desired_count,min(sr.slot_no) as first_slot
        from public.starting_roster_role_profiles sr group by sr.rider_role
      ), current_counts as (
        select cr.assigned_role as rider_role,count(*)::int as current_count
        from public.club_riders cr where cr.club_id=r.club_id group by cr.assigned_role
      )
      select d.rider_role into v_desired_role
      from desired d left join current_counts cc on cc.rider_role=d.rider_role
      order by greatest(d.desired_count-coalesce(cc.current_count,0),0) desc,d.first_slot asc
      limit 1;
      v_desired_role:=coalesce(v_desired_role,'Domestique'::public.rider_role);

      select fa.id into v_fa_id
      from public.rider_free_agents fa
      join public.riders rd on rd.id=fa.rider_id
      join public.team_tier_balance_profiles p on p.tier_key=public._get_club_balance_tier_key(r.club_id)
      where fa.status='available'
        and fa.available_from_game_date<=v_start and fa.expires_on_game_date>=v_start
        and rd.availability_status in ('fit','not_fully_fit')
        and not exists(select 1 from public.rider_health_cases hc where hc.rider_id=rd.id and hc.status in ('active','recovering') and hc.selection_blocked=true)
        and not exists(select 1 from public.club_riders cr where cr.rider_id=fa.rider_id)
        and not exists(select 1 from public.rider_contracts rc where rc.rider_id=fa.rider_id and rc.status='active')
        and public.market_ai_club_rider_country_eligible_v1(r.club_id,fa.rider_id)
        and coalesce(rd.overall,p.avg_overall_target) between p.rider_min_overall and p.rare_cap_overall
      order by case when rd.role=v_desired_role then 0 else 1 end,
               abs(coalesce(rd.overall,p.avg_overall_target)-p.avg_overall_target),
               coalesce(rd.potential,50) desc,fa.expected_salary_weekly asc,fa.id
      limit 1 for update of fa skip locked;

      if v_fa_id is not null then
        perform public.ai_transition_sign_free_agent_v1(p_transition_run_id,p_source_season,p_target_season,r.club_id,v_fa_id);
      else
        perform public.ai_transition_generate_rider_v1(p_transition_run_id,p_source_season,p_target_season,r.club_id,v_desired_role);
      end if;
      v_added:=v_added+1;
      v_roster:=v_roster+1;
      v_selectable:=v_selectable+1;
      v_fa_id:=null;
    end loop;
  end loop;
  return jsonb_build_object('ok',true,'clubs_below_min_before_extra_fill',v_clubs,'extra_riders_added',v_added,'minimum_selectable',p_min_selectable);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.run_ai_roster_season_transition_v1(p_transition_run_id uuid, p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_fill jsonb; v_contracts jsonb; v_selectable jsonb; v_roles jsonb;
begin
  v_fill:=public.process_ai_rosters_for_season_transition_v2(p_transition_run_id,p_source_season,p_target_season);
  v_contracts:=public.ensure_ai_roster_contracts_for_transition_v1(p_transition_run_id,p_source_season,p_target_season);
  v_roles:=public.ensure_ai_core_roles_for_transition_v1(p_transition_run_id,p_source_season,p_target_season);
  v_selectable:=public.ensure_ai_race_selectable_minimum_v2(p_transition_run_id,p_source_season,p_target_season,8);
  return jsonb_build_object('fill',v_fill,'existing_roster_contracts',v_contracts,'core_roles',v_roles,'selectability',v_selectable);
end;$function$
;

CREATE OR REPLACE FUNCTION public.dry_run_ai_roster_season_transition_v1(p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_timeline uuid; v_run_id uuid:=gen_random_uuid();
  v_first jsonb; v_second jsonb; v_payload jsonb;
  v_below_target integer; v_over_cap integer; v_below_selectable integer;
  v_nat_mismatch integer; v_missing_contract integer; v_retired integer;
  v_multi_roster integer; v_orphan_contract integer;
  v_missing_leader integer; v_missing_sprinter integer; v_missing_climber integer;
  v_audit_first integer; v_audit_second integer;
begin
  if p_target_season is distinct from p_source_season+1 then raise exception 'target season must equal source season + 1'; end if;
  select timeline_id into v_timeline from public.season_transition_control_v1 where id=true;
  begin
    insert into public.season_transition_runs_v1(id,timeline_id,source_season,target_season,status,metadata)
    values(v_run_id,v_timeline,p_source_season,p_target_season,'running',jsonb_build_object('dry_run',true,'component','ai_rosters'));
    perform public.run_retirement_season_transition_v1(p_source_season,p_target_season);
    perform public.snapshot_team_rankings_for_season_v1(p_source_season);
    perform public.run_competition_season_transition_v1(v_run_id,p_source_season,p_target_season);
    perform public.process_rider_contract_season_expiry_v1(v_run_id,p_source_season,p_target_season);
    perform public.process_staff_contract_season_expiry_v1(v_run_id,p_source_season,p_target_season);
    v_first:=public.run_ai_roster_season_transition_v1(v_run_id,p_source_season,p_target_season);

    with sizes as (
      select c.id,least(18,coalesce(p.target_roster_size,10)) as target,count(cr.rider_id)::int as roster_size
      from public.clubs c left join public.club_riders cr on cr.club_id=c.id
      left join public.team_tier_balance_profiles p on p.tier_key=public._get_club_balance_tier_key(c.id)
      where c.deleted_at is null and c.is_ai=true and c.owner_user_id is null and c.club_type='main'
      group by c.id,p.target_roster_size
    ) select count(*) filter(where roster_size<target)::int,count(*) filter(where roster_size>18)::int
      into v_below_target,v_over_cap from sizes;

    with selectable as (
      select c.id,count(rd.id) filter(
        where rd.availability_status not in ('injured','sick','retired')
          and not exists(select 1 from public.rider_health_cases hc where hc.rider_id=rd.id and hc.status in ('active','recovering') and hc.selection_blocked=true)
      )::int as n
      from public.clubs c left join public.club_riders cr on cr.club_id=c.id left join public.riders rd on rd.id=cr.rider_id
      where c.deleted_at is null and c.is_ai=true and c.owner_user_id is null and c.club_type='main' group by c.id
    ) select count(*) filter(where n<8)::int into v_below_selectable from selectable;

    select count(*)::int into v_nat_mismatch from public.club_riders cr join public.clubs c on c.id=cr.club_id join public.riders rd on rd.id=cr.rider_id
    where c.deleted_at is null and c.is_ai=true and c.owner_user_id is null and public.is_national_team_club_v1(c.id)
      and upper(coalesce(rd.country_code,''))<>upper(coalesce(c.country_code,''));

    select count(*)::int into v_missing_contract from public.club_riders cr join public.clubs c on c.id=cr.club_id
    where c.deleted_at is null and c.is_ai=true and c.owner_user_id is null and c.club_type='main'
      and not exists(select 1 from public.rider_contracts rc where rc.rider_id=cr.rider_id and rc.club_id=cr.club_id and rc.status='active'
        and rc.starts_on<=make_date(1999+p_target_season,1,1) and rc.expires_on>=make_date(1999+p_target_season,1,1));

    select count(*)::int into v_retired from public.club_riders cr join public.clubs c on c.id=cr.club_id join public.riders rd on rd.id=cr.rider_id
    where c.deleted_at is null and c.is_ai=true and c.owner_user_id is null and rd.availability_status='retired';
    select count(*)::int into v_multi_roster from (select rider_id from public.club_riders group by rider_id having count(distinct club_id)>1) x;
    select count(*)::int into v_orphan_contract from public.rider_contracts rc join public.clubs c on c.id=rc.club_id
    where rc.status='active' and c.deleted_at is null and c.is_ai=true and c.owner_user_id is null and c.club_type='main'
      and rc.starts_on<=make_date(1999+p_target_season,1,1) and rc.expires_on>=make_date(1999+p_target_season,1,1)
      and not exists(select 1 from public.club_riders cr where cr.club_id=rc.club_id and cr.rider_id=rc.rider_id);

    select count(*)::int into v_missing_leader from public.clubs c where c.deleted_at is null and c.is_ai=true and c.owner_user_id is null and c.club_type='main'
      and not exists(select 1 from public.club_riders cr where cr.club_id=c.id and cr.assigned_role='Leader'::public.rider_role);
    select count(*)::int into v_missing_sprinter from public.clubs c where c.deleted_at is null and c.is_ai=true and c.owner_user_id is null and c.club_type='main'
      and not exists(select 1 from public.club_riders cr where cr.club_id=c.id and cr.assigned_role='Sprinter'::public.rider_role);
    select count(*)::int into v_missing_climber from public.clubs c where c.deleted_at is null and c.is_ai=true and c.owner_user_id is null and c.club_type='main'
      and not exists(select 1 from public.club_riders cr where cr.club_id=c.id and cr.assigned_role='Climber'::public.rider_role);

    select count(*)::int into v_audit_first from public.ai_roster_transition_audit_v1 where transition_run_id=v_run_id;
    v_second:=public.run_ai_roster_season_transition_v1(v_run_id,p_source_season,p_target_season);
    select count(*)::int into v_audit_second from public.ai_roster_transition_audit_v1 where transition_run_id=v_run_id;

    v_payload:=jsonb_build_object(
      'ok',v_below_target=0 and v_over_cap=0 and v_below_selectable=0 and v_nat_mismatch=0 and v_missing_contract=0
        and v_retired=0 and v_multi_roster=0 and v_orphan_contract=0 and v_missing_leader=0 and v_missing_sprinter=0 and v_missing_climber=0
        and v_audit_second=v_audit_first,
      'first_pass',v_first,'second_pass',v_second,'clubs_below_target',v_below_target,'clubs_over_18',v_over_cap,
      'clubs_below_8_selectable',v_below_selectable,'nationality_mismatch_rows',v_nat_mismatch,
      'ai_roster_rows_missing_target_contract',v_missing_contract,'retired_ai_roster_rows',v_retired,
      'riders_on_multiple_rosters',v_multi_roster,'orphan_active_ai_contracts',v_orphan_contract,
      'clubs_missing_leader_role',v_missing_leader,'clubs_missing_sprinter_role',v_missing_sprinter,
      'clubs_missing_climber_role',v_missing_climber,'audit_rows_first',v_audit_first,'audit_rows_after_second',v_audit_second
    );
    raise exception using message='__PPM_ITEM6_DRYRUN_ROLLBACK__';
  exception when others then
    if sqlerrm='__PPM_ITEM6_DRYRUN_ROLLBACK__' then return v_payload; end if;
    raise;
  end;
end;$function$
;

CREATE OR REPLACE FUNCTION public.process_ai_rosters_for_season_transition_core_v2(p_transition_run_id uuid, p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '600s'
AS $function$
declare
  v_start date:=make_date(1999+p_target_season,1,1);
  v_target_end date:=public.get_game_date_for_season_end(p_target_season);
  r record;
  f record;
  v_count integer;
  v_missing integer;
  v_fa_used integer;
  v_desired_role public.rider_role;
  v_signed integer:=0;
  v_generated integer:=0;
  v_mismatch_removed integer:=0;
  v_clubs_filled integer:=0;
  v_before integer;
  v_after integer;
  v_expected integer;
  v_min_salary integer;
  v_duration smallint;
  v_tier text;
begin
  if p_target_season is distinct from p_source_season+1 then raise exception 'target season must equal source season + 1'; end if;
  if not exists(select 1 from public.season_transition_runs_v1 x where x.id=p_transition_run_id and x.status='running') then raise exception 'running transition not found'; end if;

  -- Clean National Team country mismatches first.
  for r in
    select cr.club_id,cr.rider_id,c.club_tier::text as club_tier
    from public.club_riders cr
    join public.clubs c on c.id=cr.club_id
    join public.riders rd on rd.id=cr.rider_id
    where c.deleted_at is null and c.is_ai=true and c.owner_user_id is null
      and public.is_national_team_club_v1(c.id)
      and upper(coalesce(rd.country_code,''))<>upper(coalesce(c.country_code,''))
  loop
    delete from public.club_riders where club_id=r.club_id and rider_id=r.rider_id;
    update public.rider_contracts
    set status='terminated',notes_json=coalesce(notes_json,'{}'::jsonb)||jsonb_build_object('terminated_reason','national_team_country_mismatch_cleanup','transition_run_id',p_transition_run_id),updated_at=now()
    where rider_id=r.rider_id and club_id=r.club_id and status='active';

    if not exists(select 1 from public.club_riders where rider_id=r.rider_id)
       and not exists(select 1 from public.rider_contracts where rider_id=r.rider_id and status='active')
       and not exists(select 1 from public.riders rd where rd.id=r.rider_id and rd.availability_status='retired') then
      select greatest(coalesce(rd.salary,0),250),
             public.suggest_initial_contract_seasons(public.get_age_years_on_game_date(rd.birth_date),coalesce(rd.overall,50)::smallint,coalesce(rd.potential,50)::smallint)
      into v_expected,v_duration from public.riders rd where rd.id=r.rider_id;
      v_min_salary:=greatest(floor(v_expected*0.90)::integer,100);
      v_tier:=case r.club_tier when 'amateur' then 'amateur' when 'continental' then 'continental' else 'proteam' end;
      insert into public.rider_free_agents(rider_id,source_type,source_club_id,desired_tier,expected_salary_weekly,min_acceptable_salary_weekly,preferred_duration_seasons,available_from_game_date,expires_on_game_date,status)
      values(r.rider_id,'released',r.club_id,v_tier,v_expected,v_min_salary,v_duration,v_start,v_target_end,'available')
      on conflict on constraint rider_free_agents_rider_id_key do update set
        source_type='released',source_club_id=excluded.source_club_id,desired_tier=excluded.desired_tier,
        expected_salary_weekly=excluded.expected_salary_weekly,min_acceptable_salary_weekly=excluded.min_acceptable_salary_weekly,
        preferred_duration_seasons=excluded.preferred_duration_seasons,available_from_game_date=excluded.available_from_game_date,
        expires_on_game_date=excluded.expires_on_game_date,status='available',updated_at=now();
    end if;
    perform public.sync_rider_contract_snapshot(r.rider_id);
    insert into public.ai_roster_transition_audit_v1(transition_run_id,source_season,target_season,club_id,rider_id,action,action_game_date,metadata)
    values(p_transition_run_id,p_source_season,p_target_season,r.club_id,r.rider_id,'nationality_mismatch_removed',v_start,'{}'::jsonb);
    v_mismatch_removed:=v_mismatch_removed+1;
  end loop;

  -- Build the signable market once. The table is transaction-local and rows are removed as they are allocated.
  create temporary table tmp_ai_transition_free_agents on commit drop as
  select fa.id as free_agent_id,fa.rider_id,rd.country_code,rd.role,rd.overall,rd.potential,
         fa.expected_salary_weekly
  from public.rider_free_agents fa
  join public.riders rd on rd.id=fa.rider_id
  where fa.status='available'
    and fa.available_from_game_date<=v_start and fa.expires_on_game_date>=v_start
    and rd.availability_status<>'retired'
    and not exists(select 1 from public.club_riders cr where cr.rider_id=fa.rider_id)
    and not exists(select 1 from public.rider_contracts rc where rc.rider_id=fa.rider_id and rc.status='active');

  create index on tmp_ai_transition_free_agents(country_code,overall);
  create index on tmp_ai_transition_free_agents(overall);
  create unique index on tmp_ai_transition_free_agents(free_agent_id);

  for r in
    select c.id as club_id,c.country_code,
           public.is_national_team_club_v1(c.id) as is_national,
           least(18,coalesce(p.target_roster_size,10)) as target_roster_size,
           coalesce(p.avg_overall_target,52) as avg_overall_target,
           coalesce(p.rider_min_overall,46) as rider_min_overall,
           coalesce(p.rare_cap_overall,63) as rare_cap_overall
    from public.clubs c
    left join public.team_tier_balance_profiles p on p.tier_key=public._get_club_balance_tier_key(c.id)
    where c.deleted_at is null and c.is_ai=true and c.owner_user_id is null and c.club_type='main'
    order by c.id
  loop
    select count(*) into v_before from public.club_riders where club_id=r.club_id;
    v_missing:=greatest(r.target_roster_size-v_before,0);
    v_fa_used:=0;

    if v_missing>0 then
      for f in
        select t.free_agent_id
        from tmp_ai_transition_free_agents t
        where (not r.is_national or upper(coalesce(t.country_code,''))=upper(coalesce(r.country_code,'')))
          and coalesce(t.overall,r.avg_overall_target) between r.rider_min_overall and r.rare_cap_overall
        order by abs(coalesce(t.overall,r.avg_overall_target)-r.avg_overall_target),
                 coalesce(t.potential,50) desc,t.expected_salary_weekly asc,t.free_agent_id
        limit v_missing
      loop
        perform public.ai_transition_sign_free_agent_v1(p_transition_run_id,p_source_season,p_target_season,r.club_id,f.free_agent_id);
        delete from tmp_ai_transition_free_agents where free_agent_id=f.free_agent_id;
        v_signed:=v_signed+1;
        v_fa_used:=v_fa_used+1;
      end loop;
    end if;

    v_count:=v_before+v_fa_used;
    while v_count<r.target_roster_size loop
      with desired as (
        select sr.rider_role,count(*)::int desired_count,min(sr.slot_no) first_slot
        from public.starting_roster_role_profiles sr group by sr.rider_role
      ), current_counts as (
        select cr.assigned_role rider_role,count(*)::int current_count
        from public.club_riders cr where cr.club_id=r.club_id group by cr.assigned_role
      )
      select d.rider_role into v_desired_role
      from desired d left join current_counts cc on cc.rider_role=d.rider_role
      order by greatest(d.desired_count-coalesce(cc.current_count,0),0) desc,d.first_slot asc limit 1;
      v_desired_role:=coalesce(v_desired_role,'Domestique'::public.rider_role);
      perform public.ai_transition_generate_rider_v1(p_transition_run_id,p_source_season,p_target_season,r.club_id,v_desired_role);
      v_generated:=v_generated+1;
      v_count:=v_count+1;
    end loop;

    select count(*) into v_after from public.club_riders where club_id=r.club_id;
    if v_after>v_before then v_clubs_filled:=v_clubs_filled+1; end if;
    perform public.recompute_club_wage_total(r.club_id);
  end loop;

  return jsonb_build_object('ok',true,'source_season',p_source_season,'target_season',p_target_season,
    'nationality_mismatches_removed',v_mismatch_removed,'free_agents_signed',v_signed,
    'riders_generated',v_generated,'clubs_filled',v_clubs_filled,'batch_market_snapshot',true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_ai_race_selectable_minimum_v2(p_transition_run_id uuid, p_source_season integer, p_target_season integer, p_min_selectable integer DEFAULT 8)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record; v_start date:=make_date(1999+p_target_season,1,1); v_roster integer; v_selectable integer;
  v_fa_id uuid; v_desired_role public.rider_role; v_added integer:=0; v_clubs integer:=0;
begin
  for r in
    select c.id as club_id,c.country_code,public.is_national_team_club_v1(c.id) as is_national,
           coalesce(p.avg_overall_target,52) as avg_overall_target,coalesce(p.rider_min_overall,46) as rider_min_overall,coalesce(p.rare_cap_overall,63) as rare_cap_overall
    from public.clubs c left join public.team_tier_balance_profiles p on p.tier_key=public._get_club_balance_tier_key(c.id)
    where c.deleted_at is null and c.is_ai=true and c.owner_user_id is null and c.club_type='main'
    order by c.id
  loop
    select count(*) into v_roster from public.club_riders where club_id=r.club_id;
    select count(*) into v_selectable from public.club_riders cr join public.riders rd on rd.id=cr.rider_id
    where cr.club_id=r.club_id and rd.availability_status not in ('injured','sick','retired')
      and not exists(select 1 from public.rider_health_cases hc where hc.rider_id=rd.id and hc.status in ('active','recovering') and hc.selection_blocked=true);
    if v_selectable<p_min_selectable then v_clubs:=v_clubs+1; end if;
    while v_selectable<p_min_selectable and v_roster<18 loop
      with desired as (
        select sr.rider_role,count(*)::int as desired_count,min(sr.slot_no) as first_slot from public.starting_roster_role_profiles sr group by sr.rider_role
      ), current_counts as (
        select cr.assigned_role as rider_role,count(*)::int as current_count from public.club_riders cr where cr.club_id=r.club_id group by cr.assigned_role
      )
      select d.rider_role into v_desired_role from desired d left join current_counts cc on cc.rider_role=d.rider_role
      order by greatest(d.desired_count-coalesce(cc.current_count,0),0) desc,d.first_slot asc limit 1;
      v_desired_role:=coalesce(v_desired_role,'Domestique'::public.rider_role);

      select fa.id into v_fa_id from public.rider_free_agents fa join public.riders rd on rd.id=fa.rider_id
      where fa.status='available' and fa.available_from_game_date<=v_start and fa.expires_on_game_date>=v_start
        and rd.availability_status in ('fit','not_fully_fit')
        and (not r.is_national or rd.country_code is not distinct from r.country_code)
        and not exists(select 1 from public.rider_health_cases hc where hc.rider_id=rd.id and hc.status in ('active','recovering') and hc.selection_blocked=true)
        and not exists(select 1 from public.club_riders cr where cr.rider_id=fa.rider_id)
        and not exists(select 1 from public.rider_contracts rc where rc.rider_id=fa.rider_id and rc.status='active')
        and coalesce(rd.overall,r.avg_overall_target) between r.rider_min_overall and r.rare_cap_overall
      order by case when rd.role=v_desired_role then 0 else 1 end,abs(coalesce(rd.overall,r.avg_overall_target)-r.avg_overall_target),coalesce(rd.potential,50) desc,fa.expected_salary_weekly asc,fa.id
      limit 1 for update of fa skip locked;
      if v_fa_id is not null then perform public.ai_transition_sign_free_agent_v1(p_transition_run_id,p_source_season,p_target_season,r.club_id,v_fa_id);
      else perform public.ai_transition_generate_rider_v1(p_transition_run_id,p_source_season,p_target_season,r.club_id,v_desired_role); end if;
      v_added:=v_added+1; v_roster:=v_roster+1; v_selectable:=v_selectable+1; v_fa_id:=null;
    end loop;
  end loop;
  return jsonb_build_object('ok',true,'clubs_below_min_before_extra_fill',v_clubs,'extra_riders_added',v_added,'minimum_selectable',p_min_selectable);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_ai_core_roles_for_transition_v1(p_transition_run_id uuid, p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_start date:=make_date(1999+p_target_season,1,1);
  r record;
  v_needed public.rider_role;
  v_candidate uuid;
  v_fa_id uuid;
  v_added integer:=0;
  v_reassigned integer:=0;
  v_count integer;
begin
  if p_target_season is distinct from p_source_season+1 then
    raise exception 'target season must equal source season + 1';
  end if;
  if not exists(select 1 from public.season_transition_runs_v1 x where x.id=p_transition_run_id and x.status='running') then
    raise exception 'running transition not found';
  end if;

  for r in
    select c.id as club_id,c.country_code,
           public.is_national_team_club_v1(c.id) as is_national
    from public.clubs c
    where c.deleted_at is null and c.is_ai=true and c.owner_user_id is null and c.club_type='main'
    order by c.id
  loop
    foreach v_needed in array array['Leader'::public.rider_role,'Sprinter'::public.rider_role,'Climber'::public.rider_role]
    loop
      if exists(select 1 from public.club_riders cr where cr.club_id=r.club_id and cr.assigned_role=v_needed) then
        continue;
      end if;

      -- Prefer correcting an existing rider whose intrinsic role already matches.
      select cr.rider_id into v_candidate
      from public.club_riders cr
      join public.riders rd on rd.id=cr.rider_id
      where cr.club_id=r.club_id and rd.role=v_needed and rd.availability_status<>'retired'
      order by coalesce(rd.overall,0) desc,cr.rider_id
      limit 1;

      if v_candidate is not null then
        update public.club_riders set assigned_role=v_needed
        where club_id=r.club_id and rider_id=v_candidate;
        insert into public.ai_roster_transition_audit_v1(
          transition_run_id,source_season,target_season,club_id,rider_id,action,action_game_date,metadata
        ) values(
          p_transition_run_id,p_source_season,p_target_season,r.club_id,v_candidate,
          'core_role_reassigned',v_start,jsonb_build_object('role',v_needed::text)
        );
        v_reassigned:=v_reassigned+1;
        v_candidate:=null;
        continue;
      end if;

      select count(*) into v_count from public.club_riders where club_id=r.club_id;
      if v_count>=18 then
        raise exception 'AI core-role guarantee cannot add % to club % because squad is at 18',v_needed,r.club_id;
      end if;

      select fa.id into v_fa_id
      from public.rider_free_agents fa
      join public.riders rd on rd.id=fa.rider_id
      where fa.status='available'
        and fa.available_from_game_date<=v_start
        and fa.expires_on_game_date>=v_start
        and rd.availability_status<>'retired'
        and rd.role=v_needed
        and (not r.is_national or rd.country_code is not distinct from r.country_code)
        and not exists(select 1 from public.club_riders cr where cr.rider_id=fa.rider_id)
        and not exists(select 1 from public.rider_contracts rc where rc.rider_id=fa.rider_id and rc.status='active')
      order by coalesce(rd.overall,0) desc,coalesce(rd.potential,50) desc,fa.expected_salary_weekly asc,fa.id
      limit 1 for update of fa skip locked;

      if v_fa_id is not null then
        v_candidate:=public.ai_transition_sign_free_agent_v1(
          p_transition_run_id,p_source_season,p_target_season,r.club_id,v_fa_id
        );
      else
        v_candidate:=public.ai_transition_generate_rider_v1(
          p_transition_run_id,p_source_season,p_target_season,r.club_id,v_needed
        );
      end if;

      update public.club_riders set assigned_role=v_needed
      where club_id=r.club_id and rider_id=v_candidate;

      insert into public.ai_roster_transition_audit_v1(
        transition_run_id,source_season,target_season,club_id,rider_id,action,action_game_date,metadata
      ) values(
        p_transition_run_id,p_source_season,p_target_season,r.club_id,v_candidate,
        'core_role_added',v_start,jsonb_build_object('role',v_needed::text)
      );
      v_added:=v_added+1;
      v_candidate:=null;
      v_fa_id:=null;
    end loop;
  end loop;

  return jsonb_build_object('ok',true,'riders_added',v_added,'existing_riders_reassigned',v_reassigned);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_main_team_reserved_supply_v1(p_stage_id uuid, p_resource_owner_club_id uuid, p_supply_key text)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_stage_date date;
  v_reserved integer := 0;
  x record;
  v_one integer;
begin
  select s.stage_date::date
  into v_stage_date
  from public.race_stages s
  where s.id = p_stage_id;

  if v_stage_date is null or p_resource_owner_club_id is null then
    return 0;
  end if;

  for x in
    select
      s.id as stage_id,
      s.race_id,
      s.stage_number
    from public.race_stages s
    join public.races r
      on r.id = s.race_id
    join public.race_participant_teams_v1 t
      on t.race_id = s.race_id
     and t.club_id = p_resource_owner_club_id
    where s.stage_date::date = v_stage_date
      and s.id <> p_stage_id
      and lower(coalesce(r.status, 'scheduled')) in ('scheduled', 'active')
      and not coalesce(s.weather_cancelled, false)
      and lower(coalesce(t.status, 'accepted')) = 'accepted'
      and not exists (
        select 1
        from public.race_stage_authoritative_runs a
        where a.stage_id = s.id
      )
      and not public.universal_race_team_disqualified_for_stage_v1(
        s.race_id,
        p_resource_owner_club_id,
        s.stage_number
      )
    order by
      coalesce(s.planned_start_hour_number, 12),
      coalesce(s.planned_start_minute, 0),
      s.id
  loop
    if p_supply_key = 'race_jersey_complete' then
      v_one := public.universal_race_team_required_jerseys_v1(
        x.race_id,
        p_resource_owner_club_id
      );
    else
      select coalesce(max(req.required_quantity), 0)
      into v_one
      from public.universal_race_stage_planned_supplies_v1(
        x.stage_id,
        p_resource_owner_club_id
      ) req
      where req.supply_key = p_supply_key;
    end if;

    v_reserved := v_reserved + greatest(coalesce(v_one, 0), 0);
  end loop;

  return v_reserved;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_effective_supply_available_v1(p_stage_id uuid, p_team_id uuid, p_supply_key text)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_owner uuid;
  v_stage_date date;
  v_available integer := 0;
  v_reserved integer := 0;
begin
  select
    public.universal_race_resource_owner_club_v1(p_team_id),
    s.stage_date::date
  into v_owner, v_stage_date
  from public.race_stages s
  where s.id = p_stage_id;

  if v_owner is null or v_stage_date is null then
    return 0;
  end if;

  if p_supply_key in ('race_jersey_complete', 'rain_jackets') then
    select count(*)::integer
    into v_available
    from public.club_race_supply_units u
    where u.club_id = v_owner
      and u.supply_key = p_supply_key
      and u.status in ('ready', 'assigned')
      and u.stage_uses_remaining > 0
      and (
        u.last_used_game_date is null
        or u.last_used_game_date <> v_stage_date
      );
  else
    select coalesce(s.quantity_available, 0)
    into v_available
    from public.club_race_supplies s
    where s.club_id = v_owner
      and s.supply_key = p_supply_key;

    if not found then
      v_available := 0;
    end if;
  end if;

  v_reserved := public.universal_race_stage_other_supply_reservations_v1(
    p_stage_id,
    p_team_id,
    p_supply_key
  );

  return greatest(v_available - v_reserved, 0);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_inactive_clubs_for_season_transition_v1(p_transition_run_id uuid, p_source_season integer, p_target_season integer, p_refresh_inactivity boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_source_end date:=public.get_game_date_for_season_end(p_source_season);
  v_target_start date:=make_date(1999+p_target_season,1,1);
  v_target_end date:=public.get_game_date_for_season_end(p_target_season);
  r record; rr record;
  v_riders integer; v_contracts integer; v_staff integer; v_children integer;
  v_removed integer:=0; v_riders_total integer:=0; v_contracts_total integer:=0;
  v_staff_total integer:=0; v_children_total integer:=0;
  v_expected integer; v_min integer; v_duration smallint; v_desired text;
begin
  if p_target_season is distinct from p_source_season+1 then raise exception 'target season must equal source season + 1'; end if;
  if not exists(select 1 from public.season_transition_runs_v1 x where x.id=p_transition_run_id and x.status='running') then
    raise exception 'running transition not found';
  end if;

  -- Last safety refresh: a manager who returned before season-end must not be removed.
  if coalesce(p_refresh_inactivity,true) then
    perform * from public.process_user_team_inactivity_v1(false);
  end if;

  drop table if exists pg_temp.tmp_inactive_club_removals_v1;
  create temporary table tmp_inactive_club_removals_v1 on commit drop as
  select c.id as club_id,c.owner_user_id as former_owner_user_id,c.name as club_name,
         c.club_tier::text as source_tier,
         case when c.club_tier='worldteam' then 'WORLD'
              when c.club_tier='proteam' then c.tier2_division::text
              when c.club_tier='continental' then c.tier3_division::text
              when c.club_tier='amateur' then c.amateur_division::text end as source_division,
         c.country_code,c.inactivity_days_snapshot,c.inactivity_reason
  from public.clubs c
  where c.deleted_at is null
    and coalesce(c.is_ai,false)=false
    and coalesce(c.club_type,'main')='main'
    and c.inactivity_status='season_end_removal_pending'
    and coalesce(c.season_end_transition_pending,false)=true
    and c.inactivity_season_end_action='replace_with_ai_pool_team';

  -- End all employment at the disappearing clubs. Reuse the already-tested staff
  -- expiry lifecycle so identities return to the normal 72-hour staff market.
  update public.club_staff cs
  set contract_expires_at=v_source_end,
      notes=coalesce(cs.notes,'{}'::jsonb)||jsonb_build_object(
        'forced_end_reason','club_removed_at_season_transition',
        'source_season',p_source_season,'target_season',p_target_season
      ),
      updated_at=now()
  where cs.is_active=true
    and exists(select 1 from tmp_inactive_club_removals_v1 t where t.club_id=cs.club_id);

  if exists(select 1 from tmp_inactive_club_removals_v1) then
    perform public.process_staff_contract_season_expiry_v1(p_transition_run_id,p_source_season,p_target_season);
  end if;

  for r in select * from tmp_inactive_club_removals_v1 order by club_id loop
    select count(*) into v_staff
    from public.staff_contract_transition_audit_v1 a
    where a.transition_run_id=p_transition_run_id and a.club_id=r.club_id and a.action='staff_contract_expired';

    v_riders:=0; v_contracts:=0; v_children:=0;

    -- Terminate every still-active contract owned by the club, including multi-season contracts.
    for rr in
      select rc.id as contract_id,rc.rider_id,rc.salary_weekly
      from public.rider_contracts rc
      where rc.club_id=r.club_id and rc.status='active'
      order by rc.rider_id
      for update
    loop
      update public.rider_contracts
      set status='terminated',
          notes_json=coalesce(notes_json,'{}'::jsonb)||jsonb_build_object(
            'terminated_reason','club_removed_at_season_transition',
            'source_season',p_source_season,'target_season',p_target_season,
            'transition_run_id',p_transition_run_id
          ),updated_at=now()
      where id=rr.contract_id and status='active';

      update public.rider_payroll_state ps
      set payroll_status=case when coalesce(ps.outstanding_salary_debt,0)+coalesce(ps.outstanding_breach_fine,0)>0
                              then 'released_unpaid'::public.rider_payroll_status else 'settled'::public.rider_payroll_status end,
          settled_at=case when coalesce(ps.outstanding_salary_debt,0)+coalesce(ps.outstanding_breach_fine,0)=0 then now() else ps.settled_at end,
          updated_at=now()
      where ps.contract_id=rr.contract_id;
      v_contracts:=v_contracts+1;
    end loop;

    -- Every non-retired rider whose live club disappears becomes a target-season free agent.
    for rr in
      select distinct cr.rider_id,rd.birth_date,rd.overall,rd.potential,rd.salary,rd.availability_status
      from public.club_riders cr join public.riders rd on rd.id=cr.rider_id
      where cr.club_id=r.club_id
      order by cr.rider_id
    loop
      delete from public.club_riders where club_id=r.club_id and rider_id=rr.rider_id;
      v_riders:=v_riders+1;

      if rr.availability_status<>'retired'
         and not exists(select 1 from public.club_riders cr where cr.rider_id=rr.rider_id)
         and not exists(select 1 from public.rider_contracts rc where rc.rider_id=rr.rider_id and rc.status='active') then
        v_expected:=greatest(coalesce(rr.salary,0),250);
        v_min:=greatest(floor(v_expected*0.90)::integer,100);
        v_duration:=public.suggest_initial_contract_seasons(
          coalesce(public.get_age_years_on_game_date(rr.birth_date),25),coalesce(rr.overall,50)::smallint,coalesce(rr.potential,50)::smallint
        );
        v_desired:=case r.source_tier when 'amateur' then 'amateur' when 'continental' then 'continental' else 'proteam' end;
        insert into public.rider_free_agents(
          rider_id,source_type,source_club_id,desired_tier,expected_salary_weekly,min_acceptable_salary_weekly,
          preferred_duration_seasons,available_from_game_date,expires_on_game_date,status
        ) values(
          rr.rider_id,'club_removed',r.club_id,v_desired,v_expected,v_min,v_duration,v_target_start,v_target_end,'available'
        ) on conflict on constraint rider_free_agents_rider_id_key do update set
          source_type='club_removed',source_club_id=excluded.source_club_id,desired_tier=excluded.desired_tier,
          expected_salary_weekly=excluded.expected_salary_weekly,min_acceptable_salary_weekly=excluded.min_acceptable_salary_weekly,
          preferred_duration_seasons=excluded.preferred_duration_seasons,available_from_game_date=excluded.available_from_game_date,
          expires_on_game_date=excluded.expires_on_game_date,status='available',updated_at=now();

        delete from public.rider_free_agent_negotiations n using public.rider_free_agents fa
        where fa.rider_id=rr.rider_id and n.free_agent_id=fa.id;
        update public.rider_transfer_listings set status='expired' where rider_id=rr.rider_id and status in ('listed','club_accepted');
        update public.rider_transfer_offers set status='expired' where rider_id=rr.rider_id and status in ('open','club_accepted');
        update public.rider_transfer_negotiations set status='expired' where rider_id=rr.rider_id and status in ('open','accepted');
      end if;
      perform public.sync_rider_contract_snapshot(rr.rider_id);
    end loop;

    -- Developing/U23 child clubs are no longer live when their parent main club is removed.
    update public.clubs ch
    set deleted_at=coalesce(ch.deleted_at,now()),is_active=false,owner_user_id=null,
        inactivity_status='closed',season_end_transition_pending=false,inactivity_season_end_action=null,
        inactivity_reason='parent_club_removed_at_season_transition',archived_at=coalesce(archived_at,now()),updated_at=now()
    where ch.parent_club_id=r.club_id and ch.deleted_at is null;
    get diagnostics v_children=row_count;

    if r.former_owner_user_id is not null then
      insert into public.user_team_inactivity_events(
        user_id,club_id,previous_status,new_status,days_inactive,reason,metadata
      ) values(
        r.former_owner_user_id,r.club_id,'season_end_removal_pending','closed',r.inactivity_days_snapshot,
        'season_end_removal_completed',jsonb_build_object(
          'source_season',p_source_season,'target_season',p_target_season,'transition_run_id',p_transition_run_id
        )
      );
      update public.profiles set team_archived_at=coalesce(team_archived_at,now()),updated_at=now()
      where id=r.former_owner_user_id;
    end if;

    update public.clubs c
    set deleted_at=coalesce(c.deleted_at,now()),owner_user_id=null,is_active=false,
        inactivity_status='closed',season_end_transition_pending=false,inactivity_season_end_action=null,
        inactivity_reason='season_end_removal_completed',archived_at=coalesce(archived_at,now()),updated_at=now()
    where c.id=r.club_id and c.deleted_at is null;

    insert into public.inactive_club_transition_audit_v1(
      transition_run_id,source_season,target_season,club_id,former_owner_user_id,club_name,
      source_tier,source_division,action,action_game_date,riders_released,contracts_terminated,
      staff_released,child_clubs_closed,metadata
    ) values(
      p_transition_run_id,p_source_season,p_target_season,r.club_id,r.former_owner_user_id,r.club_name,
      r.source_tier,r.source_division,'season_end_removed',v_target_start,v_riders,v_contracts,v_staff,v_children,
      jsonb_build_object('replacement_policy','existing_curated_ai_pool_via_structural_balance','prior_reason',r.inactivity_reason)
    ) on conflict(transition_run_id,club_id,action) do nothing;

    v_removed:=v_removed+1; v_riders_total:=v_riders_total+v_riders; v_contracts_total:=v_contracts_total+v_contracts;
    v_staff_total:=v_staff_total+v_staff; v_children_total:=v_children_total+v_children;
  end loop;

  return jsonb_build_object(
    'ok',true,'source_season',p_source_season,'target_season',p_target_season,
    'clubs_removed',v_removed,'riders_released',v_riders_total,'contracts_terminated',v_contracts_total,
    'staff_released',v_staff_total,'child_clubs_closed',v_children_total
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.dry_run_inactive_club_season_transition_v1(p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_timeline uuid; v_run_id uuid:=gen_random_uuid();
  v_snapshot integer; v_sporting jsonb; v_first jsonb; v_second jsonb; v_balance jsonb;
  v_riders jsonb; v_staff jsonb; v_ai jsonb; v_payload jsonb;
  v_expected integer; v_removed integer; v_audit_first integer; v_audit_second integer;
  v_snapshot_missing integer; v_removed_not_deleted integer; v_owner_not_cleared integer;
  v_roster_left integer; v_contract_left integer; v_staff_left integer; v_children_left integer;
  v_live_pending integer; v_nonpending_removed integer; v_world integer; v_bad_pro integer; v_bad_cont integer;
begin
  if p_target_season is distinct from p_source_season+1 then raise exception 'target season must equal source season + 1'; end if;
  select timeline_id into v_timeline from public.season_transition_control_v1 where id=true;
  begin
    insert into public.season_transition_runs_v1(id,timeline_id,source_season,target_season,status,metadata)
    values(v_run_id,v_timeline,p_source_season,p_target_season,'running',jsonb_build_object('dry_run',true,'component','inactive_clubs'));

    perform public.run_retirement_season_transition_v1(p_source_season,p_target_season);
    v_snapshot:=public.snapshot_team_rankings_for_season_v1(p_source_season);
    v_sporting:=public.apply_sporting_competition_transition_v1(v_run_id,p_source_season,p_target_season);

    -- Refresh actual user inactivity now, exactly as the real rollover will.
    perform * from public.process_user_team_inactivity_v1(false);
    select count(*)::int into v_expected
    from public.clubs c
    where c.deleted_at is null and coalesce(c.is_ai,false)=false and coalesce(c.club_type,'main')='main'
      and c.inactivity_status='season_end_removal_pending'
      and coalesce(c.season_end_transition_pending,false)=true
      and c.inactivity_season_end_action='replace_with_ai_pool_team';

    v_first:=public.process_inactive_clubs_for_season_transition_v1(v_run_id,p_source_season,p_target_season,false);
    select count(*)::int into v_audit_first from public.inactive_club_transition_audit_v1 where transition_run_id=v_run_id;
    v_second:=public.process_inactive_clubs_for_season_transition_v1(v_run_id,p_source_season,p_target_season,false);
    select count(*)::int into v_audit_second from public.inactive_club_transition_audit_v1 where transition_run_id=v_run_id;

    v_balance:=public.rebalance_competition_structure_for_transition_v1(v_run_id,p_source_season,p_target_season);
    update public.clubs set season_points=0 where deleted_at is null and club_tier::text in ('worldteam','proteam','continental','amateur');

    -- Continue through downstream components to prove removed clubs do not leak ownership.
    v_riders:=public.process_rider_contract_season_expiry_v1(v_run_id,p_source_season,p_target_season);
    v_staff:=public.process_staff_contract_season_expiry_v1(v_run_id,p_source_season,p_target_season);
    v_ai:=public.run_ai_roster_season_transition_v1(v_run_id,p_source_season,p_target_season);

    select count(*)::int into v_removed from public.inactive_club_transition_audit_v1 where transition_run_id=v_run_id and action='season_end_removed';
    select count(*)::int into v_snapshot_missing
    from public.inactive_club_transition_audit_v1 a
    where a.transition_run_id=v_run_id
      and not exists(select 1 from public.team_ranking_season_snapshots s where s.season_number=p_source_season and s.club_id=a.club_id);
    select count(*)::int into v_removed_not_deleted
    from public.inactive_club_transition_audit_v1 a join public.clubs c on c.id=a.club_id
    where a.transition_run_id=v_run_id and c.deleted_at is null;
    select count(*)::int into v_owner_not_cleared
    from public.inactive_club_transition_audit_v1 a join public.clubs c on c.id=a.club_id
    where a.transition_run_id=v_run_id and c.owner_user_id is not null;
    select count(*)::int into v_roster_left
    from public.inactive_club_transition_audit_v1 a join public.club_riders cr on cr.club_id=a.club_id
    where a.transition_run_id=v_run_id;
    select count(*)::int into v_contract_left
    from public.inactive_club_transition_audit_v1 a join public.rider_contracts rc on rc.club_id=a.club_id and rc.status='active'
    where a.transition_run_id=v_run_id;
    select count(*)::int into v_staff_left
    from public.inactive_club_transition_audit_v1 a join public.club_staff cs on cs.club_id=a.club_id and cs.is_active=true
    where a.transition_run_id=v_run_id;
    select count(*)::int into v_children_left
    from public.inactive_club_transition_audit_v1 a join public.clubs ch on ch.parent_club_id=a.club_id and ch.deleted_at is null
    where a.transition_run_id=v_run_id;
    select count(*)::int into v_live_pending
    from public.clubs c where c.deleted_at is null and coalesce(c.is_ai,false)=false and coalesce(c.club_type,'main')='main'
      and c.inactivity_status='season_end_removal_pending' and coalesce(c.season_end_transition_pending,false)=true
      and c.inactivity_season_end_action='replace_with_ai_pool_team';
    select count(*)::int into v_nonpending_removed
    from public.inactive_club_transition_audit_v1 a
    where a.transition_run_id=v_run_id and coalesce(a.metadata->>'replacement_policy','')<>'existing_curated_ai_pool_via_structural_balance';

    select count(*)::int into v_world from public.clubs where deleted_at is null and is_active=true and club_tier='worldteam';
    select count(*)::int into v_bad_pro from (values('PRO_WEST'),('PRO_EAST')) d(division)
    where (select count(*) from public.clubs c where c.deleted_at is null and c.is_active=true and c.club_tier='proteam' and c.tier2_division::text=d.division) not between 20 and 25;
    select count(*)::int into v_bad_cont from (values('CONTINENTAL_EUROPE'),('CONTINENTAL_AMERICA'),('CONTINENTAL_ASIA'),('CONTINENTAL_AFRICA'),('CONTINENTAL_OCEANIA')) d(division)
    where (select count(*) from public.clubs c where c.deleted_at is null and c.is_active=true and c.club_tier='continental' and c.tier3_division::text=d.division) not between 20 and 25;

    v_payload:=jsonb_build_object(
      'ok',v_removed=v_expected and v_audit_second=v_audit_first and v_snapshot_missing=0 and v_removed_not_deleted=0
        and v_owner_not_cleared=0 and v_roster_left=0 and v_contract_left=0 and v_staff_left=0 and v_children_left=0
        and v_live_pending=0 and v_nonpending_removed=0 and v_world=25 and v_bad_pro=0 and v_bad_cont=0,
      'expected_removals',v_expected,'actual_removals',v_removed,'canonical_snapshot_rows',v_snapshot,
      'sporting',v_sporting,'first_inactive_pass',v_first,'second_inactive_pass',v_second,'structural_balance',v_balance,
      'rider_contracts',v_riders,'staff_contracts',v_staff,'ai_rosters',v_ai,
      'audit_rows_first',v_audit_first,'audit_rows_after_second',v_audit_second,
      'removed_clubs_missing_from_history_snapshot',v_snapshot_missing,'removed_clubs_not_soft_deleted',v_removed_not_deleted,
      'removed_clubs_owner_not_cleared',v_owner_not_cleared,'roster_rows_left_on_removed_clubs',v_roster_left,
      'active_contracts_left_on_removed_clubs',v_contract_left,'active_staff_left_on_removed_clubs',v_staff_left,
      'live_child_clubs_left',v_children_left,'live_removal_pending_after',v_live_pending,
      'unexpected_removal_policy_rows',v_nonpending_removed,'worldteam_count',v_world,'bad_pro_divisions',v_bad_pro,'bad_continental_divisions',v_bad_cont
    );
    raise exception using message='__PPM_ITEM7_DRYRUN_ROLLBACK__';
  exception when others then
    if sqlerrm='__PPM_ITEM7_DRYRUN_ROLLBACK__' then return v_payload; end if;
    raise;
  end;
end;$function$
;

CREATE OR REPLACE FUNCTION public.dry_run_sponsor_objective_close_v1(p_source_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record; v_result jsonb; v_results jsonb:='[]'::jsonb; v_payload jsonb;
  v_active_before integer; v_pending_before integer; v_pending_after integer; v_checked_after integer;
  v_completed_after integer; v_failed_after integer; v_paid_after integer; v_payouts_after integer;
begin
  begin
    select count(*)::int,count(*) filter(where o.objective_result_state='pending')::int
    into v_active_before,v_pending_before
    from public.club_sponsor_objectives o join public.club_sponsors s on s.id=o.club_sponsor_id
    where s.season_number=p_source_season and s.status='active' and o.status='active';

    for r in select id,name from public.club_sponsors where season_number=p_source_season and status='active' order by id loop
      begin
        v_result:=public.sponsor_process_objectives_for_sponsor_v1(r.id,true);
        v_results:=v_results||jsonb_build_array(jsonb_build_object('sponsor_id',r.id,'sponsor_name',r.name,'result',v_result));
      exception when others then
        v_results:=v_results||jsonb_build_array(jsonb_build_object('sponsor_id',r.id,'sponsor_name',r.name,'error',sqlerrm));
      end;
    end loop;

    select count(*) filter(where o.objective_result_state='pending')::int,
           count(*) filter(where o.check_state in ('checked','paid'))::int,
           count(*) filter(where o.objective_result_state='completed')::int,
           count(*) filter(where o.objective_result_state='failed')::int,
           count(*) filter(where o.objective_result_state='paid')::int,
           count(*) filter(where o.payout_transaction_id is not null)::int
    into v_pending_after,v_checked_after,v_completed_after,v_failed_after,v_paid_after,v_payouts_after
    from public.club_sponsor_objectives o join public.club_sponsors s on s.id=o.club_sponsor_id
    where s.season_number=p_source_season;

    v_payload:=jsonb_build_object(
      'active_objectives_before',v_active_before,'pending_before',v_pending_before,
      'pending_after_force',v_pending_after,'checked_or_paid_after',v_checked_after,
      'completed_after',v_completed_after,'failed_after',v_failed_after,'paid_after',v_paid_after,
      'objectives_with_payout_transaction',v_payouts_after,'per_sponsor',v_results
    );
    raise exception using message='__PPM_SPONSOR_OBJECTIVE_DRYRUN_ROLLBACK__';
  exception when others then
    if sqlerrm='__PPM_SPONSOR_OBJECTIVE_DRYRUN_ROLLBACK__' then return v_payload; end if;
    raise;
  end;
end;$function$
;

CREATE OR REPLACE FUNCTION public.enrich_startlist_missed_payload_v1(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_race_id uuid;
  v_club_id uuid;
  v_race_name text;
  v_team_name text;
begin
  -- Only this exact event is enriched.
  if coalesce(v_payload->>'event_type', '') <> 'missed_startlist' then
    return v_payload;
  end if;

  if coalesce(v_payload->>'race_id', '') ~*
     '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    v_race_id := (v_payload->>'race_id')::uuid;
  end if;

  if coalesce(v_payload->>'club_id', '') ~*
     '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    v_club_id := (v_payload->>'club_id')::uuid;
  end if;

  v_race_name := nullif(trim(v_payload->>'race_name'), '');

  if v_race_name is null and v_race_id is not null then
    select r.name
    into v_race_name
    from public.races r
    where r.id = v_race_id
    limit 1;
  end if;

  if v_club_id is not null then
    select c.name
    into v_team_name
    from public.clubs c
    where c.id = v_club_id
    limit 1;
  end if;

  return
    v_payload
    || jsonb_build_object(
      'deep_notification', true,
      'deep_variant', 'startlist_missed',
      'image_url', 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Startlist%20missed.png',
      'race_name', v_race_name,
      'team_name', v_team_name,
      'deadline_status', 'missed',
      'race_preparation_status', 'missed_startlist',
      'race_preparation_path',
        case
          when v_race_id is not null
            then '/dashboard/race-preparation?tab=acceptedRaces&raceId=' || v_race_id::text
          else '/dashboard/race-preparation'
        end,
      'race_path',
        case
          when v_race_id is not null
            then '/dashboard/races/' || v_race_id::text
          else null
        end,
      'consequence_title', 'Startlist deadline missed',
      'consequence_text',
        'The rider submission deadline passed without a valid submitted Race Plan. The recorded commitment-score penalty and cash fine have already been applied.',
      'recommended_action',
        'Review the missed race preparation, then inspect the affected race and make sure upcoming race plans are submitted before their rider deadlines.'
    );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enrich_startlist_missed_notification_trg_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_type_code text;
begin
  select nt.code
  into v_type_code
  from public.notification_types nt
  where nt.id = new.type_id;

  if v_type_code = 'RACE_PLAN_NEEDS_ATTENTION'
     and coalesce(new.payload_json->>'event_type', '') = 'missed_startlist'
  then
    new.payload_json :=
      public.enrich_startlist_missed_payload_v1(
        coalesce(new.payload_json, '{}'::jsonb)
      );
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_count_market_result_progress_v1(p_objective_id uuid, p_until_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_club uuid; v_country text; v_group text; v_code text; v_target int; v_from date; v_to date; v_until date;
  v_value int:=0; v_races jsonb:='[]'::jsonb;
begin
  select s.club_id,upper(coalesce(s.country_code,s.metadata->>'company_country_code')),o.objective_code,coalesce(o.target_value,1),
         coalesce(o.eligible_from_game_date,s.started_at),coalesce(o.eligible_to_game_date,s.ends_at)
  into v_club,v_country,v_code,v_target,v_from,v_to
  from public.club_sponsor_objectives o join public.club_sponsors s on s.id=o.club_sponsor_id where o.id=p_objective_id;
  if v_club is null then return jsonb_build_object('error','objective_not_found','current_value',0,'target_value',1); end if;
  select group_code into v_group from public.country_market_group_members where upper(country_code)=v_country limit 1;
  v_until:=coalesce(p_until_date,public.get_current_game_date_date());

  with eligible_clubs as (
    select v_club club_id union select c.id from public.clubs c where c.parent_club_id=v_club and c.club_type='developing'
  ), market_races as (
    select distinct r.id,r.name,r.country_code,r.category,coalesce(r.end_date,r.start_date) race_date
    from public.races r left join public.country_market_group_members gm on upper(gm.country_code)=upper(r.country_code)
    where coalesce(r.end_date,r.start_date)<=v_until
      and (v_from is null or coalesce(r.end_date,r.start_date)>=v_from)
      and (v_to is null or coalesce(r.end_date,r.start_date)<=v_to)
      and (upper(r.country_code)=v_country or (v_group is not null and gm.group_code=v_group))
  ), scored as (
    select mr.*,
      case
        when v_code='sponsor_market_starts' then case when exists(select 1 from public.race_participant_teams_v1 rpt where rpt.race_id=mr.id and rpt.club_id in(select club_id from eligible_clubs)) then 1 else 0 end
        when v_code='sponsor_country_win_or_podium' then case when exists(
          select 1 from public.race_classification_standings cs where cs.race_id=mr.id
            and public.sponsor_is_general_classification_row_v1(to_jsonb(cs))
            and public.sponsor_result_position_v1(to_jsonb(cs))<=3
            and exists(select 1 from eligible_clubs ec where public.sponsor_result_row_belongs_to_club_v1(to_jsonb(cs),ec.club_id))
        ) then 1 else 0 end
        when v_code='sponsor_market_top5_results' then (
          select count(*)::int from public.race_classification_standings cs where cs.race_id=mr.id
            and public.sponsor_is_general_classification_row_v1(to_jsonb(cs))
            and public.sponsor_result_position_v1(to_jsonb(cs))<=5
            and exists(select 1 from eligible_clubs ec where public.sponsor_result_row_belongs_to_club_v1(to_jsonb(cs),ec.club_id))
        )
        else 0 end as contribution
    from market_races mr
  )
  select coalesce(sum(contribution),0)::int,
         coalesce(jsonb_agg(jsonb_build_object('race_id',id,'race_name',name,'race_date',race_date,'country_code',country_code,'contribution',contribution) order by race_date) filter(where contribution>0),'[]'::jsonb)
  into v_value,v_races from scored;
  return jsonb_build_object('objective_id',p_objective_id,'objective_code',v_code,'target_value',v_target,'current_value',v_value,
    'sponsor_country_code',v_country,'market_group',v_group,'until_date',v_until,'qualifying_races',v_races);
end;$function$
;

CREATE OR REPLACE FUNCTION public.process_sponsors_for_season_transition_v1(p_transition_run_id uuid, p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_source_end date:=public.get_game_date_for_season_end(p_source_season); v_target_start date:=public.get_game_date_for_season_start(p_target_season);
  v_current_season integer; v_current_date date; r record; v_eval jsonb;
  v_sponsors_closed integer:=0; v_objectives_terminalized integer:=0; v_historical_objectives_expired integer:=0;
  v_benefits_expired integer:=0; v_source_offers_expired integer:=0; v_identities_closed integer:=0;
  v_target_clubs integer:=0; v_target_offers integer:=0; v_unresolved integer:=0; v_auto_signed integer:=0; v_notifs_deduped integer:=0;
begin
  if p_target_season is distinct from p_source_season+1 then raise exception 'target season must equal source season + 1'; end if;
  if not exists(select 1 from public.season_transition_runs_v1 x where x.id=p_transition_run_id and x.status='running') then raise exception 'running transition not found'; end if;
  v_current_season:=public.get_current_season_number(); v_current_date:=public.get_current_game_date_date();
  if v_current_season is distinct from p_target_season or v_current_date<v_target_start then raise exception 'sponsor rollover must execute after target season begins: current season %, date %, expected season %, date >= %',v_current_season,v_current_date,p_target_season,v_target_start; end if;

  for r in select distinct s.id from public.club_sponsors s join public.club_sponsor_objectives o on o.club_sponsor_id=s.id
           where s.season_number=p_source_season and (o.objective_result_state='pending' or o.check_state in ('scheduled','waiting_for_result')) order by s.id
  loop v_eval:=public.sponsor_process_objectives_for_sponsor_v1(r.id,true); end loop;

  update public.club_sponsor_objectives o set status='expired',check_state='checked',objective_result_state='failed',checked_at=coalesce(o.checked_at,now()),failed_reason=coalesce(o.failed_reason,'Objective closed because sponsor contract was already inactive before season transition.'),metadata=coalesce(o.metadata,'{}'::jsonb)||jsonb_build_object('expired_historical_unresolved_at_season_transition',true,'source_season',p_source_season,'target_season',p_target_season),updated_at=now()
  from public.club_sponsors s where s.id=o.club_sponsor_id and s.season_number=p_source_season and s.status<>'active' and (o.objective_result_state='pending' or o.check_state in ('scheduled','waiting_for_result'));
  get diagnostics v_historical_objectives_expired=row_count;

  select count(*)::int into v_unresolved from public.club_sponsor_objectives o join public.club_sponsors s on s.id=o.club_sponsor_id where s.season_number=p_source_season and s.status='active' and (o.objective_result_state='pending' or o.check_state in ('scheduled','waiting_for_result'));
  if v_unresolved>0 then raise exception 'sponsor rollover blocked: % objectives on active source-season sponsors are still unresolved after forced evaluation',v_unresolved; end if;

  update public.club_sponsor_objectives o set status=case when o.objective_result_state in ('completed','paid') then 'completed' when o.objective_result_state='failed' then 'failed' else o.status end,updated_at=now()
  from public.club_sponsors s where s.id=o.club_sponsor_id and s.season_number=p_source_season and o.status='active' and o.objective_result_state in ('completed','paid','failed'); get diagnostics v_objectives_terminalized=row_count;

  update public.club_sponsors cs set status='expired',ends_at=coalesce(cs.ends_at,v_source_end),updated_at=now(),metadata=coalesce(cs.metadata,'{}'::jsonb)||jsonb_build_object('expired_by_season_transition',true,'source_season',p_source_season,'target_season',p_target_season,'transition_run_id',p_transition_run_id)
  where cs.season_number=p_source_season and cs.status='active'; get diagnostics v_sponsors_closed=row_count;
  update public.club_technical_sponsor_benefits b set status='expired',expires_game_date=coalesce(b.expires_game_date,v_source_end),updated_at=now(),metadata=coalesce(b.metadata,'{}'::jsonb)||jsonb_build_object('expired_by_season_transition',true,'source_season',p_source_season,'target_season',p_target_season)
  where b.status='active' and (b.game_season=p_source_season or exists(select 1 from public.club_sponsors s where s.id=b.club_sponsor_id and s.season_number=p_source_season)); get diagnostics v_benefits_expired=row_count;
  update public.club_sponsor_offers o set status='expired',updated_at=now(),metadata=coalesce(o.metadata,'{}'::jsonb)||jsonb_build_object('expired_by_season_transition',true)
  where o.season_number=p_source_season and o.status='offered'; get diagnostics v_source_offers_expired=row_count;
  update public.club_season_identities i set is_active=false,ends_game_date=coalesce(i.ends_game_date,v_source_end),updated_at=now(),metadata=coalesce(i.metadata,'{}'::jsonb)||jsonb_build_object('closed_by_season_transition',true,'target_season',p_target_season)
  where i.season_number=p_source_season and i.source_type='sponsor_naming_rights' and i.is_active=true; get diagnostics v_identities_closed=row_count;

  for r in select c.id from public.clubs c where c.deleted_at is null and c.is_active=true and coalesce(c.is_ai,false)=false and c.owner_user_id is not null and coalesce(c.club_type,'main')='main' order by c.id
  loop v_target_clubs:=v_target_clubs+1; perform * from public.sponsor_generate_offers(r.id,false); end loop;
  v_notifs_deduped:=public.dedupe_sponsor_selection_notifications_v1(p_target_season);

  select count(*)::int into v_target_offers from public.club_sponsor_offers o where o.season_number=p_target_season and o.status='offered';
  select count(*)::int into v_auto_signed from public.club_sponsors s where s.season_number=p_target_season;
  if v_auto_signed<>0 then raise exception 'sponsor rollover invariant failed: % target-season sponsor contracts were created automatically',v_auto_signed; end if;
  if exists(select 1 from public.clubs c where c.deleted_at is null and c.is_active=true and coalesce(c.is_ai,false)=false and c.owner_user_id is not null and coalesce(c.club_type,'main')='main' and not exists(select 1 from public.club_sponsor_offers o where o.club_id=c.id and o.season_number=p_target_season and o.status='offered')) then raise exception 'sponsor rollover invariant failed: at least one live player club has no target-season offers'; end if;
  if exists(select 1 from public.club_season_identities i where i.season_number=p_source_season and i.source_type='sponsor_naming_rights' and i.is_active) then raise exception 'sponsor rollover invariant failed: source-season naming-rights identity remains active'; end if;

  insert into public.sponsor_transition_audit_v1(transition_run_id,source_season,target_season,action,action_game_date,metadata)
  values(p_transition_run_id,p_source_season,p_target_season,'sponsor_rollover_completed',v_target_start,jsonb_build_object('sponsors_closed',v_sponsors_closed,'objectives_terminalized',v_objectives_terminalized,'historical_objectives_expired',v_historical_objectives_expired,'technical_benefits_expired',v_benefits_expired,'source_offers_expired',v_source_offers_expired,'naming_identities_closed',v_identities_closed,'target_player_clubs',v_target_clubs,'target_offers',v_target_offers,'auto_signed_contracts',v_auto_signed,'selection_notifications_deduped',v_notifs_deduped)) on conflict do nothing;
  return jsonb_build_object('ok',true,'source_season',p_source_season,'target_season',p_target_season,'sponsors_closed',v_sponsors_closed,'objectives_terminalized',v_objectives_terminalized,'historical_objectives_expired',v_historical_objectives_expired,'technical_benefits_expired',v_benefits_expired,'source_offers_expired',v_source_offers_expired,'naming_identities_closed',v_identities_closed,'target_player_clubs',v_target_clubs,'target_offers',v_target_offers,'auto_signed_contracts',v_auto_signed,'unresolved_active_objectives',v_unresolved,'selection_notifications_deduped',v_notifs_deduped);
end;$function$
;

CREATE OR REPLACE FUNCTION public.dry_run_sponsor_season_transition_v1(p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_timeline uuid; v_run_id uuid:=gen_random_uuid(); v_payload jsonb; v_ret jsonb; v_snap int; v_comp jsonb; v_rc jsonb; v_sc jsonb; v_ai jsonb; v_first jsonb; v_second jsonb;
  v_offer_first int; v_offer_second int; v_notif_first int; v_notif_second int; v_live_player_clubs int; v_missing_offer_clubs int; v_source_active int; v_unresolved int; v_active_benefits int; v_active_identity int; v_target_contracts int; v_duplicate_notifs int;
begin
  if p_target_season is distinct from p_source_season+1 then raise exception 'target season must equal source season + 1'; end if; select timeline_id into v_timeline from public.season_transition_control_v1 where id=true;
  begin
    insert into public.season_transition_runs_v1(id,timeline_id,source_season,target_season,status,metadata) values(v_run_id,v_timeline,p_source_season,p_target_season,'running',jsonb_build_object('dry_run',true,'component','sponsors'));
    v_ret:=public.run_retirement_season_transition_v1(p_source_season,p_target_season); v_snap:=public.snapshot_team_rankings_for_season_v1(p_source_season); v_comp:=public.run_competition_season_transition_v1(v_run_id,p_source_season,p_target_season); v_rc:=public.process_rider_contract_season_expiry_v1(v_run_id,p_source_season,p_target_season); v_sc:=public.process_staff_contract_season_expiry_v1(v_run_id,p_source_season,p_target_season); v_ai:=public.run_ai_roster_season_transition_v1(v_run_id,p_source_season,p_target_season);
    update public.game_clock_config set is_paused=true where id=true; update public.game_state set is_paused=true,season_number=p_target_season,month_number=1,day_number=1,hour_number=0,minute_number=0 where id=true;
    v_first:=public.process_sponsors_for_season_transition_v1(v_run_id,p_source_season,p_target_season); select count(*)::int into v_offer_first from public.club_sponsor_offers where season_number=p_target_season and status='offered';
    select count(*)::int into v_notif_first from public.user_notifications un join public.notifications n on n.id=un.notification_id where un.deleted_at is null and n.type_id=(select id from public.notification_types where code='SPONSOR_SELECTION_REQUIRED' limit 1) and n.payload_json->>'season_number'=p_target_season::text;
    v_second:=public.process_sponsors_for_season_transition_v1(v_run_id,p_source_season,p_target_season); select count(*)::int into v_offer_second from public.club_sponsor_offers where season_number=p_target_season and status='offered';
    select count(*)::int into v_notif_second from public.user_notifications un join public.notifications n on n.id=un.notification_id where un.deleted_at is null and n.type_id=(select id from public.notification_types where code='SPONSOR_SELECTION_REQUIRED' limit 1) and n.payload_json->>'season_number'=p_target_season::text;
    select count(*)::int into v_live_player_clubs from public.clubs c where c.deleted_at is null and c.is_active=true and coalesce(c.is_ai,false)=false and c.owner_user_id is not null and coalesce(c.club_type,'main')='main';
    select count(*)::int into v_missing_offer_clubs from public.clubs c where c.deleted_at is null and c.is_active=true and coalesce(c.is_ai,false)=false and c.owner_user_id is not null and coalesce(c.club_type,'main')='main' and not exists(select 1 from public.club_sponsor_offers o where o.club_id=c.id and o.season_number=p_target_season and o.status='offered');
    select count(*)::int into v_source_active from public.club_sponsors where season_number=p_source_season and status='active';
    select count(*)::int into v_unresolved from public.club_sponsor_objectives o join public.club_sponsors s on s.id=o.club_sponsor_id where s.season_number=p_source_season and (o.objective_result_state='pending' or o.check_state in ('scheduled','waiting_for_result'));
    select count(*)::int into v_active_benefits from public.club_technical_sponsor_benefits b where b.status='active' and (b.game_season=p_source_season or exists(select 1 from public.club_sponsors s where s.id=b.club_sponsor_id and s.season_number=p_source_season));
    select count(*)::int into v_active_identity from public.club_season_identities where season_number=p_source_season and source_type='sponsor_naming_rights' and is_active=true; select count(*)::int into v_target_contracts from public.club_sponsors where season_number=p_target_season;
    select count(*)::int into v_duplicate_notifs from (select un.user_id,n.payload_json->>'club_id' club_id,count(*) n from public.user_notifications un join public.notifications n on n.id=un.notification_id where un.deleted_at is null and n.type_id=(select id from public.notification_types where code='SPONSOR_SELECTION_REQUIRED' limit 1) and n.payload_json->>'season_number'=p_target_season::text group by un.user_id,n.payload_json->>'club_id' having count(*)>1) d;
    v_payload:=jsonb_build_object('ok',v_source_active=0 and v_unresolved=0 and v_active_benefits=0 and v_active_identity=0 and v_target_contracts=0 and v_missing_offer_clubs=0 and v_offer_second=v_offer_first and v_notif_second=v_notif_first and v_duplicate_notifs=0 and v_notif_first=v_live_player_clubs,
      'canonical_snapshot_rows',v_snap,'retirements',v_ret,'competition',v_comp,'rider_contracts',v_rc,'staff_contracts',v_sc,'ai_rosters',v_ai,'first_sponsor_pass',v_first,'second_sponsor_pass',v_second,'live_player_clubs',v_live_player_clubs,'target_offers_after_first',v_offer_first,'target_offers_after_second',v_offer_second,'active_selection_notifications_after_first',v_notif_first,'active_selection_notifications_after_second',v_notif_second,'duplicate_selection_notification_clubs',v_duplicate_notifs,'live_player_clubs_missing_offers',v_missing_offer_clubs,'source_active_sponsors_remaining',v_source_active,'source_unresolved_objectives',v_unresolved,'source_active_technical_benefits',v_active_benefits,'source_active_naming_identities',v_active_identity,'target_auto_signed_contracts',v_target_contracts);
    raise exception using message='__PPM_ITEM8_DRYRUN_ROLLBACK__';
  exception when others then if sqlerrm='__PPM_ITEM8_DRYRUN_ROLLBACK__' then return v_payload; end if; raise; end;
end;$function$
;

CREATE OR REPLACE FUNCTION public.dedupe_sponsor_selection_notifications_v1(p_season integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_count integer:=0;
begin
  with ranked as (
    select un.user_id,un.notification_id,
           row_number() over(partition by un.user_id,n.payload_json->>'club_id',n.payload_json->>'season_number' order by n.created_at desc,n.id desc) rn
    from public.user_notifications un join public.notifications n on n.id=un.notification_id
    where un.deleted_at is null
      and n.type_id=(select id from public.notification_types where code='SPONSOR_SELECTION_REQUIRED' limit 1)
      and n.payload_json->>'season_number'=p_season::text
  ), upd as (
    update public.user_notifications un set deleted_at=now()
    from ranked r where r.user_id=un.user_id and r.notification_id=un.notification_id and r.rn>1 and un.deleted_at is null
    returning 1
  ) select count(*)::int into v_count from upd;
  return v_count;
end;$function$
;

CREATE OR REPLACE FUNCTION public.get_developing_rider_age_out_window_v1(p_birth_date date)
 RETURNS TABLE(age_limit_date date, required_window_start date, required_window_end date)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_age_date date;
  v_year integer;
  v_month integer;
  v_day integer;
  v_start date;
begin
  if p_birth_date is null then return; end if;
  v_age_date := (p_birth_date + interval '24 years')::date;
  v_year:=extract(year from v_age_date)::integer;
  v_month:=extract(month from v_age_date)::integer;
  v_day:=extract(day from v_age_date)::integer;

  if v_month in (1,4,7,10) and v_day between 1 and 14 then
    v_start:=make_date(v_year,v_month,1);
  elsif v_age_date < make_date(v_year,4,1) then
    v_start:=make_date(v_year,4,1);
  elsif v_age_date < make_date(v_year,7,1) then
    v_start:=make_date(v_year,7,1);
  elsif v_age_date < make_date(v_year,10,1) then
    v_start:=make_date(v_year,10,1);
  else
    v_start:=make_date(v_year+1,1,1);
  end if;

  return query select v_age_date,v_start,(v_start+13)::date;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.is_developing_rider_race_eligible_v1(p_rider_id uuid, p_club_id uuid, p_effective_game_date date DEFAULT NULL::date)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_type text;
  v_birth date;
  v_effective date:=coalesce(p_effective_game_date,public.get_current_game_date_date());
  v_window_end date;
begin
  select c.club_type,r.birth_date into v_type,v_birth
  from public.clubs c cross join public.riders r
  where c.id=p_club_id and r.id=p_rider_id;
  if not found then return false; end if;
  if coalesce(v_type,'main') <> 'developing' then return true; end if;
  if not public.is_developing_team_access_active_v1(p_club_id) then return false; end if;
  if v_birth is null or v_effective is null then return false; end if;
  if public.get_age_years_on_game_date(v_birth) < 24 and v_effective < (v_birth+interval '24 years')::date then return true; end if;
  select w.required_window_end into v_window_end from public.get_developing_rider_age_out_window_v1(v_birth) w;
  return v_effective <= v_window_end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.assert_developing_rider_race_eligibility_v1(p_rider_id uuid, p_club_id uuid, p_effective_game_date date DEFAULT NULL::date)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not public.is_developing_rider_race_eligible_v1(p_rider_id,p_club_id,p_effective_game_date) then
    raise exception 'Rider % is not eligible to race for Developing Team % on %',p_rider_id,p_club_id,coalesce(p_effective_game_date,public.get_current_game_date_date()) using errcode='P0001';
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_developing_team_age_limits_v1(p_game_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_date date:=coalesce(p_game_date,public.get_current_game_date_date());
  rec record;
  v_notified integer:=0;
  v_overdue integer:=0;
  v_total integer:=0;
begin
  if v_date is null then raise exception 'Game date is not available'; end if;
  for rec in
    select d.parent_club_id as main_club_id,d.id as developing_club_id,r.id as rider_id,r.birth_date,
           extract(year from age(v_date,r.birth_date))::integer as age_years,
           w.required_window_start,w.required_window_end
    from public.club_riders cr
    join public.clubs d on d.id=cr.club_id and d.club_type='developing' and d.deleted_at is null
    join public.riders r on r.id=cr.rider_id
    cross join lateral public.get_developing_rider_age_out_window_v1(r.birth_date) w
    where r.birth_date is not null and w.age_limit_date <= v_date
  loop
    v_total:=v_total+1;
    perform public.create_developing_rider_age_limit_reached_notification(rec.main_club_id,rec.rider_id,rec.age_years,24,rec.required_window_start,rec.required_window_end);
    v_notified:=v_notified+1;
    if v_date > rec.required_window_end then v_overdue:=v_overdue+1; end if;
  end loop;
  return jsonb_build_object('ok',true,'game_date',v_date,'age_limit_riders_seen',v_total,'notification_attempts',v_notified,'overdue_ineligible_riders',v_overdue);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.run_developing_team_season_transition_v1(p_transition_run_id uuid, p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_renewal jsonb; v_age jsonb; v_window_notifications integer:=0; v_bad_active integer:=0;
  v_negative_wallets integer:=0; v_duplicate_ledgers integer:=0;
begin
  if p_target_season is distinct from p_source_season+1 then raise exception 'target season must equal source season + 1'; end if;
  if not exists(select 1 from public.season_transition_runs_v1 r where r.id=p_transition_run_id and r.status='running' and r.source_season=p_source_season and r.target_season=p_target_season) then
    raise exception 'matching running transition not found';
  end if;

  begin
    perform set_config('app.season_transition_coin_reason','developing_team_season_renewal',true);
    v_renewal:=public.process_developing_team_season_renewals_v1(p_target_season);
    perform set_config('app.season_transition_coin_reason','',true);
  exception when others then
    perform set_config('app.season_transition_coin_reason','',true);
    raise;
  end;

  v_window_notifications:=public.notify_developing_team_window_open();
  v_age:=public.process_developing_team_age_limits_v1(make_date(1999+p_target_season,1,1));

  select count(*) into v_bad_active
  from public.developing_team_season_access a join public.clubs m on m.id=a.main_club_id left join public.clubs d on d.id=a.developing_club_id
  where a.access_status='active' and a.active_season=p_target_season
    and (m.deleted_at is not null or m.owner_user_id is null or d.id is null or d.deleted_at is not null or a.expires_after_season<p_target_season);
  select count(*) into v_negative_wallets from public.user_wallets where balance<0;
  select count(*) into v_duplicate_ledgers from (
    select l.user_id,l.payload_json->>'system_key' k,count(*) c
    from public.user_coin_ledger l
    where l.payload_json->>'system_key' like 'developing_team_renewal:%:season:'||p_target_season::text
    group by l.user_id,l.payload_json->>'system_key' having count(*)>1
  ) q;

  if v_bad_active>0 or v_negative_wallets>0 or v_duplicate_ledgers>0 then
    raise exception 'Developing Team transition invariant failed: bad_active %, negative_wallets %, duplicate_renewal_ledgers %',v_bad_active,v_negative_wallets,v_duplicate_ledgers;
  end if;

  return jsonb_build_object('ok',true,'source_season',p_source_season,'target_season',p_target_season,'renewal',v_renewal,
    'movement_window_notifications_attempted',v_window_notifications,'age_limit_processing',v_age,'bad_active_rows',v_bad_active,
    'negative_wallets',v_negative_wallets,'duplicate_renewal_ledgers',v_duplicate_ledgers);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.dry_run_developing_team_season_transition_v1(p_source_season integer DEFAULT 1, p_target_season integer DEFAULT 2)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_timeline uuid;
  v_run uuid;
  v_main uuid;
  v_dev uuid;
  v_owner uuid;
  v_rider uuid;
  v_wallet_before integer;
  v_wallet_after_first integer;
  v_wallet_after_second integer;
  v_wallet_after_off integer;
  v_ledger_before integer;
  v_ledger_after_first integer;
  v_ledger_after_second integer;
  v_first jsonb;
  v_second jsonb;
  v_off jsonb;
  v_access_first record;
  v_access_second record;
  v_mornar_status text;
  v_window_notif_first integer;
  v_window_notif_second integer;
  v_age_notif_first integer;
  v_age_notif_second integer;
  v_age_run1 jsonb;
  v_age_run2 jsonb;
  v_eligible_jan10 boolean;
  v_eligible_jan15 boolean;
  v_move_out_allowed boolean:=false;
  v_move_back_blocked boolean:=false;
  v_race_option_hidden boolean:=false;
  v_race_validation_blocked boolean:=false;
  v_prod_wallet_after integer;
  v_prod_ledger_after integer;
  v_prod_access_status text;
  v_prod_access_season integer;
  v_ok boolean:=false;
begin
  if p_target_season is distinct from p_source_season+1 then raise exception 'target must equal source + 1'; end if;

  select a.main_club_id,a.developing_club_id,m.owner_user_id
  into v_main,v_dev,v_owner
  from public.developing_team_season_access a
  join public.clubs m on m.id=a.main_club_id
  join public.clubs d on d.id=a.developing_club_id
  where a.auto_renew=true and a.active_season=p_source_season and d.deleted_at is null
  order by m.created_at
  limit 1;
  if v_main is null then raise exception 'No live auto-renew Developing Team test row found'; end if;

  select cr.rider_id into v_rider from public.club_riders cr where cr.club_id=v_dev order by cr.created_at limit 1;
  if v_rider is null then raise exception 'No Developing Team rider available for test'; end if;

  select coalesce(w.balance,0) into v_wallet_before from public.user_wallets w where w.user_id=v_owner;
  select count(*) into v_ledger_before from public.user_coin_ledger l where l.user_id=v_owner and l.payload_json->>'system_key'='developing_team_renewal:'||v_main::text||':season:'||p_target_season::text;
  select a.access_status,a.active_season into v_prod_access_status,v_prod_access_season from public.developing_team_season_access a where a.main_club_id=v_main;

  begin
    update public.game_clock_config set is_paused=true where id=true;
    update public.game_state set is_paused=true,season_number=p_target_season,month_number=1,day_number=1,hour_number=0,minute_number=0 where id=true;

    select timeline_id into v_timeline from public.season_transition_control_v1 where id=true;
    insert into public.season_transition_runs_v1(timeline_id,source_season,target_season,status,metadata)
    values(v_timeline,p_source_season,p_target_season,'running',jsonb_build_object('dry_run','developing_team_v1')) returning id into v_run;

    v_first:=public.run_developing_team_season_transition_v1(v_run,p_source_season,p_target_season);
    select balance into v_wallet_after_first from public.user_wallets where user_id=v_owner;
    select count(*) into v_ledger_after_first from public.user_coin_ledger l where l.user_id=v_owner and l.payload_json->>'system_key'='developing_team_renewal:'||v_main::text||':season:'||p_target_season::text;
    select access_status,active_season,expires_after_season,auto_renew into v_access_first from public.developing_team_season_access where main_club_id=v_main;
    select count(*) into v_window_notif_first from public.notifications n join public.notification_types nt on nt.id=n.type_id
      where nt.code='DEVELOPING_TEAM_WINDOW_OPEN' and n.payload_json->>'club_id'=v_main::text and n.payload_json->>'window_start_game_date'=make_date(1999+p_target_season,1,1)::text;

    v_second:=public.run_developing_team_season_transition_v1(v_run,p_source_season,p_target_season);
    select balance into v_wallet_after_second from public.user_wallets where user_id=v_owner;
    select count(*) into v_ledger_after_second from public.user_coin_ledger l where l.user_id=v_owner and l.payload_json->>'system_key'='developing_team_renewal:'||v_main::text||':season:'||p_target_season::text;
    select access_status,active_season,expires_after_season,auto_renew into v_access_second from public.developing_team_season_access where main_club_id=v_main;
    select count(*) into v_window_notif_second from public.notifications n join public.notification_types nt on nt.id=n.type_id
      where nt.code='DEVELOPING_TEAM_WINDOW_OPEN' and n.payload_json->>'club_id'=v_main::text and n.payload_json->>'window_start_game_date'=make_date(1999+p_target_season,1,1)::text;

    -- Force one current U23 rider to have turned 24 on Dec 31 of the source season.
    update public.riders set birth_date=make_date(1975+p_source_season,12,31) where id=v_rider;
    v_age_run1:=public.process_developing_team_age_limits_v1(make_date(1999+p_target_season,1,1));
    select count(*) into v_age_notif_first from public.notifications n join public.notification_types nt on nt.id=n.type_id
      where nt.code='DEVELOPING_RIDER_AGE_LIMIT_REACHED' and n.payload_json->>'club_id'=v_main::text and n.payload_json->>'rider_id'=v_rider::text
        and n.payload_json->>'required_window_start_game_date'=make_date(1999+p_target_season,1,1)::text;
    v_age_run2:=public.process_developing_team_age_limits_v1(make_date(1999+p_target_season,1,1));
    select count(*) into v_age_notif_second from public.notifications n join public.notification_types nt on nt.id=n.type_id
      where nt.code='DEVELOPING_RIDER_AGE_LIMIT_REACHED' and n.payload_json->>'club_id'=v_main::text and n.payload_json->>'rider_id'=v_rider::text
        and n.payload_json->>'required_window_start_game_date'=make_date(1999+p_target_season,1,1)::text;

    v_eligible_jan10:=public.is_developing_rider_race_eligible_v1(v_rider,v_dev,make_date(1999+p_target_season,1,10));
    v_eligible_jan15:=public.is_developing_rider_race_eligible_v1(v_rider,v_dev,make_date(1999+p_target_season,1,15));

    -- Expired access: moving OUT remains allowed during the Jan window; moving back IN is blocked.
    update public.developing_team_season_access set access_status='expired',active_season=p_source_season,expires_after_season=p_source_season where main_club_id=v_main;
    perform set_config('request.jwt.claim.sub',v_owner::text,true);
    begin
      perform public.move_rider_between_main_and_developing(v_rider,v_main);
      v_move_out_allowed:=exists(select 1 from public.club_riders where club_id=v_main and rider_id=v_rider);
    exception when others then
      v_move_out_allowed:=false;
    end;
    begin
      perform public.move_rider_between_main_and_developing(v_rider,v_dev);
      v_move_back_blocked:=false;
    exception when others then
      v_move_back_blocked:=position('access is expired' in lower(sqlerrm))>0;
    end;

    select not exists(
      select 1 from jsonb_array_elements((public.get_race_preparation_squad_options_v1(v_main))->'options') x
      where x->>'id'=v_dev::text
    ) into v_race_option_hidden;

    begin
      perform public.race_prep_validate_participating_club_v1(v_main,v_dev);
      v_race_validation_blocked:=false;
    exception when others then
      v_race_validation_blocked:=position('access is expired' in lower(sqlerrm))>0;
    end;

    -- Explicit auto-renew OFF behavior on the same live team: no second debit, access expires.
    update public.developing_team_season_access set access_status='active',active_season=p_source_season,expires_after_season=p_source_season,auto_renew=false where main_club_id=v_main;
    v_off:=public.process_developing_team_season_renewals_v1(p_target_season);
    select balance into v_wallet_after_off from public.user_wallets where user_id=v_owner;

    select access_status into v_mornar_status
    from public.developing_team_season_access a
    where a.auto_renew=false and a.main_club_id<>v_main
    order by a.updated_at limit 1;

    v_ok :=
      v_wallet_after_first=v_wallet_before-public.developing_team_renewal_coin_cost_v1()
      and v_wallet_after_second=v_wallet_after_first
      and v_wallet_after_off=v_wallet_after_second
      and v_ledger_after_first=v_ledger_before+1
      and v_ledger_after_second=v_ledger_after_first
      and v_access_first.access_status='active' and v_access_first.active_season=p_target_season and v_access_first.expires_after_season=p_target_season
      and v_access_second.access_status='active' and v_access_second.active_season=p_target_season
      and v_window_notif_first=1 and v_window_notif_second=1
      and v_age_notif_first=1 and v_age_notif_second=1
      and v_eligible_jan10=true and v_eligible_jan15=false
      and v_move_out_allowed and v_move_back_blocked and v_race_option_hidden and v_race_validation_blocked
      and coalesce(v_mornar_status,'expired')='expired';

    raise exception '__ROLLBACK_DEVELOPING_TEAM_DRY_RUN__';
  exception when others then
    if sqlerrm <> '__ROLLBACK_DEVELOPING_TEAM_DRY_RUN__' then raise; end if;
  end;

  select coalesce(w.balance,0) into v_prod_wallet_after from public.user_wallets w where w.user_id=v_owner;
  select count(*) into v_prod_ledger_after from public.user_coin_ledger l where l.user_id=v_owner and l.payload_json->>'system_key'='developing_team_renewal:'||v_main::text||':season:'||p_target_season::text;

  return jsonb_build_object(
    'ok',v_ok,
    'renewal_cost',public.developing_team_renewal_coin_cost_v1(),
    'wallet_before',v_wallet_before,'wallet_after_first',v_wallet_after_first,'wallet_after_second',v_wallet_after_second,'wallet_after_auto_renew_off_test',v_wallet_after_off,
    'ledger_before',v_ledger_before,'ledger_after_first',v_ledger_after_first,'ledger_after_second',v_ledger_after_second,
    'first_pass',v_first,'second_pass',v_second,'auto_renew_off_pass',v_off,
    'window_notifications_after_first',v_window_notif_first,'window_notifications_after_second',v_window_notif_second,
    'age_processor_first',v_age_run1,'age_processor_second',v_age_run2,'age_notifications_after_first',v_age_notif_first,'age_notifications_after_second',v_age_notif_second,
    'age_24_race_eligible_jan10',v_eligible_jan10,'age_24_race_eligible_jan15',v_eligible_jan15,
    'expired_move_out_allowed',v_move_out_allowed,'expired_move_back_in_blocked',v_move_back_blocked,
    'expired_race_option_hidden',v_race_option_hidden,'expired_race_validation_blocked',v_race_validation_blocked,
    'other_auto_renew_off_status',v_mornar_status,
    'production_restored',jsonb_build_object('wallet_restored',v_prod_wallet_after=v_wallet_before,'ledger_restored',v_prod_ledger_after=v_ledger_before,'access_status_before',v_prod_access_status,'access_season_before',v_prod_access_season)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.dry_run_developing_team_promotion_cap_v1(p_source_season integer DEFAULT 1, p_target_season integer DEFAULT 2)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_u23 uuid;
  v_u23_original_tier text;
  v_u23_original_div text;
  v_timeline uuid;
  v_run uuid;
  v_snapshot integer;
  v_preview_movement text;
  v_preview_target_tier text;
  v_preview_target_division text;
  v_preview_reason text;
  v_replacement uuid;
  v_replacement_name text;
  v_replacement_target_tier text;
  v_replacement_target_division text;
  v_apply jsonb;
  v_u23_actual_tier text;
  v_replacement_actual_tier text;
  v_block_audit integer:=0;
  v_reallocation_audit integer:=0;
  v_u23_above_cap integer:=0;
  v_persisted_snapshot integer:=0;
  v_persisted_runs integer:=0;
  v_persisted_cap_audit integer:=0;
  v_production_u23_tier text;
  v_ok boolean:=false;
begin
  if p_target_season is distinct from p_source_season+1 then raise exception 'target must equal source + 1'; end if;

  select c.id,c.club_tier::text,
         case when c.club_tier='continental' then c.tier3_division::text when c.club_tier='amateur' then c.amateur_division::text else null end
  into v_u23,v_u23_original_tier,v_u23_original_div
  from public.clubs c
  where c.deleted_at is null and c.club_type='developing' and lower(coalesce(c.max_promotion_tier,''))='continental'
  order by c.created_at
  limit 1;
  if v_u23 is null then raise exception 'No live Continental-capped Developing Team available for test'; end if;

  begin
    v_snapshot:=public.snapshot_team_rankings_for_season_v1(p_source_season);

    -- Move every existing Continental Europe snapshot position far away first to avoid the unique (season,division,position) key.
    update public.team_ranking_season_snapshots
    set final_position=final_position+1000
    where season_number=p_source_season and club_tier='continental' and division='CONTINENTAL_EUROPE';

    update public.team_ranking_season_snapshots
    set final_position=final_position-999
    where season_number=p_source_season and club_tier='continental' and division='CONTINENTAL_EUROPE';

    update public.clubs
    set club_tier='continental',tier2_division=null,tier3_division='CONTINENTAL_EUROPE',amateur_division=null
    where id=v_u23;

    update public.team_ranking_season_snapshots
    set club_tier='continental',division='CONTINENTAL_EUROPE',tier2_division=null,tier3_division='CONTINENTAL_EUROPE',amateur_division=null,
        final_position=1,international_points=999999999,completed_race_count=9999,race_reputation_value=999999999,
        ranking_version='canonical_team_ranking_v1'
    where season_number=p_source_season and club_id=v_u23;

    select p.movement_type,p.target_tier,p.target_division,p.reason
    into v_preview_movement,v_preview_target_tier,v_preview_target_division,v_preview_reason
    from public.preview_competition_transition_v1(p_source_season,true) p
    where p.club_id=v_u23;

    select p.club_id,p.club_name,p.target_tier,p.target_division
    into v_replacement,v_replacement_name,v_replacement_target_tier,v_replacement_target_division
    from public.preview_competition_transition_v1(p_source_season,true) p
    where p.movement_type='cap_reallocation_promotion'
      and p.source_tier='continental'
      and p.source_division='CONTINENTAL_EUROPE'
      and p.target_tier='proteam'
    order by p.source_position,p.club_id
    limit 1;

    select timeline_id into v_timeline from public.season_transition_control_v1 where id=true;
    insert into public.season_transition_runs_v1(timeline_id,source_season,target_season,status,snapshot_rows,metadata)
    values(v_timeline,p_source_season,p_target_season,'running',v_snapshot,jsonb_build_object('dry_run','u23_promotion_cap_v1'))
    returning id into v_run;

    v_apply:=public.apply_sporting_competition_transition_v1(v_run,p_source_season,p_target_season);

    select club_tier::text into v_u23_actual_tier from public.clubs where id=v_u23;
    if v_replacement is not null then
      select club_tier::text into v_replacement_actual_tier from public.clubs where id=v_replacement;
    end if;

    select count(*) into v_block_audit
    from public.competition_transition_movements_v1 m
    where m.transition_run_id=v_run and m.club_id=v_u23 and m.movement_type='promotion_blocked_by_developing_cap'
      and m.target_tier='continental';

    select count(*) into v_reallocation_audit
    from public.competition_transition_movements_v1 m
    where m.transition_run_id=v_run and m.club_id=v_replacement and m.movement_type='cap_reallocation_promotion'
      and m.target_tier='proteam';

    select count(*) into v_u23_above_cap
    from public.clubs c
    where c.deleted_at is null and c.club_type='developing' and lower(coalesce(c.max_promotion_tier,''))='continental'
      and c.club_tier::text in ('proteam','worldteam');

    v_ok :=
      v_preview_movement='promotion_blocked_by_developing_cap'
      and v_preview_target_tier='continental'
      and v_preview_target_division='CONTINENTAL_EUROPE'
      and v_replacement is not null
      and v_replacement_target_tier='proteam'
      and v_u23_actual_tier='continental'
      and v_replacement_actual_tier='proteam'
      and v_block_audit=1
      and v_reallocation_audit=1
      and v_u23_above_cap=0;

    raise exception '__ROLLBACK_U23_PROMOTION_CAP_DRY_RUN__';
  exception when others then
    if sqlerrm <> '__ROLLBACK_U23_PROMOTION_CAP_DRY_RUN__' then raise; end if;
  end;

  select count(*) into v_persisted_snapshot from public.team_ranking_season_snapshots where season_number=p_source_season;
  select count(*) into v_persisted_runs from public.season_transition_runs_v1 where metadata->>'dry_run'='u23_promotion_cap_v1';
  select count(*) into v_persisted_cap_audit from public.competition_transition_movements_v1 where movement_type in ('promotion_blocked_by_developing_cap','cap_reallocation_promotion');
  select club_tier::text into v_production_u23_tier from public.clubs where id=v_u23;

  v_ok := v_ok
    and v_persisted_snapshot=0
    and v_persisted_runs=0
    and v_persisted_cap_audit=0
    and v_production_u23_tier=v_u23_original_tier;

  return jsonb_build_object(
    'ok',v_ok,
    'u23_club_id',v_u23,
    'production_u23_original_tier',v_u23_original_tier,
    'production_u23_original_division',v_u23_original_div,
    'synthetic_preview',jsonb_build_object('movement_type',v_preview_movement,'target_tier',v_preview_target_tier,'target_division',v_preview_target_division,'reason',v_preview_reason),
    'replacement',jsonb_build_object('club_id',v_replacement,'club_name',v_replacement_name,'target_tier',v_replacement_target_tier,'target_division',v_replacement_target_division),
    'apply_result',v_apply,
    'after_apply_inside_test',jsonb_build_object('u23_actual_tier',v_u23_actual_tier,'replacement_actual_tier',v_replacement_actual_tier,'block_audit_rows',v_block_audit,'reallocation_audit_rows',v_reallocation_audit,'u23_above_cap',v_u23_above_cap),
    'production_restored',jsonb_build_object('snapshot_rows',v_persisted_snapshot,'dry_run_transition_rows',v_persisted_runs,'cap_audit_rows',v_persisted_cap_audit,'u23_tier',v_production_u23_tier)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.season_calendar_shift_date_v1(p_source_date date, p_target_season integer)
 RETURNS date
 LANGUAGE plpgsql
 IMMUTABLE STRICT
AS $function$
declare
  v_year integer:=1999+p_target_season;
  v_month integer:=extract(month from p_source_date)::integer;
  v_day integer:=extract(day from p_source_date)::integer;
  v_first date;
  v_last date;
begin
  if p_target_season<1 then raise exception 'target season must be positive'; end if;
  v_first:=make_date(v_year,v_month,1);
  v_last:=(v_first+interval '1 month - 1 day')::date;
  return make_date(v_year,v_month,least(v_day,extract(day from v_last)::integer));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.season_calendar_shift_json_v1(p_value jsonb, p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v_type text;
  v_result jsonb;
  v_text text;
  v_source_year text:=(1999+p_source_season)::text;
  v_target_year text:=(1999+p_target_season)::text;
begin
  if p_value is null then return null; end if;
  v_type:=jsonb_typeof(p_value);
  if v_type='object' then
    select coalesce(jsonb_object_agg(e.key,public.season_calendar_shift_json_v1(e.value,p_source_season,p_target_season)),'{}'::jsonb)
    into v_result from jsonb_each(p_value) e;
    return v_result;
  elsif v_type='array' then
    select coalesce(jsonb_agg(public.season_calendar_shift_json_v1(a.value,p_source_season,p_target_season)),'[]'::jsonb)
    into v_result from jsonb_array_elements(p_value) a;
    return v_result;
  elsif v_type='string' then
    v_text:=p_value#>>'{}';
    v_text:=replace(v_text,'Season '||p_source_season::text,'Season '||p_target_season::text);
    v_text:=replace(v_text,'S'||p_source_season::text||' ','S'||p_target_season::text||' ');
    v_text:=replace(v_text,v_source_year||'-',v_target_year||'-');
    return to_jsonb(v_text);
  end if;
  return p_value;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.season_calendar_sanitize_metadata_v1(p_metadata jsonb, p_source_season integer, p_target_season integer, p_kind text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v jsonb:=public.season_calendar_shift_json_v1(coalesce(p_metadata,'{}'::jsonb),p_source_season,p_target_season);
begin
  if p_kind='race' then
    v:=v-array[
      'weather_all_stages_cancelled','weather_all_stages_have_completed_runs','weather_cancellation_status','weather_cancelled_stage_count',
      'weather_completed_run_count','weather_result_stage_count','weather_state_finalized_at','weather_total_stage_count',
      'captains_pending_rider_deadline','team_list_announcement_finalized','team_list_announcement_finalized_at','team_list_announcement_processed',
      'team_list_announcement_processed_at','team_list_announcement_team_count','race_startlist_captain_model_version','race_startlist_captains_finalized',
      'race_startlist_captains_finalized_at','race_startlist_expected_team_count','race_startlist_rider_count','ai_startlist_remaining_unfillable_team_count',
      'ai_startlist_replaced_team_count','ai_startlist_replacement_checked_at','historical_results_generated','forward_only_terminal_closure',
      'forward_only_terminal_closed_at','forward_only_terminal_closure_reason','forward_only_terminal_closed_on_game_date','archived_reason','merged_into_race_id',
      'removed_from_calendar','removed_from_calendar_at','removed_from_calendar_reason','duplicate_cleanup_completed'
    ];
    v:=v-'season_number';
  elsif p_kind='stage' then
    v:=v-array['weather_cancelled','weather_cancellation_reason','weather_cancelled_at','simulation_run_id','authoritative_run_id','result_published_at'];
  end if;
  return v||jsonb_build_object('calendar_source_season',p_source_season,'calendar_target_season',p_target_season,'calendar_generated_v1',true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.prepare_next_season_race_calendar_v1_legacy_before_application_(p_source_season integer, p_target_season integer, p_late_recovery boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_source_year integer:=1999+p_source_season;
  v_target_year integer:=1999+p_target_season;
  v_source_races integer;
  v_source_stages integer;
  v_source_profiles integer;
  v_source_points integer;
  v_source_tt integer;
  v_inserted_races integer:=0;
  v_inserted_stages integer:=0;
  v_inserted_rules integer:=0;
  v_inserted_profiles integer:=0;
  v_inserted_points integer:=0;
  v_inserted_tt integer:=0;
  v_recovered integer:=0;
  v_current_date date:=public.get_current_game_date_date();
  v_current_season integer:=public.get_current_season_number();
  v_current_ordinal integer;
  v_conflicts integer:=0;
begin
  if p_target_season is distinct from p_source_season+1 then raise exception 'target season must equal source season + 1'; end if;

  select count(*) into v_source_races from public.races r where extract(year from r.start_date)::integer=v_source_year and r.status<>'archived';
  select count(*) into v_source_stages from public.race_stages s join public.races r on r.id=s.race_id where extract(year from r.start_date)::integer=v_source_year and r.status<>'archived';
  select count(*) into v_source_profiles from public.race_stage_profile_details d join public.races r on r.id=d.race_id where extract(year from r.start_date)::integer=v_source_year and r.status<>'archived';
  select count(*) into v_source_points from public.race_stage_points p join public.race_stages s on s.id=p.stage_id join public.races r on r.id=s.race_id where extract(year from r.start_date)::integer=v_source_year and r.status<>'archived';
  select count(*) into v_source_tt from public.race_stage_time_trial_rules t join public.race_stages s on s.id=t.stage_id join public.races r on r.id=s.race_id where extract(year from r.start_date)::integer=v_source_year and r.status<>'archived';

  if v_source_races=0 then raise exception 'No source-season races found for season %',p_source_season; end if;
  if (select count(*) from public.race_entry_rules e join public.races r on r.id=e.race_id where extract(year from r.start_date)::integer=v_source_year and r.status<>'archived')<>v_source_races then
    raise exception 'Source calendar is incomplete: not every recurring race has entry rules';
  end if;
  if v_source_profiles<>v_source_stages then raise exception 'Source calendar is incomplete: stage profile rows % do not match stages %',v_source_profiles,v_source_stages; end if;

  select count(*) into v_conflicts
  from public.races src
  join public.races existing
    on existing.name=src.name
   and existing.start_date=public.season_calendar_shift_date_v1(src.start_date,p_target_season)
   and existing.id<>public.season_calendar_deterministic_uuid_v1('race|'||src.id::text||'|season|'||p_target_season::text)
  where extract(year from src.start_date)::integer=v_source_year and src.status<>'archived';
  if v_conflicts>0 then raise exception 'Target calendar has % natural-key race conflicts; refusing duplicate generation',v_conflicts; end if;

  perform set_config('app.season_calendar_clone','1',true);

  insert into public.races(
    id,name,short_name,start_date,end_date,country_code,host_city,category,race_type,is_stage_race,stage_count,status,
    profile_image_url,description,metadata,created_at,updated_at,logo_url,start_time_region_code,planned_start_hour_number,
    planned_start_minute,planned_start_time_label,planned_start_assigned_at
  )
  select public.season_calendar_deterministic_uuid_v1('race|'||r.id::text||'|season|'||p_target_season::text),
    r.name,r.short_name,public.season_calendar_shift_date_v1(r.start_date,p_target_season),public.season_calendar_shift_date_v1(r.end_date,p_target_season),
    r.country_code,r.host_city,r.category,r.race_type,r.is_stage_race,r.stage_count,'scheduled',r.profile_image_url,r.description,
    public.season_calendar_sanitize_metadata_v1(r.metadata,p_source_season,p_target_season,'race')||jsonb_build_object('calendar_source_race_id',r.id),
    now(),now(),r.logo_url,r.start_time_region_code,r.planned_start_hour_number,r.planned_start_minute,r.planned_start_time_label,null
  from public.races r
  where extract(year from r.start_date)::integer=v_source_year and r.status<>'archived'
  on conflict(id) do nothing;
  get diagnostics v_inserted_races=row_count;

  insert into public.race_stages(
    id,race_id,stage_number,stage_date,name,start_city,finish_city,host_city,host_country_code,distance_km,terrain_type,finish_type,is_summit_finish,
    flat_pct,hilly_pct,mountain_pct,cobbled_pct,elevation_gain_m,profile_image_url,weather_snapshot,rules_snapshot,metadata,created_at,updated_at,
    start_city_name,finish_city_name,profile_type,notes,intermediate_sprints_json,mountain_climbs_json,weather_summary,start_time_region_code,
    planned_start_hour_number,planned_start_minute,planned_start_time_label,planned_start_assigned_at,stage_format,weather_cancelled,weather_cancellation_reason,weather_cancelled_at
  )
  select public.season_calendar_deterministic_uuid_v1('stage|'||s.id::text||'|season|'||p_target_season::text),
    public.season_calendar_deterministic_uuid_v1('race|'||s.race_id::text||'|season|'||p_target_season::text),
    s.stage_number,public.season_calendar_shift_date_v1(s.stage_date,p_target_season),s.name,s.start_city,s.finish_city,s.host_city,s.host_country_code,s.distance_km,
    s.terrain_type,s.finish_type,s.is_summit_finish,s.flat_pct,s.hilly_pct,s.mountain_pct,s.cobbled_pct,s.elevation_gain_m,s.profile_image_url,'{}'::jsonb,
    public.season_calendar_shift_json_v1(s.rules_snapshot,p_source_season,p_target_season),
    public.season_calendar_sanitize_metadata_v1(s.metadata,p_source_season,p_target_season,'stage')||jsonb_build_object('calendar_source_stage_id',s.id),
    now(),now(),s.start_city_name,s.finish_city_name,s.profile_type,s.notes,
    public.season_calendar_shift_json_v1(s.intermediate_sprints_json,p_source_season,p_target_season),
    public.season_calendar_shift_json_v1(s.mountain_climbs_json,p_source_season,p_target_season),null,s.start_time_region_code,
    s.planned_start_hour_number,s.planned_start_minute,s.planned_start_time_label,null,s.stage_format,false,null,null
  from public.race_stages s join public.races r on r.id=s.race_id
  where extract(year from r.start_date)::integer=v_source_year and r.status<>'archived'
  on conflict(id) do nothing;
  get diagnostics v_inserted_stages=row_count;

  insert into public.race_stage_profile_details(
    stage_id,race_id,stage_title,route_label,stage_summary,weather_summary,distance_km,elevation_gain_m,terrain_type,profile_type,terrain_split,
    profile_points,route_markers,intermediate_sprints,mountain_climbs,metadata,created_at,updated_at,weather_snapshot
  )
  select public.season_calendar_deterministic_uuid_v1('stage|'||d.stage_id::text||'|season|'||p_target_season::text),
    public.season_calendar_deterministic_uuid_v1('race|'||d.race_id::text||'|season|'||p_target_season::text),
    d.stage_title,d.route_label,d.stage_summary,null,d.distance_km,d.elevation_gain_m,d.terrain_type,d.profile_type,
    public.season_calendar_shift_json_v1(d.terrain_split,p_source_season,p_target_season),public.season_calendar_shift_json_v1(d.profile_points,p_source_season,p_target_season),
    public.season_calendar_shift_json_v1(d.route_markers,p_source_season,p_target_season),public.season_calendar_shift_json_v1(d.intermediate_sprints,p_source_season,p_target_season),
    public.season_calendar_shift_json_v1(d.mountain_climbs,p_source_season,p_target_season),
    public.season_calendar_sanitize_metadata_v1(d.metadata,p_source_season,p_target_season,'profile'),now(),now(),null
  from public.race_stage_profile_details d join public.races r on r.id=d.race_id
  where extract(year from r.start_date)::integer=v_source_year and r.status<>'archived'
  on conflict(stage_id) do nothing;
  get diagnostics v_inserted_profiles=row_count;

  insert into public.race_stage_points(id,stage_id,point_type,km_from_start,name,kom_category,points_scheme,time_bonus_seconds,is_finish_point,sort_order,metadata,created_at,updated_at)
  select public.season_calendar_deterministic_uuid_v1('stagepoint|'||p.id::text||'|season|'||p_target_season::text),
    public.season_calendar_deterministic_uuid_v1('stage|'||p.stage_id::text||'|season|'||p_target_season::text),
    p.point_type,p.km_from_start,p.name,p.kom_category,p.points_scheme,p.time_bonus_seconds,p.is_finish_point,p.sort_order,
    public.season_calendar_sanitize_metadata_v1(p.metadata,p_source_season,p_target_season,'point'),now(),now()
  from public.race_stage_points p join public.race_stages s on s.id=p.stage_id join public.races r on r.id=s.race_id
  where extract(year from r.start_date)::integer=v_source_year and r.status<>'archived'
  on conflict(id) do nothing;
  get diagnostics v_inserted_points=row_count;

  insert into public.race_stage_time_trial_rules(stage_id,start_order_mode,start_interval_seconds,counting_rider_number,equipment_required,replay_duration_seconds,dropped_rider_time_mode,rules_json,created_at,updated_at)
  select public.season_calendar_deterministic_uuid_v1('stage|'||t.stage_id::text||'|season|'||p_target_season::text),
    t.start_order_mode,t.start_interval_seconds,t.counting_rider_number,t.equipment_required,t.replay_duration_seconds,t.dropped_rider_time_mode,
    public.season_calendar_shift_json_v1(t.rules_json,p_source_season,p_target_season),now(),now()
  from public.race_stage_time_trial_rules t join public.race_stages s on s.id=t.stage_id join public.races r on r.id=s.race_id
  where extract(year from r.start_date)::integer=v_source_year and r.status<>'archived'
  on conflict(stage_id) do update set
    start_order_mode=excluded.start_order_mode,start_interval_seconds=excluded.start_interval_seconds,counting_rider_number=excluded.counting_rider_number,
    equipment_required=excluded.equipment_required,replay_duration_seconds=excluded.replay_duration_seconds,dropped_rider_time_mode=excluded.dropped_rider_time_mode,
    rules_json=excluded.rules_json,updated_at=now() where (race_stage_time_trial_rules.start_order_mode,race_stage_time_trial_rules.start_interval_seconds,race_stage_time_trial_rules.counting_rider_number,race_stage_time_trial_rules.equipment_required,race_stage_time_trial_rules.replay_duration_seconds,race_stage_time_trial_rules.dropped_rider_time_mode,race_stage_time_trial_rules.rules_json) is distinct from (excluded.start_order_mode,excluded.start_interval_seconds,excluded.counting_rider_number,excluded.equipment_required,excluded.replay_duration_seconds,excluded.dropped_rider_time_mode,excluded.rules_json);
  get diagnostics v_inserted_tt=row_count;

  insert into public.race_entry_rules(
    race_id,race_class_code,target_teams,min_teams,max_teams,min_riders_per_team,max_riders_per_team,applications_open_game_date,applications_close_game_date,
    applications_status,auto_close_when_full,allow_waitlist,prize_fund_cash,prize_fund_source,metadata,created_at,updated_at,race_season_number,
    race_start_month_number,race_start_day_number,application_window_policy,applications_open_season_number,applications_open_month_number,applications_open_day_number,
    applications_close_season_number,applications_close_month_number,applications_close_day_number,team_list_announcement_season_number,
    team_list_announcement_month_number,team_list_announcement_day_number,rider_submission_deadline_season_number,rider_submission_deadline_month_number,
    rider_submission_deadline_day_number,ai_fill_deadline_season_number,ai_fill_deadline_month_number,ai_fill_deadline_day_number,application_deadline_policy,rider_submission_deadline
  )
  select public.season_calendar_deterministic_uuid_v1('race|'||e.race_id::text||'|season|'||p_target_season::text),e.race_class_code,e.target_teams,e.min_teams,e.max_teams,
    e.min_riders_per_team,e.max_riders_per_team,
    case when e.applications_open_game_date is null then null else public.season_calendar_shift_date_v1(e.applications_open_game_date,p_target_season+(extract(year from e.applications_open_game_date)::integer-v_source_year)) end,
    case when e.applications_close_game_date is null then null else public.season_calendar_shift_date_v1(e.applications_close_game_date,p_target_season+(extract(year from e.applications_close_game_date)::integer-v_source_year)) end,
    'scheduled',e.auto_close_when_full,e.allow_waitlist,e.prize_fund_cash,e.prize_fund_source,
    public.season_calendar_sanitize_metadata_v1(e.metadata,p_source_season,p_target_season,'entry_rule')||jsonb_build_object('calendar_source_race_id',e.race_id),now(),now(),p_target_season,
    extract(month from public.season_calendar_shift_date_v1(r.start_date,p_target_season))::integer,
    extract(day from public.season_calendar_shift_date_v1(r.start_date,p_target_season))::integer,e.application_window_policy,
    case when e.applications_open_season_number is null then null else p_target_season+(e.applications_open_season_number-p_source_season) end,e.applications_open_month_number,e.applications_open_day_number,
    case when e.applications_close_season_number is null then null else p_target_season+(e.applications_close_season_number-p_source_season) end,e.applications_close_month_number,e.applications_close_day_number,
    case when e.team_list_announcement_season_number is null then null else p_target_season+(e.team_list_announcement_season_number-p_source_season) end,e.team_list_announcement_month_number,e.team_list_announcement_day_number,
    case when e.rider_submission_deadline_season_number is null then null else p_target_season+(e.rider_submission_deadline_season_number-p_source_season) end,e.rider_submission_deadline_month_number,e.rider_submission_deadline_day_number,
    case when e.ai_fill_deadline_season_number is null then null else p_target_season+(e.ai_fill_deadline_season_number-p_source_season) end,e.ai_fill_deadline_month_number,e.ai_fill_deadline_day_number,e.application_deadline_policy,
    case when e.rider_submission_deadline is null then null else public.season_calendar_shift_date_v1(e.rider_submission_deadline,p_target_season+(extract(year from e.rider_submission_deadline)::integer-v_source_year)) end
  from public.race_entry_rules e join public.races r on r.id=e.race_id
  where extract(year from r.start_date)::integer=v_source_year and r.status<>'archived'
  on conflict(race_id) do nothing;
  get diagnostics v_inserted_rules=row_count;

  -- Clear weather generated by any pre-existing trigger side effects. Weather is regenerated by normal race-weather lifecycle, not inherited.
  update public.race_stages s set weather_snapshot='{}'::jsonb,weather_summary=null,weather_cancelled=false,weather_cancellation_reason=null,weather_cancelled_at=null
  where s.race_id in(select public.season_calendar_deterministic_uuid_v1('race|'||r.id::text||'|season|'||p_target_season::text) from public.races r where extract(year from r.start_date)::integer=v_source_year and r.status<>'archived') and (s.weather_snapshot<>'{}'::jsonb or s.weather_summary is not null or s.weather_cancelled=true or s.weather_cancellation_reason is not null or s.weather_cancelled_at is not null);

  if p_late_recovery and v_current_date is not null and v_current_season=p_source_season and v_current_date<make_date(v_target_year,1,1) then
    v_current_ordinal:=public.game_date_ordinal_v1(v_current_season,extract(month from v_current_date)::integer,extract(day from v_current_date)::integer);
    with recoverable as (
      select e.race_id,r.start_date,(r.start_date-4)::date as recovery_close
      from public.race_entry_rules e join public.races r on r.id=e.race_id
      where e.race_season_number=p_target_season
        and r.metadata->>'calendar_source_season'=p_source_season::text
        and public.game_date_ordinal_v1(e.applications_close_season_number,e.applications_close_month_number,e.applications_close_day_number)<v_current_ordinal
        and r.start_date>v_current_date and (r.start_date-4)>=v_current_date
        and coalesce(e.application_deadline_policy,'')<>'late_calendar_recovery_v1'
    )
    update public.race_entry_rules e
    set applications_open_season_number=v_current_season,
        applications_open_month_number=extract(month from v_current_date)::integer,
        applications_open_day_number=extract(day from v_current_date)::integer,
        applications_close_season_number=extract(year from x.recovery_close)::integer-1999,
        applications_close_month_number=extract(month from x.recovery_close)::integer,
        applications_close_day_number=extract(day from x.recovery_close)::integer,
        team_list_announcement_season_number=extract(year from x.recovery_close)::integer-1999,
        team_list_announcement_month_number=extract(month from x.recovery_close)::integer,
        team_list_announcement_day_number=extract(day from x.recovery_close)::integer,
        rider_submission_deadline_season_number=extract(year from x.recovery_close)::integer-1999,
        rider_submission_deadline_month_number=extract(month from x.recovery_close)::integer,
        rider_submission_deadline_day_number=extract(day from x.recovery_close)::integer,
        ai_fill_deadline_season_number=extract(year from x.recovery_close)::integer-1999,
        ai_fill_deadline_month_number=extract(month from x.recovery_close)::integer,
        ai_fill_deadline_day_number=extract(day from x.recovery_close)::integer,
        application_deadline_policy='late_calendar_recovery_v1',
        metadata=coalesce(e.metadata,'{}'::jsonb)||jsonb_build_object('late_calendar_recovery_v1',true,'late_calendar_recovery_generated_on',v_current_date),
        updated_at=now()
    from recoverable x where e.race_id=x.race_id;
    get diagnostics v_recovered=row_count;
  end if;

  -- Derive current application status from season-aware ordinals after any late-recovery adjustment.
  if v_current_date is not null and v_current_season is not null then
    v_current_ordinal:=public.game_date_ordinal_v1(v_current_season,extract(month from v_current_date)::integer,extract(day from v_current_date)::integer);
    update public.race_entry_rules e
    set applications_status=case
      when e.applications_open_season_number is null or e.applications_close_season_number is null then 'scheduled'
      when v_current_ordinal < public.game_date_ordinal_v1(e.applications_open_season_number,e.applications_open_month_number,e.applications_open_day_number) then 'scheduled'
      when v_current_ordinal <= public.game_date_ordinal_v1(e.applications_close_season_number,e.applications_close_month_number,e.applications_close_day_number) then 'open'
      else 'closed'
    end
    where e.race_season_number=p_target_season
      and exists(select 1 from public.races r where r.id=e.race_id and r.metadata->>'calendar_source_season'=p_source_season::text);
  end if;

  return jsonb_build_object('ok',true,'source_season',p_source_season,'target_season',p_target_season,
    'source_template',jsonb_build_object('races',v_source_races,'stages',v_source_stages,'profiles',v_source_profiles,'points',v_source_points,'tt_rules',v_source_tt),
    'inserted',jsonb_build_object('races',v_inserted_races,'stages',v_inserted_stages,'entry_rules',v_inserted_rules,'profiles',v_inserted_profiles,'points',v_inserted_points,'tt_rule_writes',v_inserted_tt),
    'late_recovery_rules',v_recovered,'deterministic_ids',true,'archived_races_excluded',true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.run_race_calendar_season_transition_v1(p_transition_run_id uuid, p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_source_year integer:=1999+p_source_season;
  v_target_year integer:=1999+p_target_season;
  v_expected_races integer;
  v_expected_stages integer;
  v_expected_profiles integer;
  v_expected_points integer;
  v_expected_tt integer;
  v_target_races integer;
  v_target_stages integer;
  v_target_profiles integer;
  v_target_points integer;
  v_target_tt integer;
  v_preseason_rows bigint;
  v_forbidden_rows bigint;
  v_bad_status integer;
  v_bad_dates integer;
  v_missing_rules integer;
  v_point_reconciliation jsonb;
  v_points_ok boolean;
begin
  if p_target_season is distinct from p_source_season+1 then
    raise exception 'target season must equal source season + 1';
  end if;
  if not exists(
    select 1 from public.season_transition_runs_v1 r
    where r.id=p_transition_run_id
      and r.status='running'
      and r.source_season=p_source_season
      and r.target_season=p_target_season
  ) then
    raise exception 'matching running season transition not found';
  end if;

  select count(*) into v_expected_races from public.races r where extract(year from r.start_date)::int=v_source_year and r.status<>'archived';
  select count(*) into v_expected_stages from public.race_stages s join public.races r on r.id=s.race_id where extract(year from r.start_date)::int=v_source_year and r.status<>'archived';
  select count(*) into v_expected_profiles from public.race_stage_profile_details d join public.races r on r.id=d.race_id where extract(year from r.start_date)::int=v_source_year and r.status<>'archived';
  select count(*) into v_expected_points from public.race_stage_points p join public.race_stages s on s.id=p.stage_id join public.races r on r.id=s.race_id where extract(year from r.start_date)::int=v_source_year and r.status<>'archived';
  select count(*) into v_expected_tt from public.race_stage_time_trial_rules t join public.race_stages s on s.id=t.stage_id join public.races r on r.id=s.race_id where extract(year from r.start_date)::int=v_source_year and r.status<>'archived';

  select count(*) into v_target_races from public.races r where extract(year from r.start_date)::int=v_target_year and r.metadata->>'calendar_source_season'=p_source_season::text;
  select count(*) into v_target_stages from public.race_stages s join public.races r on r.id=s.race_id where extract(year from r.start_date)::int=v_target_year and r.metadata->>'calendar_source_season'=p_source_season::text;
  select count(*) into v_target_profiles from public.race_stage_profile_details d join public.races r on r.id=d.race_id where extract(year from r.start_date)::int=v_target_year and r.metadata->>'calendar_source_season'=p_source_season::text;
  select count(*) into v_target_points from public.race_stage_points p join public.race_stages s on s.id=p.stage_id join public.races r on r.id=s.race_id where extract(year from r.start_date)::int=v_target_year and r.metadata->>'calendar_source_season'=p_source_season::text;
  select count(*) into v_target_tt from public.race_stage_time_trial_rules t join public.race_stages s on s.id=t.stage_id join public.races r on r.id=s.race_id where extract(year from r.start_date)::int=v_target_year and r.metadata->>'calendar_source_season'=p_source_season::text;

  v_point_reconciliation := public.validate_season_calendar_stage_point_reconciliation_v3(p_source_season,p_target_season);
  v_points_ok := coalesce((v_point_reconciliation->>'ok')::boolean,false);

  select count(*) into v_missing_rules from public.races r left join public.race_entry_rules e on e.race_id=r.id
  where extract(year from r.start_date)::int=v_target_year and r.metadata->>'calendar_source_season'=p_source_season::text and (e.race_id is null or e.race_season_number<>p_target_season);
  select count(*) into v_bad_status from public.races r
  where extract(year from r.start_date)::int=v_target_year and r.metadata->>'calendar_source_season'=p_source_season::text and r.status not in ('scheduled','active');
  select count(*) into v_bad_dates from public.race_stages s join public.races r on r.id=s.race_id
  where extract(year from r.start_date)::int=v_target_year and r.metadata->>'calendar_source_season'=p_source_season::text and (s.stage_date<r.start_date or s.stage_date>r.end_date);

  select
    (select count(*) from public.race_team_applications a join public.races r on r.id=a.race_id where extract(year from r.start_date)::int=v_target_year and r.metadata->>'calendar_source_season'=p_source_season::text)
   +(select count(*) from public.race_team_entries a join public.races r on r.id=a.race_id where extract(year from r.start_date)::int=v_target_year and r.metadata->>'calendar_source_season'=p_source_season::text)
   +(select count(*) from public.race_participant_teams a join public.races r on r.id=a.race_id where extract(year from r.start_date)::int=v_target_year and r.metadata->>'calendar_source_season'=p_source_season::text)
   +(select count(*) from public.race_participant_riders a join public.races r on r.id=a.race_id where extract(year from r.start_date)::int=v_target_year and r.metadata->>'calendar_source_season'=p_source_season::text)
   +(select count(*) from public.race_preparations a join public.races r on r.id=a.race_id where extract(year from r.start_date)::int=v_target_year and r.metadata->>'calendar_source_season'=p_source_season::text)
  into v_preseason_rows;

  select
    (select count(*) from public.race_stage_results a join public.races r on r.id=a.race_id where extract(year from r.start_date)::int=v_target_year and r.metadata->>'calendar_source_season'=p_source_season::text)
   +(select count(*) from public.race_classification_standings a join public.races r on r.id=a.race_id where extract(year from r.start_date)::int=v_target_year and r.metadata->>'calendar_source_season'=p_source_season::text)
   +(select count(*) from public.race_prize_awards a join public.races r on r.id=a.race_id where extract(year from r.start_date)::int=v_target_year and r.metadata->>'calendar_source_season'=p_source_season::text)
   +(select count(*) from public.race_ranking_point_awards a join public.races r on r.id=a.race_id where extract(year from r.start_date)::int=v_target_year and r.metadata->>'calendar_source_season'=p_source_season::text)
   +(select count(*) from public.race_stage_simulation_runs a join public.races r on r.id=a.race_id where extract(year from r.start_date)::int=v_target_year and r.metadata->>'calendar_source_season'=p_source_season::text)
  into v_forbidden_rows;

  if v_target_races<>v_expected_races
     or v_target_stages<>v_expected_stages
     or v_target_profiles<>v_expected_profiles
     or not v_points_ok
     or v_target_tt<>v_expected_tt
     or v_missing_rules<>0
     or v_bad_status<>0
     or v_bad_dates<>0
     or v_forbidden_rows<>0 then
    raise exception 'Target race calendar invariant failed: races %/%, stages %/%, profiles %/%, points %/% reconciliation_ok %, tt %/%, missing_rules %, bad_status %, bad_dates %, forbidden_history_rows %, preseason_operational_rows %, point_reconciliation %',
      v_target_races,v_expected_races,
      v_target_stages,v_expected_stages,
      v_target_profiles,v_expected_profiles,
      v_target_points,v_expected_points,v_points_ok,
      v_target_tt,v_expected_tt,
      v_missing_rules,v_bad_status,v_bad_dates,v_forbidden_rows,v_preseason_rows,
      v_point_reconciliation::text;
  end if;

  return jsonb_build_object(
    'ok',true,
    'source_season',p_source_season,
    'target_season',p_target_season,
    'races',v_target_races,
    'stages',v_target_stages,
    'profiles',v_target_profiles,
    'stage_points',v_target_points,
    'source_stage_points',v_expected_points,
    'point_reconciliation',v_point_reconciliation,
    'tt_rules',v_target_tt,
    'preseason_operational_rows',v_preseason_rows,
    'forbidden_history_rows',v_forbidden_rows,
    'missing_entry_rules',v_missing_rules,
    'bad_stage_dates',v_bad_dates
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.prepare_next_season_race_calendar_if_due_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_date date:=public.get_current_game_date_date();
  v_source integer:=public.get_current_season_number();
  v_target integer;
  v_target_year integer;
  v_existing integer;
begin
  if v_date is null or v_source is null then return jsonb_build_object('ok',false,'status','game_date_unavailable'); end if;
  v_target:=v_source+1; v_target_year:=1999+v_target;
  if extract(month from v_date)::integer<10 then return jsonb_build_object('ok',true,'status','not_due','source_season',v_source,'target_season',v_target); end if;
  select count(*) into v_existing from public.races r where extract(year from r.start_date)::integer=v_target_year and r.metadata->>'calendar_source_season'=v_source::text;
  if v_existing>0 then return jsonb_build_object('ok',true,'status','already_prepared','source_season',v_source,'target_season',v_target,'races',v_existing); end if;
  return public.prepare_next_season_race_calendar_v1(v_source,v_target,true)||jsonb_build_object('status','prepared');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.dry_run_race_calendar_season_transition_v1(p_source_season integer DEFAULT 1, p_target_season integer DEFAULT 2)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_source_year integer:=1999+p_source_season;
  v_target_year integer:=1999+p_target_season;
  v_before integer;
  v_after_rollback integer;
  v_first jsonb;
  v_second jsonb;
  v_verify jsonb;
  v_timeline uuid;
  v_run uuid;
  v_target_races integer;
  v_target_stages integer;
  v_target_rules integer;
  v_target_profiles integer;
  v_target_points integer;
  v_target_tt integer;
  v_recovery integer;
  v_open integer;
  v_archived_cloned integer;
  v_cancelled_source_scheduled integer;
  v_feb29_shift_ok boolean:=false;
  v_dynamic bigint;
  v_second_zero boolean:=false;
  v_ok boolean:=false;
begin
  if p_target_season is distinct from p_source_season+1 then raise exception 'target must equal source + 1'; end if;
  select count(*) into v_before from public.races where extract(year from start_date)::integer=v_target_year;

  begin
    v_first:=public.prepare_next_season_race_calendar_v1(p_source_season,p_target_season,true);

    select count(*) into v_target_races from public.races r where extract(year from r.start_date)::integer=v_target_year and r.metadata->>'calendar_source_season'=p_source_season::text;
    select count(*) into v_target_stages from public.race_stages s join public.races r on r.id=s.race_id where extract(year from r.start_date)::integer=v_target_year and r.metadata->>'calendar_source_season'=p_source_season::text;
    select count(*) into v_target_rules from public.race_entry_rules e join public.races r on r.id=e.race_id where extract(year from r.start_date)::integer=v_target_year and r.metadata->>'calendar_source_season'=p_source_season::text;
    select count(*) into v_target_profiles from public.race_stage_profile_details d join public.races r on r.id=d.race_id where extract(year from r.start_date)::integer=v_target_year and r.metadata->>'calendar_source_season'=p_source_season::text;
    select count(*) into v_target_points from public.race_stage_points p join public.race_stages s on s.id=p.stage_id join public.races r on r.id=s.race_id where extract(year from r.start_date)::integer=v_target_year and r.metadata->>'calendar_source_season'=p_source_season::text;
    select count(*) into v_target_tt from public.race_stage_time_trial_rules t join public.race_stages s on s.id=t.stage_id join public.races r on r.id=s.race_id where extract(year from r.start_date)::integer=v_target_year and r.metadata->>'calendar_source_season'=p_source_season::text;

    select count(*) into v_recovery from public.race_entry_rules e join public.races r on r.id=e.race_id
      where e.race_season_number=p_target_season and r.metadata->>'calendar_source_season'=p_source_season::text and e.application_deadline_policy='late_calendar_recovery_v1';
    select count(*) into v_open from public.race_entry_rules e join public.races r on r.id=e.race_id
      where e.race_season_number=p_target_season and r.metadata->>'calendar_source_season'=p_source_season::text and e.applications_status='open';

    select count(*) into v_archived_cloned
    from public.races src
    where extract(year from src.start_date)::integer=v_source_year and src.status='archived'
      and exists(select 1 from public.races trg where trg.id=public.season_calendar_deterministic_uuid_v1('race|'||src.id::text||'|season|'||p_target_season::text));

    select count(*) into v_cancelled_source_scheduled
    from public.races src
    join public.races trg on trg.id=public.season_calendar_deterministic_uuid_v1('race|'||src.id::text||'|season|'||p_target_season::text)
    where extract(year from src.start_date)::integer=v_source_year and src.status='cancelled' and trg.status='scheduled';

    select exists(
      select 1 from public.races src
      join public.races trg on trg.id=public.season_calendar_deterministic_uuid_v1('race|'||src.id::text||'|season|'||p_target_season::text)
      where src.start_date=make_date(v_source_year,2,29) and trg.start_date=make_date(v_target_year,2,28)
    ) into v_feb29_shift_ok;

    select timeline_id into v_timeline from public.season_transition_control_v1 where id=true;
    insert into public.season_transition_runs_v1(timeline_id,source_season,target_season,status,metadata)
    values(v_timeline,p_source_season,p_target_season,'running',jsonb_build_object('dry_run','race_calendar_v1')) returning id into v_run;
    v_verify:=public.run_race_calendar_season_transition_v1(v_run,p_source_season,p_target_season);
    v_dynamic:=coalesce((v_verify->>'dynamic_rows_copied')::bigint,-1);

    v_second:=public.prepare_next_season_race_calendar_v1(p_source_season,p_target_season,true);
    v_second_zero:=
      coalesce((v_second->'inserted'->>'races')::integer,-1)=0 and
      coalesce((v_second->'inserted'->>'stages')::integer,-1)=0 and
      coalesce((v_second->'inserted'->>'entry_rules')::integer,-1)=0 and
      coalesce((v_second->'inserted'->>'profiles')::integer,-1)=0 and
      coalesce((v_second->'inserted'->>'points')::integer,-1)=0 and
      coalesce((v_second->'inserted'->>'tt_rule_writes')::integer,-1)=0 and
      coalesce((v_second->>'late_recovery_rules')::integer,-1)=0;

    v_ok:=v_target_races=591 and v_target_stages=1626 and v_target_rules=591 and v_target_profiles=1626 and v_target_tt=74 and coalesce((v_verify->'point_reconciliation'->>'ok')::boolean,false)
      and v_recovery>0 and v_open>0 and v_archived_cloned=0 and v_cancelled_source_scheduled=1 and v_feb29_shift_ok and v_dynamic=0 and v_second_zero
      and coalesce((v_verify->>'missing_entry_rules')::integer,-1)=0 and coalesce((v_verify->>'bad_stage_dates')::integer,-1)=0;

    raise exception '__ROLLBACK_RACE_CALENDAR_DRY_RUN__';
  exception when others then
    if sqlerrm<>'__ROLLBACK_RACE_CALENDAR_DRY_RUN__' then raise; end if;
  end;

  select count(*) into v_after_rollback from public.races where extract(year from start_date)::integer=v_target_year;
  v_ok:=v_ok and v_after_rollback=v_before and not exists(select 1 from public.season_transition_runs_v1 where metadata->>'dry_run'='race_calendar_v1');

  return jsonb_build_object('ok',v_ok,'first_pass',v_first,'verification',v_verify,'second_pass',v_second,
    'target_counts_inside_test',jsonb_build_object('races',v_target_races,'stages',v_target_stages,'entry_rules',v_target_rules,'profiles',v_target_profiles,'points',v_target_points,'tt_rules',v_target_tt),
    'late_recovery',jsonb_build_object('rules',v_recovery,'currently_open',v_open),
    'archived_races_cloned',v_archived_cloned,'cancelled_source_returned_scheduled',v_cancelled_source_scheduled,'feb29_to_feb28',v_feb29_shift_ok,
    'dynamic_rows_copied',v_dynamic,'second_pass_zero_work',v_second_zero,'production_target_races_before',v_before,'production_target_races_after_rollback',v_after_rollback);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notification_enrich_rider_identity_json_v1(p_value jsonb, p_default_scope text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_type text;
  v_result jsonb;
  v_key text;
  v_item jsonb;
  v_rider_id uuid;
  v_rider record;
  v_first_name text;
  v_last_name text;
  v_full_name text;
  v_scope text;
  v_existing_path text;
begin
  if p_value is null then
    return null;
  end if;

  v_type := jsonb_typeof(p_value);

  if v_type = 'array' then
    select coalesce(
      jsonb_agg(
        public.notification_enrich_rider_identity_json_v1(
          value,
          p_default_scope
        )
      ),
      '[]'::jsonb
    )
    into v_result
    from jsonb_array_elements(p_value);

    return v_result;
  end if;

  if v_type <> 'object' then
    return p_value;
  end if;

  v_result := '{}'::jsonb;

  -- Recurse first so nested rider objects are also protected.
  for v_key, v_item in
    select key, value
    from jsonb_each(p_value)
  loop
    v_result :=
      v_result ||
      jsonb_build_object(
        v_key,
        public.notification_enrich_rider_identity_json_v1(
          v_item,
          p_default_scope
        )
      );
  end loop;

  if coalesce(v_result->>'rider_id', '') ~*
     '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    v_rider_id := (v_result->>'rider_id')::uuid;

    select
      r.id,
      r.first_name,
      r.last_name,
      r.display_name,
      r.country_code
    into v_rider
    from public.riders r
    where r.id = v_rider_id
    limit 1;

    if found then
      v_first_name := nullif(trim(coalesce(v_rider.first_name, '')), '');
      v_last_name := nullif(trim(coalesce(v_rider.last_name, '')), '');

      v_full_name :=
        nullif(
          trim(
            concat_ws(
              ' ',
              v_first_name,
              v_last_name
            )
          ),
          ''
        );

      if v_full_name is null then
        v_full_name := nullif(trim(coalesce(v_rider.display_name, '')), '');
      end if;

      v_existing_path :=
        coalesce(
          nullif(trim(v_result->>'rider_profile_path'), ''),
          nullif(trim(v_result->>'my_rider_profile_path'), ''),
          nullif(trim(v_result->>'external_rider_profile_path'), '')
        );

      v_scope :=
        coalesce(
          nullif(trim(v_result->>'rider_scope'), ''),
          case
            when coalesce(v_existing_path, '') like '/dashboard/external-riders/%'
              then 'external'
            when coalesce(v_existing_path, '') like '/dashboard/my-riders/%'
              then 'internal'
            else null
          end,
          nullif(trim(p_default_scope), ''),
          'internal'
        );

      v_result :=
        v_result ||
        jsonb_build_object(
          'rider_first_name', v_first_name,
          'rider_last_name', v_last_name,
          'rider_full_name', v_full_name,
          'rider_country_code',
            nullif(trim(coalesce(v_rider.country_code, '')), ''),
          'rider_scope', v_scope,
          'rider_profile_path',
            coalesce(
              v_existing_path,
              case
                when v_scope = 'external'
                  then '/dashboard/external-riders/' || v_rider.id::text
                else '/dashboard/my-riders/' || v_rider.id::text
              end
            )
        );
    end if;
  end if;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notification_expand_root_rider_text_v1(p_text text, p_payload jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  v_full_name text;
  v_old_name text;
begin
  if p_text is null or btrim(p_text) = '' then
    return p_text;
  end if;

  v_full_name := public.notification_root_rider_full_name_v1(p_payload);

  if v_full_name is null then
    return p_text;
  end if;

  -- Common old abbreviated fields.
  foreach v_old_name in array array[
    nullif(btrim(p_payload->>'display_name'), ''),
    nullif(btrim(p_payload->>'rider_display_name'), ''),
    nullif(btrim(p_payload->>'rider_name'), ''),
    nullif(btrim(p_payload->>'name'), '')
  ]
  loop
    if v_old_name is not null
       and v_old_name <> v_full_name
       and position(v_old_name in p_text) > 0
    then
      p_text := replace(p_text, v_old_name, v_full_name);
    end if;
  end loop;

  return p_text;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notification_default_rider_scope_v1(p_type_code text, p_payload jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
begin
  -- Respect explicit payload scope/path first.
  if nullif(trim(p_payload->>'rider_scope'), '') is not null then
    return p_payload->>'rider_scope';
  end if;

  if coalesce(p_payload->>'rider_profile_path', '') like '/dashboard/external-riders/%'
     or coalesce(p_payload->>'external_rider_profile_path', '') like '/dashboard/external-riders/%'
  then
    return 'external';
  end if;

  if coalesce(p_payload->>'rider_profile_path', '') like '/dashboard/my-riders/%'
     or coalesce(p_payload->>'my_rider_profile_path', '') like '/dashboard/my-riders/%'
  then
    return 'internal';
  end if;

  -- Scouting reports are external-market rider profiles by default.
  if upper(coalesce(p_type_code, '')) in (
    'SCOUT_REPORT_COMPLETED',
    'ADVISOR_SCOUT_REPORT'
  ) then
    return 'external';
  end if;

  -- Normal rider/team health, contract and roster events concern own riders.
  return 'internal';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notification_enrich_rider_identity_trg_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_type_code text;
  v_scope text;
begin
  select nt.code
  into v_type_code
  from public.notification_types nt
  where nt.id = new.type_id;

  v_scope :=
    public.notification_default_rider_scope_v1(
      v_type_code,
      coalesce(new.payload_json, '{}'::jsonb)
    );

  new.payload_json :=
    public.notification_enrich_rider_identity_json_v1(
      coalesce(new.payload_json, '{}'::jsonb),
      v_scope
    );

  new.title :=
    public.notification_canonical_rider_title_v1(
      v_type_code,
      new.title,
      new.payload_json
    );

  new.message :=
    public.notification_expand_root_rider_text_v1(
      new.message,
      new.payload_json
    );

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notification_canonical_rider_title_v1(p_type_code text, p_current_title text, p_payload jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  v_code text := upper(coalesce(p_type_code, ''));
  v_name text :=
    coalesce(
      nullif(trim(p_payload->>'rider_full_name'), ''),
      nullif(
        trim(
          concat_ws(
            ' ',
            nullif(trim(p_payload->>'rider_first_name'), ''),
            nullif(trim(p_payload->>'rider_last_name'), '')
          )
        ),
        ''
      )
    );
begin
  if v_name is null then
    return p_current_title;
  end if;

  case v_code
    when 'RIDER_INJURED' then
      return v_name || ' is injured';

    when 'RIDER_SICK' then
      return v_name || ' is sick';

    when 'RIDER_NOT_FULLY_FIT' then
      return v_name || ' is not fully fit';

    when 'RIDER_FIT_AGAIN' then
      return v_name || ' is fit again';

    when 'SCOUT_REPORT_COMPLETED' then
      return 'Scout report ready: ' || v_name;

    when 'RIDER_CONTRACT_EXPIRING' then
      return 'Contract expiring: ' || v_name;

    when 'RIDER_WANTS_MORE_RACE_SELECTION' then
      return 'Rider wants more race selection: ' || v_name;

    when 'RIDER_REQUESTS_RELEASE' then
      return 'Rider requests release: ' || v_name;

    when 'RETIREMENT_ANNOUNCED' then
      return 'Retirement announced: ' || v_name;

    else
      -- For any other rider-based notification, only replace known
      -- abbreviated payload names when possible; otherwise keep title.
      return public.notification_expand_root_rider_text_v1(
        p_current_title,
        p_payload
      );
  end case;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_team_ranking_past_winners_from_snapshot_v1(p_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_snapshot_rows integer;
  v_divisions integer;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_bad integer;
begin
  if p_season is null or p_season <= 0 then
    raise exception 'sync_team_ranking_past_winners_from_snapshot_v1: season must be positive';
  end if;

  perform public.snapshot_team_rankings_for_season_v1(p_season);

  select count(*), count(distinct division)
  into v_snapshot_rows, v_divisions
  from public.team_ranking_season_snapshots
  where season_number=p_season;

  if v_snapshot_rows=0 or v_divisions=0 then
    raise exception 'sync_team_ranking_past_winners_from_snapshot_v1: season % has no canonical snapshot',p_season;
  end if;

  select count(*) into v_bad
  from (
    select division
    from public.team_ranking_season_snapshots
    where season_number=p_season and final_position=1
    group by division
    having count(*)<>1
  ) x;
  if v_bad<>0 then
    raise exception 'sync_team_ranking_past_winners_from_snapshot_v1: canonical snapshot has invalid division winners for season %',p_season;
  end if;

  with winners as (
    select season_number,division,club_id,club_name,country_code,points
    from public.team_ranking_season_snapshots
    where season_number=p_season and final_position=1
  ), ins as (
    insert into public.team_ranking_past_winners(
      season_number,division,club_id,club_name,country_code,points
    )
    select w.season_number,w.division,w.club_id,w.club_name,w.country_code,w.points
    from winners w
    where not exists(
      select 1 from public.team_ranking_past_winners p
      where p.season_number=w.season_number and p.division=w.division
    )
    returning 1
  )
  select count(*) into v_inserted from ins;

  with winners as (
    select season_number,division,club_id,club_name,country_code,points
    from public.team_ranking_season_snapshots
    where season_number=p_season and final_position=1
  ), upd as (
    update public.team_ranking_past_winners p
    set club_id=w.club_id,
        club_name=w.club_name,
        country_code=w.country_code,
        points=w.points
    from winners w
    where p.season_number=w.season_number
      and p.division=w.division
      and (p.club_id,p.club_name,p.country_code,p.points)
          is distinct from
          (w.club_id,w.club_name,w.country_code,w.points)
    returning 1
  )
  select count(*) into v_updated from upd;

  select count(*) into v_bad
  from public.team_ranking_past_winners p
  join public.team_ranking_season_snapshots s
    on s.season_number=p.season_number and s.division=p.division and s.final_position=1
  where p.season_number=p_season
    and (p.club_id,p.club_name,p.country_code,p.points)
        is distinct from
        (s.club_id,s.club_name,s.country_code,s.points);
  if v_bad<>0 then
    raise exception 'sync_team_ranking_past_winners_from_snapshot_v1: history cache diverges from canonical snapshot for season %',p_season;
  end if;

  if (select count(*) from public.team_ranking_past_winners where season_number=p_season)<>v_divisions then
    raise exception 'sync_team_ranking_past_winners_from_snapshot_v1: expected % winners for season %, found %',
      v_divisions,p_season,(select count(*) from public.team_ranking_past_winners where season_number=p_season);
  end if;

  return jsonb_build_object(
    'ok',true,
    'season',p_season,
    'snapshot_rows',v_snapshot_rows,
    'division_winners',v_divisions,
    'inserted',v_inserted,
    'updated',v_updated
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.run_rankings_history_season_transition_v1(p_transition_run_id uuid, p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_source_year integer; v_target_year integer; v_sync jsonb;
  v_source_awards bigint; v_target_awards bigint;
  v_target_team_rows bigint; v_target_team_nonzero bigint; v_target_rider_rankings bigint;
  v_divisions integer; v_bad integer;
begin
  if p_target_season<>p_source_season+1 then raise exception 'run_rankings_history_season_transition_v1: target season must equal source+1'; end if;
  if not exists(select 1 from public.season_transition_runs_v1 where id=p_transition_run_id and source_season=p_source_season and target_season=p_target_season and status='running') then
    raise exception 'run_rankings_history_season_transition_v1: transition run is not running/matching';
  end if;
  v_source_year:=1999+p_source_season; v_target_year:=1999+p_target_season;

  select count(*) into v_target_awards from public.race_ranking_point_awards a join public.races r on r.id=a.race_id where extract(year from r.start_date)::integer=v_target_year;
  if v_target_awards<>0 then raise exception 'run_rankings_history_season_transition_v1: target season % already has % ranking award rows',p_target_season,v_target_awards; end if;

  v_sync:=public.sync_team_ranking_past_winners_from_snapshot_v1(p_source_season);
  select count(distinct division) into v_divisions from public.team_ranking_season_snapshots where season_number=p_source_season;
  select count(*) into v_bad
  from public.team_ranking_past_winners p
  join public.team_ranking_season_snapshots s on s.season_number=p.season_number and s.division=p.division and s.final_position=1
  where p.season_number=p_source_season and (p.club_id,p.club_name,p.country_code,p.points) is distinct from (s.club_id,s.club_name,s.country_code,s.points);
  if v_bad<>0 then raise exception 'run_rankings_history_season_transition_v1: winner history mismatch'; end if;

  select count(*) into v_source_awards from public.race_ranking_point_awards a join public.races r on r.id=a.race_id where extract(year from r.start_date)::integer=v_source_year;
  select count(*) into v_target_team_rows from public.team_international_points_by_season_v1 where season_year=v_target_year;
  select count(*) into v_target_team_nonzero from public.team_international_points_by_season_v1
    where season_year=v_target_year and (coalesce(international_points,0)<>0 or coalesce(scoring_rows,0)<>0 or coalesce(scoring_races,0)<>0 or coalesce(scoring_stages,0)<>0);
  select count(*) into v_target_rider_rankings from public.rider_international_points_by_season_v1 where season_year=v_target_year;
  if v_target_team_nonzero<>0 or v_target_rider_rankings<>0 then
    raise exception 'run_rankings_history_season_transition_v1: target rankings are not fresh (nonzero teams %, rider rows %)',v_target_team_nonzero,v_target_rider_rankings;
  end if;

  return jsonb_build_object('ok',true,'source_season',p_source_season,'target_season',p_target_season,
    'source_ranking_award_rows',v_source_awards,'target_ranking_award_rows',v_target_awards,
    'target_team_ranking_rows',v_target_team_rows,'target_team_nonzero_rows',v_target_team_nonzero,
    'target_rider_ranking_rows',v_target_rider_rankings,'division_winners',v_divisions,'winner_sync',v_sync);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.dry_run_rankings_history_season_transition_v1(p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_timeline uuid; v_run uuid;
  v_before_snapshot bigint; v_before_winners bigint; v_before_source_awards bigint; v_before_target_awards bigint;
  v_before_source_team_points numeric; v_before_source_rider_points numeric;
  v_before_target_team_rankings bigint; v_before_target_team_nonzero bigint; v_before_target_rider_rankings bigint;
  v_first jsonb; v_second jsonb; v_repair jsonb; v_divisions integer; v_mismatch integer;
  v_target_team_rankings bigint; v_target_team_nonzero bigint; v_target_rider_rankings bigint; v_result jsonb;
  v_after_snapshot bigint; v_after_winners bigint; v_after_run bigint; v_after_source_awards bigint; v_after_target_awards bigint;
  v_after_source_team_points numeric; v_after_source_rider_points numeric;
  v_source_year integer:=1999+p_source_season; v_target_year integer:=1999+p_target_season;
begin
  if p_target_season<>p_source_season+1 then raise exception 'dry_run_rankings_history_season_transition_v1: target must equal source+1'; end if;
  select timeline_id into v_timeline from public.season_transition_control_v1 where id=true;
  if v_timeline is null then raise exception 'No season transition timeline'; end if;

  select count(*) into v_before_snapshot from public.team_ranking_season_snapshots where season_number=p_source_season;
  select count(*) into v_before_winners from public.team_ranking_past_winners where season_number=p_source_season;
  select count(*) into v_before_source_awards from public.race_ranking_point_awards a join public.races r on r.id=a.race_id where extract(year from r.start_date)::int=v_source_year;
  select count(*) into v_before_target_awards from public.race_ranking_point_awards a join public.races r on r.id=a.race_id where extract(year from r.start_date)::int=v_target_year;
  select coalesce(sum(international_points),0) into v_before_source_team_points from public.team_international_points_by_season_v1 where season_year=v_source_year;
  select coalesce(sum(international_points),0) into v_before_source_rider_points from public.rider_international_points_by_season_v1 where season_year=v_source_year;
  select count(*),count(*) filter(where coalesce(international_points,0)<>0 or coalesce(scoring_rows,0)<>0 or coalesce(scoring_races,0)<>0 or coalesce(scoring_stages,0)<>0)
    into v_before_target_team_rankings,v_before_target_team_nonzero from public.team_international_points_by_season_v1 where season_year=v_target_year;
  select count(*) into v_before_target_rider_rankings from public.rider_international_points_by_season_v1 where season_year=v_target_year;

  begin
    perform public.snapshot_team_rankings_for_season_v1(p_source_season);
    insert into public.season_transition_runs_v1(timeline_id,source_season,target_season,status,metadata)
    values(v_timeline,p_source_season,p_target_season,'running',jsonb_build_object('dry_run','rankings_history_v1')) returning id into v_run;

    v_first:=public.run_rankings_history_season_transition_v1(v_run,p_source_season,p_target_season);
    v_second:=public.sync_team_ranking_past_winners_from_snapshot_v1(p_source_season);
    select count(distinct division) into v_divisions from public.team_ranking_season_snapshots where season_number=p_source_season;

    update public.team_ranking_past_winners set points=points+1
    where id=(select id from public.team_ranking_past_winners where season_number=p_source_season order by division limit 1);
    v_repair:=public.sync_team_ranking_past_winners_from_snapshot_v1(p_source_season);

    select count(*) into v_mismatch
    from public.team_ranking_past_winners p join public.team_ranking_season_snapshots s
      on s.season_number=p.season_number and s.division=p.division and s.final_position=1
    where p.season_number=p_source_season
      and (p.club_id,p.club_name,p.country_code,p.points) is distinct from (s.club_id,s.club_name,s.country_code,s.points);

    select count(*),count(*) filter(where coalesce(international_points,0)<>0 or coalesce(scoring_rows,0)<>0 or coalesce(scoring_races,0)<>0 or coalesce(scoring_stages,0)<>0)
      into v_target_team_rankings,v_target_team_nonzero from public.team_international_points_by_season_v1 where season_year=v_target_year;
    select count(*) into v_target_rider_rankings from public.rider_international_points_by_season_v1 where season_year=v_target_year;

    v_result:=jsonb_build_object(
      'ok',(v_first->>'ok')::boolean
        and coalesce((v_second->>'inserted')::int,-1)=0
        and coalesce((v_second->>'updated')::int,-1)=0
        and coalesce((v_repair->>'updated')::int,-1)=1
        and v_mismatch=0 and v_target_team_nonzero=0 and v_target_rider_rankings=0,
      'first_pass',v_first,'second_sync',v_second,'repair_sync',v_repair,'division_winners',v_divisions,
      'winner_mismatches_after_repair',v_mismatch,'target_team_ranking_rows',v_target_team_rankings,
      'target_team_nonzero_rows',v_target_team_nonzero,'target_rider_ranking_rows',v_target_rider_rankings,
      'source_awards_inside_test',(select count(*) from public.race_ranking_point_awards a join public.races r on r.id=a.race_id where extract(year from r.start_date)::int=v_source_year),
      'target_awards_inside_test',(select count(*) from public.race_ranking_point_awards a join public.races r on r.id=a.race_id where extract(year from r.start_date)::int=v_target_year),
      'source_team_points_inside_test',(select coalesce(sum(international_points),0) from public.team_international_points_by_season_v1 where season_year=v_source_year),
      'source_rider_points_inside_test',(select coalesce(sum(international_points),0) from public.rider_international_points_by_season_v1 where season_year=v_source_year)
    );
    raise exception using errcode='P0199',message='rankings_history_dry_run_rollback';
  exception when sqlstate 'P0199' then
    if sqlerrm<>'rankings_history_dry_run_rollback' then raise; end if;
  end;

  select count(*) into v_after_snapshot from public.team_ranking_season_snapshots where season_number=p_source_season;
  select count(*) into v_after_winners from public.team_ranking_past_winners where season_number=p_source_season;
  select count(*) into v_after_run from public.season_transition_runs_v1 where id=v_run;
  select count(*) into v_after_source_awards from public.race_ranking_point_awards a join public.races r on r.id=a.race_id where extract(year from r.start_date)::int=v_source_year;
  select count(*) into v_after_target_awards from public.race_ranking_point_awards a join public.races r on r.id=a.race_id where extract(year from r.start_date)::int=v_target_year;
  select coalesce(sum(international_points),0) into v_after_source_team_points from public.team_international_points_by_season_v1 where season_year=v_source_year;
  select coalesce(sum(international_points),0) into v_after_source_rider_points from public.rider_international_points_by_season_v1 where season_year=v_source_year;

  return coalesce(v_result,'{}'::jsonb)||jsonb_build_object('production_restored',jsonb_build_object(
    'snapshot_restored',v_after_snapshot=v_before_snapshot,'winner_cache_restored',v_after_winners=v_before_winners,
    'dry_run_transition_rows',v_after_run,'source_awards_restored',v_after_source_awards=v_before_source_awards,
    'target_awards_restored',v_after_target_awards=v_before_target_awards,'source_team_points_restored',v_after_source_team_points=v_before_source_team_points,
    'source_rider_points_restored',v_after_source_rider_points=v_before_source_rider_points,
    'target_team_ranking_rows_were',v_before_target_team_rankings,'target_team_nonzero_rows_were',v_before_target_team_nonzero,
    'target_rider_rankings_were',v_before_target_rider_rankings));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.dry_run_finances_rewards_season_transition_v1(p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance'
AS $function$
declare
  v_timeline uuid;
  v_run uuid;
  v_before_snapshot bigint;
  v_before_grants bigint;
  v_before_guard bigint;
  v_before_runs bigint;
  v_before_wallet_sum bigint;
  v_before_loan_count bigint;
  v_before_loan_outstanding bigint;
  v_before_cash_map jsonb;
  v_before_wallet_map jsonb;
  v_game_before jsonb;
  v_preview_count integer;
  v_preview_cash bigint;
  v_preview_coin_user integer;
  v_world_reward_count integer;
  v_world_winner_cash bigint;
  v_promo_reward_count integer;
  v_bad_promo_count integer;
  v_structural_promo_count integer;
  v_expected_playoff_promos integer;
  v_apply_count integer;
  v_grant_count integer;
  v_guard_count integer;
  v_wallet_after_sum bigint;
  v_wallet_delta bigint;
  v_nonrecipient_cash_changed integer;
  v_nonrecipient_wallet_changed integer;
  v_loan_count_after bigint;
  v_loan_outstanding_after bigint;
  v_second_apply_blocked boolean:=false;
  v_result jsonb;
  v_after_snapshot bigint;
  v_after_grants bigint;
  v_after_guard bigint;
  v_after_runs bigint;
  v_after_wallet_sum bigint;
  v_after_loan_count bigint;
  v_after_loan_outstanding bigint;
  v_after_cash_map jsonb;
  v_after_game jsonb;
begin
  if p_target_season<>p_source_season+1 then
    raise exception 'dry_run_finances_rewards_season_transition_v1: target must equal source+1';
  end if;
  if auth.role()<>'service_role' then
    raise exception 'dry_run_finances_rewards_season_transition_v1 requires service_role';
  end if;

  select timeline_id into v_timeline from public.season_transition_control_v1 where id=true;
  select count(*) into v_before_snapshot from public.team_ranking_season_snapshots where season_number=p_source_season;
  select count(*) into v_before_grants from public.club_season_reward_grants where source_season=p_source_season;
  select count(*) into v_before_guard from public.season_reward_guard where source_season=p_source_season;
  select count(*) into v_before_runs from public.season_reward_runs where source_season=p_source_season;
  select coalesce(sum(balance),0) into v_before_wallet_sum from public.user_wallets;
  select count(*),coalesce(sum(outstanding_principal),0) into v_before_loan_count,v_before_loan_outstanding from finance.emergency_loans;
  select coalesce(jsonb_object_agg(a.club_id::text,coalesce(b.balance,0)),'{}'::jsonb)
    into v_before_cash_map
  from finance.accounts a left join finance.account_balances b on b.account_id=a.id
  where a.club_id is not null and a.currency='CASH' and a.kind='main';
  select coalesce(jsonb_object_agg(user_id::text,balance),'{}'::jsonb) into v_before_wallet_map from public.user_wallets;
  select to_jsonb(gs) into v_game_before from public.game_state gs where id=true;

  begin
    perform public.snapshot_team_rankings_for_season_v1(p_source_season);
    insert into public.season_transition_runs_v1(timeline_id,source_season,target_season,status,metadata)
    values(v_timeline,p_source_season,p_target_season,'running',jsonb_build_object('dry_run','finances_rewards_v1'))
    returning id into v_run;

    perform public.run_competition_season_transition_v1(v_run,p_source_season,p_target_season);

    select count(*),coalesce(sum(cash_total),0),coalesce(sum(coin_total) filter(where owner_user_id is not null),0),
           count(*) filter(where division='WORLD'),
           coalesce(max(cash_total) filter(where division='WORLD' and final_position=1),0)
    into v_preview_count,v_preview_cash,v_preview_coin_user,v_world_reward_count,v_world_winner_cash
    from public.run_competition_rewards_v2(p_source_season,true);

    select count(*) into v_promo_reward_count
    from public.run_competition_rewards_v2(p_source_season,true) r
    where exists(
      select 1 from jsonb_array_elements(r.reward_details) d
      where d->>'code' in ('PRO_PLAYOFF_PROMOTION','CONTINENTAL_PLAYOFF_PROMOTION','AMATEUR_PLAYOFF_PROMOTION')
    );

    select count(*) into v_bad_promo_count
    from public.run_competition_rewards_v2(p_source_season,true) r
    where exists(
      select 1 from jsonb_array_elements(r.reward_details) d
      where d->>'code' in ('PRO_PLAYOFF_PROMOTION','CONTINENTAL_PLAYOFF_PROMOTION','AMATEUR_PLAYOFF_PROMOTION')
    )
    and not exists(
      select 1 from public.competition_transition_movements_v1 m
      where m.transition_run_id=v_run and m.club_id=r.club_id and m.phase='sporting' and m.movement_type='playoff_promotion'
    );

    select count(*) into v_structural_promo_count
    from public.run_competition_rewards_v2(p_source_season,true) r
    join public.competition_transition_movements_v1 m on m.transition_run_id=v_run and m.club_id=r.club_id and m.phase in ('structural_fill','structural_trim')
    where exists(
      select 1 from jsonb_array_elements(r.reward_details) d
      where d->>'code' in ('PRO_PLAYOFF_PROMOTION','CONTINENTAL_PLAYOFF_PROMOTION','AMATEUR_PLAYOFF_PROMOTION')
    );

    select count(*) into v_expected_playoff_promos
    from public.competition_transition_movements_v1 m
    where m.transition_run_id=v_run and m.phase='sporting' and m.movement_type='playoff_promotion';

    update public.game_state
    set season_number=p_target_season,month_number=1,day_number=1,hour_number=0,minute_number=0
    where id=true;

    select count(*) into v_apply_count from public.apply_competition_rewards_v1(p_source_season);
    select count(*) into v_grant_count from public.club_season_reward_grants where source_season=p_source_season;
    select count(*) into v_guard_count from public.season_reward_guard where source_season=p_source_season;

    select coalesce(sum(balance),0) into v_wallet_after_sum from public.user_wallets;
    v_wallet_delta:=v_wallet_after_sum-v_before_wallet_sum;

    select count(*) into v_nonrecipient_cash_changed
    from jsonb_each_text(v_before_cash_map) e
    join finance.accounts a on a.club_id=e.key::uuid and a.currency='CASH' and a.kind='main'
    left join finance.account_balances b on b.account_id=a.id
    where coalesce(b.balance,0)<>e.value::bigint
      and not exists(
        select 1 from public.club_season_reward_grants g
        where g.source_season=p_source_season and g.club_id=a.club_id and g.cash_total>0
      );

    select count(*) into v_nonrecipient_wallet_changed
    from jsonb_each_text(v_before_wallet_map) e
    join public.user_wallets w on w.user_id=e.key::uuid
    where w.balance<>e.value::bigint
      and not exists(
        select 1 from public.club_season_reward_grants g
        join public.clubs c on c.id=g.club_id
        where g.source_season=p_source_season and c.owner_user_id=w.user_id and g.coin_total>0
      );

    select count(*),coalesce(sum(outstanding_principal),0) into v_loan_count_after,v_loan_outstanding_after from finance.emergency_loans;

    begin
      perform public.apply_competition_rewards_v1(p_source_season);
    exception when others then
      if position('already applied' in lower(sqlerrm))>0 or position('already exist' in lower(sqlerrm))>0 then
        v_second_apply_blocked:=true;
      else
        raise;
      end if;
    end;

    v_result:=jsonb_build_object(
      'ok',v_preview_count>0
        and v_world_reward_count=6
        and v_world_winner_cash>=3000000
        and v_bad_promo_count=0
        and v_structural_promo_count=0
        and v_promo_reward_count=v_expected_playoff_promos
        and v_apply_count=v_preview_count
        and v_grant_count=v_preview_count
        and v_guard_count=1
        and v_wallet_delta=v_preview_coin_user
        and v_nonrecipient_cash_changed=0
        and v_nonrecipient_wallet_changed=0
        and v_loan_count_after=v_before_loan_count
        and v_loan_outstanding_after=v_before_loan_outstanding
        and v_second_apply_blocked,
      'preview_reward_rows',v_preview_count,
      'preview_gross_cash',v_preview_cash,
      'preview_user_coin_total',v_preview_coin_user,
      'world_reward_rows',v_world_reward_count,
      'world_winner_cash',v_world_winner_cash,
      'playoff_promotion_reward_rows',v_promo_reward_count,
      'sporting_playoff_promotions',v_expected_playoff_promos,
      'bad_promotion_bonus_rows',v_bad_promo_count,
      'structural_fill_promotion_bonus_rows',v_structural_promo_count,
      'applied_grant_rows',v_apply_count,
      'reward_guard_rows',v_guard_count,
      'wallet_delta',v_wallet_delta,
      'nonrecipient_cash_accounts_changed',v_nonrecipient_cash_changed,
      'nonrecipient_wallets_changed',v_nonrecipient_wallet_changed,
      'loans_unchanged',v_loan_count_after=v_before_loan_count and v_loan_outstanding_after=v_before_loan_outstanding,
      'second_apply_blocked',v_second_apply_blocked
    );

    raise exception using errcode='P0198',message='finances_rewards_dry_run_rollback';
  exception when sqlstate 'P0198' then
    if sqlerrm<>'finances_rewards_dry_run_rollback' then raise; end if;
  end;

  select count(*) into v_after_snapshot from public.team_ranking_season_snapshots where season_number=p_source_season;
  select count(*) into v_after_grants from public.club_season_reward_grants where source_season=p_source_season;
  select count(*) into v_after_guard from public.season_reward_guard where source_season=p_source_season;
  select count(*) into v_after_runs from public.season_reward_runs where source_season=p_source_season;
  select coalesce(sum(balance),0) into v_after_wallet_sum from public.user_wallets;
  select count(*),coalesce(sum(outstanding_principal),0) into v_after_loan_count,v_after_loan_outstanding from finance.emergency_loans;
  select coalesce(jsonb_object_agg(a.club_id::text,coalesce(b.balance,0)),'{}'::jsonb)
    into v_after_cash_map
  from finance.accounts a left join finance.account_balances b on b.account_id=a.id
  where a.club_id is not null and a.currency='CASH' and a.kind='main';
  select to_jsonb(gs) into v_after_game from public.game_state gs where id=true;

  return coalesce(v_result,'{}'::jsonb)||jsonb_build_object(
    'production_restored',jsonb_build_object(
      'snapshot_restored',v_after_snapshot=v_before_snapshot,
      'reward_grants_restored',v_after_grants=v_before_grants,
      'reward_guard_restored',v_after_guard=v_before_guard,
      'reward_runs_restored',v_after_runs=v_before_runs,
      'wallets_restored',v_after_wallet_sum=v_before_wallet_sum,
      'cash_accounts_restored',v_after_cash_map=v_before_cash_map,
      'loans_restored',v_after_loan_count=v_before_loan_count and v_after_loan_outstanding=v_before_loan_outstanding,
      'game_state_restored',v_after_game=v_game_before
    )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.run_finances_rewards_season_transition_v1(p_transition_run_id uuid, p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_preview_count integer;
  v_cash bigint;
  v_user_coins integer;
  v_bad_promo integer;
  v_structural_promo integer;
  v_expected_playoff integer;
  v_all_sporting_playoff integer;
  v_removed_playoff integer;
  v_actual_playoff integer;
begin
  if p_target_season<>p_source_season+1 then raise exception 'run_finances_rewards_season_transition_v1: target must equal source+1'; end if;
  if not exists(select 1 from public.season_transition_runs_v1 where id=p_transition_run_id and source_season=p_source_season and target_season=p_target_season and status='running') then
    raise exception 'run_finances_rewards_season_transition_v1: transition run is not running/matching';
  end if;
  if exists(select 1 from public.season_reward_guard where source_season=p_source_season)
     or exists(select 1 from public.club_season_reward_grants where source_season=p_source_season) then
    raise exception 'run_finances_rewards_season_transition_v1: source season rewards were already applied before transition completion';
  end if;

  select count(*),coalesce(sum(cash_total),0),coalesce(sum(coin_total) filter(where owner_user_id is not null),0)
  into v_preview_count,v_cash,v_user_coins
  from public.run_competition_rewards_v2(p_source_season,true);

  select count(*) into v_actual_playoff
  from public.run_competition_rewards_v2(p_source_season,true) r
  where exists(select 1 from jsonb_array_elements(r.reward_details) d where d->>'code' in ('PRO_PLAYOFF_PROMOTION','CONTINENTAL_PLAYOFF_PROMOTION','AMATEUR_PLAYOFF_PROMOTION'));

  select count(*) into v_all_sporting_playoff
  from public.competition_transition_movements_v1 m
  where m.transition_run_id=p_transition_run_id and m.phase='sporting' and m.movement_type='playoff_promotion';

  -- A club removed for season-end inactivity is not a payable reward recipient even if its
  -- sporting result qualified for promotion. The sporting movement remains in history.
  select count(*) into v_expected_playoff
  from public.competition_transition_movements_v1 m
  join public.clubs c on c.id=m.club_id
  where m.transition_run_id=p_transition_run_id and m.phase='sporting' and m.movement_type='playoff_promotion'
    and c.deleted_at is null;

  v_removed_playoff:=v_all_sporting_playoff-v_expected_playoff;

  select count(*) into v_bad_promo
  from public.run_competition_rewards_v2(p_source_season,true) r
  where exists(select 1 from jsonb_array_elements(r.reward_details) d where d->>'code' in ('PRO_PLAYOFF_PROMOTION','CONTINENTAL_PLAYOFF_PROMOTION','AMATEUR_PLAYOFF_PROMOTION'))
    and not exists(select 1 from public.competition_transition_movements_v1 m where m.transition_run_id=p_transition_run_id and m.club_id=r.club_id and m.phase='sporting' and m.movement_type='playoff_promotion');

  select count(*) into v_structural_promo
  from public.run_competition_rewards_v2(p_source_season,true) r
  join public.competition_transition_movements_v1 m on m.transition_run_id=p_transition_run_id and m.club_id=r.club_id and m.phase in ('structural_fill','structural_trim')
  where exists(select 1 from jsonb_array_elements(r.reward_details) d where d->>'code' in ('PRO_PLAYOFF_PROMOTION','CONTINENTAL_PLAYOFF_PROMOTION','AMATEUR_PLAYOFF_PROMOTION'));

  if v_preview_count=0 or v_bad_promo<>0 or v_structural_promo<>0 or v_actual_playoff<>v_expected_playoff then
    raise exception 'run_finances_rewards_season_transition_v1: reward preview failed integrity checks (preview %, actual_playoff %, payable_expected %, all_sporting %, removed %, bad %, structural %)',
      v_preview_count,v_actual_playoff,v_expected_playoff,v_all_sporting_playoff,v_removed_playoff,v_bad_promo,v_structural_promo;
  end if;

  return jsonb_build_object('ok',true,'source_season',p_source_season,'target_season',p_target_season,
    'reward_status','pending_post_transition_apply','preview_reward_rows',v_preview_count,'preview_gross_cash',v_cash,
    'preview_user_coin_total',v_user_coins,'sporting_playoff_promotions_all',v_all_sporting_playoff,
    'sporting_playoff_promotions_payable',v_expected_playoff,'sporting_playoff_promotions_removed_inactive',v_removed_playoff);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_apply_competition_rewards_after_transition_v1(p_source_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_timeline uuid;
  v_target integer:=p_source_season+1;
  v_count integer;
  v_cash bigint;
  v_coins integer;
begin
  if auth.role()<>'service_role' then raise exception 'Only service_role can apply post-transition competition rewards'; end if;
  select timeline_id into v_timeline from public.season_transition_control_v1 where id=true;
  if not exists(
    select 1 from public.season_transition_runs_v1
    where timeline_id=v_timeline and source_season=p_source_season and target_season=v_target and status='completed'
  ) then
    raise exception 'No completed current-timeline transition exists for Season % -> %',p_source_season,v_target;
  end if;
  if coalesce(public.get_current_season_number(),0)<v_target then
    raise exception 'Current game season has not reached Season %',v_target;
  end if;
  if exists(select 1 from public.season_reward_guard where source_season=p_source_season) then
    select count(*),coalesce(sum(cash_total),0),coalesce(sum(coin_total),0)
      into v_count,v_cash,v_coins from public.club_season_reward_grants where source_season=p_source_season;
    return jsonb_build_object('ok',true,'status','already_applied','source_season',p_source_season,'grant_rows',v_count,'gross_cash',v_cash,'coin_total',v_coins);
  end if;

  select count(*),coalesce(sum(cash_total),0),coalesce(sum(coin_total) filter(where owner_user_id is not null),0)
    into v_count,v_cash,v_coins from public.run_competition_rewards_v2(p_source_season,true);
  if v_count=0 then raise exception 'Reward preview is empty for source season %',p_source_season; end if;

  perform public.apply_competition_rewards_v1(p_source_season);

  return jsonb_build_object('ok',true,'status','applied','source_season',p_source_season,
    'grant_rows',(select count(*) from public.club_season_reward_grants where source_season=p_source_season),
    'gross_cash',(select coalesce(sum(cash_total),0) from public.club_season_reward_grants where source_season=p_source_season),
    'coin_total_to_users',v_coins);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.run_post_season_transition_notifications_v1(p_transition_run_id uuid, p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
  v_created_season integer:=0;
  v_created_movement integer:=0;
  v_created_rider_contract integer:=0;
  v_created_staff_contract integer:=0;
  v_errors integer:=0;
  v_before bigint;
  v_after bigint;
  v_inbox jsonb;
  v_retirement_count integer:=0;
  v_sponsor_count integer:=0;
  v_developing_window_count integer:=0;
  v_developing_age_count integer:=0;
begin
  if p_target_season<>p_source_season+1 then raise exception 'run_post_season_transition_notifications_v1: target must equal source+1'; end if;
  if not exists(
    select 1 from public.season_transition_runs_v1
    where id=p_transition_run_id and source_season=p_source_season and target_season=p_target_season and status='completed'
  ) then raise exception 'run_post_season_transition_notifications_v1: completed transition run not found'; end if;

  -- One Season Started notification per surviving user-managed main club.
  for r in
    select distinct c.owner_user_id as user_id,c.id as club_id,c.name as club_name
    from public.clubs c
    where c.owner_user_id is not null and coalesce(c.club_type,'main')='main' and c.deleted_at is null
  loop
    begin
      select count(*) into v_before from public.user_notifications un join public.notifications n on n.id=un.notification_id
      where un.user_id=r.user_id and un.deleted_at is null and n.payload_json->>'event_key'=format('season_started:%s:%s',p_transition_run_id,r.club_id);
      perform public.create_user_game_notification_v1(
        r.user_id,'SEASON_STARTED',format('Season %s has started',p_target_season),
        format('Season %s is now underway. Review %s, your new competition, contracts, sponsors and season objectives.',p_target_season,r.club_name),
        '/dashboard/overview',jsonb_build_object('transition_run_id',p_transition_run_id,'source_season',p_source_season,'target_season',p_target_season,'club_id',r.club_id,'club_name',r.club_name),
        format('season_started:%s:%s',p_transition_run_id,r.club_id),null);
      select count(*) into v_after from public.user_notifications un join public.notifications n on n.id=un.notification_id
      where un.user_id=r.user_id and un.deleted_at is null and n.payload_json->>'event_key'=format('season_started:%s:%s',p_transition_run_id,r.club_id);
      if v_before=0 and v_after=1 then v_created_season:=v_created_season+1; end if;
    exception when others then v_errors:=v_errors+1; end;
  end loop;

  -- Sporting promotion/relegation outcomes only; structural administrative balancing is never user-facing sporting success.
  for r in
    select m.*,coalesce(c.owner_user_id,parent.owner_user_id) as user_id
    from public.competition_transition_movements_v1 m
    join public.clubs c on c.id=m.club_id
    left join public.clubs parent on parent.id=c.parent_club_id
    where m.transition_run_id=p_transition_run_id and m.phase='sporting'
      and m.movement_type in ('direct_promotion','playoff_promotion','relegated')
      and coalesce(c.owner_user_id,parent.owner_user_id) is not null
      and c.deleted_at is null
  loop
    begin
      if r.movement_type in ('direct_promotion','playoff_promotion') then
        perform public.create_user_game_notification_v1(
          r.user_id,'TEAM_PROMOTED',format('%s promoted',r.club_name),
          format('%s has been promoted from %s to %s for Season %s.',r.club_name,r.source_tier,r.target_tier,p_target_season),
          '/dashboard/overview',jsonb_build_object('transition_run_id',p_transition_run_id,'club_id',r.club_id,'club_name',r.club_name,'source_season',p_source_season,'target_season',p_target_season,'movement_type',r.movement_type,'source_tier',r.source_tier,'source_division',r.source_division,'target_tier',r.target_tier,'target_division',r.target_division,'playoff_pool',r.playoff_pool,'playoff_pool_rank',r.playoff_pool_rank),
          format('season_transition:%s:club:%s:promoted',p_transition_run_id,r.club_id),null);
      else
        perform public.create_user_game_notification_v1(
          r.user_id,'TEAM_RELEGATED',format('%s relegated',r.club_name),
          format('%s has been relegated from %s to %s for Season %s.',r.club_name,r.source_tier,r.target_tier,p_target_season),
          '/dashboard/overview',jsonb_build_object('transition_run_id',p_transition_run_id,'club_id',r.club_id,'club_name',r.club_name,'source_season',p_source_season,'target_season',p_target_season,'movement_type',r.movement_type,'source_tier',r.source_tier,'source_division',r.source_division,'target_tier',r.target_tier,'target_division',r.target_division),
          format('season_transition:%s:club:%s:relegated',p_transition_run_id,r.club_id),null);
      end if;
      v_created_movement:=v_created_movement+1;
    exception when others then v_errors:=v_errors+1; end;
  end loop;

  -- One rider-contract expiry summary per surviving user organization/club.
  for r in
    select coalesce(c.owner_user_id,parent.owner_user_id) as user_id,a.club_id,c.name as club_name,
           count(*)::integer as expired_count,
           jsonb_agg(jsonb_build_object('rider_id',a.rider_id,'contract_id',a.contract_id) order by a.rider_id) as riders
    from public.rider_contract_transition_audit_v1 a
    join public.clubs c on c.id=a.club_id
    left join public.clubs parent on parent.id=c.parent_club_id
    where a.transition_run_id=p_transition_run_id and a.action='contract_expired'
      and coalesce(c.owner_user_id,parent.owner_user_id) is not null and c.deleted_at is null
    group by coalesce(c.owner_user_id,parent.owner_user_id),a.club_id,c.name
  loop
    begin
      perform public.create_user_game_notification_v1(
        r.user_id,'SEASON_RIDER_CONTRACTS_EXPIRED','Rider contracts expired',
        format('%s rider contract%s expired at the end of Season %s. Unsigned eligible riders are now free agents.',r.expired_count,case when r.expired_count=1 then '' else 's' end,p_source_season),
        '/dashboard/squad',jsonb_build_object('transition_run_id',p_transition_run_id,'club_id',r.club_id,'club_name',r.club_name,'source_season',p_source_season,'target_season',p_target_season,'expired_count',r.expired_count,'riders',r.riders),
        format('season_transition:%s:club:%s:rider_contracts_expired',p_transition_run_id,r.club_id),null);
      v_created_rider_contract:=v_created_rider_contract+1;
    exception when others then v_errors:=v_errors+1; end;
  end loop;

  -- One staff-contract expiry summary per surviving user organization/club.
  for r in
    select coalesce(c.owner_user_id,parent.owner_user_id) as user_id,a.club_id,c.name as club_name,
           count(*)::integer as expired_count,
           jsonb_agg(jsonb_build_object('staff_id',a.staff_id) order by a.staff_id) as staff
    from public.staff_contract_transition_audit_v1 a
    join public.clubs c on c.id=a.club_id
    left join public.clubs parent on parent.id=c.parent_club_id
    where a.transition_run_id=p_transition_run_id and a.action='staff_contract_expired'
      and coalesce(c.owner_user_id,parent.owner_user_id) is not null and c.deleted_at is null
    group by coalesce(c.owner_user_id,parent.owner_user_id),a.club_id,c.name
  loop
    begin
      perform public.create_user_game_notification_v1(
        r.user_id,'SEASON_STAFF_CONTRACTS_EXPIRED','Staff contracts expired',
        format('%s staff contract%s expired at the end of Season %s. Eligible staff have returned to the staff market.',r.expired_count,case when r.expired_count=1 then '' else 's' end,p_source_season),
        '/dashboard/staff',jsonb_build_object('transition_run_id',p_transition_run_id,'club_id',r.club_id,'club_name',r.club_name,'source_season',p_source_season,'target_season',p_target_season,'expired_count',r.expired_count,'staff',r.staff),
        format('season_transition:%s:club:%s:staff_contracts_expired',p_transition_run_id,r.club_id),null);
      v_created_staff_contract:=v_created_staff_contract+1;
    exception when others then v_errors:=v_errors+1; end;
  end loop;

  -- Existing component notifications: verify, do not duplicate.
  select count(distinct un.notification_id)::int into v_retirement_count
  from public.user_notifications un join public.notifications n on n.id=un.notification_id join public.notification_types nt on nt.id=n.type_id
  where un.deleted_at is null and nt.code='SEASON_RETIREMENTS_CONFIRMED' and n.payload_json->>'season_number'=p_source_season::text;
  select count(distinct un.notification_id)::int into v_sponsor_count
  from public.user_notifications un join public.notifications n on n.id=un.notification_id join public.notification_types nt on nt.id=n.type_id
  where un.deleted_at is null and nt.code='SPONSOR_SELECTION_REQUIRED' and n.payload_json->>'season_number'=p_target_season::text;
  select count(distinct un.notification_id)::int into v_developing_window_count
  from public.user_notifications un join public.notifications n on n.id=un.notification_id join public.notification_types nt on nt.id=n.type_id
  where un.deleted_at is null and nt.code='DEVELOPING_TEAM_WINDOW_OPEN' and n.payload_json->>'window_start_game_date'=make_date(1999+p_target_season,1,1)::text;
  select count(distinct un.notification_id)::int into v_developing_age_count
  from public.user_notifications un join public.notifications n on n.id=un.notification_id join public.notification_types nt on nt.id=n.type_id
  where un.deleted_at is null and nt.code='DEVELOPING_RIDER_AGE_LIMIT_REACHED' and n.payload_json->>'required_window_start_game_date'=make_date(1999+p_target_season,1,1)::text;

  begin
    v_inbox:=public.inbox_send_season_start_if_due();
  exception when others then
    v_errors:=v_errors+1;
    v_inbox:=jsonb_build_object('ok',false,'error',sqlerrm);
  end;

  return jsonb_build_object('ok',v_errors=0,'transition_run_id',p_transition_run_id,
    'season_started_created',v_created_season,'movement_notifications_attempted',v_created_movement,
    'rider_contract_summary_attempts',v_created_rider_contract,'staff_contract_summary_attempts',v_created_staff_contract,
    'retirement_notifications_present',v_retirement_count,'sponsor_selection_notifications_present',v_sponsor_count,
    'developing_window_notifications_present',v_developing_window_count,'developing_age_notifications_present',v_developing_age_count,
    'season_start_inbox',v_inbox,'errors',v_errors);
end;
$function$
;

