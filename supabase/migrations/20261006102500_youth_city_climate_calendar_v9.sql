-- Youth Academy city-level climate calendar v9
-- Fixes the month browser showing all 87 seeded candidates and replaces
-- country-only climate screening with a conservative city-specific season gate.

create table if not exists private.youth_race_city_climate_windows_v9(
  country_code text not null,
  city_name text not null,
  allowed_months smallint[] not null,
  primary key(country_code,city_name)
);

truncate table private.youth_race_city_climate_windows_v9;

insert into private.youth_race_city_climate_windows_v9(
  country_code,city_name,allowed_months
) values
('DE','Freiburg',array[4,5,6,7,8,9,10]::smallint[]),
('AT','Innsbruck',array[5,6,7,8,9]::smallint[]),
('CH','Basel',array[4,5,6,7,8,9,10]::smallint[]),
('CZ','Brno',array[4,5,6,7,8,9]::smallint[]),
('PL','Kraków',array[5,6,7,8,9]::smallint[]),
('SK','Košice',array[4,5,6,7,8,9]::smallint[]),

('KE','Nairobi',array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),
('TZ','Arusha',array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),
('RW','Kigali',array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),
('ZA','Cape Town',array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),
('NA','Windhoek',array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),
('ZM','Lusaka',array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),

('TH','Chiang Mai',array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),
('VN','Da Nang',array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),
('JP','Kyoto',array[4,5,6,7,8,9,10,11]::smallint[]),
('KR','Busan',array[4,5,6,7,8,9,10,11]::smallint[]),
('ID','Bandung',array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),
('MY','Penang',array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),

('US','Boulder',array[4,5,6,7,8,9,10]::smallint[]),
('US','Asheville',array[4,5,6,7,8,9,10]::smallint[]),
('US','Madison',array[5,6,7,8,9]::smallint[]),
('CA','Victoria',array[5,6,7,8,9]::smallint[]),
('CA','Kelowna',array[4,5,6,7,8,9]::smallint[]),
('MX','Oaxaca',array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),

('DK','Aarhus',array[5,6,7,8,9]::smallint[]),
('SE','Uppsala',array[5,6,7,8,9]::smallint[]),
('NO','Bergen',array[6,7,8,9]::smallint[]),
('FI','Tampere',array[5,6,7,8]::smallint[]),
('EE','Tartu',array[5,6,7,8,9]::smallint[]),
('UA','Lviv',array[5,6,7,8,9]::smallint[]),

('AU','Adelaide',array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),
('AU','Hobart',array[10,11,12,1,2,3,4]::smallint[]),
('AU','Geelong',array[9,10,11,12,1,2,3,4,5]::smallint[]),
('NZ','Christchurch',array[10,11,12,1,2,3,4]::smallint[]),
('NZ','Rotorua',array[10,11,12,1,2,3,4,5]::smallint[]),
('FJ','Suva',array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),

('CO','Medellín',array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),
('AR','Mendoza',array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),
('BR','Curitiba',array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),
('CL','Valdivia',array[10,11,12,1,2,3,4]::smallint[]),
('PE','Arequipa',array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),
('EC','Cuenca',array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),

('IN','Pune',array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),
('IN','Chandigarh',array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),
('PK','Lahore',array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),
('NP','Pokhara',array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),
('LK','Kandy',array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),
('BD','Chattogram',array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),

('HR','Split',array[3,4,5,6,7,8,9,10,11]::smallint[]),
('IT','Modena',array[4,5,6,7,8,9,10]::smallint[]),
('RS','Novi Sad',array[4,5,6,7,8,9,10]::smallint[]),
('SI','Maribor',array[4,5,6,7,8,9,10]::smallint[]),
('BA','Mostar',array[3,4,5,6,7,8,9,10,11]::smallint[]),
('MK','Ohrid',array[4,5,6,7,8,9,10]::smallint[]),

('TR','Izmir',array[3,4,5,6,7,8,9,10,11]::smallint[]),
('IR','Shiraz',array[3,4,5,6,7,8,9,10,11]::smallint[]),
('KZ','Almaty',array[4,5,6,7,8,9,10]::smallint[]),
('UZ','Samarkand',array[3,4,5,6,7,8,9,10]::smallint[]),
('AE','Al Ain',array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),
('OM','Salalah',array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),

('MA','Agadir',array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),
('DZ','Oran',array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),
('TN','Sfax',array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),
('EG','Alexandria',array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),
('SN','Dakar',array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),
('GH','Kumasi',array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),

('BE','Ghent',array[4,5,6,7,8,9,10]::smallint[]),
('FR','Roubaix',array[4,5,6,7,8,9,10]::smallint[]),
('ES','Girona',array[3,4,5,6,7,8,9,10,11]::smallint[]),
('PT','Braga',array[3,4,5,6,7,8,9,10,11]::smallint[]),
('NL','Utrecht',array[4,5,6,7,8,9,10]::smallint[]),
('IE','Cork',array[5,6,7,8,9]::smallint[]);

create or replace function private.youth_race_city_weather_eligible_v9(
  p_country_code text,
  p_city_name text,
  p_start_date date,
  p_end_date date
)
returns boolean
language sql
stable
set search_path=public,private,pg_temp
as $function$
  select
    exists(
      select 1
      from private.youth_race_city_climate_windows_v9 w
      where upper(w.country_code)=upper(p_country_code)
        and lower(w.city_name)=lower(p_city_name)
    )
    and coalesce((
      select bool_and(
        extract(month from d)::smallint = any(w.allowed_months)
        and coalesce(n.avg_max_temp_c,-999) >= 15
      )
      from private.youth_race_city_climate_windows_v9 w
      cross join generate_series(
        p_start_date,
        greatest(p_start_date,coalesce(p_end_date,p_start_date)),
        interval '1 day'
      ) d
      left join public.country_weather_weekly_normals n
        on upper(n.country_code)=upper(p_country_code)
       and n.week_of_year=extract(week from d)::integer
      where upper(w.country_code)=upper(p_country_code)
        and lower(w.city_name)=lower(p_city_name)
    ),false);
$function$;

-- Keep the existing scheduler name so future season transitions automatically
-- receive the city-level rule as well.
create or replace function private.apply_youth_weather_calendar_v8(
  p_season integer,
  p_from_date date
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_from date:=coalesce(
    p_from_date,
    public.game_date_from_parts(p_season,1,1)-1
  );
  v_selected integer:=0;
begin
  update public.youth_races
  set
    status='cancelled',
    metadata=(coalesce(metadata,'{}'::jsonb) - 'prelaunch_cancelled')
      || jsonb_build_object(
        'hidden_from_calendar',true,
        'calendar_exclusion','city_climate_or_monthly_density_v9'
      ),
    updated_at=now()
  where season_number=p_season
    and race_date>v_from;

  with base as (
    select
      r.id,
      extract(month from r.race_date)::integer month_no,
      r.competition_class,
      case
        when r.competition_class='world' then 'WORLD'
        when r.competition_class='continental'
          then private.youth_continental_division_for_country_v1(r.host_country_code)
        else private.youth_regional_division_for_country_v1(r.host_country_code)
      end target_division,
      lower(coalesce(r.host_city,'')) host_key,
      r.race_date
    from public.youth_races r
    where r.season_number=p_season
      and r.race_date>v_from
      and r.host_country_code is not null
      and nullif(r.host_city,'') is not null
      and private.youth_race_city_weather_eligible_v9(
        r.host_country_code,
        r.host_city,
        r.race_date,
        coalesce(r.race_end_date,r.race_date)
      )
  ), city_unique as (
    select b.*,
      row_number() over(
        partition by b.month_no,b.competition_class,b.target_division,b.host_key
        order by b.race_date,b.id
      ) city_rank
    from base b
    where b.target_division is not null
  ), ranked as (
    select c.*,
      row_number() over(
        partition by c.month_no,c.competition_class,c.target_division
        order by c.race_date,md5(c.id::text)
      ) quota_rank
    from city_unique c
    where c.city_rank=1
  ), chosen as (
    select r.id,r.competition_class,r.target_division
    from ranked r
    where r.quota_rank<=private.youth_calendar_month_quota_v8(
      r.competition_class,r.month_no
    )
  )
  update public.youth_races r
  set
    status='scheduled',
    division_code=case
      when c.competition_class='world' then 'WORLD'
      else c.target_division
    end,
    team_limit=20,
    min_teams=16,
    target_teams=16,
    entry_cost=500,
    invitation_response_deadline=r.race_date-7,
    results_published_at=null,
    metadata=(coalesce(r.metadata,'{}'::jsonb)
      - 'prelaunch_cancelled'
      - 'calendar_exclusion')
      || jsonb_build_object(
        'hidden_from_calendar',false,
        'city_climate_rule_v9',true
      ),
    updated_at=now()
  from chosen c
  where r.id=c.id;

  get diagnostics v_selected=row_count;

  return jsonb_build_object(
    'season_number',p_season,
    'from_date',v_from,
    'scheduled_races',v_selected,
    'minimum_expected_max_temperature_c',15,
    'city_level_climate_gate',true,
    'minimum_teams',16,
    'maximum_teams',20
  );
end;
$function$;

-- Snapshot entries that will disappear from the corrected future calendar.
create temporary table pg_temp.youth_v9_future_removed_entries
on commit drop
as
with base as (
  select
    r.id,
    extract(month from r.race_date)::integer month_no,
    r.competition_class,
    case
      when r.competition_class='world' then 'WORLD'
      when r.competition_class='continental'
        then private.youth_continental_division_for_country_v1(r.host_country_code)
      else private.youth_regional_division_for_country_v1(r.host_country_code)
    end target_division,
    lower(coalesce(r.host_city,'')) host_key,
    r.race_date
  from public.youth_races r
  where r.season_number=public.get_current_season_number()
    and private.youth_race_city_weather_eligible_v9(
      r.host_country_code,r.host_city,r.race_date,coalesce(r.race_end_date,r.race_date)
    )
), city_unique as (
  select b.*,
    row_number() over(
      partition by b.month_no,b.competition_class,b.target_division,b.host_key
      order by b.race_date,b.id
    ) city_rank
  from base b
  where b.target_division is not null
), ranked as (
  select c.*,
    row_number() over(
      partition by c.month_no,c.competition_class,c.target_division
      order by c.race_date,md5(c.id::text)
    ) quota_rank
  from city_unique c
  where c.city_rank=1
), chosen as (
  select id
  from ranked
  where quota_rank<=private.youth_calendar_month_quota_v8(
    competition_class,month_no
  )
)
select
  e.id entry_id,e.race_id,e.academy_id,r.season_number,
  greatest(coalesce(nullif(e.total_participation_cost,0),e.entry_cost,0),0)::bigint refund_amount
from public.youth_race_entries e
join public.youth_races r on r.id=e.race_id
where r.season_number=public.get_current_season_number()
  and r.race_date>public.get_current_game_date_date()
  and r.status='scheduled'
  and e.status='entered'
  and not exists(select 1 from chosen c where c.id=r.id);

delete from public.youth_race_lineups l
using pg_temp.youth_v9_future_removed_entries x
where l.entry_id=x.entry_id;

with refunds as (
  select academy_id,season_number,sum(refund_amount)::bigint refund_amount
  from pg_temp.youth_v9_future_removed_entries
  group by academy_id,season_number
)
update public.youth_academy_season_budgets b
set spent_amount=greatest(0,b.spent_amount-r.refund_amount),updated_at=now()
from refunds r
where b.academy_id=r.academy_id
  and b.season_number=r.season_number;

insert into public.youth_academy_ledger(
  academy_id,season_number,game_date,category,description,amount,metadata
)
select
  x.academy_id,x.season_number,public.get_current_game_date_date(),
  'race_withdrawal_refund',
  'Youth city-climate calendar correction refund',
  x.refund_amount,
  jsonb_build_object(
    'race_id',x.race_id,
    'entry_id',x.entry_id,
    'reason','city_climate_calendar_v9'
  )
from pg_temp.youth_v9_future_removed_entries x
where x.refund_amount>0;

update public.youth_race_entries e
set status='withdrawn',updated_at=now()
from pg_temp.youth_v9_future_removed_entries x
where e.id=x.entry_id;

-- Rebuild the entire Season 1/current-season schedule, not only future dates.
select private.apply_youth_weather_calendar_v8(
  public.get_current_season_number(),
  public.game_date_from_parts(public.get_current_season_number(),1,1)-1
);

-- Past selected races are retained only as clean pre-launch calendar history.
-- They cannot generate results or team entries.
update public.youth_races
set
  status='cancelled',
  metadata=(coalesce(metadata,'{}'::jsonb) - 'calendar_exclusion')
    || jsonb_build_object(
      'hidden_from_calendar',false,
      'prelaunch_cancelled',true,
      'city_climate_rule_v9',true
    ),
  updated_at=now()
where season_number=public.get_current_season_number()
  and race_end_date<public.get_current_game_date_date()
  and coalesce((metadata->>'city_climate_rule_v9')::boolean,false);

-- Any excluded candidate stays invisible in the month browser.
update public.youth_races
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'hidden_from_calendar',true
    ),
    updated_at=now()
where season_number=public.get_current_season_number()
  and status='cancelled'
  and not coalesce((metadata->>'prelaunch_cancelled')::boolean,false);

select public.sync_youth_scheduled_race_invitations_v2(
  public.get_current_season_number()
);
select public.ensure_youth_race_runtime_for_season_v1(
  public.get_current_season_number()
);
select public.process_youth_team_allocations_v2(
  public.get_current_game_date_date()
);
