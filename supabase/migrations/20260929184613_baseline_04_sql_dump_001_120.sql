set check_function_bodies = false;
CREATE OR REPLACE FUNCTION public.get_my_club_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  select c.id
  from public.clubs c
  where c.owner_user_id = auth.uid()
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_game_time()
 RETURNS TABLE(season_number integer, month_name text, day_number integer, hour_24 integer, minute_2 integer, display_text text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with ts as (
    select public.get_current_game_timestamp() as game_ts
  )
  select
    public.season_from_game_date(game_ts::date) as season_number,
    trim(to_char(game_ts, 'FMMonth')) as month_name,
    extract(day from game_ts)::int as day_number,
    extract(hour from game_ts)::int as hour_24,
    extract(minute from game_ts)::int as minute_2,
    format(
      'Season %s · %s %s · %s:%s',
      public.season_from_game_date(game_ts::date),
      trim(to_char(game_ts, 'FMMonth')),
      extract(day from game_ts)::int,
      lpad(extract(hour from game_ts)::int::text, 2, '0'),
      lpad(extract(minute from game_ts)::int::text, 2, '0')
    ) as display_text
  from ts;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_unread_notification_count()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select count(*)::integer
  from public.user_notifications
  where user_id = auth.uid()
    and status = 'unread'
    and deleted_at is null;
$function$
;

CREATE OR REPLACE FUNCTION public.finance_get_club_statement(p_club_id uuid, p_limit integer DEFAULT 200, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(created_at timestamp with time zone, transaction_id uuid, type text, net_amount bigint, metadata jsonb)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with restart_boundary as (
    select max(h.created_at) as restarted_at
    from public.club_restart_history h where h.club_id=p_club_id
  )
  select t.created_at,t.id,t.type,sum(e.amount),t.metadata
  from finance.transactions t
  join finance.entries e on e.transaction_id=t.id
  join finance.accounts a on a.id=e.account_id
  left join finance.transaction_types tt on tt.code=t.type
  cross join restart_boundary rb
  where a.club_id=p_club_id
    and a.currency='CASH' and a.kind='main'
    and finance.is_club_member_or_owner(p_club_id,auth.uid())
    and coalesce(tt.is_user_visible,true)=true
    and not exists(select 1 from finance.transaction_voids tv where tv.source_transaction_id=t.id)
    and (p_before is null or t.created_at<p_before)
    and t.created_at>coalesce(rb.restarted_at,'-infinity'::timestamptz)
  group by t.created_at,t.id,t.type,t.metadata
  order by t.created_at desc
  limit greatest(p_limit,1);
$function$
;

CREATE OR REPLACE FUNCTION public.finance_get_club_statement_v2(p_club_id uuid, p_limit integer DEFAULT 200, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(created_at timestamp with time zone, transaction_id uuid, type text, type_name text, category text, net_amount bigint, metadata jsonb)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with restart_boundary as (
    select max(h.created_at) as restarted_at
    from public.club_restart_history h where h.club_id=p_club_id
  )
  select t.created_at,t.id,t.type,coalesce(tt.name,t.type),coalesce(tt.category,'unknown'),sum(e.amount),t.metadata
  from finance.transactions t
  join finance.entries e on e.transaction_id=t.id
  join finance.accounts a on a.id=e.account_id
  left join finance.transaction_types tt on tt.code=t.type
  cross join restart_boundary rb
  where a.club_id=p_club_id
    and a.currency='CASH' and a.kind='main'
    and finance.is_club_member_or_owner(p_club_id,auth.uid())
    and coalesce(tt.is_user_visible,true)=true
    and not exists(select 1 from finance.transaction_voids tv where tv.source_transaction_id=t.id)
    and (p_before is null or t.created_at<p_before)
    and t.created_at>coalesce(rb.restarted_at,'-infinity'::timestamptz)
  group by t.created_at,t.id,t.type,tt.name,tt.category,t.metadata
  order by t.created_at desc
  limit greatest(p_limit,1);
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_coin_status()
 RETURNS TABLE(balance integer, can_play boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    COALESCE(uw.balance, 0)::integer AS balance,
    true::boolean AS can_play
  FROM auth.users AS au
  LEFT JOIN public.user_wallets AS uw
    ON uw.user_id = au.id
  WHERE au.id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.rand_int(min_val integer, max_val integer)
 RETURNS integer
 LANGUAGE sql
 STABLE
AS $function$
  select floor(random() * (greatest(max_val, min_val) - least(max_val, min_val) + 1))::int
       + least(max_val, min_val);
$function$
;

CREATE OR REPLACE FUNCTION public.get_current_season_number()
 RETURNS integer
 LANGUAGE sql
 STABLE
AS $function$
  select season_number
  from public.game_state
  where id = true
$function$
;

CREATE OR REPLACE FUNCTION public.get_season_number_for_game_date(p_game_date date)
 RETURNS integer
 LANGUAGE sql
 STABLE
AS $function$
  select public.season_from_game_date(p_game_date);
$function$
;

CREATE OR REPLACE FUNCTION public.get_game_date_for_season_start(p_season integer)
 RETURNS date
 LANGUAGE sql
 STABLE
AS $function$
  select public.game_date_from_parts(p_season, 1, 1);
$function$
;

CREATE OR REPLACE FUNCTION public.get_game_date_for_season_end(p_season integer)
 RETURNS date
 LANGUAGE sql
 STABLE
AS $function$
  select public.game_date_from_parts(p_season, 12, 31);
$function$
;

CREATE OR REPLACE FUNCTION public.get_amateur_division_for_country(p_country_code text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
select case upper(trim(p_country_code))
  -- NORTH AMERICA / CARIBBEAN / CENTRAL AMERICA
  when 'US' then 'NORTH_AMERICA'
  when 'CA' then 'NORTH_AMERICA'
  when 'MX' then 'NORTH_AMERICA'
  when 'BS' then 'NORTH_AMERICA'
  when 'CU' then 'NORTH_AMERICA'
  when 'DO' then 'NORTH_AMERICA'
  when 'HT' then 'NORTH_AMERICA'
  when 'JM' then 'NORTH_AMERICA'
  when 'TT' then 'NORTH_AMERICA'
  when 'CR' then 'NORTH_AMERICA'
  when 'PA' then 'NORTH_AMERICA'
  when 'DM' then 'NORTH_AMERICA'
  when 'CW' then 'NORTH_AMERICA'
  when 'KY' then 'NORTH_AMERICA'
  when 'PR' then 'NORTH_AMERICA'
  when 'AW' then 'NORTH_AMERICA'
  when 'BB' then 'NORTH_AMERICA'
  when 'BZ' then 'NORTH_AMERICA'
  when 'GT' then 'NORTH_AMERICA'

  -- SOUTH AMERICA
  when 'AR' then 'SOUTH_AMERICA'
  when 'BR' then 'SOUTH_AMERICA'
  when 'CL' then 'SOUTH_AMERICA'
  when 'CO' then 'SOUTH_AMERICA'
  when 'PE' then 'SOUTH_AMERICA'
  when 'VE' then 'SOUTH_AMERICA'
  when 'UY' then 'SOUTH_AMERICA'
  when 'PY' then 'SOUTH_AMERICA'
  when 'BO' then 'SOUTH_AMERICA'
  when 'EC' then 'SOUTH_AMERICA'

  -- WESTERN EUROPE
  when 'GB' then 'WESTERN_EUROPE'
  when 'IE' then 'WESTERN_EUROPE'
  when 'FR' then 'WESTERN_EUROPE'
  when 'BE' then 'WESTERN_EUROPE'
  when 'NL' then 'WESTERN_EUROPE'
  when 'LU' then 'WESTERN_EUROPE'
  when 'MC' then 'WESTERN_EUROPE'
  when 'ES' then 'WESTERN_EUROPE'
  when 'PT' then 'WESTERN_EUROPE'
  when 'AD' then 'WESTERN_EUROPE'
  when 'GI' then 'WESTERN_EUROPE'

  -- CENTRAL EUROPE
  when 'DE' then 'CENTRAL_EUROPE'
  when 'CH' then 'CENTRAL_EUROPE'
  when 'AT' then 'CENTRAL_EUROPE'
  when 'LI' then 'CENTRAL_EUROPE'
  when 'PL' then 'CENTRAL_EUROPE'
  when 'CZ' then 'CENTRAL_EUROPE'
  when 'SK' then 'CENTRAL_EUROPE'
  when 'HU' then 'CENTRAL_EUROPE'

  -- SOUTHERN / BALKAN EUROPE
  when 'IT' then 'SOUTHERN_BALKAN_EUROPE'
  when 'SM' then 'SOUTHERN_BALKAN_EUROPE'
  when 'MT' then 'SOUTHERN_BALKAN_EUROPE'
  when 'HR' then 'SOUTHERN_BALKAN_EUROPE'
  when 'SI' then 'SOUTHERN_BALKAN_EUROPE'
  when 'BA' then 'SOUTHERN_BALKAN_EUROPE'
  when 'RS' then 'SOUTHERN_BALKAN_EUROPE'
  when 'ME' then 'SOUTHERN_BALKAN_EUROPE'
  when 'XK' then 'SOUTHERN_BALKAN_EUROPE'
  when 'MK' then 'SOUTHERN_BALKAN_EUROPE'
  when 'AL' then 'SOUTHERN_BALKAN_EUROPE'
  when 'GR' then 'SOUTHERN_BALKAN_EUROPE'
  when 'CY' then 'SOUTHERN_BALKAN_EUROPE'
  when 'RO' then 'SOUTHERN_BALKAN_EUROPE'
  when 'BG' then 'SOUTHERN_BALKAN_EUROPE'
  when 'MD' then 'SOUTHERN_BALKAN_EUROPE'

  -- NORTHERN / EASTERN EUROPE
  when 'DK' then 'NORTHERN_EASTERN_EUROPE'
  when 'SE' then 'NORTHERN_EASTERN_EUROPE'
  when 'NO' then 'NORTHERN_EASTERN_EUROPE'
  when 'FI' then 'NORTHERN_EASTERN_EUROPE'
  when 'IS' then 'NORTHERN_EASTERN_EUROPE'
  when 'EE' then 'NORTHERN_EASTERN_EUROPE'
  when 'LV' then 'NORTHERN_EASTERN_EUROPE'
  when 'LT' then 'NORTHERN_EASTERN_EUROPE'
  when 'UA' then 'NORTHERN_EASTERN_EUROPE'
  when 'BY' then 'NORTHERN_EASTERN_EUROPE'
  when 'RU' then 'NORTHERN_EASTERN_EUROPE'
  when 'GE' then 'NORTHERN_EASTERN_EUROPE'
  when 'AM' then 'NORTHERN_EASTERN_EUROPE'
  when 'AZ' then 'NORTHERN_EASTERN_EUROPE'

  -- WEST / NORTH AFRICA
  when 'MA' then 'WEST_NORTH_AFRICA'
  when 'DZ' then 'WEST_NORTH_AFRICA'
  when 'TN' then 'WEST_NORTH_AFRICA'
  when 'LY' then 'WEST_NORTH_AFRICA'
  when 'EG' then 'WEST_NORTH_AFRICA'
  when 'SN' then 'WEST_NORTH_AFRICA'
  when 'GM' then 'WEST_NORTH_AFRICA'
  when 'GN' then 'WEST_NORTH_AFRICA'
  when 'GW' then 'WEST_NORTH_AFRICA'
  when 'SL' then 'WEST_NORTH_AFRICA'
  when 'LR' then 'WEST_NORTH_AFRICA'
  when 'ML' then 'WEST_NORTH_AFRICA'
  when 'NE' then 'WEST_NORTH_AFRICA'
  when 'BF' then 'WEST_NORTH_AFRICA'
  when 'TG' then 'WEST_NORTH_AFRICA'
  when 'BJ' then 'WEST_NORTH_AFRICA'
  when 'GH' then 'WEST_NORTH_AFRICA'
  when 'NG' then 'WEST_NORTH_AFRICA'
  when 'CV' then 'WEST_NORTH_AFRICA'
  when 'MR' then 'WEST_NORTH_AFRICA'

  -- CENTRAL / SOUTH AFRICA
  when 'CM' then 'CENTRAL_SOUTH_AFRICA'
  when 'CF' then 'CENTRAL_SOUTH_AFRICA'
  when 'CG' then 'CENTRAL_SOUTH_AFRICA'
  when 'CD' then 'CENTRAL_SOUTH_AFRICA'
  when 'GA' then 'CENTRAL_SOUTH_AFRICA'
  when 'SD' then 'CENTRAL_SOUTH_AFRICA'
  when 'SS' then 'CENTRAL_SOUTH_AFRICA'
  when 'ET' then 'CENTRAL_SOUTH_AFRICA'
  when 'KE' then 'CENTRAL_SOUTH_AFRICA'
  when 'TZ' then 'CENTRAL_SOUTH_AFRICA'
  when 'UG' then 'CENTRAL_SOUTH_AFRICA'
  when 'RW' then 'CENTRAL_SOUTH_AFRICA'
  when 'BI' then 'CENTRAL_SOUTH_AFRICA'
  when 'AO' then 'CENTRAL_SOUTH_AFRICA'
  when 'NA' then 'CENTRAL_SOUTH_AFRICA'
  when 'BW' then 'CENTRAL_SOUTH_AFRICA'
  when 'ZA' then 'CENTRAL_SOUTH_AFRICA'
  when 'LS' then 'CENTRAL_SOUTH_AFRICA'
  when 'SZ' then 'CENTRAL_SOUTH_AFRICA'
  when 'ZM' then 'CENTRAL_SOUTH_AFRICA'
  when 'ZW' then 'CENTRAL_SOUTH_AFRICA'
  when 'MW' then 'CENTRAL_SOUTH_AFRICA'
  when 'MZ' then 'CENTRAL_SOUTH_AFRICA'
  when 'MG' then 'CENTRAL_SOUTH_AFRICA'
  when 'MU' then 'CENTRAL_SOUTH_AFRICA'
  when 'SC' then 'CENTRAL_SOUTH_AFRICA'

  -- WEST / CENTRAL ASIA
  when 'TR' then 'WEST_CENTRAL_ASIA'
  when 'IR' then 'WEST_CENTRAL_ASIA'
  when 'IQ' then 'WEST_CENTRAL_ASIA'
  when 'SY' then 'WEST_CENTRAL_ASIA'
  when 'LB' then 'WEST_CENTRAL_ASIA'
  when 'IL' then 'WEST_CENTRAL_ASIA'
  when 'PS' then 'WEST_CENTRAL_ASIA'
  when 'JO' then 'WEST_CENTRAL_ASIA'
  when 'KW' then 'WEST_CENTRAL_ASIA'
  when 'QA' then 'WEST_CENTRAL_ASIA'
  when 'SA' then 'WEST_CENTRAL_ASIA'
  when 'AE' then 'WEST_CENTRAL_ASIA'
  when 'OM' then 'WEST_CENTRAL_ASIA'
  when 'YE' then 'WEST_CENTRAL_ASIA'
  when 'KZ' then 'WEST_CENTRAL_ASIA'
  when 'UZ' then 'WEST_CENTRAL_ASIA'
  when 'TM' then 'WEST_CENTRAL_ASIA'
  when 'KG' then 'WEST_CENTRAL_ASIA'
  when 'TJ' then 'WEST_CENTRAL_ASIA'
  when 'BH' then 'WEST_CENTRAL_ASIA'

  -- SOUTH ASIA
  when 'IN' then 'SOUTH_ASIA'
  when 'PK' then 'SOUTH_ASIA'
  when 'BD' then 'SOUTH_ASIA'
  when 'NP' then 'SOUTH_ASIA'
  when 'LK' then 'SOUTH_ASIA'
  when 'MV' then 'SOUTH_ASIA'

  -- EAST / SOUTHEAST ASIA
  when 'CN' then 'EAST_SOUTHEAST_ASIA'
  when 'JP' then 'EAST_SOUTHEAST_ASIA'
  when 'KR' then 'EAST_SOUTHEAST_ASIA'
  when 'MN' then 'EAST_SOUTHEAST_ASIA'
  when 'TH' then 'EAST_SOUTHEAST_ASIA'
  when 'VN' then 'EAST_SOUTHEAST_ASIA'
  when 'KH' then 'EAST_SOUTHEAST_ASIA'
  when 'LA' then 'EAST_SOUTHEAST_ASIA'
  when 'MM' then 'EAST_SOUTHEAST_ASIA'
  when 'MY' then 'EAST_SOUTHEAST_ASIA'
  when 'SG' then 'EAST_SOUTHEAST_ASIA'
  when 'BN' then 'EAST_SOUTHEAST_ASIA'
  when 'ID' then 'EAST_SOUTHEAST_ASIA'
  when 'PH' then 'EAST_SOUTHEAST_ASIA'
  when 'HK' then 'EAST_SOUTHEAST_ASIA'
  when 'TW' then 'EAST_SOUTHEAST_ASIA'

  -- OCEANIA
  when 'AU' then 'OCEANIA'
  when 'NZ' then 'OCEANIA'
  when 'FJ' then 'OCEANIA'
  when 'WS' then 'OCEANIA'
  when 'PG' then 'OCEANIA'
  when 'NC' then 'OCEANIA'
  when 'TO' then 'OCEANIA'
  when 'AS' then 'OCEANIA'
  when 'PF' then 'OCEANIA'
  when 'VU' then 'OCEANIA'

  else null
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_expected_tier3_division_for_country(p_country_code text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
select case public.get_amateur_division_for_country(p_country_code)
  when 'WESTERN_EUROPE' then 'CONTINENTAL_EUROPE'
  when 'CENTRAL_EUROPE' then 'CONTINENTAL_EUROPE'
  when 'SOUTHERN_BALKAN_EUROPE' then 'CONTINENTAL_EUROPE'
  when 'NORTHERN_EASTERN_EUROPE' then 'CONTINENTAL_EUROPE'

  when 'NORTH_AMERICA' then 'CONTINENTAL_AMERICA'
  when 'SOUTH_AMERICA' then 'CONTINENTAL_AMERICA'

  when 'WEST_NORTH_AFRICA' then 'CONTINENTAL_AFRICA'
  when 'CENTRAL_SOUTH_AFRICA' then 'CONTINENTAL_AFRICA'

  when 'WEST_CENTRAL_ASIA' then 'CONTINENTAL_ASIA'
  when 'SOUTH_ASIA' then 'CONTINENTAL_ASIA'
  when 'EAST_SOUTHEAST_ASIA' then 'CONTINENTAL_ASIA'

  when 'OCEANIA' then 'CONTINENTAL_OCEANIA'
  else null
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_expected_tier2_division_for_country(p_country_code text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
select case public.get_amateur_division_for_country(p_country_code)
  when 'WESTERN_EUROPE' then 'PRO_WEST'
  when 'CENTRAL_EUROPE' then 'PRO_WEST'
  when 'SOUTHERN_BALKAN_EUROPE' then 'PRO_WEST'
  when 'NORTHERN_EASTERN_EUROPE' then 'PRO_WEST'
  when 'NORTH_AMERICA' then 'PRO_WEST'
  when 'SOUTH_AMERICA' then 'PRO_WEST'

  when 'WEST_NORTH_AFRICA' then 'PRO_EAST'
  when 'CENTRAL_SOUTH_AFRICA' then 'PRO_EAST'
  when 'WEST_CENTRAL_ASIA' then 'PRO_EAST'
  when 'SOUTH_ASIA' then 'PRO_EAST'
  when 'EAST_SOUTHEAST_ASIA' then 'PRO_EAST'
  when 'OCEANIA' then 'PRO_EAST'
  else null
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_current_game_date_parts()
 RETURNS TABLE(current_game_date date, season_number integer, month_number integer, day_number integer)
 LANGUAGE sql
 STABLE
AS $function$
  select
    public.game_date_from_parts(gs.season_number, gs.month_number, gs.day_number) as current_game_date,
    gs.season_number,
    gs.month_number::integer,
    gs.day_number::integer
  from public.game_state gs
  where gs.id = true
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_current_game_date()
 RETURNS TABLE(season_number integer, month_number smallint, day_number smallint)
 LANGUAGE sql
 STABLE
AS $function$
  select
    gs.season_number,
    gs.month_number,
    gs.day_number
  from public.game_state gs
  where gs.id = true
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_current_game_date_date()
 RETURNS date
 LANGUAGE sql
 STABLE
AS $function$
  select public.game_date_from_parts(
    gs.season_number,
    gs.month_number,
    gs.day_number
  )
  from public.game_state gs
  where gs.id = true
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_team_ranking_past_winners(p_division text)
 RETURNS TABLE(season_number integer, club_id uuid, club_name text, country_code text, points integer, logo_path text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    w.season_number,
    w.club_id,
    w.club_name,
    w.country_code,
    w.points,
    c.logo_path
  from public.team_ranking_past_winners w
  left join public.clubs c
    on c.id = w.club_id
  where w.division = p_division
  order by w.season_number desc;
$function$
;

CREATE OR REPLACE FUNCTION public.get_club_ranking_summary(p_club_id uuid)
 RETURNS TABLE(competition_label text, rank_position integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

  select
    standing.competition_label,
    standing.rank_position

  from public.get_club_competition_standing_canonical_v1(
    p_club_id
  ) standing

  limit 1;

$function$
;

CREATE OR REPLACE FUNCTION public.get_current_game_month()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select gs.month_number
     from public.game_state gs
     limit 1),
    1
  );
$function$
;

CREATE OR REPLACE FUNCTION public.finance_get_club_statement_admin(p_club_id uuid, p_limit integer DEFAULT 200, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(created_at timestamp with time zone, transaction_id uuid, type text, type_name text, category text, net_amount bigint, metadata jsonb)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with restart_boundary as (
    select max(h.created_at) as restarted_at
    from public.club_restart_history h
    where h.club_id = p_club_id
  )
  select
    t.created_at,
    t.id as transaction_id,
    t.type,
    coalesce(tt.name, t.type) as type_name,
    coalesce(tt.category, 'unknown') as category,
    sum(e.amount) as net_amount,
    t.metadata
  from finance.transactions t
  join finance.entries e
    on e.transaction_id = t.id
  join finance.accounts a
    on a.id = e.account_id
  left join finance.transaction_types tt
    on tt.code = t.type
  cross join restart_boundary rb
  where a.club_id = p_club_id
    and a.currency = 'CASH'
    and a.kind = 'main'
    and (p_before is null or t.created_at < p_before)
    and t.created_at > coalesce(rb.restarted_at, '-infinity'::timestamptz)
  group by t.created_at, t.id, t.type, tt.name, tt.category, t.metadata
  order by t.created_at desc
  limit greatest(p_limit, 1);
$function$
;

CREATE OR REPLACE FUNCTION public.get_country_region(p_country_code text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case upper(coalesce(p_country_code, ''))
    when 'AL' then 'Europe'
    when 'AD' then 'Europe'
    when 'AT' then 'Europe'
    when 'BA' then 'Europe'
    when 'BE' then 'Europe'
    when 'BG' then 'Europe'
    when 'BY' then 'Europe'
    when 'CH' then 'Europe'
    when 'CY' then 'Europe'
    when 'CZ' then 'Europe'
    when 'DE' then 'Europe'
    when 'DK' then 'Europe'
    when 'EE' then 'Europe'
    when 'ES' then 'Europe'
    when 'FI' then 'Europe'
    when 'FR' then 'Europe'
    when 'GB' then 'Europe'
    when 'GR' then 'Europe'
    when 'HR' then 'Europe'
    when 'HU' then 'Europe'
    when 'IE' then 'Europe'
    when 'IS' then 'Europe'
    when 'IT' then 'Europe'
    when 'LT' then 'Europe'
    when 'LU' then 'Europe'
    when 'LV' then 'Europe'
    when 'ME' then 'Europe'
    when 'MK' then 'Europe'
    when 'MT' then 'Europe'
    when 'NL' then 'Europe'
    when 'NO' then 'Europe'
    when 'PL' then 'Europe'
    when 'PT' then 'Europe'
    when 'RO' then 'Europe'
    when 'RS' then 'Europe'
    when 'SE' then 'Europe'
    when 'SI' then 'Europe'
    when 'SK' then 'Europe'
    when 'SM' then 'Europe'
    when 'UA' then 'Europe'

    when 'US' then 'North America'
    when 'CA' then 'North America'
    when 'MX' then 'North America'
    when 'CR' then 'North America'
    when 'CU' then 'North America'
    when 'DO' then 'North America'
    when 'GT' then 'North America'
    when 'HN' then 'North America'
    when 'JM' then 'North America'
    when 'NI' then 'North America'
    when 'PA' then 'North America'
    when 'SV' then 'North America'
    when 'TT' then 'North America'

    when 'AR' then 'South America'
    when 'BO' then 'South America'
    when 'BR' then 'South America'
    when 'CL' then 'South America'
    when 'CO' then 'South America'
    when 'EC' then 'South America'
    when 'PE' then 'South America'
    when 'PY' then 'South America'
    when 'UY' then 'South America'
    when 'VE' then 'South America'

    when 'DZ' then 'Africa'
    when 'EG' then 'Africa'
    when 'ET' then 'Africa'
    when 'GH' then 'Africa'
    when 'KE' then 'Africa'
    when 'MA' then 'Africa'
    when 'NG' then 'Africa'
    when 'RW' then 'Africa'
    when 'TN' then 'Africa'
    when 'UG' then 'Africa'
    when 'ZA' then 'Africa'

    when 'AE' then 'Middle East'
    when 'BH' then 'Middle East'
    when 'IL' then 'Middle East'
    when 'IQ' then 'Middle East'
    when 'IR' then 'Middle East'
    when 'JO' then 'Middle East'
    when 'KW' then 'Middle East'
    when 'LB' then 'Middle East'
    when 'OM' then 'Middle East'
    when 'QA' then 'Middle East'
    when 'SA' then 'Middle East'
    when 'TR' then 'Middle East'

    when 'AU' then 'Oceania'
    when 'NZ' then 'Oceania'

    when 'CN' then 'Asia'
    when 'HK' then 'Asia'
    when 'ID' then 'Asia'
    when 'IN' then 'Asia'
    when 'JP' then 'Asia'
    when 'KZ' then 'Asia'
    when 'KR' then 'Asia'
    when 'MY' then 'Asia'
    when 'PH' then 'Asia'
    when 'SG' then 'Asia'
    when 'TH' then 'Asia'
    when 'TW' then 'Asia'
    when 'UZ' then 'Asia'
    when 'VN' then 'Asia'

    else 'Other'
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_notifications(p_status text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 20)
 RETURNS TABLE(user_notification_id bigint, status text, read_at timestamp with time zone, assigned_at timestamp with time zone, notification_id bigint, title text, message text, source text, action_url text, payload_json jsonb, notification_created_at timestamp with time zone, type_code text, icon_name text, preference_group text, default_image_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    un.id as user_notification_id,
    un.status::text,
    un.read_at,
    un.created_at as assigned_at,
    n.id as notification_id,
    n.title::text,
    n.message,
    n.source::text,
    n.action_url::text,
    n.payload_json,
    n.created_at as notification_created_at,
    nt.code::text as type_code,
    nt.icon_name::text,
    nt.preference_group::text,
    nt.default_image_url::text
  from public.user_notifications un
  join public.notifications n on n.id = un.notification_id
  join public.notification_types nt on nt.id = n.type_id
  where un.user_id = auth.uid()
    and p_status in ('unread', 'read')
    and un.status = p_status
    and un.deleted_at is null
    and (n.expires_at is null or n.expires_at > now())
  order by n.created_at desc
  limit greatest(1, least(p_page_size, 100))
  offset ((greatest(p_page, 1) - 1) * greatest(1, least(p_page_size, 100)));
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_primary_club_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  select c.id
  from public.clubs c
  where c.owner_user_id = auth.uid()
  order by
    case
      when c.name ilike '%u23%' then 1
      else 0
    end,
    c.created_at asc,
    c.id asc
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_authoritative_game_time()
 RETURNS TABLE(season_number integer, month_number smallint, month_name text, day_number smallint, hour_24 smallint, minute_2 smallint, display_text text)
 LANGUAGE sql
AS $function$
with ts as (
  select public.get_current_game_timestamp() as game_ts
)
select
  public.season_from_game_date(game_ts::date) as season_number,
  extract(month from game_ts)::smallint as month_number,
  trim(to_char(game_ts, 'Month')) as month_name,
  extract(day from game_ts)::smallint as day_number,
  extract(hour from game_ts)::smallint as hour_24,
  extract(minute from game_ts)::smallint as minute_2,
  concat(
    'Season ',
    public.season_from_game_date(game_ts::date),
    ' - ',
    trim(to_char(game_ts, 'FMDay')),
    ' - ',
    trim(to_char(game_ts, 'FMMonth')),
    ' ',
    extract(day from game_ts)::int,
    ' - ',
    to_char(game_ts, 'HH24:MI')
  ) as display_text
from ts;
$function$
;

CREATE OR REPLACE FUNCTION public.get_overlapping_committed_riders(p_rider_ids uuid[], p_start_date date, p_days integer)
 RETURNS TABLE(rider_id uuid, source_type text, source_id uuid, blocked_from date, blocked_until date, status_code text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with req as(
    select
      (p_start_date-1) as requested_from_with_buffer,
      ((p_start_date+(p_days-1))+1) as requested_until_with_buffer,
      p_start_date as requested_from_exact,
      (p_start_date+(p_days-1)) as requested_until_exact
  )
  select
    rcw.rider_id,rcw.source_type,rcw.source_id,rcw.blocked_from,rcw.blocked_until,
    'already_in_overlapping_activity'::text
  from public.rider_commitment_windows rcw
  cross join req
  where rcw.rider_id=any(coalesce(p_rider_ids,'{}'::uuid[]))
    and not(
      rcw.blocked_until<req.requested_from_with_buffer
      or rcw.blocked_from>req.requested_until_with_buffer
    )

  union all

  select
    nd.rider_id,'national_duty'::text,nd.id,
    coalesce(nd.duty_start_date,nd.duty_date),
    coalesce(nd.duty_end_date,nd.duty_date),
    'national_duty'::text
  from public.national_championship_duties nd
  cross join req
  where nd.rider_id=any(coalesce(p_rider_ids,'{}'::uuid[]))
    and nd.status='confirmed'
    and coalesce(nd.duty_start_date,nd.duty_date)<=req.requested_until_exact
    and coalesce(nd.duty_end_date,nd.duty_date)>=req.requested_from_exact

  union all

  select
    wd.rider_id,'world_road_duty'::text,wd.id,
    wd.duty_date,wd.duty_date,'world_road_duty'::text
  from public.world_road_championship_duties wd
  cross join req
  where wd.rider_id=any(coalesce(p_rider_ids,'{}'::uuid[]))
    and wd.status='confirmed'
    and wd.duty_date<=req.requested_until_exact
    and wd.duty_date>=req.requested_from_exact;
$function$
;

CREATE OR REPLACE FUNCTION public.get_overlapping_training_camp_riders(p_rider_ids uuid[], p_start_date date, p_days integer)
 RETURNS TABLE(rider_id uuid, booking_id uuid, blocked_from date, blocked_until date)
 LANGUAGE sql
 STABLE
AS $function$
  with requested_window as (
    select
      (p_start_date - 1) as requested_from,
      ((p_start_date + (p_days - 1)) + 1) as requested_until
  ),
  normalized_riders as (
    select distinct unnest(coalesce(p_rider_ids, '{}'::uuid[])) as rider_id
  )
  select distinct
    tcp.rider_id,
    b.id as booking_id,
    (b.start_date - 1) as blocked_from,
    (b.end_date + 1) as blocked_until
  from public.training_camp_bookings b
  join public.training_camp_participants tcp
    on tcp.booking_id = b.id
  join normalized_riders nr
    on nr.rider_id = tcp.rider_id
  cross join requested_window rw
  where b.status in ('planned', 'active')
    and not (
      (b.end_date + 1) < rw.requested_from
      or (b.start_date - 1) > rw.requested_until
    );
$function$
;

CREATE OR REPLACE FUNCTION public.finance_get_club_tax_audits(p_club_id uuid, p_limit integer DEFAULT 12)
 RETURNS TABLE(period_start date, period_end date, tax_rate_bps integer, taxable_income_gross bigint, expected_tax bigint, already_withheld bigint, adjustment_amount bigint, audit_status text, details jsonb, created_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    a.period_start,
    a.period_end,
    a.tax_rate_bps,
    a.taxable_income_gross,
    a.expected_tax,
    a.already_withheld,
    a.adjustment_amount,
    a.audit_status,
    a.details,
    a.created_at
  from finance.monthly_tax_audits a
  where a.club_id = p_club_id
    and finance.is_club_member_or_owner(p_club_id, auth.uid())
  order by a.period_start desc
  limit greatest(p_limit, 1);
$function$
;

CREATE OR REPLACE FUNCTION public.get_regular_training_focus_distribution(p_focus_code text)
 RETURNS TABLE(attribute_code text, weight numeric)
 LANGUAGE sql
 IMMUTABLE
AS $function$
  with weights as (
    select * from (values
      -- general
      ('general',     'sprint',      0.12::numeric),
      ('general',     'climbing',    0.12::numeric),
      ('general',     'time_trial',  0.12::numeric),
      ('general',     'endurance',   0.16::numeric),
      ('general',     'flat',        0.12::numeric),
      ('general',     'recovery',    0.12::numeric),
      ('general',     'resistance',  0.12::numeric),
      ('general',     'race_iq',     0.06::numeric),
      ('general',     'teamwork',    0.06::numeric),

      -- recovery
      ('recovery',    'recovery',    0.55::numeric),
      ('recovery',    'endurance',   0.15::numeric),
      ('recovery',    'resistance',  0.10::numeric),
      ('recovery',    'teamwork',    0.10::numeric),
      ('recovery',    'race_iq',     0.10::numeric),

      -- sprint
      ('sprint',      'sprint',      0.55::numeric),
      ('sprint',      'flat',        0.15::numeric),
      ('sprint',      'endurance',   0.10::numeric),
      ('sprint',      'resistance',  0.10::numeric),
      ('sprint',      'recovery',    0.10::numeric),

      -- climbing
      ('climbing',    'climbing',    0.55::numeric),
      ('climbing',    'endurance',   0.15::numeric),
      ('climbing',    'resistance',  0.10::numeric),
      ('climbing',    'recovery',    0.10::numeric),
      ('climbing',    'flat',        0.10::numeric),

      -- flat
      ('flat',        'flat',        0.50::numeric),
      ('flat',        'sprint',      0.15::numeric),
      ('flat',        'endurance',   0.15::numeric),
      ('flat',        'resistance',  0.10::numeric),
      ('flat',        'teamwork',    0.10::numeric),

      -- time_trial
      ('time_trial',  'time_trial',  0.55::numeric),
      ('time_trial',  'endurance',   0.15::numeric),
      ('time_trial',  'resistance',  0.10::numeric),
      ('time_trial',  'recovery',    0.10::numeric),
      ('time_trial',  'race_iq',     0.10::numeric),

      -- endurance
      ('endurance',   'endurance',   0.55::numeric),
      ('endurance',   'recovery',    0.15::numeric),
      ('endurance',   'resistance',  0.15::numeric),
      ('endurance',   'flat',        0.10::numeric),
      ('endurance',   'teamwork',    0.05::numeric),

      -- resistance
      ('resistance',  'resistance',  0.55::numeric),
      ('resistance',  'endurance',   0.15::numeric),
      ('resistance',  'recovery',    0.15::numeric),
      ('resistance',  'climbing',    0.10::numeric),
      ('resistance',  'teamwork',    0.05::numeric),

      -- race_iq
      ('race_iq',     'race_iq',     0.55::numeric),
      ('race_iq',     'teamwork',    0.15::numeric),
      ('race_iq',     'endurance',   0.10::numeric),
      ('race_iq',     'time_trial',  0.10::numeric),
      ('race_iq',     'recovery',    0.10::numeric),

      -- teamwork
      ('teamwork',    'teamwork',    0.55::numeric),
      ('teamwork',    'race_iq',     0.15::numeric),
      ('teamwork',    'endurance',   0.10::numeric),
      ('teamwork',    'recovery',    0.10::numeric),
      ('teamwork',    'flat',        0.10::numeric)
    ) as v(focus_code, attribute_code, weight)
  )
  select w.attribute_code, w.weight
  from weights w
  where w.focus_code = lower(coalesce(p_focus_code, 'general'));
$function$
;

CREATE OR REPLACE FUNCTION public.game_base_year()
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select 2000;
$function$
;

CREATE OR REPLACE FUNCTION public.game_year_from_season(p_season integer)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE STRICT
AS $function$
  select public.game_base_year() + p_season - 1;
$function$
;

CREATE OR REPLACE FUNCTION public.season_from_game_date(p_date date)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE STRICT
AS $function$
  select extract(year from p_date)::int - public.game_base_year() + 1;
$function$
;

CREATE OR REPLACE FUNCTION public.season_from_game_timestamp(p_ts timestamp with time zone)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE STRICT
AS $function$
  select extract(year from (p_ts at time zone 'UTC'))::int - public.game_base_year() + 1;
$function$
;

CREATE OR REPLACE FUNCTION public.game_date_from_parts(p_season integer, p_month integer, p_day integer)
 RETURNS date
 LANGUAGE sql
 IMMUTABLE STRICT
AS $function$
  select make_date(public.game_year_from_season(p_season), p_month, p_day);
$function$
;

CREATE OR REPLACE FUNCTION public.game_timestamp_from_parts(p_season integer, p_month integer, p_day integer, p_hour integer DEFAULT 0, p_minute integer DEFAULT 0)
 RETURNS timestamp without time zone
 LANGUAGE sql
 IMMUTABLE STRICT
AS $function$
  select make_timestamp(
    public.game_year_from_season(p_season),
    p_month,
    p_day,
    p_hour,
    p_minute,
    0
  );
$function$
;

CREATE OR REPLACE FUNCTION public.get_club_staff_overview(p_club_id uuid)
 RETURNS TABLE(staff_id uuid, club_id uuid, role_type text, staff_name text, specialization text, team_scope text, country_code text, expertise smallint, experience smallint, potential smallint, leadership smallint, efficiency smallint, loyalty smallint, salary_weekly integer, contract_expires_at date, training_efficiency_multiplier numeric, development_multiplier numeric, overload_risk_multiplier numeric, youth_dev_multiplier numeric, risk_multiplier numeric, recovery_duration_multiplier numeric, daily_recovery_bonus integer, fatigue_floor_reduction integer, limited_by_facility boolean, facility_warning text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with infra as (
  select
    ci.club_id,
    coalesce(ci.training_center_level, 0) as training_center_level,
    coalesce(ci.medical_center_level, 0) as medical_center_level,
    coalesce(ci.scouting_level, 0) as scouting_level,
    coalesce(ci.mechanics_workshop_level, 0) as mechanics_workshop_level
  from public.club_infrastructure ci
  where ci.club_id = p_club_id
),
coach as (
  select *
  from public.get_head_coach_effects(p_club_id)
),
doctor as (
  select *
  from public.get_team_doctor_effects(p_club_id)
)
select
  cs.id as staff_id,
  cs.club_id,
  cs.role_type,
  cs.staff_name,
  cs.specialization,
  cs.team_scope::text,
  cs.country_code,
  cs.expertise,
  cs.experience,
  cs.potential,
  cs.leadership,
  cs.efficiency,
  cs.loyalty,
  cs.salary_weekly,
  cs.contract_expires_at,

  case
    when cs.role_type = 'head_coach'
      then coalesce((select training_efficiency_multiplier from coach), 1.0000)
    else 1.0000
  end as training_efficiency_multiplier,

  case
    when cs.role_type = 'head_coach'
      then coalesce((select development_multiplier from coach), 1.0000)
    else 1.0000
  end as development_multiplier,

  case
    when cs.role_type = 'head_coach'
      then coalesce((select overload_risk_multiplier from coach), 1.0000)
    else 1.0000
  end as overload_risk_multiplier,

  case
    when cs.role_type = 'head_coach'
      then coalesce((select youth_dev_multiplier from coach), 1.0000)
    else 1.0000
  end as youth_dev_multiplier,

  case
    when cs.role_type = 'team_doctor'
      then coalesce((select risk_multiplier from doctor), 1.0000)
    else 1.0000
  end as risk_multiplier,

  case
    when cs.role_type = 'team_doctor'
      then coalesce((select recovery_duration_multiplier from doctor), 1.0000)
    else 1.0000
  end as recovery_duration_multiplier,

  case
    when cs.role_type = 'team_doctor'
      then coalesce((select daily_recovery_bonus from doctor), 0)
    else 0
  end as daily_recovery_bonus,

  case
    when cs.role_type = 'team_doctor'
      then coalesce((select fatigue_floor_reduction from doctor), 0)
    else 0
  end as fatigue_floor_reduction,

  case
    when cs.role_type = 'head_coach'
      then coalesce((select training_center_level from infra), 0) <= 0
    when cs.role_type = 'team_doctor'
      then coalesce((select medical_center_level from infra), 0) <= 0
    when cs.role_type = 'mechanic'
      then coalesce((select mechanics_workshop_level from infra), 0) <= 0
    when cs.role_type = 'scout_analyst'
      then coalesce((select scouting_level from infra), 0) <= 0
    else false
  end as limited_by_facility,

  case
    when cs.role_type = 'head_coach'
         and coalesce((select training_center_level from infra), 0) <= 0
      then 'Training Center Lv 0 caps part of the coach bonus.'
    when cs.role_type = 'team_doctor'
         and coalesce((select medical_center_level from infra), 0) <= 0
      then 'Medical Center Lv 0 caps part of the doctor bonus.'
    when cs.role_type = 'mechanic'
         and coalesce((select mechanics_workshop_level from infra), 0) <= 0
      then 'Mechanics Workshop Lv 0 caps technical support and setup quality.'
    when cs.role_type = 'scout_analyst'
         and coalesce((select scouting_level from infra), 0) <= 0
      then 'Scouting Office Lv 0 caps scouting and analyst effectiveness.'
    else null
  end as facility_warning
from public.club_staff cs
where cs.club_id = p_club_id
  and cs.is_active = true
order by
  case cs.role_type
    when 'head_coach' then 1
    when 'team_doctor' then 2
    when 'mechanic' then 3
    when 'sport_director' then 4
    when 'scout_analyst' then 5
    else 99
  end,
  cs.staff_name;
$function$
;

CREATE OR REPLACE FUNCTION public.get_club_staff_weekly_wages(p_club_id uuid)
 RETURNS TABLE(staff_count integer, total_wages bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
select
  count(*)::int as staff_count,
  coalesce(sum(cs.salary_weekly), 0)::bigint as total_wages
from public.club_staff cs
where cs.club_id = p_club_id
  and cs.is_active = true;
$function$
;

CREATE OR REPLACE FUNCTION public.resolve_training_camp_focus_code(p_camp_type text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when p_camp_type is null or btrim(p_camp_type) = '' then 'general'

    when lower(p_camp_type) like '%climb%'
      or lower(p_camp_type) like '%mountain%'
      or lower(p_camp_type) like '%altitude%'
      then 'climbing'

    when lower(p_camp_type) like '%sprint%'
      then 'sprint'

    when lower(p_camp_type) in ('tt', 'time trial', 'time_trial')
      or lower(p_camp_type) like '%time%'
      then 'time_trial'

    when lower(p_camp_type) like '%flat%'
      then 'flat'

    when lower(p_camp_type) like '%endurance%'
      then 'endurance'

    when lower(p_camp_type) like '%resistance%'
      then 'resistance'

    when lower(p_camp_type) like '%recovery%'
      then 'recovery'

    when lower(p_camp_type) like '%race iq%'
      or lower(p_camp_type) like '%race_iq%'
      or lower(p_camp_type) like '%tactic%'
      then 'race_iq'

    when lower(p_camp_type) like '%team%'
      then 'teamwork'

    else 'general'
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.hash_unit(p_text text, p_salt text DEFAULT ''::text)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
AS $function$
  with h as (
    select decode(md5(coalesce(p_text, '') || '|' || coalesce(p_salt, '')), 'hex') as b
  )
  select (
    (
      (get_byte(b, 0)::bigint << 24) +
      (get_byte(b, 1)::bigint << 16) +
      (get_byte(b, 2)::bigint << 8) +
      get_byte(b, 3)::bigint
    )::numeric / 4294967295::numeric
  )
  from h;
$function$
;

CREATE OR REPLACE FUNCTION public.clamp_smallint(p_value numeric, p_min integer DEFAULT 35, p_max integer DEFAULT 90)
 RETURNS smallint
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select greatest(p_min, least(p_max, round(p_value)::int))::smallint;
$function$
;

CREATE OR REPLACE FUNCTION public.get_rider_last_weekly_development(p_rider_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select coalesce(
    (
      select jsonb_build_object(
        'rider_id', v.rider_id,
        'week_start_date', v.week_start_date,
        'week_end_date', v.week_end_date,
        'processed_at', v.processed_at,
        'skill_changes', v.skill_changes
      )
      from public.rider_last_weekly_development_v v
      where v.rider_id = p_rider_id
    ),
    jsonb_build_object(
      'rider_id', p_rider_id,
      'week_start_date', null,
      'week_end_date', null,
      'processed_at', null,
      'skill_changes', '[]'::jsonb
    )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.get_club_weekly_skill_change_widget(p_club_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
with latest_week as (
  select max(week_end_date) as week_end_date
  from public.rider_weekly_skill_changes
),
club_changes as (
  select
    c.week_end_date,
    c.rider_id,
    r.display_name,
    c.attribute_code,
    c.delta_value
  from public.rider_weekly_skill_changes c
  join latest_week lw
    on lw.week_end_date = c.week_end_date
  join public.club_riders cr
    on cr.rider_id = c.rider_id
  join public.riders r
    on r.id = c.rider_id
  where cr.club_id = p_club_id
)
select coalesce(
  (
    select jsonb_build_object(
      'club_id', p_club_id,
      'week_end_date', max(week_end_date),
      'positive_skill_changes', count(*) filter (where delta_value > 0),
      'negative_skill_changes', count(*) filter (where delta_value < 0),
      'net_delta_sum', coalesce(sum(delta_value), 0),
      'riders_changed', count(distinct rider_id),
      'changes',
        jsonb_agg(
          jsonb_build_object(
            'rider_id', rider_id,
            'display_name', display_name,
            'attribute_code', attribute_code,
            'delta_value', delta_value
          )
          order by abs(delta_value) desc, display_name, attribute_code
        )
    )
    from club_changes
  ),
  jsonb_build_object(
    'club_id', p_club_id,
    'week_end_date', null,
    'positive_skill_changes', 0,
    'negative_skill_changes', 0,
    'net_delta_sum', 0,
    'riders_changed', 0,
    'changes', '[]'::jsonb
  )
);
$function$
;

CREATE OR REPLACE FUNCTION public.get_current_main_club_id()
 RETURNS uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select c.id
  from public.clubs c
  where c.owner_user_id = auth.uid()
    and c.club_type = 'main'
    and c.is_active = true
    and c.deleted_at is null
  order by c.created_at asc
  limit 1
$function$
;

CREATE OR REPLACE FUNCTION public.rider_belongs_to_current_club_family(p_rider_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.club_riders cr
    join public.clubs team_club
      on team_club.id = cr.club_id
    join public.clubs main_club
      on main_club.id = case
        when team_club.club_type = 'developing' then team_club.parent_club_id
        else team_club.id
      end
    where cr.rider_id = p_rider_id
      and main_club.id = public.get_current_main_club_id()
  )
$function$
;

CREATE OR REPLACE FUNCTION public.get_club_active_staff_courses(p_club_id uuid)
 RETURNS TABLE(course_id uuid, staff_id uuid, course_code text, course_title text, focus_label text, status text, started_game_date date, completes_on_game_date date, duration_days integer, cost_cash integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with allowed as (
  select 1
  from public.clubs c
  left join public.club_memberships cm
    on cm.club_id = c.id
   and cm.user_id = auth.uid()
  where c.id = p_club_id
    and (c.owner_user_id = auth.uid() or cm.user_id is not null)
  limit 1
),
ranked as (
  select
    sc.id as course_id,
    sc.staff_id,
    sc.course_code,
    sc.course_title,
    sc.focus_label,
    sc.status,
    sc.started_game_date,
    sc.completes_on_game_date,
    sc.duration_days,
    sc.cost_cash,
    row_number() over (
      partition by sc.staff_id
      order by sc.created_at desc, sc.completes_on_game_date desc
    ) as rn
  from public.staff_courses sc
  where sc.club_id = p_club_id
    and sc.status = 'active'
)
select
  r.course_id,
  r.staff_id,
  r.course_code,
  r.course_title,
  r.focus_label,
  r.status,
  r.started_game_date,
  r.completes_on_game_date,
  r.duration_days,
  r.cost_cash
from ranked r
where exists (select 1 from allowed)
  and r.rn = 1
order by r.completes_on_game_date asc, r.course_title asc;
$function$
;

CREATE OR REPLACE FUNCTION public.get_club_recent_staff_course_results(p_club_id uuid, p_limit integer DEFAULT 8)
 RETURNS TABLE(course_id uuid, staff_id uuid, staff_name text, role_type text, course_code text, course_title text, focus_label text, completed_game_date date, expertise_gain smallint, experience_gain smallint, potential_gain smallint, leadership_gain smallint, efficiency_gain smallint, loyalty_gain smallint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with allowed as (
  select 1
  from public.clubs c
  left join public.club_memberships cm
    on cm.club_id = c.id
   and cm.user_id = auth.uid()
  where c.id = p_club_id
    and (c.owner_user_id = auth.uid() or cm.user_id is not null)
  limit 1
)
select
  sc.id as course_id,
  sc.staff_id,
  coalesce(sc.metadata->>'staff_name', cs.staff_name) as staff_name,
  coalesce(sc.metadata->>'role_type', cs.role_type) as role_type,
  sc.course_code,
  sc.course_title,
  sc.focus_label,
  sc.completed_game_date,
  sc.expertise_gain,
  sc.experience_gain,
  sc.potential_gain,
  sc.leadership_gain,
  sc.efficiency_gain,
  sc.loyalty_gain
from public.staff_courses sc
left join public.club_staff cs
  on cs.id = sc.staff_id
where exists (select 1 from allowed)
  and sc.club_id = p_club_id
  and sc.status = 'completed'
order by sc.completed_game_date desc nulls last, sc.updated_at desc
limit greatest(coalesce(p_limit, 8), 1);
$function$
;

CREATE OR REPLACE FUNCTION public.finance_get_team_policy_cost_summary_admin(p_club_id uuid, p_period_start date, p_period_end date)
 RETURNS TABLE(period_start date, period_end date, total_policy_cost bigint, trip_policy_cost bigint, recurring_policy_cost bigint, bonus_policy_cost bigint, travel_cost bigint, accommodation_cost bigint, logistics_cost bigint, vehicle_cost bigint, housing_cost bigint, nutrition_cost bigint, recovery_support_cost bigint, staff_support_cost bigint, bonus_payout_cost bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with tx as (
    select
      t.type,
      abs(sum(e.amount))::bigint as amount
    from finance.transactions t
    join finance.entries e
      on e.transaction_id = t.id
    join finance.accounts a
      on a.id = e.account_id
    where a.club_id = p_club_id
      and a.currency = 'CASH'
      and a.kind = 'main'
      and e.amount < 0
      and t.created_at::date >= p_period_start
      and t.created_at::date <= p_period_end
      and t.type in (
        'team_policy_travel_cost',
        'team_policy_accommodation_cost',
        'team_policy_logistics_cost',
        'team_policy_vehicle_cost',
        'team_policy_housing_cost',
        'team_policy_nutrition_cost',
        'team_policy_recovery_support_cost',
        'team_policy_staff_support_cost',
        'team_policy_bonus_payout'
      )
    group by t.type
  )
  select
    p_period_start,
    p_period_end,
    coalesce(sum(tx.amount), 0)::bigint as total_policy_cost,
    coalesce(sum(case when tx.type in (
      'team_policy_travel_cost',
      'team_policy_accommodation_cost'
    ) then tx.amount else 0 end), 0)::bigint as trip_policy_cost,
    coalesce(sum(case when tx.type in (
      'team_policy_logistics_cost',
      'team_policy_vehicle_cost',
      'team_policy_housing_cost',
      'team_policy_nutrition_cost',
      'team_policy_recovery_support_cost',
      'team_policy_staff_support_cost'
    ) then tx.amount else 0 end), 0)::bigint as recurring_policy_cost,
    coalesce(sum(case when tx.type = 'team_policy_bonus_payout' then tx.amount else 0 end), 0)::bigint as bonus_policy_cost,
    coalesce(sum(case when tx.type = 'team_policy_travel_cost' then tx.amount else 0 end), 0)::bigint as travel_cost,
    coalesce(sum(case when tx.type = 'team_policy_accommodation_cost' then tx.amount else 0 end), 0)::bigint as accommodation_cost,
    coalesce(sum(case when tx.type = 'team_policy_logistics_cost' then tx.amount else 0 end), 0)::bigint as logistics_cost,
    coalesce(sum(case when tx.type = 'team_policy_vehicle_cost' then tx.amount else 0 end), 0)::bigint as vehicle_cost,
    coalesce(sum(case when tx.type = 'team_policy_housing_cost' then tx.amount else 0 end), 0)::bigint as housing_cost,
    coalesce(sum(case when tx.type = 'team_policy_nutrition_cost' then tx.amount else 0 end), 0)::bigint as nutrition_cost,
    coalesce(sum(case when tx.type = 'team_policy_recovery_support_cost' then tx.amount else 0 end), 0)::bigint as recovery_support_cost,
    coalesce(sum(case when tx.type = 'team_policy_staff_support_cost' then tx.amount else 0 end), 0)::bigint as staff_support_cost,
    coalesce(sum(case when tx.type = 'team_policy_bonus_payout' then tx.amount else 0 end), 0)::bigint as bonus_payout_cost
  from tx;
$function$
;

CREATE OR REPLACE FUNCTION public.text_to_deterministic_uuid(p_input text)
 RETURNS uuid
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select (
    substr(md5(p_input), 1, 8) || '-' ||
    substr(md5(p_input), 9, 4) || '-' ||
    substr(md5(p_input), 13, 4) || '-' ||
    substr(md5(p_input), 17, 4) || '-' ||
    substr(md5(p_input), 21, 12)
  )::uuid
$function$
;

CREATE OR REPLACE FUNCTION public._get_owned_main_club_id(p_user_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select c.id
  from public.clubs c
  where c.owner_user_id = p_user_id
    and c.deleted_at is null
  order by
    case
      when c.parent_club_id is null and coalesce(c.club_type, 'main') <> 'developing' then 0
      else 1
    end,
    c.created_at asc
  limit 1
$function$
;

CREATE OR REPLACE FUNCTION public.get_free_agent_market_listings(p_page integer DEFAULT 1, p_page_size integer DEFAULT 50)
 RETURNS TABLE(free_agent_id uuid, rider_id uuid, display_name text, country_code text, role rider_role, age_years integer, overall smallint, potential smallint, market_value bigint, expected_salary_weekly integer, min_acceptable_salary_weekly integer, preferred_duration_seasons smallint, desired_tier text, available_from_game_date date, expires_on_game_date date, source_type text, source_club_id uuid, source_club_name text, status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with base as (
    select
      fa.id as free_agent_id,
      fa.rider_id,
      r.display_name,
      r.country_code,
      r.role,
      public.get_age_years_on_game_date(r.birth_date) as age_years,
      r.overall,
      r.potential,
      r.market_value,
      fa.expected_salary_weekly,
      fa.min_acceptable_salary_weekly,
      fa.preferred_duration_seasons,
      fa.desired_tier,
      fa.available_from_game_date,
      fa.expires_on_game_date,
      fa.source_type,
      fa.source_club_id,
      c.name as source_club_name,
      fa.status,
      fa.created_at
    from public.rider_free_agents fa
    join public.riders r
      on r.id = fa.rider_id
    left join public.clubs c
      on c.id = fa.source_club_id
    where fa.status = 'available'
  )
  select
    b.free_agent_id,
    b.rider_id,
    b.display_name,
    b.country_code,
    b.role,
    b.age_years,
    b.overall,
    b.potential,
    b.market_value,
    b.expected_salary_weekly,
    b.min_acceptable_salary_weekly,
    b.preferred_duration_seasons,
    b.desired_tier,
    b.available_from_game_date,
    b.expires_on_game_date,
    b.source_type,
    b.source_club_id,
    b.source_club_name,
    b.status
  from base b
  order by b.available_from_game_date desc, b.created_at desc
  offset greatest(coalesce(p_page, 1) - 1, 0) * greatest(least(coalesce(p_page_size, 50), 100), 1)
  limit greatest(least(coalesce(p_page_size, 50), 100), 1)
$function$
;

CREATE OR REPLACE FUNCTION public.club_tier_rank(p_tier club_tier)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case p_tier
    when 'worldteam'::public.club_tier then 1
    when 'proteam'::public.club_tier then 2
    when 'continental'::public.club_tier then 3
    when 'amateur'::public.club_tier then 4
    else null
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_dashboard_quick_actions()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_array(
    jsonb_build_object('id', 'squad', 'label', 'Squad', 'href', '#/dashboard/squad', 'accent', 'from-slate-900 to-slate-700'),
    jsonb_build_object('id', 'calendar', 'label', 'Calendar', 'href', '#/dashboard/calendar', 'accent', 'from-blue-600 to-blue-500'),
    jsonb_build_object('id', 'finance', 'label', 'Finance', 'href', '#/dashboard/finance', 'accent', 'from-emerald-600 to-emerald-500'),
    jsonb_build_object('id', 'sponsors', 'label', 'Sponsors', 'href', '#/dashboard/finance', 'accent', 'from-yellow-500 to-amber-400'),
    jsonb_build_object('id', 'inbox', 'label', 'Inbox', 'href', '#/dashboard/inbox', 'accent', 'from-rose-600 to-rose-500'),
    jsonb_build_object('id', 'training', 'label', 'Training', 'href', '#/dashboard/training', 'accent', 'from-violet-600 to-violet-500'),
    jsonb_build_object('id', 'infrastructure', 'label', 'Infrastructure', 'href', '#/dashboard/infrastructure', 'accent', 'from-cyan-700 to-cyan-500'),
    jsonb_build_object('id', 'policies', 'label', 'Policies', 'href', '#/dashboard/finance', 'accent', 'from-orange-600 to-orange-500')
  );
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_notifications(p_limit integer DEFAULT 50, p_only_unread boolean DEFAULT false)
 RETURNS TABLE(user_notification_row_id bigint, notification_id bigint, type_id bigint, title character varying, message text, source character varying, action_url character varying, payload_json jsonb, status character varying, read_at timestamp with time zone, deleted_at timestamp with time zone, delivered_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    un.id as user_notification_row_id,
    n.id as notification_id,
    n.type_id,
    n.title,
    n.message,
    n.source,
    n.action_url,
    n.payload_json,
    un.status,
    un.read_at,
    un.deleted_at,
    un.created_at as delivered_at
  from public.user_notifications un
  join public.notifications n
    on n.id = un.notification_id
  where un.user_id = auth.uid()
    and un.deleted_at is null
    and (not p_only_unread or un.status = 'unread')
  order by un.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$function$
;

CREATE OR REPLACE FUNCTION public.refill_generated_free_agent_pool()
 RETURNS TABLE(created_count integer, amateur_created integer, continental_created integer, proteam_created integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select *
  from public.seed_generated_free_agent_pool(30, 18, 8);
$function$
;

CREATE OR REPLACE FUNCTION public.get_market_health_snapshot()
 RETURNS TABLE(active_transfer_listings integer, active_free_agents integer, open_transfer_offers integer, open_transfer_negotiations integer, open_free_agent_negotiations integer, ai_transfer_offers_today integer, ai_free_agent_negotiations_today integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    (select count(*)::integer
     from public.rider_transfer_listings
     where status = 'listed') as active_transfer_listings,

    (select count(*)::integer
     from public.rider_free_agents
     where status = 'available') as active_free_agents,

    (select count(*)::integer
     from public.rider_transfer_offers
     where status = 'open') as open_transfer_offers,

    (select count(*)::integer
     from public.rider_transfer_negotiations
     where status = 'open') as open_transfer_negotiations,

    (select count(*)::integer
     from public.rider_free_agent_negotiations
     where status = 'open') as open_free_agent_negotiations,

    (select count(*)::integer
     from public.rider_transfer_offers rto
     join public.clubs c on c.id = rto.buyer_club_id
     where c.is_ai = true
       and rto.offered_on_game_date = public.get_current_game_date_date()) as ai_transfer_offers_today,

    (select count(*)::integer
     from public.rider_free_agent_negotiations n
     join public.clubs c on c.id = n.club_id
     where c.is_ai = true
       and n.opened_on_game_date = public.get_current_game_date_date()) as ai_free_agent_negotiations_today;
$function$
;

CREATE OR REPLACE FUNCTION public.get_market_game_date()
 RETURNS date
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select public.get_current_game_date_date();
$function$
;

CREATE OR REPLACE FUNCTION public.get_market_ai_config()
 RETURNS TABLE(transfer_seller_daily_limit integer, transfer_buyer_daily_limit integer, free_agent_buyer_daily_limit integer, free_agent_sign_daily_limit integer, transfer_negotiation_daily_limit integer, transfer_contract_offer_daily_limit integer, transfer_bid_pct_below_asking numeric, transfer_bid_pct_above_market numeric, free_agent_expected_salary_pct numeric, min_club_cash_reserve bigint, ignore_ai_cash_constraints boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    c.transfer_seller_daily_limit,
    c.transfer_buyer_daily_limit,
    c.free_agent_buyer_daily_limit,
    c.free_agent_sign_daily_limit,
    c.transfer_negotiation_daily_limit,
    c.transfer_contract_offer_daily_limit,
    c.transfer_bid_pct_below_asking,
    c.transfer_bid_pct_above_market,
    c.free_agent_expected_salary_pct,
    c.min_club_cash_reserve,
    c.ignore_ai_cash_constraints
  from public.market_ai_config c
  where c.id = true
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_active_free_agent_market_listings()
 RETURNS TABLE(id uuid, rider_id uuid, source_type text, source_club_id uuid, desired_tier text, expected_salary_weekly integer, min_acceptable_salary_weekly integer, preferred_duration_seasons smallint, available_from_game_date date, expires_on_game_date date, status text, display_name text, country_code text, role rider_role, overall smallint, potential smallint, market_value bigint, salary integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    fa.id,
    fa.rider_id,
    fa.source_type,
    fa.source_club_id,
    fa.desired_tier::text,
    fa.expected_salary_weekly,
    fa.min_acceptable_salary_weekly,
    fa.preferred_duration_seasons,
    fa.available_from_game_date,
    fa.expires_on_game_date,
    fa.status::text,
    r.display_name,
    r.country_code,
    r.role,
    r.overall,
    r.potential,
    r.market_value,
    r.salary
  from public.rider_free_agents fa
  join public.riders r
    on r.id = fa.rider_id
  where fa.status = 'available'
    and fa.available_from_game_date <= public.get_current_game_date_date()
    and fa.expires_on_game_date >= public.get_current_game_date_date()
    and r.display_name is not null
    and btrim(r.display_name) <> ''
    and r.role is not null
    and r.overall is not null
  order by fa.created_at desc;
$function$
;

CREATE OR REPLACE FUNCTION public.get_rider_recent_training_sessions(p_rider_id uuid, p_limit integer DEFAULT 5)
 RETURNS TABLE(activity_date date, source text, activity_type text, intensity text, fatigue_load smallint, recovery_bonus smallint, focus_code text, development_value_base numeric, session_participated boolean, chart_value numeric)
 LANGUAGE sql
 STABLE
AS $function$
  select
    a.activity_date,
    a.source,
    a.activity_type,
    a.intensity,
    a.fatigue_load,
    a.recovery_bonus,
    a.metadata->>'focus_code' as focus_code,
    coalesce((a.metadata->>'development_value_base')::numeric, 0) as development_value_base,
    coalesce((a.metadata->>'session_participated')::boolean, a.participated, true) as session_participated,
    case
      when coalesce((a.metadata->>'session_participated')::boolean, a.participated, true) = false then 0
      else coalesce((a.metadata->>'development_value_base')::numeric, 0)
    end as chart_value
  from public.rider_daily_activity a
  where a.rider_id = p_rider_id
    and a.source in ('regular_training', 'training_camp')
  order by a.activity_date desc
  limit greatest(p_limit, 1);
$function$
;

CREATE OR REPLACE FUNCTION public.get_current_game_timestamp()
 RETURNS timestamp with time zone
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select make_timestamptz(
    1999 + gs.season_number,
    gs.month_number,
    gs.day_number,
    coalesce(gs.hour_number, 0),
    coalesce(gs.minute_number, 0),
    0,
    'UTC'
  )
  from public.game_state gs
  where gs.id = true
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_transfer_time_left_seconds(p_expires_on_game_date date)
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    case
      when p_expires_on_game_date is null then null
      else greatest(
        floor(
          extract(
            epoch from (
              make_timestamptz(
                extract(year from p_expires_on_game_date)::int,
                extract(month from p_expires_on_game_date)::int,
                extract(day from p_expires_on_game_date)::int,
                23, 59, 59,
                'UTC'
              ) - public.get_current_game_timestamp()
            )
          )
        )::bigint,
        0
      )
    end
$function$
;

CREATE OR REPLACE FUNCTION public.get_rider_free_agent_market(p_page integer DEFAULT 1, p_page_size integer DEFAULT 300)
 RETURNS TABLE(free_agent_id uuid, rider_id uuid, status text, expected_salary_weekly integer, expires_on_game_date date, display_name text, country_code text, role text, overall smallint, potential smallint, age_years integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    fa.id as free_agent_id,
    fa.rider_id,
    fa.status,
    fa.expected_salary_weekly,
    fa.expires_on_game_date,
    r.display_name,
    r.country_code,
    r.role::text as role,
    r.overall,
    r.potential,
    extract(year from age(public.get_current_game_date_date(), r.birth_date))::integer as age_years
  from public.rider_free_agents fa
  join public.riders r
    on r.id = fa.rider_id
  where fa.status = 'available'
  order by fa.created_at desc
  limit greatest(coalesce(p_page_size, 300), 1)
  offset greatest(coalesce(p_page, 1) - 1, 0) * greatest(coalesce(p_page_size, 300), 1);
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_transfer_listings_dashboard()
 RETURNS TABLE(listing_id uuid, rider_id uuid, display_name text, country_code text, role rider_role, overall smallint, potential smallint, age_years integer, asking_price bigint, min_allowed_price bigint, max_allowed_price bigint, listed_on_game_date date, expires_on_game_date date, status text, status_changed_at_game_ts timestamp without time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with ctx as (
    select
      public._get_owned_main_club_id(auth.uid()) as club_id,
      public.get_current_game_timestamp() as now_game_ts
  )
  select
    l.id as listing_id,
    l.rider_id,
    coalesce(
      nullif(r.display_name, ''),
      trim(concat_ws(' ', r.first_name, r.last_name))
    ) as display_name,
    r.country_code,
    r.role,
    r.overall,
    r.potential,
    public.get_age_years_on_game_date(r.birth_date) as age_years,
    l.asking_price,
    l.min_allowed_price,
    l.max_allowed_price,
    l.listed_on_game_date,
    l.expires_on_game_date,
    l.status::text,
    coalesce(l.status_changed_at_game_ts, l.status_changed_game_ts) as status_changed_at_game_ts
  from public.rider_transfer_listings l
  join ctx
    on ctx.club_id = l.seller_club_id
  join public.riders r
    on r.id = l.rider_id
  where
    l.status::text = 'listed'
    or (
      l.status::text in ('cancelled', 'completed', 'expired')
      and coalesce(l.status_changed_at_game_ts, l.status_changed_game_ts)
            > ctx.now_game_ts - interval '24 hours'
    )
  order by
    case when l.status::text = 'listed' then 0 else 1 end,
    coalesce(
      l.status_changed_at_game_ts,
      l.status_changed_game_ts,
      l.updated_at::timestamp,
      l.created_at::timestamp
    ) desc;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_transfer_offers_received_dashboard()
 RETURNS TABLE(offer_id uuid, listing_id uuid, rider_id uuid, rider_name text, country_code text, role rider_role, overall smallint, potential smallint, age_years integer, buyer_club_id uuid, buyer_club_name text, offered_price bigint, offered_on_game_date date, expires_on_game_date date, status text, status_changed_at_game_ts timestamp without time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$with ctx as (
  select
    public._get_owned_main_club_id(auth.uid()) as club_id
)
select
  o.id as offer_id,
  o.listing_id,
  o.rider_id,
  coalesce(
    nullif(r.display_name, ''),
    trim(concat_ws(' ', r.first_name, r.last_name))
  ) as rider_name,
  r.country_code,
  r.role,
  r.overall,
  r.potential,
  public.get_age_years_on_game_date(r.birth_date) as age_years,
  o.buyer_club_id,
  bc.name as buyer_club_name,
  o.offered_price,
  o.offered_on_game_date,
  o.expires_on_game_date,
  o.status::text,
  o.status_changed_at_game_ts
from public.rider_transfer_offers o
join ctx
  on ctx.club_id = o.seller_club_id
join public.riders r
  on r.id = o.rider_id
left join public.clubs bc
  on bc.id = o.buyer_club_id
left join lateral (
  select max(e.event_game_date) as last_event_game_date
  from public.rider_transfer_events e
  where e.offer_id = o.id
) ev on true
where
  o.status::text in (
    'open',
    'club_accepted',
    'completed',
    'rejected',
    'rider_declined',
    'expired',
    'auto_blocked'
  )
  and coalesce(
    ev.last_event_game_date,
    o.expires_on_game_date,
    o.offered_on_game_date
  ) >= (public.get_current_game_date_date() - 1)
order by
  coalesce(
    ev.last_event_game_date,
    o.expires_on_game_date,
    o.offered_on_game_date
  ) desc,
  o.created_at desc;$function$
;

CREATE OR REPLACE FUNCTION public.get_my_seller_negotiations_dashboard()
 RETURNS TABLE(negotiation_id uuid, listing_id uuid, offer_id uuid, rider_id uuid, rider_name text, country_code text, role rider_role, overall smallint, potential smallint, age_years integer, buyer_club_id uuid, buyer_club_name text, current_salary_weekly integer, expected_salary_weekly integer, min_acceptable_salary_weekly integer, offer_salary_weekly integer, offer_duration_seasons smallint, preferred_duration_seasons smallint, status text, closed_reason text, locked_until timestamp with time zone, opened_on_game_date date, expires_on_game_date date, status_changed_at_game_ts timestamp without time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with ctx as (
    select
      public._get_owned_main_club_id(auth.uid()) as club_id,
      public.get_current_game_timestamp() as now_game_ts
  )
  select
    n.id as negotiation_id,
    n.listing_id,
    n.offer_id,
    n.rider_id,
    coalesce(
      nullif(r.display_name, ''),
      trim(concat_ws(' ', r.first_name, r.last_name))
    ) as rider_name,
    r.country_code,
    r.role,
    r.overall,
    r.potential,
    public.get_age_years_on_game_date(r.birth_date) as age_years,
    n.buyer_club_id,
    bc.name as buyer_club_name,
    n.current_salary_weekly,
    n.expected_salary_weekly,
    n.min_acceptable_salary_weekly,
    n.offer_salary_weekly,
    n.offer_duration_seasons,
    n.preferred_duration_seasons,
    n.status::text,
    n.closed_reason,
    n.locked_until,
    n.opened_on_game_date,
    n.expires_on_game_date,
    n.status_changed_at_game_ts
  from public.rider_transfer_negotiations n
  join ctx
    on ctx.club_id = n.seller_club_id
  join public.riders r
    on r.id = n.rider_id
  left join public.clubs bc
    on bc.id = n.buyer_club_id
  where
    n.status::text = 'open'
    or (
      n.status::text in ('accepted', 'declined', 'expired')
      and n.status_changed_at_game_ts > ctx.now_game_ts - interval '24 hours'
    )
  order by
    case when n.status::text = 'open' then 0 else 1 end,
    coalesce(n.status_changed_at_game_ts, n.updated_at, n.created_at) desc;
$function$
;

CREATE OR REPLACE FUNCTION public.get_current_game_ts_local()
 RETURNS timestamp without time zone
 LANGUAGE sql
 STABLE
AS $function$
  select make_timestamp(
    public.game_year_from_season(gs.season_number),
    gs.month_number,
    gs.day_number,
    coalesce(gs.hour_number, 0),
    coalesce(gs.minute_number, 0),
    0
  )
  from public.game_state gs
  where gs.id = true
$function$
;

CREATE OR REPLACE FUNCTION public._get_current_game_clock_ts()
 RETURNS timestamp without time zone
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select make_timestamp(
    1999 + gs.season_number,
    gs.month_number,
    gs.day_number,
    gs.hour_number,
    gs.minute_number,
    0
  )
  from public.game_state gs
  where gs.id = true
$function$
;

CREATE OR REPLACE FUNCTION public.get_rider_transfer_negotiation_page_context(p_negotiation_id uuid)
 RETURNS TABLE(negotiation_id uuid, offer_id uuid, listing_id uuid, rider_id uuid, buyer_club_id uuid, seller_club_id uuid, status text, current_salary_weekly integer, expected_salary_weekly integer, offer_salary_weekly integer, offer_duration_seasons smallint, min_acceptable_salary_weekly integer, preferred_duration_seasons smallint, closed_reason text, opened_on_game_date date, expires_on_game_date date, locked_until timestamp with time zone, attempt_count integer, max_attempts integer, created_at timestamp with time zone, updated_at timestamp with time zone, rider_first_name text, rider_last_name text, rider_display_name text, rider_country_code text, rider_role text, rider_birth_date date, rider_image_url text, buyer_club_name text, seller_club_name text, offered_price integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    n.id as negotiation_id,
    n.offer_id,
    n.listing_id,
    n.rider_id,
    n.buyer_club_id,
    n.seller_club_id,
    n.status,
    n.current_salary_weekly,
    n.expected_salary_weekly,
    n.offer_salary_weekly,
    n.offer_duration_seasons,
    n.min_acceptable_salary_weekly,
    n.preferred_duration_seasons,
    n.closed_reason,
    n.opened_on_game_date,
    n.expires_on_game_date,
    n.locked_until,
    n.attempt_count,
    n.max_attempts,
    n.created_at,
    n.updated_at,

    to_jsonb(r)->>'first_name' as rider_first_name,
    to_jsonb(r)->>'last_name' as rider_last_name,
    coalesce(
      to_jsonb(r)->>'display_name',
      to_jsonb(r)->>'full_name',
      to_jsonb(r)->>'rider_name',
      to_jsonb(r)->>'name'
    ) as rider_display_name,
    to_jsonb(r)->>'country_code' as rider_country_code,
    to_jsonb(r)->>'role' as rider_role,
    nullif(to_jsonb(r)->>'birth_date', '')::date as rider_birth_date,
    coalesce(
      to_jsonb(r)->>'image_url',
      to_jsonb(r)->>'portrait_url',
      to_jsonb(r)->>'photo_url',
      to_jsonb(r)->>'avatar_url'
    ) as rider_image_url,

    coalesce(
      to_jsonb(buyer)->>'name',
      to_jsonb(buyer)->>'club_name',
      to_jsonb(buyer)->>'display_name'
    ) as buyer_club_name,
    coalesce(
      to_jsonb(seller)->>'name',
      to_jsonb(seller)->>'club_name',
      to_jsonb(seller)->>'display_name'
    ) as seller_club_name,

    o.offered_price
  from public.rider_transfer_negotiations n
  left join public.riders r
    on r.id = n.rider_id
  left join public.clubs buyer
    on buyer.id = n.buyer_club_id
  left join public.clubs seller
    on seller.id = n.seller_club_id
  left join public.rider_transfer_offers o
    on o.id = n.offer_id
  where n.id = p_negotiation_id
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.format_money_us(p_value numeric)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when p_value is null then '—'
    else '$' || to_char(round(p_value)::numeric, 'FM999,999,999,999,990')
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_received_transfer_offers_dashboard()
 RETURNS TABLE(id uuid, listing_id uuid, rider_id uuid, seller_club_id uuid, buyer_club_id uuid, seller_club_name text, buyer_club_name text, offered_price numeric, offered_on_game_date text, expires_on_game_date text, status text, auto_block_reason text, metadata jsonb, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$select
  o.id,
  o.listing_id,
  o.rider_id,
  o.seller_club_id,
  o.buyer_club_id,
  seller.name as seller_club_name,
  buyer.name as buyer_club_name,
  o.offered_price,
  o.offered_on_game_date,
  o.expires_on_game_date,
  o.status,
  o.auto_block_reason,
  o.metadata,
  o.created_at,
  o.updated_at
from public.rider_transfer_offers o
left join public.clubs seller on seller.id = o.seller_club_id
left join public.clubs buyer on buyer.id = o.buyer_club_id
left join lateral (
  select max(e.event_game_date) as last_event_game_date
  from public.rider_transfer_events e
  where e.offer_id = o.id
) ev on true
where o.seller_club_id = public.get_my_primary_club_id()
  and coalesce(
    ev.last_event_game_date,
    o.expires_on_game_date,
    o.offered_on_game_date
  ) >= (public.get_current_game_date_date() - 1)
order by
  coalesce(ev.last_event_game_date, o.expires_on_game_date, o.offered_on_game_date) desc,
  o.created_at desc$function$
;

CREATE OR REPLACE FUNCTION public.get_my_seller_transfer_negotiations_dashboard()
 RETURNS TABLE(id uuid, offer_id uuid, listing_id uuid, rider_id uuid, seller_club_id uuid, buyer_club_id uuid, buyer_club_name text, status text, current_salary_weekly numeric, expected_salary_weekly numeric, min_acceptable_salary_weekly numeric, preferred_duration_seasons integer, offer_salary_weekly numeric, offer_duration_seasons integer, attempt_count integer, max_attempts integer, locked_until text, opened_on_game_date text, expires_on_game_date text, closed_reason text, notes_json jsonb, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    n.id,
    n.offer_id,
    n.listing_id,
    n.rider_id,
    n.seller_club_id,
    n.buyer_club_id,
    buyer.name as buyer_club_name,
    n.status,
    n.current_salary_weekly,
    n.expected_salary_weekly,
    n.min_acceptable_salary_weekly,
    n.preferred_duration_seasons,
    n.offer_salary_weekly,
    n.offer_duration_seasons,
    n.attempt_count,
    n.max_attempts,
    n.locked_until,
    n.opened_on_game_date,
    n.expires_on_game_date,
    n.closed_reason,
    n.notes_json,
    n.created_at,
    n.updated_at
  from public.rider_transfer_negotiations n
  left join public.clubs buyer on buyer.id = n.buyer_club_id
  where n.seller_club_id = public.get_my_primary_club_id()
  order by n.created_at desc
$function$
;

CREATE OR REPLACE FUNCTION public.start_rider_free_agent_negotiation(p_free_agent_id uuid, p_club_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.start_rider_free_agent_negotiation_v2(p_free_agent_id, p_club_id);
$function$
;

CREATE OR REPLACE FUNCTION public.is_rider_assigned_to_training_camp_on_date(p_rider_id uuid, p_game_date date)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select exists (
    select 1
    from public.training_camp_participants tcp
    join public.training_camp_bookings b
      on b.id = tcp.booking_id
    where tcp.rider_id = p_rider_id
      and b.status in ('planned', 'active', 'completed')
      and p_game_date between b.start_date and b.end_date
  );
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_transfer_history_dashboard()
 RETURNS TABLE(id text, direction text, movement_type text, rider_id uuid, rider_name text, from_club_id uuid, from_club_name text, to_club_id uuid, to_club_name text, amount bigint, game_date date, completed_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$with main_club as (
  select public._get_owned_main_club_id(auth.uid()) as club_id
),
raw_history as (
  select
    ('transfer-departure-' || coalesce(e.offer_id::text, e.id::text))::text as id,
    'departure'::text as direction,
    'transfer'::text as movement_type,
    e.rider_id,
    coalesce(
      nullif(trim(concat_ws(' ', r.first_name, r.last_name)), ''),
      nullif(r.display_name, ''),
      'Unknown rider'
    ) as rider_name,
    e.seller_club_id as from_club_id,
    sc.name as from_club_name,
    e.buyer_club_id as to_club_id,
    bc.name as to_club_name,
    nullif(e.payload ->> 'transfer_amount', '')::bigint as amount,
    e.event_game_date as game_date,
    e.created_at as completed_at
  from public.rider_transfer_events e
  join main_club mc
    on true
  left join public.riders r
    on r.id = e.rider_id
  left join public.clubs sc
    on sc.id = e.seller_club_id
  left join public.clubs bc
    on bc.id = e.buyer_club_id
  where e.event_type = 'transfer_completed'
    and e.seller_club_id = mc.club_id

  union all

  select
    ('transfer-arrival-' || coalesce(e.offer_id::text, e.id::text))::text as id,
    'arrival'::text as direction,
    'transfer'::text as movement_type,
    e.rider_id,
    coalesce(
      nullif(trim(concat_ws(' ', r.first_name, r.last_name)), ''),
      nullif(r.display_name, ''),
      'Unknown rider'
    ) as rider_name,
    e.seller_club_id as from_club_id,
    sc.name as from_club_name,
    e.buyer_club_id as to_club_id,
    bc.name as to_club_name,
    nullif(e.payload ->> 'transfer_amount', '')::bigint as amount,
    e.event_game_date as game_date,
    e.created_at as completed_at
  from public.rider_transfer_events e
  join main_club mc
    on true
  left join public.riders r
    on r.id = e.rider_id
  left join public.clubs sc
    on sc.id = e.seller_club_id
  left join public.clubs bc
    on bc.id = e.buyer_club_id
  where e.event_type = 'transfer_completed'
    and e.buyer_club_id = mc.club_id

  union all

  select
    ('fa-arrival-' || e.id::text)::text as id,
    'arrival'::text as direction,
    'free_agent'::text as movement_type,
    e.rider_id,
    coalesce(
      nullif(trim(concat_ws(' ', r.first_name, r.last_name)), ''),
      nullif(r.display_name, ''),
      'Unknown rider'
    ) as rider_name,
    null::uuid as from_club_id,
    'Free Agent'::text as from_club_name,
    e.club_id as to_club_id,
    c.name as to_club_name,
    null::bigint as amount,
    e.event_game_date as game_date,
    e.created_at as completed_at
  from public.rider_free_agent_events e
  left join public.riders r
    on r.id = e.rider_id
  left join public.clubs c
    on c.id = e.club_id
  where e.event_type = 'free_agent_signed'
    and e.club_id = public._get_owned_main_club_id(auth.uid())

  union all

  select
    fa.id::text as id,
    'departure'::text as direction,
    'release'::text as movement_type,
    fa.rider_id,
    coalesce(
      nullif(trim(concat_ws(' ', r.first_name, r.last_name)), ''),
      nullif(r.display_name, ''),
      'Unknown rider'
    ) as rider_name,
    fa.source_club_id as from_club_id,
    sc.name as from_club_name,
    null::uuid as to_club_id,
    'Free Agent Market'::text as to_club_name,
    null::bigint as amount,
    coalesce(fa.available_from_game_date, fa.created_at::date) as game_date,
    fa.created_at as completed_at
  from public.rider_free_agents fa
  left join public.riders r
    on r.id = fa.rider_id
  left join public.clubs sc
    on sc.id = fa.source_club_id
  where fa.source_club_id = public._get_owned_main_club_id(auth.uid())
    and lower(coalesce(fa.source_type, '')) in ('release', 'released', 'club_release')
),
deduped as (
  select distinct on (
    direction,
    movement_type,
    rider_id,
    coalesce(game_date, completed_at::date),
    coalesce(from_club_name, ''),
    coalesce(to_club_name, '')
  )
    id,
    direction,
    movement_type,
    rider_id,
    rider_name,
    from_club_id,
    from_club_name,
    to_club_id,
    to_club_name,
    amount,
    game_date,
    completed_at
  from raw_history
  order by
    direction,
    movement_type,
    rider_id,
    coalesce(game_date, completed_at::date),
    coalesce(from_club_name, ''),
    coalesce(to_club_name, ''),
    completed_at desc nulls last
)
select
  d.id,
  d.direction,
  d.movement_type,
  d.rider_id,
  d.rider_name,
  d.from_club_id,
  d.from_club_name,
  d.to_club_id,
  d.to_club_name,
  d.amount,
  d.game_date,
  d.completed_at
from deduped d
order by d.completed_at desc nulls last;$function$
;

CREATE OR REPLACE FUNCTION public.resolve_main_club_id_for_user(p_user_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  select c.id
  from public.clubs c
  where c.owner_user_id = p_user_id
    and c.deleted_at is null
  order by
    case
      when c.parent_club_id is null and coalesce(c.club_type, '') <> 'developing' then 0
      when coalesce(c.club_type, '') <> 'developing' then 1
      else 2
    end,
    c.id
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_free_agent_market_rows(p_page integer DEFAULT 1, p_page_size integer DEFAULT 10000)
 RETURNS TABLE(free_agent_id uuid, rider_id uuid, status text, expected_salary_weekly integer, expires_on_game_date date, created_at timestamp with time zone, first_name text, last_name text, display_name text, country_code text, role text, overall integer, potential integer, birth_date date)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    fa.id as free_agent_id,
    fa.rider_id,
    fa.status,
    fa.expected_salary_weekly,
    fa.expires_on_game_date,
    fa.created_at,
    r.first_name,
    r.last_name,
    r.display_name,
    r.country_code,
    r.role::text as role,
    r.overall::int as overall,
    r.potential::int as potential,
    r.birth_date
  from public.rider_free_agents fa
  join public.riders r
    on r.id = fa.rider_id
  where fa.status in ('available', 'open')
  order by fa.created_at desc
  limit greatest(coalesce(p_page_size, 10000), 1)
  offset greatest(coalesce(p_page, 1) - 1, 0) * greatest(coalesce(p_page_size, 10000), 1);
$function$
;

CREATE OR REPLACE FUNCTION public.staff_market_target_available_count(p_role_type text)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select case p_role_type
    when 'head_coach' then 70
    when 'trainer' then 60
    when 'team_doctor' then 50
    when 'physio' then 60
    when 'mechanic' then 70
    when 'scout_analyst' then 90
    when 'nutritionist' then 50
    when 'sport_director' then 50
    when 'u23_head_coach' then 50
    else 50
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_market_pick_country()
 RETURNS text
 LANGUAGE sql
AS $function$
  with eligible_countries as (
    select upper(f.country_code) as country_code
    from public.first_names_master f
    join public.last_names_master l
      on upper(l.country_code) = upper(f.country_code)
    where coalesce(trim(f.country_code), '') <> ''
      and coalesce(trim(l.country_code), '') <> ''
    group by upper(f.country_code)
  )
  select ec.country_code
  from eligible_countries ec
  order by random()
  limit 1
$function$
;

CREATE OR REPLACE FUNCTION public.staff_market_role_weight(p_role_type text)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select case p_role_type
    when 'head_coach' then 8
    when 'trainer' then 12
    when 'team_doctor' then 8
    when 'physio' then 12
    when 'mechanic' then 10
    when 'scout_analyst' then 12
    when 'nutritionist' then 5
    when 'sport_director' then 6
    when 'u23_head_coach' then 4
    else 1
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_market_region_from_country(p_country_code text)
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select case upper(trim(coalesce(p_country_code, '')))
    -- Europe
    when 'AL' then 'europe'
    when 'AD' then 'europe'
    when 'AT' then 'europe'
    when 'BE' then 'europe'
    when 'BA' then 'europe'
    when 'BG' then 'europe'
    when 'HR' then 'europe'
    when 'CY' then 'europe'
    when 'CZ' then 'europe'
    when 'DK' then 'europe'
    when 'EE' then 'europe'
    when 'FI' then 'europe'
    when 'FR' then 'europe'
    when 'DE' then 'europe'
    when 'GR' then 'europe'
    when 'HU' then 'europe'
    when 'IS' then 'europe'
    when 'IE' then 'europe'
    when 'IT' then 'europe'
    when 'LV' then 'europe'
    when 'LI' then 'europe'
    when 'LT' then 'europe'
    when 'LU' then 'europe'
    when 'MT' then 'europe'
    when 'MD' then 'europe'
    when 'MC' then 'europe'
    when 'ME' then 'europe'
    when 'NL' then 'europe'
    when 'MK' then 'europe'
    when 'NO' then 'europe'
    when 'PL' then 'europe'
    when 'PT' then 'europe'
    when 'RO' then 'europe'
    when 'RS' then 'europe'
    when 'SK' then 'europe'
    when 'SI' then 'europe'
    when 'ES' then 'europe'
    when 'SE' then 'europe'
    when 'CH' then 'europe'
    when 'GB' then 'europe'
    when 'UK' then 'europe'
    when 'UA' then 'europe'

    -- Asia
    when 'CN' then 'asia'
    when 'JP' then 'asia'
    when 'KR' then 'asia'
    when 'KP' then 'asia'
    when 'MN' then 'asia'
    when 'IN' then 'asia'
    when 'PK' then 'asia'
    when 'BD' then 'asia'
    when 'LK' then 'asia'
    when 'NP' then 'asia'
    when 'BT' then 'asia'
    when 'MV' then 'asia'
    when 'TH' then 'asia'
    when 'VN' then 'asia'
    when 'KH' then 'asia'
    when 'LA' then 'asia'
    when 'MM' then 'asia'
    when 'MY' then 'asia'
    when 'SG' then 'asia'
    when 'ID' then 'asia'
    when 'PH' then 'asia'
    when 'BN' then 'asia'
    when 'TL' then 'asia'
    when 'KZ' then 'asia'
    when 'UZ' then 'asia'
    when 'KG' then 'asia'
    when 'TJ' then 'asia'
    when 'TM' then 'asia'

    -- Middle East
    when 'AE' then 'middle_east'
    when 'SA' then 'middle_east'
    when 'QA' then 'middle_east'
    when 'BH' then 'middle_east'
    when 'KW' then 'middle_east'
    when 'OM' then 'middle_east'
    when 'YE' then 'middle_east'
    when 'IR' then 'middle_east'
    when 'IQ' then 'middle_east'
    when 'IL' then 'middle_east'
    when 'JO' then 'middle_east'
    when 'LB' then 'middle_east'
    when 'SY' then 'middle_east'
    when 'TR' then 'middle_east'
    when 'PS' then 'middle_east'

    -- Africa
    when 'DZ' then 'africa'
    when 'AO' then 'africa'
    when 'BJ' then 'africa'
    when 'BW' then 'africa'
    when 'BF' then 'africa'
    when 'BI' then 'africa'
    when 'CM' then 'africa'
    when 'CV' then 'africa'
    when 'CF' then 'africa'
    when 'TD' then 'africa'
    when 'KM' then 'africa'
    when 'CG' then 'africa'
    when 'CD' then 'africa'
    when 'CI' then 'africa'
    when 'DJ' then 'africa'
    when 'EG' then 'africa'
    when 'GQ' then 'africa'
    when 'ER' then 'africa'
    when 'SZ' then 'africa'
    when 'ET' then 'africa'
    when 'GA' then 'africa'
    when 'GM' then 'africa'
    when 'GH' then 'africa'
    when 'GN' then 'africa'
    when 'GW' then 'africa'
    when 'KE' then 'africa'
    when 'LS' then 'africa'
    when 'LR' then 'africa'
    when 'LY' then 'africa'
    when 'MG' then 'africa'
    when 'MW' then 'africa'
    when 'ML' then 'africa'
    when 'MR' then 'africa'
    when 'MU' then 'africa'
    when 'MA' then 'africa'
    when 'MZ' then 'africa'
    when 'NA' then 'africa'
    when 'NE' then 'africa'
    when 'NG' then 'africa'
    when 'RW' then 'africa'
    when 'ST' then 'africa'
    when 'SN' then 'africa'
    when 'SC' then 'africa'
    when 'SL' then 'africa'
    when 'SO' then 'africa'
    when 'ZA' then 'africa'
    when 'SS' then 'africa'
    when 'SD' then 'africa'
    when 'TZ' then 'africa'
    when 'TG' then 'africa'
    when 'TN' then 'africa'
    when 'UG' then 'africa'
    when 'ZM' then 'africa'
    when 'ZW' then 'africa'

    -- North America / Central America / Caribbean
    when 'US' then 'north_america'
    when 'CA' then 'north_america'
    when 'MX' then 'north_america'
    when 'GT' then 'north_america'
    when 'BZ' then 'north_america'
    when 'HN' then 'north_america'
    when 'SV' then 'north_america'
    when 'NI' then 'north_america'
    when 'CR' then 'north_america'
    when 'PA' then 'north_america'
    when 'CU' then 'north_america'
    when 'DO' then 'north_america'
    when 'HT' then 'north_america'
    when 'JM' then 'north_america'
    when 'TT' then 'north_america'

    -- South America
    when 'AR' then 'south_america'
    when 'BO' then 'south_america'
    when 'BR' then 'south_america'
    when 'CL' then 'south_america'
    when 'CO' then 'south_america'
    when 'EC' then 'south_america'
    when 'GY' then 'south_america'
    when 'PY' then 'south_america'
    when 'PE' then 'south_america'
    when 'SR' then 'south_america'
    when 'UY' then 'south_america'
    when 'VE' then 'south_america'

    -- Oceania
    when 'AU' then 'oceania'
    when 'NZ' then 'oceania'
    when 'FJ' then 'oceania'
    when 'PG' then 'oceania'
    when 'WS' then 'oceania'

    else 'global'
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_market_group_for_country(p_country_code text)
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select cgm.group_code
  from public.country_market_group_members cgm
  where cgm.country_code = upper(trim(p_country_code))
  limit 1
$function$
;

CREATE OR REPLACE FUNCTION public.staff_market_pick_generation_group()
 RETURNS text
 LANGUAGE sql
AS $function$
  select g.code
  from public.country_market_groups g
  order by random()
  limit 1
$function$
;

CREATE OR REPLACE FUNCTION public.staff_market_pick_country_from_group(p_group_code text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE sql
AS $function$
  with eligible as (
    select cgm.country_code
    from public.country_market_group_members cgm
    where (p_group_code is null or cgm.group_code = p_group_code)
      and exists (
        select 1
        from public.first_names_master fn
        where fn.country_code = cgm.country_code
      )
      and exists (
        select 1
        from public.last_names_master ln
        where ln.country_code = cgm.country_code
      )
  )
  select e.country_code
  from eligible e
  order by random()
  limit 1
$function$
;

CREATE OR REPLACE FUNCTION public.staff_role_limit_for_club(p_club_id uuid, p_role_type text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((
    select g.limit_count
    from public.get_staff_role_capacity_overview_for_club(p_club_id) g
    where g.role_type = lower(trim(p_role_type))
    limit 1
  ), 0)::integer;
$function$
;

CREATE OR REPLACE FUNCTION public.can_club_hire_staff_for_role(p_club_id uuid, p_role_type text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select coalesce((
    select g.can_hire
    from public.get_club_staff_role_limits(p_club_id) g
    where g.role_type = lower(trim(p_role_type))
    limit 1
  ), false);
$function$
;

CREATE OR REPLACE FUNCTION public.finance_get_club_tax_statement(p_club_id uuid, p_limit integer DEFAULT 500, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(created_at timestamp with time zone, transaction_id uuid, type text, type_name text, category text, net_amount bigint, metadata jsonb)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    t.created_at,
    t.id as transaction_id,
    t.type,
    coalesce(tt.name, t.type) as type_name,
    coalesce(tt.category, 'tax') as category,
    sum(e.amount) as net_amount,
    coalesce(t.metadata, '{}'::jsonb) ||
      case
        when src.id is not null and src.metadata ? 'game_date' then
          jsonb_build_object(
            'source_game_date',
            src.metadata -> 'game_date',
            'source_type',
            src.type
          )
        else '{}'::jsonb
      end as metadata
  from finance.transactions t
  join finance.entries e on e.transaction_id = t.id
  join finance.accounts a on a.id = e.account_id
  left join finance.transaction_types tt on tt.code = t.type
  left join finance.transactions src
    on t.type = 'tax_withholding'
   and t.metadata ->> 'source_transaction_id' = src.id::text
  where a.club_id = p_club_id
    and a.currency = 'CASH'
    and a.kind = 'main'
    and finance.is_club_member_or_owner(p_club_id, auth.uid())
    and t.type in (
      'tax_withholding',
      'tax_monthly_adjustment',
      'tax_monthly_refund'
    )
    and (p_before is null or t.created_at < p_before)
  group by
    t.created_at,
    t.id,
    t.type,
    tt.name,
    tt.category,
    t.metadata,
    src.id,
    src.type,
    src.metadata
  order by t.created_at desc
  limit greatest(p_limit, 1);
$function$
;

CREATE OR REPLACE FUNCTION public.get_retirement_chance_bps(p_subject_type text, p_age_years integer)
 RETURNS integer
 LANGUAGE sql
 STABLE
AS $function$
  select case
    when p_subject_type = 'rider' then
      case
        when p_age_years >= 42 then 10000
        when p_age_years >= 40 then 7000
        when p_age_years >= 38 then 4000
        when p_age_years >= 36 then 1500
        when p_age_years >= 34 then 500
        else 0
      end

    when p_subject_type = 'staff' then
      case
        when p_age_years >= 70 then 10000
        when p_age_years >= 68 then 2500
        when p_age_years >= 65 then 1000
        when p_age_years >= 62 then 300
        else 0
      end

    else 0
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_retirement_band(p_subject_type text, p_age_years integer)
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select case
    when p_subject_type = 'rider' then
      case
        when p_age_years >= 42 then 'forced'
        when p_age_years >= 40 then 'very_high_risk'
        when p_age_years >= 38 then 'high_risk'
        when p_age_years >= 36 then 'medium_risk'
        when p_age_years >= 34 then 'low_risk'
        else 'not_eligible'
      end

    when p_subject_type = 'staff' then
      case
        when p_age_years >= 70 then 'forced'
        when p_age_years >= 68 then 'high_risk'
        when p_age_years >= 65 then 'medium_risk'
        when p_age_years >= 62 then 'low_risk'
        else 'not_eligible'
      end

    else 'not_eligible'
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_club_staff_with_current_assignments(p_club_id uuid)
 RETURNS TABLE(id uuid, club_id uuid, role_type text, specialization text, team_scope text, staff_name text, country_code text, expertise smallint, experience smallint, potential smallint, leadership smallint, efficiency smallint, loyalty smallint, salary_weekly integer, contract_expires_at date, birth_date date, is_active boolean, notes jsonb, current_assignment_label text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    cs.id,
    cs.club_id,
    cs.role_type,
    cs.specialization,
    cs.team_scope,
    cs.staff_name,
    cs.country_code,
    cs.expertise,
    cs.experience,
    cs.potential,
    cs.leadership,
    cs.efficiency,
    cs.loyalty,
    cs.salary_weekly,
    cs.contract_expires_at,
    cs.birth_date,
    cs.is_active,
    cs.notes,
    case
      when scout_task.id is not null then
        'Scouting rider: ' ||
        coalesce(
          nullif(r.display_name, ''),
          trim(concat_ws(' ', r.first_name, r.last_name)),
          'Unknown rider'
        ) ||
        ' • Completes: ' ||
        to_char(scout_task.completes_at_game_ts, 'YYYY-MM-DD HH24:MI')
      else null
    end::text as current_assignment_label
  from public.club_staff cs
  left join lateral (
    select rst.id, rst.rider_id, rst.completes_at_game_ts
    from public.rider_scout_tasks rst
    where rst.scout_staff_id = cs.id
      and rst.status in ('queued', 'in_progress')
    order by rst.completes_at_game_ts asc
    limit 1
  ) scout_task on true
  left join public.riders r
    on r.id = scout_task.rider_id
  where cs.club_id = p_club_id
    and cs.is_active = true
  order by cs.role_type asc, cs.salary_weekly desc, cs.staff_name asc;
$function$
;

CREATE OR REPLACE FUNCTION public.count_ai_ai_completed_transfer_deals_on_date(p_game_date date DEFAULT NULL::date)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select count(*)::integer
  from public.rider_transfer_offers o
  join public.clubs buyer on buyer.id = o.buyer_club_id
  join public.clubs seller on seller.id = o.seller_club_id
  where buyer.is_ai = true
    and seller.is_ai = true
    and o.status = 'completed'
    and o.offered_on_game_date::date = coalesce(p_game_date, public.get_current_game_date_date());
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_scouting_reports_overview()
 RETURNS TABLE(report_id uuid, rider_id uuid, rider_name text, rider_country_code text, scout_staff_id uuid, scout_name text, completed_at timestamp without time zone, overall_label text, potential_label text, strengths text[], notes text, status text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select rsr.id,
    rsr.rider_id,
    coalesce(nullif(r.display_name,''),nullif(trim(concat_ws(' ',r.first_name,r.last_name)),''),nullif(rsr.report_json->>'rider_name',''),'Unknown rider')::text,
    r.country_code::text,
    rsr.scout_staff_id,
    coalesce(cs.staff_name,'Scout')::text,
    coalesce(rsr.created_at_game_ts,rsr.scouted_on_game_date::timestamp)::timestamp without time zone,
    coalesce(rsr.report_json #>> '{overall,label}','—')::text,
    case
      when public.scout_metric_label_midpoint_v1(rsr.report_json #>> '{potential,label}') >= 80 then 'Elite'
      when public.scout_metric_label_midpoint_v1(rsr.report_json #>> '{potential,label}') >= 65 then 'High'
      when public.scout_metric_label_midpoint_v1(rsr.report_json #>> '{potential,label}') >= 45 then 'Medium'
      when public.scout_metric_label_midpoint_v1(rsr.report_json #>> '{potential,label}') >= 25 then 'Low'
      when public.scout_metric_label_midpoint_v1(rsr.report_json #>> '{potential,label}') is not null then 'Very Low'
      else '—'
    end::text,
    (select coalesce(array_agg(label order by val desc nulls last),array[]::text[])
     from (select initcap(replace(key,'_',' ')) as label,
                  public.scout_metric_label_midpoint_v1(value->>'label') as val
           from jsonb_each(coalesce(rsr.report_json->'attributes','{}'::jsonb))
           where public.scout_metric_label_midpoint_v1(value->>'label') is not null
           order by public.scout_metric_label_midpoint_v1(value->>'label') desc limit 3) s),
    nullif(rsr.report_json->>'notes','')::text,
    coalesce(rsr.report_json->>'status','new')::text
  from public.rider_scout_reports rsr
  left join public.riders r on r.id=rsr.rider_id
  left join public.club_staff cs on cs.id=rsr.scout_staff_id
  where rsr.club_id=public.resolve_main_club_id_for_user(auth.uid())
  order by coalesce(rsr.created_at_game_ts,rsr.scouted_on_game_date::timestamp) desc nulls last;
$function$
;

CREATE OR REPLACE FUNCTION public.training_camp_star_development_modifier(p_stars integer)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case greatest(1, least(5, coalesce(p_stars, 3)))
    when 1 then 0.95
    when 2 then 0.98
    when 3 then 1.00
    when 4 then 1.05
    when 5 then 1.10
    else 1.00
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.training_camp_star_fatigue_delta(p_stars integer)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case greatest(1, least(5, coalesce(p_stars, 3)))
    when 1 then 2
    when 2 then 1
    when 3 then 0
    when 4 then -1
    when 5 then -2
    else 0
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.training_camp_weather_effect_v1(p_weather_state text)
 RETURNS TABLE(normalized_weather_state text, skill_modifier numeric, base_fatigue_delta integer, risk_level text, sickness_risk_pct numeric, injury_risk_pct numeric, mechanical_risk_pct numeric, should_warn boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with normalized as (
    select
      case
        when lower(coalesce(p_weather_state, 'ideal')) in ('ideal', 'clear', 'sunny') then 'ideal'
        when lower(coalesce(p_weather_state, 'ideal')) in ('partly_cloudy', 'partly cloudy', 'cloudy_sunny') then 'partly_cloudy'
        when lower(coalesce(p_weather_state, 'ideal')) in ('overcast', 'cloudy') then 'overcast'
        when lower(coalesce(p_weather_state, 'ideal')) in ('foggy', 'fog') then 'foggy'
        when lower(coalesce(p_weather_state, 'ideal')) in ('drizzle', 'light_rain', 'light rain') then 'drizzle'
        when lower(coalesce(p_weather_state, 'ideal')) in ('rain', 'wet') then 'rain'
        when lower(coalesce(p_weather_state, 'ideal')) in ('windy', 'strong_wind', 'strong wind') then 'windy'
        when lower(coalesce(p_weather_state, 'ideal')) in ('heavy_rain', 'heavy rain') then 'heavy_rain'
        when lower(coalesce(p_weather_state, 'ideal')) in ('sleet') then 'sleet'
        when lower(coalesce(p_weather_state, 'ideal')) in ('snow', 'snowy') then 'snow'
        when lower(coalesce(p_weather_state, 'ideal')) in ('thunderstorm', 'storm') then 'thunderstorm'
        else lower(coalesce(p_weather_state, 'ideal'))
      end as state
  )
  select
    state as normalized_weather_state,

    case state
      when 'ideal' then 1.00
      when 'partly_cloudy' then 1.00
      when 'overcast' then 0.98
      when 'foggy' then 0.96
      when 'drizzle' then 0.97
      when 'rain' then 0.94
      when 'windy' then 0.95
      when 'heavy_rain' then 0.88
      when 'snow' then 0.85
      when 'sleet' then 0.85
      when 'thunderstorm' then 0.70
      else 1.00
    end::numeric as skill_modifier,

    case state
      when 'ideal' then 0
      when 'partly_cloudy' then 0
      when 'overcast' then 0
      when 'foggy' then 1
      when 'drizzle' then 1
      when 'rain' then 2
      when 'windy' then 2
      when 'heavy_rain' then 4
      when 'snow' then 5
      when 'sleet' then 5
      when 'thunderstorm' then 6
      else 0
    end::integer as base_fatigue_delta,

    case state
      when 'ideal' then 'normal'
      when 'partly_cloudy' then 'normal'
      when 'overcast' then 'normal'
      when 'foggy' then 'small'
      when 'drizzle' then 'small'
      when 'rain' then 'medium'
      when 'windy' then 'medium'
      when 'heavy_rain' then 'high'
      when 'snow' then 'high'
      when 'sleet' then 'high'
      when 'thunderstorm' then 'severe'
      else 'normal'
    end::text as risk_level,

    case state
      when 'foggy' then 0.50
      when 'drizzle' then 1.00
      when 'rain' then 2.50
      when 'windy' then 0.50
      when 'heavy_rain' then 5.00
      when 'snow' then 6.00
      when 'sleet' then 6.00
      when 'thunderstorm' then 8.00
      else 0.00
    end::numeric as sickness_risk_pct,

    case state
      when 'rain' then 0.50
      when 'windy' then 1.50
      when 'heavy_rain' then 3.00
      when 'snow' then 4.00
      when 'sleet' then 4.00
      when 'thunderstorm' then 8.00
      else 0.00
    end::numeric as injury_risk_pct,

    case state
      when 'windy' then 2.00
      when 'heavy_rain' then 2.00
      when 'snow' then 3.00
      when 'sleet' then 3.00
      when 'thunderstorm' then 4.00
      else 0.00
    end::numeric as mechanical_risk_pct,

    case
      when state in ('heavy_rain', 'snow', 'sleet', 'thunderstorm') then true
      else false
    end as should_warn
  from normalized;
$function$
;

CREATE OR REPLACE FUNCTION public.get_staff_assignment_availability_factor(p_staff_id uuid, p_on_date date)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select greatest(
    0,
    1 - least(100, coalesce(sum(load_pct), 0)) / 100.0
  )
  from public.staff_assignment_load
  where staff_id = p_staff_id
    and status = 'active'
    and p_on_date between starts_on and ends_on;
$function$
;

CREATE OR REPLACE FUNCTION public.get_head_coach_effects(p_club_id uuid)
 RETURNS TABLE(staff_id uuid, staff_name text, specialization text, training_efficiency_multiplier numeric, development_multiplier numeric, overload_risk_multiplier numeric, youth_dev_multiplier numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select *
  from public.get_head_coach_effects(
    p_club_id,
    public.get_current_game_date_date()
  );
$function$
;

CREATE OR REPLACE FUNCTION public.get_club_staff_role_capacity(p_club_id uuid)
 RETURNS TABLE(role_type text, display_name text, role_group text, assigned_count integer, max_absolute integer, current_capacity integer, open_slots integer, is_unlocked boolean, locked_reason text, facility_key text, gameplay_status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with role_rows as (
    select rc.role_type, rc.display_name, rc.role_group, rc.max_absolute,
           rc.facility_key, rc.requires_developing_team, rc.gameplay_status
    from public.staff_role_catalog rc
    where rc.is_market_role = true
  ),
  infra as (
    select
      coalesce(max(ci.hq_level), 0)::integer as hq_level,
      coalesce(max(ci.training_center_level), 0)::integer as training_center_level,
      coalesce(max(ci.medical_center_level), 0)::integer as medical_center_level,
      coalesce(max(ci.youth_academy_level), 0)::integer as youth_academy_level,
      coalesce(max(ci.scouting_level), 0)::integer as scouting_level,
      coalesce(max(ci.mechanics_workshop_level), 0)::integer as mechanics_workshop_level
    from public.club_infrastructure ci
    where ci.club_id = p_club_id
  ),
  assigned as (
    select cs.role_type, count(*)::integer as assigned_count
    from public.club_staff cs
    where cs.club_id = p_club_id
      and coalesce(cs.is_active, true) = true
    group by cs.role_type
  ),
  developing_status as (
    select exists (
      select 1
      from public.clubs dc
      where dc.parent_club_id = p_club_id
        and coalesce(dc.club_type, '') = 'developing'
        and dc.deleted_at is null
    ) as has_developing_team
  ),
  capacity_calc as (
    select
      rr.role_type, rr.display_name, rr.role_group, rr.max_absolute,
      rr.facility_key, rr.requires_developing_team, rr.gameplay_status,
      coalesce(a.assigned_count, 0)::integer as assigned_count,
      ds.has_developing_team,
      i.hq_level, i.training_center_level, i.medical_center_level, i.youth_academy_level,
      case
        when rr.role_type = 'trainer' then
          case
            when i.hq_level < 1 then 0
            when i.training_center_level >= 5 then 3
            when i.training_center_level >= 3 then 2
            else 1
          end
        when rr.role_type = 'team_doctor' then
          case
            when i.hq_level < 1 then 0
            when i.medical_center_level >= 3 then 2
            else 1
          end
        when rr.role_type = 'physio' then
          case
            when i.hq_level < 1 then 0
            when i.medical_center_level >= 5 then 5
            when i.medical_center_level >= 4 then 4
            when i.medical_center_level >= 3 then 3
            when i.medical_center_level >= 1 then 2
            else 1
          end
        when rr.role_type = 'nutritionist' then
          case
            when i.hq_level < 1 then 0
            when i.medical_center_level >= 2 then 1
            else 0
          end
        when rr.role_type = 'head_coach' then
          case when i.hq_level >= 1 then 1 else 0 end
        when rr.role_type = 'scout_analyst' then
          case
            when i.hq_level < 1 then 0
            when i.scouting_level >= 4 then 5
            when i.scouting_level >= 3 then 4
            when i.scouting_level >= 2 then 3
            when i.scouting_level >= 1 then 2
            else 1
          end
        when rr.role_type = 'mechanic' then
          case
            when i.hq_level < 1 then 0
            when i.mechanics_workshop_level >= 4 then 5
            when i.mechanics_workshop_level >= 3 then 4
            when i.mechanics_workshop_level >= 2 then 3
            when i.mechanics_workshop_level >= 1 then 2
            else 1
          end
        when rr.role_type = 'u23_head_coach' then
          case
            when ds.has_developing_team = true
              and i.youth_academy_level >= 1
              and public.user_has_premium_access_v1(
                (select owner.owner_user_id from public.clubs owner where owner.id = p_club_id)
              )
              and exists (
                select 1
                from public.clubs dev
                where dev.parent_club_id = p_club_id
                  and dev.club_type = 'developing'
                  and dev.deleted_at is null
                  and public.is_developing_team_access_active_v1(dev.id)
              )
            then 1
            else 0
          end
        when rr.role_type = 'sport_director' then
          case
            when i.hq_level >= 4 then 2
            when i.hq_level >= 2 then 1
            else 0
          end
        else 0
      end::integer as raw_current_capacity
    from role_rows rr
    cross join infra i
    cross join developing_status ds
    left join assigned a on a.role_type = rr.role_type
  )
  select
    cc.role_type, cc.display_name, cc.role_group, cc.assigned_count, cc.max_absolute,
    least(cc.max_absolute, cc.raw_current_capacity)::integer as current_capacity,
    greatest(least(cc.max_absolute, cc.raw_current_capacity) - cc.assigned_count, 0)::integer as open_slots,
    case
      when cc.requires_developing_team = true and cc.has_developing_team = false then false
      when least(cc.max_absolute, cc.raw_current_capacity) <= 0 then false
      else true
    end as is_unlocked,
    case
      when cc.role_type = 'u23_head_coach'
        and not public.user_has_premium_access_v1(
          (select owner.owner_user_id from public.clubs owner where owner.id = p_club_id)
        )
        then 'Premium membership is required for the U23 Head Coach.'
      when cc.requires_developing_team = true and cc.has_developing_team = false
        then 'Developing Team is not unlocked.'
      when cc.role_type = 'u23_head_coach' and cc.youth_academy_level < 1
        then 'Youth Academy Lv 1 is required.'
      when cc.role_type = 'sport_director' and cc.hq_level < 2
        then 'Club House Lv 2 is required.'
      when cc.role_type = 'trainer' and cc.hq_level < 1
        then 'Club House Lv 1 is required.'
      when cc.role_type = 'nutritionist' and cc.hq_level >= 1 and cc.medical_center_level < 2
        then 'Medical Center Lv 2 is required.'
      when cc.hq_level < 1 and cc.role_type <> 'u23_head_coach'
        then 'Club House Lv 1 is required.'
      else null
    end as locked_reason,
    cc.facility_key,
    cc.gameplay_status
  from capacity_calc cc
  order by
    case cc.role_group
      when 'coaching' then 1
      when 'developing_team' then 2
      when 'medical' then 3
      when 'technical' then 4
      when 'race' then 5
      when 'scouting' then 6
      else 99
    end,
    cc.display_name;
$function$
;

CREATE OR REPLACE FUNCTION public.get_staff_role_limits(p_club_id uuid)
 RETURNS TABLE(role_type text, display_name text, role_group text, assigned_count integer, max_absolute integer, current_capacity integer, open_slots integer, is_unlocked boolean, locked_reason text, facility_key text, gameplay_status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    c.role_type,
    c.display_name,
    c.role_group,
    c.assigned_count,
    c.max_absolute,
    c.current_capacity,
    c.open_slots,
    c.is_unlocked,
    c.locked_reason,
    c.facility_key,
    c.gameplay_status
  from public.get_club_staff_role_capacity(p_club_id) c;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_market_daily_refill_cap(p_role_type text)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select case p_role_type
    when 'head_coach' then 6
    when 'trainer' then 10
    when 'team_doctor' then 6
    when 'physio' then 10
    when 'mechanic' then 8
    when 'scout_analyst' then 10
    when 'nutritionist' then 5
    when 'sport_director' then 5
    when 'u23_head_coach' then 5
    else 5
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_staff_role_limit_counts(p_club_id uuid)
 RETURNS TABLE(role_type text, limit_count integer, active_count integer, open_slots integer, can_hire boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    r.role_type::text,
    r.limit_count::integer,
    r.active_count::integer,
    r.open_slots::integer,
    r.can_hire::boolean
  from public.get_staff_role_capacity_overview_for_club(p_club_id) r;
$function$
;

CREATE OR REPLACE FUNCTION public.get_staff_role_capacity_overview_for_club(p_club_id uuid)
 RETURNS TABLE(role_type text, limit_count integer, active_count integer, open_slots integer, can_hire boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
with infra as (
  select
    coalesce(ci.hq_level, 1) as hq_level,
    coalesce(ci.training_center_level, 0) as training_center_level,
    coalesce(ci.medical_center_level, 0) as medical_center_level,
    coalesce(ci.scouting_level, 0) as scouting_level,
    coalesce(ci.youth_academy_level, 0) as youth_academy_level,
    coalesce(ci.mechanics_workshop_level, 0) as mechanics_workshop_level
  from public.club_infrastructure ci
  where ci.club_id = p_club_id
),
safe_infra as (
  select * from infra
  union all
  select 1,0,0,0,0,0
  where not exists (select 1 from infra)
),
club_access as (
  select
    public.user_has_premium_access_v1(c.owner_user_id) as is_premium,
    exists (
      select 1
      from public.clubs d
      where d.parent_club_id = c.id
        and d.club_type = 'developing'
        and d.deleted_at is null
        and public.is_developing_team_access_active_v1(d.id)
    ) as has_active_developing_team
  from public.clubs c
  where c.id = p_club_id
),
safe_access as (
  select * from club_access
  union all
  select false, false
  where not exists (select 1 from club_access)
),
limits as (
  select v.role_type, v.limit_count
  from safe_infra i
  cross join safe_access access
  cross join lateral (
    values
      ('head_coach'::text, 1::integer),
      ('trainer'::text, case when i.training_center_level >= 3 then 2 else 1 end),
      ('team_doctor'::text, case when i.medical_center_level >= 3 then 2 else 1 end),
      ('physio'::text, case when i.medical_center_level >= 5 then 5 when i.medical_center_level >= 4 then 4 when i.medical_center_level >= 3 then 3 when i.medical_center_level >= 1 then 2 else 1 end),
      ('nutritionist'::text, case when i.medical_center_level >= 2 then 1 else 0 end),
      ('mechanic'::text, case when i.mechanics_workshop_level >= 4 then 5 when i.mechanics_workshop_level >= 3 then 4 when i.mechanics_workshop_level >= 2 then 3 when i.mechanics_workshop_level >= 1 then 2 else 1 end),
      ('sport_director'::text, case when i.hq_level >= 4 then 2 when i.hq_level >= 2 then 1 else 0 end),
      ('scout_analyst'::text, case when i.scouting_level >= 4 then 5 when i.scouting_level >= 3 then 4 when i.scouting_level >= 2 then 3 when i.scouting_level >= 1 then 2 else 1 end),
      ('u23_head_coach'::text, case when access.is_premium and access.has_active_developing_team and i.youth_academy_level >= 1 then 1 else 0 end)
  ) as v(role_type, limit_count)
),
active_counts as (
  select cs.role_type::text as role_type, count(*)::integer as active_count
  from public.club_staff cs
  where cs.club_id = p_club_id
    and cs.is_active = true
  group by cs.role_type::text
)
select
  l.role_type,
  l.limit_count,
  coalesce(a.active_count,0)::integer,
  greatest(l.limit_count-coalesce(a.active_count,0),0)::integer,
  (l.limit_count > coalesce(a.active_count,0))::boolean
from limits l
left join active_counts a on a.role_type=l.role_type
order by case l.role_type
  when 'head_coach' then 1 when 'trainer' then 2 when 'team_doctor' then 3
  when 'physio' then 4 when 'nutritionist' then 5 when 'mechanic' then 6
  when 'sport_director' then 7 when 'scout_analyst' then 8 when 'u23_head_coach' then 9
  else 99 end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_club_team_car_fleet_summary(p_club_id uuid)
 RETURNS TABLE(club_id uuid, total_quantity integer, max_total_quantity integer, support_score numeric, max_support_score numeric, support_ratio numeric, support_tier text, mechanical_response_bonus_pct numeric, feeding_support_bonus_pct numeric, tactical_communication_bonus_pct numeric, incident_time_loss_reduction_pct numeric, race_fatigue_reduction_pct numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
select
  s.club_id,
  s.total_cars as total_quantity,
  s.max_total_cars as max_total_quantity,
  s.best_available_support_score as support_score,
  s.max_race_support_score as max_support_score,
  s.best_available_support_ratio as support_ratio,
  s.support_tier,
  s.mechanical_response_bonus_pct,
  s.feeding_support_bonus_pct,
  s.tactical_communication_bonus_pct,
  s.incident_time_loss_reduction_pct,
  s.race_fatigue_reduction_pct
from public.get_club_team_car_garage_summary(p_club_id) s;
$function$
;

CREATE OR REPLACE FUNCTION public.get_infrastructure_facility_job_capacity(p_club_id uuid)
 RETURNS TABLE(club_id uuid, active_facility_jobs integer, max_active_facility_jobs integer, open_facility_job_slots integer, can_start_facility_job boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with allowed as (
  select 1
  from public.clubs c
  left join public.club_memberships cm
    on cm.club_id = c.id
   and cm.user_id = auth.uid()
  where c.id = p_club_id
    and (
      c.owner_user_id = auth.uid()
      or cm.user_id is not null
    )
  limit 1
),
counts as (
  select count(*)::integer as active_count
  from public.club_infrastructure_jobs j
  where j.club_id = p_club_id
    and j.job_type = 'facility_upgrade'
    and j.status = 'pending'
)
select
  p_club_id as club_id,
  counts.active_count as active_facility_jobs,
  2 as max_active_facility_jobs,
  greatest(2 - counts.active_count, 0)::integer as open_facility_job_slots,
  (counts.active_count < 2)::boolean as can_start_facility_job
from counts
where exists (select 1 from allowed);
$function$
;

CREATE OR REPLACE FUNCTION public.team_car_condition_factor(p_condition_percent numeric)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
select case
  when coalesce(p_condition_percent, 0) >= 80 then 1.00
  when coalesce(p_condition_percent, 0) >= 60 then 0.90
  when coalesce(p_condition_percent, 0) >= 40 then 0.75
  when coalesce(p_condition_percent, 0) >= 30 then 0.60
  else 0.00
end::numeric;
$function$
;

CREATE OR REPLACE FUNCTION public.get_club_team_car_roster(p_club_id uuid)
 RETURNS TABLE(car_id uuid, club_id uuid, garage_slot integer, display_name text, asset_level smallint, asset_name text, purchase_cost_cash bigint, support_value numeric, condition_percent numeric, condition_status text, condition_factor numeric, effective_support_value numeric, status text, total_race_days integer, total_distance_km numeric, last_used_game_date date, acquired_game_date date, current_assignment_type text, current_assignment_id uuid, current_assignment_label text, assignment_locked boolean, assignment_start_game_date date, assignment_end_game_date date, condition_loss_per_race_day numeric, repair_cost_per_condition_point bigint, repair_points_per_game_day numeric, min_assign_condition_percent numeric, max_assigned_per_event integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with allowed as (
  select 1
  from public.clubs c
  left join public.club_memberships cm
    on cm.club_id = c.id
   and cm.user_id = auth.uid()
  where c.id = p_club_id
    and (
      c.owner_user_id = auth.uid()
      or cm.user_id is not null
    )
  limit 1
)
select
  tc.id as car_id,
  tc.club_id,
  tc.garage_slot,
  tc.display_name,
  tc.asset_level,
  cfg.asset_name,
  tc.purchase_cost_cash,
  tc.support_value,
  tc.condition_percent,
  case
    when tc.condition_percent >= 80 then 'Excellent'
    when tc.condition_percent >= 60 then 'Good'
    when tc.condition_percent >= 40 then 'Worn'
    when tc.condition_percent >= 30 then 'Poor'
    else 'Not race-ready'
  end as condition_status,
  public.team_car_condition_factor(tc.condition_percent) as condition_factor,
  round(
    tc.support_value * public.team_car_condition_factor(tc.condition_percent),
    2
  ) as effective_support_value,
  tc.status,
  tc.total_race_days,
  tc.total_distance_km,
  tc.last_used_game_date,
  tc.acquired_game_date,
  tc.current_assignment_type,
  tc.current_assignment_id,
  tc.current_assignment_label,
  tc.assignment_locked,
  tc.assignment_start_game_date,
  tc.assignment_end_game_date,
  cfg.condition_loss_per_race_day,
  cfg.repair_cost_per_condition_point,
  cfg.repair_points_per_game_day,
  cfg.min_assign_condition_percent,
  cfg.max_assigned_per_event
from public.club_team_cars tc
join public.infrastructure_asset_config cfg
  on cfg.asset_key = tc.asset_key
 and cfg.asset_level = tc.asset_level
where exists (select 1 from allowed)
  and tc.club_id = p_club_id
  and tc.status <> 'sold'
order by tc.garage_slot asc;
$function$
;

CREATE OR REPLACE FUNCTION public.get_club_team_car_garage_summary(p_club_id uuid)
 RETURNS TABLE(club_id uuid, total_cars integer, max_total_cars integer, available_cars integer, assigned_cars integer, in_repair_cars integer, pending_delivery_cars integer, best_available_support_score numeric, max_race_support_score numeric, best_available_support_ratio numeric, support_tier text, mechanical_response_bonus_pct numeric, feeding_support_bonus_pct numeric, tactical_communication_bonus_pct numeric, incident_time_loss_reduction_pct numeric, race_fatigue_reduction_pct numeric, max_assigned_per_event integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with allowed as (
  select 1
  from public.clubs c
  left join public.club_memberships cm
    on cm.club_id = c.id
   and cm.user_id = auth.uid()
  where c.id = p_club_id
    and (
      c.owner_user_id = auth.uid()
      or cm.user_id is not null
    )
  limit 1
),
cfg as (
  select
    max(max_total_quantity)::integer as max_total_cars,
    max(max_assigned_per_event)::integer as max_assigned_per_event,
    max(support_value)::numeric as best_support_value
  from public.infrastructure_asset_config
  where asset_key = 'team_car'
),
counts as (
  select
    count(*) filter (where status <> 'sold')::integer as total_cars,
    count(*) filter (where status = 'available')::integer as available_cars,
    count(*) filter (where status = 'assigned')::integer as assigned_cars,
    count(*) filter (where status = 'in_repair')::integer as in_repair_cars
  from public.club_team_cars
  where club_id = p_club_id
),
pending as (
  select coalesce(sum(asset_quantity), 0)::integer as pending_delivery_cars
  from public.club_infrastructure_jobs
  where club_id = p_club_id
    and job_type = 'asset_delivery'
    and target_key = 'team_car'
    and status = 'pending'
),
best_available as (
  select
    round(
      sum(effective_support_value),
      2
    ) as best_available_support_score
  from (
    select
      tc.support_value * public.team_car_condition_factor(tc.condition_percent) as effective_support_value
    from public.club_team_cars tc
    where tc.club_id = p_club_id
      and tc.status = 'available'
      and tc.condition_percent >= 30
    order by effective_support_value desc
    limit 3
  ) best
),
score as (
  select
    p_club_id as club_id,
    coalesce(counts.total_cars, 0) as total_cars,
    coalesce(cfg.max_total_cars, 10) as max_total_cars,
    coalesce(counts.available_cars, 0) as available_cars,
    coalesce(counts.assigned_cars, 0) as assigned_cars,
    coalesce(counts.in_repair_cars, 0) as in_repair_cars,
    coalesce(pending.pending_delivery_cars, 0) as pending_delivery_cars,
    coalesce(best_available.best_available_support_score, 0)::numeric as best_available_support_score,
    (coalesce(cfg.max_assigned_per_event, 3) * coalesce(cfg.best_support_value, 3.00))::numeric as max_race_support_score,
    coalesce(cfg.max_assigned_per_event, 3) as max_assigned_per_event
  from counts
  cross join pending
  cross join cfg
  cross join best_available
)
select
  score.club_id,
  score.total_cars,
  score.max_total_cars,
  score.available_cars,
  score.assigned_cars,
  score.in_repair_cars,
  score.pending_delivery_cars,
  round(score.best_available_support_score, 2),
  round(score.max_race_support_score, 2),
  round(
    least(score.best_available_support_score / nullif(score.max_race_support_score, 0), 1),
    4
  ) as best_available_support_ratio,
  case
    when score.best_available_support_score <= 0 then 'None'
    when score.best_available_support_score < 2 then 'Basic'
    when score.best_available_support_score < 4 then 'Solid'
    when score.best_available_support_score < 6.5 then 'Strong'
    else 'Elite'
  end as support_tier,
  round(least(score.best_available_support_score / nullif(score.max_race_support_score, 0), 1) * 15, 2),
  round(least(score.best_available_support_score / nullif(score.max_race_support_score, 0), 1) * 10, 2),
  round(least(score.best_available_support_score / nullif(score.max_race_support_score, 0), 1) * 8, 2),
  round(least(score.best_available_support_score / nullif(score.max_race_support_score, 0), 1) * 12, 2),
  round(least(score.best_available_support_score / nullif(score.max_race_support_score, 0), 1) * 5, 2),
  score.max_assigned_per_event
from score
where exists (select 1 from allowed);
$function$
;

CREATE OR REPLACE FUNCTION public.finance_next_emergency_loan_due_date(p_issued_game_date date)
 RETURNS date
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  /*
    First repayment must be the first Monday that is at least 7 days
    after the loan issue date.

    This avoids emergency loans issued on Sunday being due the next day.
  */
  select (
    (p_issued_game_date + interval '7 days')
    + (
      (
        8 - extract(isodow from (p_issued_game_date + interval '7 days'))::int
      ) % 7
    ) * interval '1 day'
  )::date;
$function$
;

CREATE OR REPLACE FUNCTION public.finance_get_club_cash_balance(p_club_id uuid)
 RETURNS numeric
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(cfs.current_balance, 0)::numeric
  from public.club_finance_summary cfs
  where cfs.club_id = public.finance_resolve_paying_club_id(p_club_id)
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.is_club_liquidated(p_club_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.clubs c
    left join finance.club_insolvency_state cis
      on cis.club_id = c.id
    where c.id = p_club_id
      and (
        c.deleted_at is not null
        or coalesce(cis.status, 'active') = 'liquidated'
        or cis.liquidated_at is not null
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.team_bus_condition_factor(p_condition_percent numeric)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
AS $function$
select
  case
    when coalesce(p_condition_percent, 0) >= 70 then 1.00
    when coalesce(p_condition_percent, 0) >= 50 then 0.85
    when coalesce(p_condition_percent, 0) >= 30 then 0.65
    else 0.00
  end::numeric;
$function$
;

CREATE OR REPLACE FUNCTION public.get_club_team_bus_roster(p_club_id uuid)
 RETURNS TABLE(bus_id uuid, club_id uuid, garage_slot integer, display_name text, asset_level smallint, asset_name text, purchase_cost_cash bigint, support_value numeric, condition_percent numeric, condition_status text, condition_factor numeric, effective_support_value numeric, status text, total_race_days integer, total_distance_km numeric, last_used_game_date date, acquired_game_date date, current_assignment_type text, current_assignment_id uuid, current_assignment_label text, assignment_locked boolean, assignment_start_game_date date, assignment_end_game_date date, condition_loss_per_race_day numeric, repair_cost_per_condition_point bigint, repair_points_per_game_day numeric, min_assign_condition_percent numeric, max_assigned_per_event integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with allowed as (
  select 1
  from public.clubs c
  left join public.club_memberships cm
    on cm.club_id = c.id
   and cm.user_id = auth.uid()
  where c.id = p_club_id
    and (
      c.owner_user_id = auth.uid()
      or cm.user_id is not null
    )
  limit 1
)
select
  tb.id as bus_id,
  tb.club_id,
  tb.garage_slot,
  tb.display_name,
  tb.asset_level,
  cfg.asset_name,
  tb.purchase_cost_cash,
  tb.support_value,
  tb.condition_percent,
  case
    when tb.condition_percent >= 90 then 'Excellent'
    when tb.condition_percent >= 70 then 'Good'
    when tb.condition_percent >= 50 then 'Worn'
    when tb.condition_percent >= 30 then 'Poor'
    else 'Not race-ready'
  end as condition_status,
  public.team_bus_condition_factor(tb.condition_percent) as condition_factor,
  round(
    tb.support_value * public.team_bus_condition_factor(tb.condition_percent),
    2
  ) as effective_support_value,
  tb.status,
  tb.total_race_days,
  tb.total_distance_km,
  tb.last_used_game_date,
  tb.acquired_game_date,
  tb.current_assignment_type,
  tb.current_assignment_id,
  tb.current_assignment_label,
  tb.assignment_locked,
  tb.assignment_start_game_date,
  tb.assignment_end_game_date,
  cfg.condition_loss_per_race_day,
  cfg.repair_cost_per_condition_point,
  cfg.repair_points_per_game_day,
  cfg.min_assign_condition_percent,
  cfg.max_assigned_per_event
from public.club_team_buses tb
join public.infrastructure_asset_config cfg
  on cfg.asset_key = tb.asset_key
 and cfg.asset_level = tb.asset_level
where exists (select 1 from allowed)
  and tb.club_id = p_club_id
  and tb.status <> 'sold'
order by tb.garage_slot asc;
$function$
;

CREATE OR REPLACE FUNCTION public.get_club_team_bus_garage_summary(p_club_id uuid)
 RETURNS TABLE(club_id uuid, total_buses integer, max_total_buses integer, available_buses integer, assigned_buses integer, in_repair_buses integer, pending_delivery_buses integer, best_available_support_score numeric, max_event_support_score numeric, best_available_support_ratio numeric, support_tier text, one_day_fatigue_reduction_pct numeric, short_tour_fatigue_reduction_pct numeric, long_tour_fatigue_reduction_pct numeric, recovery_comfort_bonus_pct numeric, max_assigned_per_event integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with allowed as (
  select 1
  from public.clubs c
  left join public.club_memberships cm
    on cm.club_id = c.id
   and cm.user_id = auth.uid()
  where c.id = p_club_id
    and (c.owner_user_id = auth.uid() or cm.user_id is not null)
  limit 1
),
cfg as (
  select
    max(max_total_quantity)::integer as max_total_buses,
    max(max_assigned_per_event)::integer as max_assigned_per_event,
    max(support_value)::numeric as best_support_value
  from public.infrastructure_asset_config
  where asset_key = 'team_bus'
),
counts as (
  select
    count(*) filter (where status <> 'sold')::integer as total_buses,
    count(*) filter (where status = 'available')::integer as available_buses,
    count(*) filter (where status = 'assigned')::integer as assigned_buses,
    count(*) filter (where status = 'in_repair')::integer as in_repair_buses
  from public.club_team_buses
  where club_id = p_club_id
),
pending as (
  select coalesce(sum(asset_quantity), 0)::integer as pending_delivery_buses
  from public.club_infrastructure_jobs
  where club_id = p_club_id
    and job_type = 'asset_delivery'
    and target_key = 'team_bus'
    and status = 'pending'
),
best_available as (
  select
    tb.asset_level,
    public.team_bus_condition_factor(tb.condition_percent) as condition_factor,
    round(tb.support_value * public.team_bus_condition_factor(tb.condition_percent), 2) as effective_support_value
  from public.club_team_buses tb
  where tb.club_id = p_club_id
    and tb.status = 'available'
    and tb.condition_percent >= 30
  order by
    (case tb.asset_level when 1 then 3 when 2 then 6 when 3 then 11 else 0 end)
      * public.team_bus_condition_factor(tb.condition_percent) desc,
    tb.asset_level desc,
    tb.condition_percent desc
  limit 1
),
score as (
  select
    p_club_id as club_id,
    coalesce(counts.total_buses, 0) as total_buses,
    coalesce(cfg.max_total_buses, 3) as max_total_buses,
    coalesce(counts.available_buses, 0) as available_buses,
    coalesce(counts.assigned_buses, 0) as assigned_buses,
    coalesce(counts.in_repair_buses, 0) as in_repair_buses,
    coalesce(pending.pending_delivery_buses, 0) as pending_delivery_buses,
    coalesce(best_available.effective_support_value, 0)::numeric as best_available_support_score,
    coalesce(cfg.best_support_value, 3.00)::numeric as max_event_support_score,
    coalesce(cfg.max_assigned_per_event, 1) as max_assigned_per_event,
    coalesce(best_available.asset_level, 0)::integer as best_level,
    coalesce(best_available.condition_factor, 0)::numeric as condition_factor
  from counts
  cross join pending
  cross join cfg
  left join best_available on true
)
select
  score.club_id,
  score.total_buses,
  score.max_total_buses,
  score.available_buses,
  score.assigned_buses,
  score.in_repair_buses,
  score.pending_delivery_buses,
  round(score.best_available_support_score, 2),
  round(score.max_event_support_score, 2),
  round(least(score.best_available_support_score / nullif(score.max_event_support_score, 0), 1), 4),
  case
    when score.best_level <= 0 then 'None'
    when score.best_level = 1 then 'Basic'
    when score.best_level = 2 then 'Strong'
    else 'Elite'
  end,
  -- Legacy field consumed by the existing Rider recovery card: return real Recovery Support.
  round((case score.best_level when 1 then 1 when 2 then 2 when 3 then 4 else 0 end) * score.condition_factor, 2),
  -- Legacy fatigue fields: return the real Fatigue Control contribution (no fake tour multiplier).
  round((case score.best_level when 1 then 2 when 2 then 4 when 3 then 7 else 0 end) * score.condition_factor, 2),
  round((case score.best_level when 1 then 2 when 2 then 4 when 3 then 7 else 0 end) * score.condition_factor, 2),
  round((case score.best_level when 1 then 1 when 2 then 2 when 3 then 4 else 0 end) * score.condition_factor, 2),
  score.max_assigned_per_event
from score
where exists (select 1 from allowed);
$function$
;

CREATE OR REPLACE FUNCTION public.get_club_medical_van_roster(p_club_id uuid)
 RETURNS TABLE(van_id uuid, club_id uuid, garage_slot integer, display_name text, asset_level smallint, asset_name text, purchase_cost_cash bigint, support_value numeric, condition_percent numeric, condition_status text, condition_factor numeric, effective_support_value numeric, status text, total_race_days integer, total_distance_km numeric, last_used_game_date date, acquired_game_date date, current_assignment_type text, current_assignment_id uuid, current_assignment_label text, assignment_locked boolean, assignment_start_game_date date, assignment_end_game_date date, condition_loss_per_race_day numeric, repair_cost_per_condition_point integer, repair_points_per_game_day numeric, min_assign_condition_percent numeric, max_assigned_per_event integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select
    mv.id as van_id,
    mv.club_id,
    mv.garage_slot,
    mv.display_name,
    mv.asset_level,
    coalesce(
      cfg.asset_name,
      mv.metadata->>'asset_name',
      ('Medical Van Lv ' || mv.asset_level)::text
    ) as asset_name,
    mv.purchase_cost_cash,
    mv.support_value::numeric,
    mv.condition_percent::numeric,
    case
      when mv.condition_percent >= 90 then 'Excellent'
      when mv.condition_percent >= 70 then 'Good'
      when mv.condition_percent >= 30 then 'Worn'
      else 'Critical'
    end as condition_status,
    round((greatest(least(mv.condition_percent, 100), 0) / 100.0)::numeric, 4) as condition_factor,
    case
      when mv.status = 'sold' then 0::numeric
      else round(
        (mv.support_value * greatest(least(mv.condition_percent, 100), 0) / 100.0)::numeric,
        2
      )
    end as effective_support_value,
    mv.status,
    mv.total_race_days,
    mv.total_distance_km,
    mv.last_used_game_date,
    mv.acquired_game_date,
    mv.current_assignment_type,
    mv.current_assignment_id,
    mv.current_assignment_label,
    mv.assignment_locked,
    mv.assignment_start_game_date,
    mv.assignment_end_game_date,
    coalesce(cfg.condition_loss_per_race_day, 0)::numeric as condition_loss_per_race_day,
    coalesce(cfg.repair_cost_per_condition_point, 0)::integer as repair_cost_per_condition_point,
    coalesce(cfg.repair_points_per_game_day, 1)::numeric as repair_points_per_game_day,
    coalesce(cfg.min_assign_condition_percent, 30)::numeric as min_assign_condition_percent,
    coalesce(cfg.max_assigned_per_event, 1)::integer as max_assigned_per_event
  from public.club_medical_vans mv
  left join public.infrastructure_asset_config cfg
    on cfg.asset_key = 'medical_van'
   and cfg.asset_level = mv.asset_level
  where mv.club_id = p_club_id
    and mv.status <> 'sold'
  order by mv.garage_slot asc, mv.created_at asc;
$function$
;

CREATE OR REPLACE FUNCTION public.equipment_calculate_catalog_setup_bonus_preview(p_frame_catalog_item_id uuid DEFAULT NULL::uuid, p_wheelset_catalog_item_id uuid DEFAULT NULL::uuid, p_tires_catalog_item_id uuid DEFAULT NULL::uuid, p_groupset_catalog_item_id uuid DEFAULT NULL::uuid, p_helmet_catalog_item_id uuid DEFAULT NULL::uuid, p_shoes_catalog_item_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with config as (
  select
    4::numeric as equipment_bonus_cap_pct,
    4::numeric as equipment_fatigue_cap_pct,
    5::numeric as team_support_cap_pct,
    8::numeric as total_non_rider_support_cap_pct,
    10::numeric as total_fatigue_reduction_cap_pct
),
selected_catalog as (
  select *
  from (
    values
      ('frame'::text, p_frame_catalog_item_id),
      ('wheelset'::text, p_wheelset_catalog_item_id),
      ('tires'::text, p_tires_catalog_item_id),
      ('groupset'::text, p_groupset_catalog_item_id),
      ('helmet'::text, p_helmet_catalog_item_id),
      ('shoes'::text, p_shoes_catalog_item_id)
  ) as v(equipment_category, catalog_item_id)
),
selected_items as (
  select
    cw.equipment_category,
    cw.display_label as category_label,
    cw.weight,
    cw.sort_order,
    sc.catalog_item_id,
    ec.id as item_id,
    ec.display_name,
    ec.item_key,
    ec.quality_score,
    ec.metadata->>'quality_label' as quality_label,
    ec.metadata->>'terrain_role' as terrain_role,
    sponsor.name as brand_name,
    coalesce(ec.effects, '{}'::jsonb) as effects
  from public.equipment_bonus_category_weights cw
  left join selected_catalog sc
    on sc.equipment_category = cw.equipment_category
  left join public.equipment_catalog ec
    on ec.id = sc.catalog_item_id
   and ec.equipment_kind = 'durable'
   and ec.equipment_category = cw.equipment_category
   and ec.is_active is true
  left join public.sponsor_companies sponsor
    on sponsor.id = ec.brand_company_id
  where cw.is_active is true
),
weighted_bonus_rows as (
  select
    si.equipment_category,
    abk.bonus_key,
    abk.display_label,
    abk.sort_order,
    abk.is_fatigue_bonus,
    coalesce((si.effects->>abk.bonus_key)::numeric, 0) as item_bonus_pct,
    coalesce((si.effects->>abk.bonus_key)::numeric, 0) * si.weight as weighted_bonus_pct
  from selected_items si
  cross join public.equipment_bonus_allowed_keys abk
  where si.item_id is not null
    and abk.is_active is true
),
raw_bonus_totals as (
  select
    abk.bonus_key,
    abk.display_label,
    abk.sort_order,
    abk.is_fatigue_bonus,
    coalesce(sum(wbr.weighted_bonus_pct), 0) as raw_bonus_pct
  from public.equipment_bonus_allowed_keys abk
  left join weighted_bonus_rows wbr
    on wbr.bonus_key = abk.bonus_key
  where abk.is_active is true
  group by
    abk.bonus_key,
    abk.display_label,
    abk.sort_order,
    abk.is_fatigue_bonus
),
capped_bonus_totals as (
  select
    rbt.bonus_key,
    rbt.display_label,
    rbt.sort_order,
    rbt.is_fatigue_bonus,
    round(rbt.raw_bonus_pct, 2) as raw_bonus_pct,
    round(
      greatest(
        -4,
        least(
          rbt.raw_bonus_pct,
          case
            when rbt.is_fatigue_bonus then config.equipment_fatigue_cap_pct
            else config.equipment_bonus_cap_pct
          end
        )
      ),
      2
    ) as capped_bonus_pct
  from raw_bonus_totals rbt
  cross join config
)
select jsonb_build_object(
  'bonus_model', 'weighted_equipment_setup_bonus_v1',
  'caps', jsonb_build_object(
    'equipment_stage_bonus_cap_pct', config.equipment_bonus_cap_pct,
    'equipment_fatigue_cap_pct', config.equipment_fatigue_cap_pct,
    'team_support_cap_pct', config.team_support_cap_pct,
    'total_non_rider_support_cap_pct', config.total_non_rider_support_cap_pct,
    'total_fatigue_reduction_cap_pct', config.total_fatigue_reduction_cap_pct
  ),
  'weighted_bonuses', (
    select jsonb_object_agg(
      cbt.bonus_key,
      cbt.capped_bonus_pct
      order by cbt.sort_order
    )
    from capped_bonus_totals cbt
  ),
  'raw_weighted_bonuses', (
    select jsonb_object_agg(
      cbt.bonus_key,
      cbt.raw_bonus_pct
      order by cbt.sort_order
    )
    from capped_bonus_totals cbt
  ),
  'selected_items', (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'equipment_category', si.equipment_category,
          'category_label', si.category_label,
          'weight', si.weight,
          'catalog_item_id', si.catalog_item_id,
          'display_name', si.display_name,
          'brand_name', si.brand_name,
          'quality_label', si.quality_label,
          'terrain_role', si.terrain_role,
          'effects', si.effects
        )
        order by si.sort_order
      ),
      '[]'::jsonb
    )
    from selected_items si
  )
)
from config;
$function$
;

CREATE OR REPLACE FUNCTION public.equipment_get_starter_equipment_catalog()
 RETURNS TABLE(equipment_category text, brand_name text, display_name text, required_count integer, catalog_item_id uuid)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with starter_def as (
    select *
    from (
      values
        ('frame'::text, 'Cannondalea'::text, 'Meridian Core'::text, 10),
        ('wheelset'::text, 'Fulcram'::text, 'NeraCore F40'::text, 10),
        ('tires'::text, 'Spacialized'::text, 'BaseWay Road'::text, 10),
        ('groupset'::text, 'Campagnola'::text, 'Axiom Gearset 120'::text, 10),
        ('helmet'::text, 'Skott'::text, 'CityRace Comp'::text, 10),
        ('shoes'::text, 'Spacialized'::text, 'BaseLock Road'::text, 10)
    ) as v(equipment_category, brand_name, display_name, required_count)
  )
  select
    sd.equipment_category,
    sd.brand_name,
    sd.display_name,
    sd.required_count,
    ec.id as catalog_item_id
  from starter_def sd
  join public.sponsor_companies sc
    on lower(sc.name) = lower(sd.brand_name)
  join public.equipment_catalog ec
    on ec.brand_company_id = sc.id
   and ec.equipment_kind = 'durable'
   and ec.equipment_category = sd.equipment_category
   and ec.display_name = sd.display_name
   and ec.is_active is true;
$function$
;

CREATE OR REPLACE FUNCTION public.get_race_detail_v1(p_race_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'race', to_jsonb(r),
    'stages', coalesce((
      select jsonb_agg(
        to_jsonb(s)
        || jsonb_build_object(
          'points', coalesce((
            select jsonb_agg(to_jsonb(p) order by p.sort_order, p.km_from_start, p.created_at)
            from public.race_stage_points p
            where p.stage_id = s.id
          ), '[]'::jsonb)
        )
        order by s.stage_number
      )
      from public.race_stages s
      where s.race_id = r.id
    ), '[]'::jsonb)
  )
  from public.races r
  where r.id = p_race_id;
$function$
;

CREATE OR REPLACE FUNCTION public.get_race_participants_v1(p_race_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with club_rankings as (
    select
      c.id as club_id,
      c.club_tier::text as club_tier,
      coalesce(
        c.tier2_division::text,
        c.tier3_division::text,
        c.amateur_division::text,
        'main'
      ) as division_key,
      coalesce(c.season_points, 0) as season_points,
      rank() over (
        partition by
          coalesce(c.club_tier::text, 'unknown'),
          coalesce(
            c.tier2_division::text,
            c.tier3_division::text,
            c.amateur_division::text,
            'main'
          )
        order by coalesce(c.season_points, 0) desc, c.name asc
      ) as competition_rank
    from public.clubs c
    where c.deleted_at is null
      and coalesce(c.is_active, true) = true
  ),
  accepted_teams as (
    select
      rpt.id,
      rpt.race_id,
      rpt.team_id,
      rpt.status,
      rpt.team_name_snapshot,
      coalesce(nullif(rpt.logo_url_snapshot, ''), nullif(c.logo_path, '')) as logo_url_snapshot,
      rpt.country_code_snapshot,
      rpt.ranking_snapshot,

      c.club_tier::text as club_tier,
      coalesce(
        c.tier2_division::text,
        c.tier3_division::text,
        c.amateur_division::text,
        'main'
      ) as division_key,
      cr.competition_rank,
      cr.season_points as competition_points,

      case
        when c.club_tier::text = 'worldteam' then 'WorldTeam'
        when c.club_tier::text = 'proteam' then 'ProTeam'
        when c.club_tier::text = 'continental' then 'Continental'
        when c.club_tier::text = 'amateur' then 'Amateur'
        when c.club_tier is not null then initcap(replace(c.club_tier::text, '_', ' '))
        else 'Competition'
      end as competition_label
    from public.race_participant_teams rpt
    left join public.clubs c
      on c.id = rpt.team_id
    left join club_rankings cr
      on cr.club_id = rpt.team_id
    where rpt.race_id = p_race_id
      and rpt.status = 'accepted'
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'race_id', t.race_id,
        'team_id', t.team_id,
        'status', t.status,
        'team_name_snapshot', t.team_name_snapshot,
        'logo_url_snapshot', t.logo_url_snapshot,
        'country_code_snapshot', t.country_code_snapshot,
        'ranking_snapshot', t.ranking_snapshot,

        'competition_label', t.competition_label,
        'competition_rank', t.competition_rank,
        'competition_points', t.competition_points,
        'club_tier', t.club_tier,
        'division_key', t.division_key,

        'riders', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'id', rpr.id,
                'race_id', rpr.race_id,
                'team_id', rpr.team_id,
                'rider_id', rpr.rider_id,
                'rider_name_snapshot', rpr.rider_name_snapshot,
                'team_name_snapshot', rpr.team_name_snapshot,
                'country_code_snapshot', rpr.country_code_snapshot,
                'age_snapshot', rpr.age_snapshot,
                'is_young_rider', rpr.is_young_rider,
                'start_number', rpr.start_number,

                'role_snapshot', rsv.role,
                'overall_snapshot', rsv.overall
              )
              order by rpr.start_number nulls last, rpr.rider_name_snapshot
            )
            from public.race_participant_riders rpr
            left join public.rider_statistics_view rsv
              on rsv.rider_id = rpr.rider_id
            where rpr.race_id = t.race_id
              and rpr.team_id = t.team_id
          ),
          '[]'::jsonb
        )
      )
      order by t.team_name_snapshot
    ),
    '[]'::jsonb
  )
  from accepted_teams t;
$function$
;

CREATE OR REPLACE FUNCTION public.get_race_participants_v1(p_race_id uuid, p_viewer_club_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with club_rankings as (
    select
      c.id as club_id,
      c.club_tier::text as club_tier,
      coalesce(
        c.tier2_division::text,
        c.tier3_division::text,
        c.amateur_division::text,
        'main'
      ) as division_key,
      coalesce(c.season_points, 0) as season_points,
      rank() over (
        partition by
          coalesce(c.club_tier::text, 'unknown'),
          coalesce(
            c.tier2_division::text,
            c.tier3_division::text,
            c.amateur_division::text,
            'main'
          )
        order by coalesce(c.season_points, 0) desc, c.name asc
      ) as competition_rank
    from public.clubs c
    where c.deleted_at is null
      and coalesce(c.is_active, true) = true
  ),
  accepted_teams as (
    select
      rpt.id,
      rpt.race_id,
      rpt.team_id,
      rpt.status,
      rpt.team_name_snapshot,
      coalesce(nullif(rpt.logo_url_snapshot, ''), nullif(c.logo_path, '')) as logo_url_snapshot,
      rpt.country_code_snapshot,
      rpt.ranking_snapshot,

      c.club_tier::text as club_tier,
      coalesce(
        c.tier2_division::text,
        c.tier3_division::text,
        c.amateur_division::text,
        'main'
      ) as division_key,
      cr.competition_rank,
      cr.season_points as competition_points,

      case
        when c.club_tier::text = 'worldteam' then 'WorldTeam League'
        when c.club_tier::text = 'proteam' then
          'ProTeam / ' || initcap(replace(coalesce(c.tier2_division::text, 'main'), '_', ' '))
        when c.club_tier::text = 'continental' then
          'Continental / ' || initcap(replace(coalesce(c.tier3_division::text, 'main'), '_', ' '))
        when c.club_tier::text = 'amateur' then
          'Amateur / ' || initcap(replace(coalesce(c.amateur_division::text, 'main'), '_', ' '))
        when c.club_tier is not null then initcap(replace(c.club_tier::text, '_', ' '))
        else 'Competition'
      end as competition_display
    from public.race_participant_teams rpt
    left join public.clubs c
      on c.id = rpt.team_id
    left join club_rankings cr
      on cr.club_id = rpt.team_id
    where rpt.race_id = p_race_id
      and rpt.status = 'accepted'
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'race_id', t.race_id,
        'team_id', t.team_id,
        'status', t.status,
        'team_name_snapshot', t.team_name_snapshot,
        'logo_url_snapshot', t.logo_url_snapshot,
        'country_code_snapshot', t.country_code_snapshot,
        'ranking_snapshot', t.ranking_snapshot,

        'competition_display', t.competition_display,
        'competition_rank', t.competition_rank,
        'competition_points', t.competition_points,
        'club_tier', t.club_tier,
        'division_key', t.division_key,

        'riders', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'id', rpr.id,
                'race_id', rpr.race_id,
                'team_id', rpr.team_id,
                'rider_id', rpr.rider_id,
                'rider_name_snapshot', rpr.rider_name_snapshot,
                'team_name_snapshot', rpr.team_name_snapshot,
                'country_code_snapshot', rpr.country_code_snapshot,
                'age_snapshot', rpr.age_snapshot,
                'is_young_rider', rpr.is_young_rider,
                'start_number', rpr.start_number,

                'role_snapshot', rsv.role,
                'overall_snapshot', rsv.overall,

                'can_view_exact_overall',
                  case
                    when p_viewer_club_id is not null
                     and rpr.team_id = p_viewer_club_id then true
                    else false
                  end,

                'overall_range_label',
                  case
                    when rsv.overall is null then 'OVR —'
                    when p_viewer_club_id is not null
                     and rpr.team_id = p_viewer_club_id then 'OVR ' || round(rsv.overall)::text
                    when rsv.overall < 20 then 'OVR 0–20'
                    when rsv.overall < 40 then 'OVR 20–40'
                    when rsv.overall < 60 then 'OVR 40–60'
                    when rsv.overall < 80 then 'OVR 60–80'
                    else 'OVR 80–100'
                  end
              )
              order by rpr.start_number nulls last, rpr.rider_name_snapshot
            )
            from public.race_participant_riders rpr
            left join public.rider_statistics_view rsv
              on rsv.rider_id = rpr.rider_id
            where rpr.race_id = t.race_id
              and rpr.team_id = t.team_id
          ),
          '[]'::jsonb
        )
      )
      order by t.team_name_snapshot
    ),
    '[]'::jsonb
  )
  from accepted_teams t;
$function$
;

CREATE OR REPLACE FUNCTION public.get_race_results_view_v1(p_race_id uuid, p_after_stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$with selected_stage as (
  select coalesce(
    p_after_stage_id,
    (
      select rs.id
      from public.race_stages rs
      where rs.race_id = p_race_id
      order by rs.stage_number asc
      limit 1
    )
  ) as stage_id
),

stage_results as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'rank', rsr.rank,
        'rider_id', rsr.rider_id,
        'team_id', rsr.team_id,
        'rider_name_snapshot', rsr.rider_name_snapshot,
        'team_name_snapshot', rsr.team_name_snapshot,
        'elapsed_seconds', rsr.elapsed_seconds,
        'gap_seconds', rsr.gap_seconds,
        'bonus_seconds', rsr.bonus_seconds,
        'penalty_seconds', rsr.penalty_seconds,
        'finish_points', rsr.finish_points,
        'sprint_points', rsr.sprint_points,
        'mountain_points', rsr.mountain_points,
        'status', rsr.status
      )
      order by rsr.rank
    ),
    '[]'::jsonb
  ) as rows
  from selected_stage ss
  join public.race_stage_results rsr
    on rsr.stage_id = ss.stage_id
   and rsr.race_id = p_race_id
),

point_results as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'point_id', rspr.point_id,
        'point_type', rsp.point_type::text,
        'point_name', rsp.name,
        'km_from_start', rsp.km_from_start,
        'rank', rspr.rank,
        'rider_id', rspr.rider_id,
        'team_id', rspr.team_id,
        'rider_name_snapshot', rspr.rider_name_snapshot,
        'team_name_snapshot', rspr.team_name_snapshot,
        'points_awarded', rspr.points_awarded,
        'bonus_seconds_awarded', rspr.bonus_seconds_awarded
      )
      order by
        rsp.km_from_start nulls last,
        rsp.sort_order nulls last,
        rspr.rank
    ),
    '[]'::jsonb
  ) as rows
  from selected_stage ss
  join public.race_stage_point_results rspr
    on rspr.stage_id = ss.stage_id
   and rspr.race_id = p_race_id
  join public.race_stage_points rsp
    on rsp.id = rspr.point_id
),

classifications as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'classification_type', rcs.classification_type::text,
        'entity_type', rcs.entity_type::text,
        'rank', rcs.rank,
        'previous_rank', rcs.previous_rank,
        'rider_id', rcs.rider_id,
        'team_id', rcs.team_id,
        'display_name_snapshot', rcs.display_name_snapshot,
        'team_name_snapshot', rcs.team_name_snapshot,
        'total_time_seconds', rcs.total_time_seconds,
        'gap_seconds', rcs.gap_seconds,
        'points', rcs.points
      )
      order by
        rcs.classification_type::text,
        rcs.rank
    ),
    '[]'::jsonb
  ) as rows
  from selected_stage ss
  join public.race_classification_standings rcs
    on rcs.after_stage_id = ss.stage_id
   and rcs.race_id = p_race_id
),

leader_snapshot as (
  select coalesce(
    (
      select nullif(
        leader_snapshot_row.payload,
        '{}'::jsonb
      )
      from selected_stage selected
      join public.race_leader_snapshots leader_snapshot_row
        on leader_snapshot_row.after_stage_id =
          selected.stage_id
       and leader_snapshot_row.race_id =
          p_race_id
      limit 1
    ),

    (
      select jsonb_strip_nulls(
        jsonb_build_object(
          'general',
          (
            select jsonb_build_object(
              'name',
                standing.display_name_snapshot,
              'team',
                standing.team_name_snapshot,
              'value',
                to_char(
                  make_interval(
                    secs => coalesce(
                      standing.total_time_seconds,
                      0
                    )
                  ),
                  'HH24:MI:SS'
                )
            )
            from public.race_classification_standings standing
            where standing.race_id = p_race_id
              and standing.after_stage_id =
                selected.stage_id
              and standing.classification_type =
                'general'
              and standing.entity_type = 'rider'
              and standing.rank = 1
            limit 1
          ),

          'sprinter',
          (
            select jsonb_build_object(
              'name',
                standing.display_name_snapshot,
              'team',
                standing.team_name_snapshot,
              'value',
                coalesce(standing.points, 0)::text ||
                ' pts'
            )
            from public.race_classification_standings standing
            where standing.race_id = p_race_id
              and standing.after_stage_id =
                selected.stage_id
              and standing.classification_type =
                'points'
              and standing.entity_type = 'rider'
              and standing.rank = 1
            limit 1
          ),

          'mountain',
          (
            select jsonb_build_object(
              'name',
                standing.display_name_snapshot,
              'team',
                standing.team_name_snapshot,
              'value',
                coalesce(standing.points, 0)::text ||
                ' pts'
            )
            from public.race_classification_standings standing
            where standing.race_id = p_race_id
              and standing.after_stage_id =
                selected.stage_id
              and standing.classification_type =
                'mountain'
              and standing.entity_type = 'rider'
              and standing.rank = 1
            limit 1
          ),

          'young',
          (
            select jsonb_build_object(
              'name',
                standing.display_name_snapshot,
              'team',
                standing.team_name_snapshot,
              'value',
                to_char(
                  make_interval(
                    secs => coalesce(
                      standing.total_time_seconds,
                      0
                    )
                  ),
                  'HH24:MI:SS'
                )
            )
            from public.race_classification_standings standing
            where standing.race_id = p_race_id
              and standing.after_stage_id =
                selected.stage_id
              and standing.classification_type =
                'young'
              and standing.entity_type = 'rider'
              and standing.rank = 1
            limit 1
          ),

          'team',
          (
            select jsonb_build_object(
              'name',
                coalesce(
                  standing.display_name_snapshot,
                  standing.team_name_snapshot
                ),
              'team',
                standing.team_name_snapshot,
              'value',
                to_char(
                  make_interval(
                    secs => coalesce(
                      standing.total_time_seconds,
                      0
                    )
                  ),
                  'HH24:MI:SS'
                )
            )
            from public.race_classification_standings standing
            where standing.race_id = p_race_id
              and standing.after_stage_id =
                selected.stage_id
              and standing.classification_type =
                'team'
              and standing.entity_type = 'team'
              and standing.rank = 1
            limit 1
          )
        )
      )
      from selected_stage selected
    ),

    '{}'::jsonb
  ) as payload
)

select jsonb_build_object(
  'race_id', p_race_id,
  'stage_id', ss.stage_id,
  'stage_results', sr.rows,
  'point_results', pr.rows,
  'classifications', cls.rows,
  'leader_snapshot', ls.payload
)
from selected_stage ss
cross join stage_results sr
cross join point_results pr
cross join classifications cls
cross join leader_snapshot ls;$function$
;

CREATE OR REPLACE FUNCTION public.get_race_entry_overview_v1(p_race_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with rules as (
    select
      rer.*,
      rcr.display_name,
      rcr.race_format,
      rcr.prize_fund_min_cash,
      rcr.prize_fund_max_cash
    from public.race_entry_rules rer
    join public.race_category_rules rcr
      on rcr.race_class_code = rer.race_class_code
    where rer.race_id = p_race_id
  ),
  participants as (
    select count(*)::integer as team_count
    from (
      select rpt.team_id
      from public.race_participant_teams rpt
      where rpt.race_id = p_race_id

      union

      select coalesce(rte.participating_club_id, rte.club_id) as team_id
      from public.race_team_entries rte
      where rte.race_id = p_race_id
        and rte.status in ('accepted', 'confirmed')
    ) participant_union
    where participant_union.team_id is not null
  ),
  accepted_applications as (
    select count(distinct rta.team_id)::integer as team_count
    from public.race_team_applications rta
    where rta.race_id = p_race_id
      and rta.application_status = 'accepted'
  ),
  submitted_applications as (
    select count(distinct rta.team_id)::integer as team_count
    from public.race_team_applications rta
    where rta.race_id = p_race_id
      and rta.application_status in ('submitted', 'accepted', 'waitlisted')
  ),
  accepted_union as (
    select rpt.team_id
    from public.race_participant_teams rpt
    where rpt.race_id = p_race_id

    union

    select rta.team_id
    from public.race_team_applications rta
    where rta.race_id = p_race_id
      and rta.application_status = 'accepted'

    union

    select coalesce(rte.participating_club_id, rte.club_id) as team_id
    from public.race_team_entries rte
    where rte.race_id = p_race_id
      and rte.status in ('accepted', 'confirmed')
  ),
  accepted_count as (
    select count(*)::integer as team_count
    from accepted_union
    where team_id is not null
  )
  select coalesce(
    (
      select jsonb_build_object(
        'race_id', rules.race_id,
        'race_class_code', rules.race_class_code,
        'display_name', rules.display_name,
        'race_format', rules.race_format,

        'target_teams', rules.target_teams,
        'min_teams', rules.min_teams,
        'max_teams', rules.max_teams,
        'min_riders_per_team', rules.min_riders_per_team,
        'max_riders_per_team', rules.max_riders_per_team,

        'applications_status', rules.applications_status,
        'application_window_policy', rules.application_window_policy,

        'race_season_number', rules.race_season_number,
        'race_start_month_number', rules.race_start_month_number,
        'race_start_day_number', rules.race_start_day_number,
        'race_start_display', public.format_season_mmdd_v1(
          rules.race_season_number,
          rules.race_start_month_number,
          rules.race_start_day_number
        ),

        'applications_open_season_number', rules.applications_open_season_number,
        'applications_open_month_number', rules.applications_open_month_number,
        'applications_open_day_number', rules.applications_open_day_number,
        'applications_open_display', public.format_season_mmdd_v1(
          rules.applications_open_season_number,
          rules.applications_open_month_number,
          rules.applications_open_day_number
        ),

        'applications_close_season_number', rules.applications_close_season_number,
        'applications_close_month_number', rules.applications_close_month_number,
        'applications_close_day_number', rules.applications_close_day_number,
        'applications_close_display', public.format_season_mmdd_v1(
          rules.applications_close_season_number,
          rules.applications_close_month_number,
          rules.applications_close_day_number
        ),

        'auto_close_when_full', rules.auto_close_when_full,
        'allow_waitlist', rules.allow_waitlist,

        'accepted_teams', coalesce(ac.team_count, 0),
        'participant_teams', coalesce(p.team_count, 0),
        'accepted_application_teams', coalesce(aa.team_count, 0),
        'submitted_application_teams', coalesce(sa.team_count, 0),
        'available_target_slots', greatest(0, rules.target_teams - coalesce(ac.team_count, 0)),
        'available_max_slots', greatest(0, rules.max_teams - coalesce(ac.team_count, 0)),

        'prize_fund_cash', rules.prize_fund_cash,
        'prize_fund_min_cash', rules.prize_fund_min_cash,
        'prize_fund_max_cash', rules.prize_fund_max_cash,
        'prize_fund_source', rules.prize_fund_source
      )
      from rules
      cross join accepted_count ac
      cross join participants p
      cross join accepted_applications aa
      cross join submitted_applications sa
    ),
    '{}'::jsonb
  );
$function$
;

