-- Align Youth Regional competition with the senior 12-division structure,
-- tidy grouped National Championship notices, trim stale future Youth race fields,
-- and expose AI kit previews wherever a normal team kit is absent.

create or replace function private.youth_regional_division_for_country_v1(p_country_code text)
returns text
language sql
stable
set search_path=public,private,pg_temp
as $function$
  select public.get_amateur_division_for_country(p_country_code);
$function$;

create or replace function private.youth_continental_division_for_regional_v1(p_regional_division text)
returns text
language sql
immutable
set search_path=pg_temp
as $function$
  select case upper(coalesce(p_regional_division,''))
    when 'NORTH_AMERICA' then 'CONTINENTAL_WEST'
    when 'SOUTH_AMERICA' then 'CONTINENTAL_WEST'
    when 'WESTERN_EUROPE' then 'CONTINENTAL_WEST'
    when 'CENTRAL_EUROPE' then 'CONTINENTAL_WEST'
    when 'SOUTHERN_BALKAN_EUROPE' then 'CONTINENTAL_WEST'
    when 'NORTHERN_EASTERN_EUROPE' then 'CONTINENTAL_WEST'
    when 'WEST_NORTH_AFRICA' then 'CONTINENTAL_EAST'
    when 'CENTRAL_SOUTH_AFRICA' then 'CONTINENTAL_EAST'
    when 'WEST_CENTRAL_ASIA' then 'CONTINENTAL_EAST'
    when 'SOUTH_ASIA' then 'CONTINENTAL_EAST'
    when 'EAST_SOUTHEAST_ASIA' then 'CONTINENTAL_EAST'
    when 'OCEANIA' then 'CONTINENTAL_EAST'
    else null
  end;
$function$;

create or replace function private.youth_continental_division_for_country_v1(p_country_code text)
returns text
language sql
stable
set search_path=public,private,pg_temp
as $function$
  select private.youth_continental_division_for_regional_v1(
    public.get_amateur_division_for_country(p_country_code)
  );
$function$;

create or replace function private.youth_regional_ai_target_v1(p_division_code text)
returns integer
language sql
immutable
set search_path=pg_temp
as $function$
  select case upper(coalesce(p_division_code,''))
    when 'NORTH_AMERICA' then 2
    when 'SOUTH_AMERICA' then 2
    when 'WESTERN_EUROPE' then 2
    when 'CENTRAL_EUROPE' then 2
    when 'SOUTHERN_BALKAN_EUROPE' then 2
    when 'NORTHERN_EASTERN_EUROPE' then 2
    when 'WEST_NORTH_AFRICA' then 2
    when 'CENTRAL_SOUTH_AFRICA' then 2
    when 'WEST_CENTRAL_ASIA' then 2
    when 'SOUTH_ASIA' then 2
    when 'EAST_SOUTHEAST_ASIA' then 2
    when 'OCEANIA' then 2
    else 0
  end;
$function$;

create or replace function private.youth_regional_feed_count_v1(p_continental_division text)
returns integer
language sql
immutable
set search_path=pg_temp
as $function$
  select case upper(coalesce(p_continental_division,''))
    when 'CONTINENTAL_WEST' then 6
    when 'CONTINENTAL_EAST' then 6
    else 0
  end;
$function$;

create or replace function public.ensure_youth_competition_memberships_v1(p_season integer default null)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  s integer:=coalesce(p_season,public.get_current_season_number(),1);
  x record;
  d text;
  need integer;
begin
  if not exists(select 1 from public.youth_academy_competition_memberships where season_number=s) then
    return public.rebalance_youth_competition_memberships_v2(s,false);
  end if;

  for x in
    select a.id,c.country_code
    from public.youth_academies a
    join public.clubs c on c.id=a.club_id
    where a.is_active and not a.is_ai and c.deleted_at is null
      and not exists(
        select 1 from public.youth_academy_competition_memberships m
        where m.season_number=s and m.academy_id=a.id
      )
    order by a.activated_season,a.created_at,a.id
  loop
    d:=private.youth_continental_division_for_country_v1(x.country_code);
    if (select count(*) from public.youth_academy_competition_memberships where season_number=s and division_code=d)<20 then
      insert into public.youth_academy_competition_memberships(
        season_number,academy_id,competition_class,division_code,metadata
      ) values(s,x.id,'continental',d,jsonb_build_object('assignment','midseason_user_continental_vacancy'));
    else
      insert into public.youth_academy_competition_memberships(
        season_number,academy_id,competition_class,division_code,metadata
      ) values(s,x.id,'regional',private.youth_regional_division_for_country_v1(x.country_code),
               jsonb_build_object('assignment','midseason_user_regional'));
    end if;
  end loop;

  foreach d in array array['CONTINENTAL_WEST','CONTINENTAL_EAST'] loop
    need:=20-(select count(*) from public.youth_academy_competition_memberships where season_number=s and division_code=d);
    if need>0 then
      insert into public.youth_academy_competition_memberships(
        season_number,academy_id,competition_class,division_code,metadata
      )
      select s,a.id,'continental',d,jsonb_build_object('assignment','continental_ai_repair')
      from public.youth_academies a
      join public.clubs c on c.id=a.club_id
      where a.is_active and a.is_ai and c.deleted_at is null
        and private.youth_continental_division_for_country_v1(c.country_code)=d
        and not exists(
          select 1 from public.youth_academy_competition_memberships m
          where m.season_number=s and m.academy_id=a.id
        )
      order by private.youth_academy_strength_v1(a.id) desc,a.id
      limit need;
    end if;
  end loop;

  foreach d in array array[
    'NORTH_AMERICA','SOUTH_AMERICA','WESTERN_EUROPE','CENTRAL_EUROPE',
    'SOUTHERN_BALKAN_EUROPE','NORTHERN_EASTERN_EUROPE',
    'WEST_NORTH_AFRICA','CENTRAL_SOUTH_AFRICA','WEST_CENTRAL_ASIA',
    'SOUTH_ASIA','EAST_SOUTHEAST_ASIA','OCEANIA'
  ] loop
    need:=private.youth_regional_ai_target_v1(d)-(
      select count(*)
      from public.youth_academy_competition_memberships m
      join public.youth_academies a on a.id=m.academy_id
      where m.season_number=s and m.competition_class='regional'
        and m.division_code=d and a.is_ai
    );
    if need>0 then
      insert into public.youth_academy_competition_memberships(
        season_number,academy_id,competition_class,division_code,metadata
      )
      select s,a.id,'regional',d,jsonb_build_object('assignment','regional_ai_repair')
      from public.youth_academies a
      join public.clubs c on c.id=a.club_id
      where a.is_active and a.is_ai and c.deleted_at is null
        and private.youth_regional_division_for_country_v1(c.country_code)=d
        and not exists(
          select 1 from public.youth_academy_competition_memberships m
          where m.season_number=s and m.academy_id=a.id
        )
      order by private.youth_academy_strength_v1(a.id) desc,a.id
      limit need;
    end if;
  end loop;

  return jsonb_build_object(
    'season_number',s,
    'world',(select count(*) from public.youth_academy_competition_memberships where season_number=s and competition_class='world'),
    'continental_west',(select count(*) from public.youth_academy_competition_memberships where season_number=s and division_code='CONTINENTAL_WEST'),
    'continental_east',(select count(*) from public.youth_academy_competition_memberships where season_number=s and division_code='CONTINENTAL_EAST'),
    'regional',(select count(*) from public.youth_academy_competition_memberships where season_number=s and competition_class='regional')
  );
end;
$function$;

create or replace function public.club_jersey_url_v1(p_club_id uuid)
returns text
language sql
stable
security definer
set search_path=public,pg_temp
as $function$
  select coalesce(
    (
      select nullif(v.kit_config->>'image_url','')
      from public.club_profile_popup_view v
      where v.club_id=p_club_id
      limit 1
    ),
    (
      select nullif(p.jersey_url,'')
      from public.ai_team_kit_previews p
      where p.club_id=p_club_id and coalesce(p.is_active,true)
      order by p.updated_at desc nulls last,p.created_at desc nulls last
      limit 1
    ),
    (
      select nullif(c.logo_path,'')
      from public.clubs c
      where c.id=p_club_id
      limit 1
    )
  );
$function$;

create or replace function public.national_championship_notify_selection_v1(p_edition_id uuid)
returns integer
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  e public.national_championship_editions%rowtype;
  x record;
  v_count integer:=0;
  v_country_name text;
  v_season integer;
  v_message text;
begin
  select * into e from public.national_championship_editions where id=p_edition_id;
  if e.id is null then return 0; end if;

  v_season:=coalesce(e.season_number,public.get_current_season_number(),1);

  select coalesce(c.name,e.country_code) into v_country_name
  from public.countries c where upper(c.code)=upper(e.country_code) limit 1;
  v_country_name:=coalesce(v_country_name,e.country_code);

  for x in
    select
      root.owner_user_id,
      count(*)::integer rider_count,
      string_agg(
        case
          when en.entry_path='qualification' then
            public.format_game_date_season_v1(h.qualification_date,v_season)||
            ', top '||coalesce(h.qualifying_places,0)||' advance '||
            en.rider_name_snapshot||' — Qualification Group '||coalesce(en.heat_number,1)
          else
            public.format_game_date_season_v1(e.final_date,v_season)||' '||
            en.rider_name_snapshot||' — Direct Final'
        end,
        E'\n'
        order by coalesce(h.qualification_date,e.final_date),
                 coalesce(en.heat_number,999),
                 en.rider_name_snapshot,en.id
      ) rider_lines,
      jsonb_agg(jsonb_build_object(
        'rider_id',en.rider_id,
        'rider_name',en.rider_name_snapshot,
        'entry_path',en.entry_path,
        'heat_number',en.heat_number,
        'qualification_date',h.qualification_date,
        'qualifying_places',h.qualifying_places
      ) order by coalesce(h.qualification_date,e.final_date),
                 coalesce(en.heat_number,999),
                 en.rider_name_snapshot,en.id) riders
    from public.national_championship_entries en
    left join public.national_championship_heats h on h.id=en.heat_id
    join public.clubs rc on rc.id=en.club_id_snapshot
    join public.clubs root on root.id=case
      when rc.club_type='developing' and rc.parent_club_id is not null then rc.parent_club_id
      else rc.id
    end
    where en.edition_id=e.id
      and en.participation_decision='pending'
      and root.owner_user_id is not null
    group by root.owner_user_id
  loop
    update public.user_notifications un
    set deleted_at=coalesce(un.deleted_at,now())
    from public.notifications n
    where un.notification_id=n.id
      and un.user_id=x.owner_user_id
      and n.payload_json ? 'rider_id'
      and (
        coalesce(n.payload_json->>'type_code','')='CHAMPIONSHIP_PARTICIPATION_REQUIRED'
        or n.title ilike '%selected for National Championship%'
        or n.title ilike '%participation decision required%'
      );

    v_message:=
      x.rider_count||' rider(s) selected for the '||v_country_name||
      ' National Championship · Season '||v_season||'.'||E'\n\n'||
      x.rider_lines||E'\n\n'||
      'Approve or refuse each rider from the National Championships duty page. '||
      'Approved riders are locked from one game day before through one game day after their Championship event.';

    perform public.ppm_create_user_notification_direct_v1(
      x.owner_user_id,
      'NATIONAL_CHAMPIONSHIP_SELECTED',
      x.rider_count||' riders selected for National Championship',
      v_message,
      '/dashboard/national-ranking?tab=duty',
      jsonb_build_object(
        'edition_id',e.id,
        'season_number',v_season,
        'country_code',e.country_code,
        'country_name',v_country_name,
        'rider_count',x.rider_count,
        'riders',x.riders,
        'final_date',e.final_date,
        'participation_decision_deadline',e.participation_decision_deadline,
        'action_path','/dashboard/national-ranking?tab=duty',
        'image_url','https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/National%20Road%20Championsjip.png'
      ),
      'national-championship-selection-group:'||e.id::text||':'||x.owner_user_id::text
    );
    v_count:=v_count+1;
  end loop;

  return v_count;
end;
$function$;

-- Refresh the text of existing grouped notices from their structured rider payload,
-- so current notifications immediately use the same date-first, one-rider-per-line layout.
with rebuilt as (
  select
    n.id,
    coalesce((n.payload_json->>'rider_count')::integer,jsonb_array_length(coalesce(n.payload_json->'riders','[]'::jsonb))) rider_count,
    coalesce(n.payload_json->>'country_name',n.payload_json->>'country_code','National') country_name,
    coalesce((n.payload_json->>'season_number')::integer,public.get_current_season_number(),1) season_number,
    (
      select string_agg(
        case
          when coalesce(r->>'entry_path','')='qualification' then
            public.format_game_date_season_v1((r->>'qualification_date')::date,coalesce((n.payload_json->>'season_number')::integer,1))||
            ', top '||coalesce((r->>'qualifying_places')::integer,0)||' advance '||
            coalesce(r->>'rider_name','Rider')||' — Qualification Group '||coalesce((r->>'heat_number')::integer,1)
          else
            public.format_game_date_season_v1((n.payload_json->>'final_date')::date,coalesce((n.payload_json->>'season_number')::integer,1))||
            ' '||coalesce(r->>'rider_name','Rider')||' — Direct Final'
        end,
        E'\n'
        order by
          case
            when coalesce(r->>'qualification_date','')~'^\\d{4}-\\d{2}-\\d{2}$'
              then (r->>'qualification_date')::date
            else (n.payload_json->>'final_date')::date
          end,
          coalesce((r->>'heat_number')::integer,999),
          coalesce(r->>'rider_name','')
      )
      from jsonb_array_elements(coalesce(n.payload_json->'riders','[]'::jsonb)) r
    ) rider_lines
  from public.notifications n
  where n.payload_json ? 'riders'
    and jsonb_typeof(n.payload_json->'riders')='array'
    and (
      n.title ilike '%riders selected for National Championship%'
      or coalesce(n.payload_json->>'type_code','')='NATIONAL_CHAMPIONSHIP_SELECTED'
    )
)
update public.notifications n
set message=
  rebuilt.rider_count||' rider(s) selected for the '||rebuilt.country_name||
  ' National Championship · Season '||rebuilt.season_number||'.'||E'\n\n'||
  coalesce(rebuilt.rider_lines,'')||E'\n\n'||
  'Approve or refuse each rider from the National Championships duty page. Approved riders are locked from one game day before through one game day after their Championship event.'
from rebuilt
where n.id=rebuilt.id;

-- Rebuild current-season Youth membership with the 12 senior Regional divisions.
select public.rebalance_youth_competition_memberships_v2(
  public.get_current_season_number(),
  true
);

-- Re-map all future Regional races and invitations using those 12 divisions.
select public.sync_youth_scheduled_race_invitations_v2(
  public.get_current_season_number()
);

-- Remove stale/excess AI entries from future scheduled races while preserving
-- every human manager entry. The race target (Regional 10, Continental 12,
-- World 16) is the intended field size; team_limit remains the hard maximum.
create temporary table pg_temp.youth_entries_to_trim on commit drop as
with ai_entries as (
  select
    e.id entry_id,
    e.race_id,
    e.academy_id,
    r.season_number,
    greatest(coalesce(e.total_participation_cost,e.entry_cost,0),0)::bigint refund_amount,
    coalesce(r.target_teams,private.youth_race_target_teams_v1(r.competition_class,r.team_limit))::integer target_teams,
    (
      select count(*)::integer
      from public.youth_race_entries he
      join public.youth_academies ha on ha.id=he.academy_id
      where he.race_id=e.race_id
        and he.status in ('entered','completed')
        and not ha.is_ai
    ) human_count,
    (
      m.academy_id is not null and (
        (r.competition_class='world' and m.competition_class='world')
        or
        (r.competition_class='continental' and (
          (m.competition_class='continental' and m.division_code=r.division_code)
          or
          (m.competition_class='regional'
           and private.youth_continental_division_for_regional_v1(m.division_code)=r.division_code)
        ))
        or
        (r.competition_class='regional'
         and private.youth_regional_division_for_country_v1(c.country_code)=r.division_code)
      )
    ) valid_entry,
    row_number() over(
      partition by e.race_id
      order by
        case when m.academy_id is not null then 0 else 1 end,
        case when m.competition_class=r.competition_class then 0 else 1 end,
        case
          when private.youth_regional_division_for_country_v1(c.country_code)=r.division_code
            then 0 else 1
        end,
        private.youth_academy_strength_v1(a.id) desc,
        e.id
    )::integer ai_rank
  from public.youth_race_entries e
  join public.youth_races r on r.id=e.race_id
  join public.youth_academies a on a.id=e.academy_id and a.is_ai
  join public.clubs c on c.id=a.club_id
  left join public.youth_academy_competition_memberships m
    on m.academy_id=e.academy_id and m.season_number=r.season_number
  where e.status in ('entered','completed')
    and r.season_number=public.get_current_season_number()
    and r.status='scheduled'
    and r.race_date>public.get_current_game_date_date()
)
select entry_id,race_id,academy_id,season_number,refund_amount
from ai_entries
where not valid_entry
   or ai_rank>greatest(0,target_teams-human_count);

with refunds as (
  select
    t.academy_id,
    t.season_number,
    sum(abs(l.amount))::bigint refund_amount
  from pg_temp.youth_entries_to_trim t
  join public.youth_academy_ledger l
    on l.academy_id=t.academy_id
   and l.category='race_travel'
   and l.metadata->>'race_id'=t.race_id::text
  group by t.academy_id,t.season_number
)
update public.youth_academy_season_budgets b
set spent_amount=greatest(0,b.spent_amount-r.refund_amount),
    updated_at=now()
from refunds r
where b.academy_id=r.academy_id
  and b.season_number=r.season_number;

delete from public.youth_academy_ledger l
using pg_temp.youth_entries_to_trim t
where l.academy_id=t.academy_id
  and l.category='race_travel'
  and l.metadata->>'race_id'=t.race_id::text;

delete from public.youth_race_entries e
using pg_temp.youth_entries_to_trim t
where e.id=t.entry_id;

-- Now obsolete invitations can be removed and valid ones rebuilt.
select public.sync_youth_scheduled_race_invitations_v2(
  public.get_current_season_number()
);

-- Refill future AI fields only up to their configured target.
do $block$
declare
  x record;
  gd date:=public.get_current_game_date_date();
begin
  for x in
    select r.id
    from public.youth_races r
    where r.season_number=public.get_current_season_number()
      and r.status='scheduled'
      and r.race_date>gd
    order by r.race_date,r.id
  loop
    perform private.fill_youth_race_field_v2(x.id,gd,false);
  end loop;
end;
$block$;
