-- Consolidate high-volume Core notifications into daily state summaries.
-- Staff Advisory remains a separate paid analytical/advice layer.

-- -----------------------------------------------------------------------------
-- Registry and preference-group configuration
-- -----------------------------------------------------------------------------
insert into public.notification_preference_groups(code,label,description,sort_order,is_active)
values
  ('riderHealth','Team medical report','Show one daily Core medical summary covering injuries, sickness, reduced fitness and recoveries.',9,true)
on conflict (code) do update set
  label=excluded.label,
  description=excluded.description,
  sort_order=excluded.sort_order,
  is_active=true;

update public.notification_preference_groups
set label='Race application updates',
    description='Show the daily race-application overview plus application decisions and important application-rule changes.'
where code='raceApplicationResults';

update public.notification_preference_groups
set label='Race preparation daily report',
    description='Show one daily Core status report for open, attention-required and finalised race preparations. Sports Director Advisory remains separate analytical advice.'
where code='racePreparation';

update public.notification_preference_groups
set label='Stage planning daily report',
    description='Show one daily Core report for open stage plans, upcoming locks, locked plans and missing plans. Sports Director Advisory remains separate analytical advice.'
where code='stagePlanReminders';

update public.notification_preference_groups
set description='Show one grouped low-stock warning for race supplies that need restocking before events.'
where code='raceSupplies';

update public.notification_preference_groups
set description='Show finance warnings, sponsor objectives, emergency loans, tax alerts, payroll issues, the final insolvency warning and one canonical club-liquidation notice.'
where code='financeAlerts';

update public.notification_preference_groups
set description='Show rider morale, contracts, staff and internal team changes. Rider health is controlled separately by Team medical report.'
where code='teamUpdates';

update public.notification_preference_groups
set description='Show optional paid analytical reports and recommendations from active staff advisors. These are separate from Core operational daily status reports.'
where code='staffAdvisory';

insert into public.notification_types(code,name,source,icon_name,priority,is_active,preference_group,default_image_url)
values
  ('RACE_APPLICATION_DAILY_UPDATE','Race Applications Daily Update','game','calendar',2,true,'raceApplicationResults','https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Race%20Application%20are%20open.png'),
  ('RACE_PREPARATION_DAILY_REPORT','Race Preparation Daily Report','game','clipboard',3,true,'racePreparation','https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Race%20Plan%20needs%20Antention.png'),
  ('STAGE_PLANNING_DAILY_REPORT','Stage Planning Daily Report','game','route',3,true,'stagePlanReminders','https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Stage%20plan%20open.png'),
  ('RIDER_HEALTH_DAILY_REPORT','Team Medical Daily Report','game','heart-pulse',3,true,'riderHealth',null)
on conflict (code) do update set
  name=excluded.name,
  source=excluded.source,
  icon_name=excluded.icon_name,
  priority=excluded.priority,
  is_active=true,
  preference_group=excluded.preference_group,
  default_image_url=excluded.default_image_url;

update public.notification_types
set default_image_url='https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Race%20Supplies%20low.png'
where code='RACE_SUPPLIES_LOW';

-- Historical notification rows remain intact. These legacy types simply stop
-- creating new separate cards.
update public.notification_types
set is_active=false
where code in (
  'RACE_APPLICATION_WINDOW_OPEN','RACE_APPLICATION_CLOSING_SOON',
  'RACE_PLAN_OPEN','RACE_PLAN_NEEDS_ATTENTION','RACE_PLAN_FINALISED',
  'STAGE_PLANS_OPEN','STAGE_PLAN_LOCK_REMINDER','STAGE_PLAN_LOCKED','STAGE_PLAN_MISSING_AT_LOCK',
  'RACE_SUPPLIES_LOW_STOCK',
  'RIDER_INJURED','RIDER_SICK','RIDER_NOT_FULLY_FIT','RIDER_FIT_AGAIN',
  'CLUB_LIQUIDATED_INSOLVENCY'
);

-- -----------------------------------------------------------------------------
-- Compatibility: old emitters either map to the remaining canonical event or
-- quietly retire because a daily Core report now owns that information.
-- -----------------------------------------------------------------------------
create or replace function public.notification_canonical_type_code_v2(p_type_code text)
returns text
language sql
immutable
as $function$
  select case upper(btrim(coalesce(p_type_code,'')))
    when 'RACE_APPLICATION_WINDOW_OPEN' then null
    when 'RACE_APPLICATION_CLOSING_SOON' then null
    when 'RACE_PLAN_OPEN' then null
    when 'RACE_PLAN_NEEDS_ATTENTION' then null
    when 'RACE_PLAN_FINALISED' then null
    when 'RACE_PLAN_DEADLINE_REMINDER' then null
    when 'STAGE_PLANS_OPEN' then null
    when 'STAGE_PLAN_LOCK_REMINDER' then null
    when 'STAGE_PLAN_LOCKED' then null
    when 'STAGE_PLAN_MISSING_AT_LOCK' then null
    when 'STAGE_PLAN_MISSING_REMINDER' then null
    when 'RIDER_INJURED' then null
    when 'RIDER_SICK' then null
    when 'RIDER_NOT_FULLY_FIT' then null
    when 'RIDER_FIT_AGAIN' then null
    when 'RACE_SUPPLIES_LOW_STOCK' then 'RACE_SUPPLIES_LOW'
    when 'CLUB_LIQUIDATED_INSOLVENCY' then 'FINANCE_CLUB_LIQUIDATED'
    else nullif(btrim(p_type_code),'')
  end;
$function$;

create or replace function public.create_user_game_notification_v1(
  p_user_id uuid,
  p_type_code text,
  p_title text,
  p_message text,
  p_action_url text default null,
  p_payload_json jsonb default '{}'::jsonb,
  p_event_key text default null,
  p_expires_at timestamptz default null
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_code text;
  v_type_id public.notification_types.id%type;
  v_notification_id public.notifications.id%type;
  v_existing_notification_id public.notifications.id%type;
  v_payload jsonb;
begin
  v_code := public.notification_canonical_type_code_v2(p_type_code);
  if v_code is null then return null; end if;

  select nt.id into v_type_id
  from public.notification_types nt
  where nt.code=v_code and nt.is_active=true
  limit 1;
  if v_type_id is null then
    raise exception 'Notification type not found or inactive: %', v_code;
  end if;

  v_payload := coalesce(p_payload_json,'{}'::jsonb)
    || jsonb_build_object('event_key',p_event_key,'type_code',v_code);

  if p_event_key is not null then
    select n.id into v_existing_notification_id
    from public.notifications n
    join public.user_notifications un on un.notification_id=n.id
    where un.user_id=p_user_id
      and n.payload_json->>'event_key'=p_event_key
      and un.deleted_at is null
    limit 1;
    if v_existing_notification_id is not null then
      return v_existing_notification_id::text;
    end if;
  end if;

  -- Canonical liquidation is terminal and must appear only once per club/user.
  if v_code='FINANCE_CLUB_LIQUIDATED' and nullif(v_payload->>'club_id','') is not null then
    select n.id into v_existing_notification_id
    from public.notifications n
    join public.user_notifications un on un.notification_id=n.id
    join public.notification_types nt on nt.id=n.type_id
    where un.user_id=p_user_id and un.deleted_at is null
      and nt.code='FINANCE_CLUB_LIQUIDATED'
      and n.payload_json->>'club_id'=v_payload->>'club_id'
    order by n.id desc limit 1;
    if v_existing_notification_id is not null then return v_existing_notification_id::text; end if;
  end if;

  insert into public.notifications(type_id,title,message,source,created_by_user_id,action_url,payload_json,expires_at,created_at)
  values(v_type_id,p_title,p_message,'game',null,p_action_url,v_payload,p_expires_at,now())
  returning id into v_notification_id;

  insert into public.user_notifications(user_id,notification_id,status,read_at,deleted_at,created_at)
  values(p_user_id,v_notification_id,'unread',null,null,now());
  return v_notification_id::text;
end;
$function$;

create or replace function public.ppm_create_user_notification_direct_v1(
  p_user_id uuid,
  p_type_code text,
  p_title text,
  p_message text,
  p_action_url text default null,
  p_payload_json jsonb default '{}'::jsonb,
  p_event_key text default null
)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_code text;
  v_type_id bigint;
  v_source text;
  v_notification_id bigint;
  v_payload jsonb;
begin
  if p_user_id is null then raise exception 'ppm_create_user_notification_direct_v1: p_user_id is required'; end if;
  v_code := public.notification_canonical_type_code_v2(p_type_code);
  if v_code is null then return null; end if;

  select nt.id,coalesce(nullif(trim(nt.source),''),'game') into v_type_id,v_source
  from public.notification_types nt where nt.code=v_code and nt.is_active=true limit 1;
  if v_type_id is null then raise exception 'Notification type % not found or inactive',v_code; end if;

  v_payload := coalesce(p_payload_json,'{}'::jsonb) || jsonb_build_object('type_code',v_code);
  if nullif(trim(coalesce(p_event_key,'')),'') is not null then
    v_payload := v_payload || jsonb_build_object('event_key',p_event_key);
    select n.id into v_notification_id
    from public.notifications n
    join public.user_notifications un on un.notification_id=n.id
    where un.user_id=p_user_id and un.deleted_at is null
      and n.payload_json->>'event_key'=p_event_key
    order by n.id desc limit 1;
  end if;

  if v_notification_id is null and v_code='FINANCE_CLUB_LIQUIDATED' and nullif(v_payload->>'club_id','') is not null then
    select n.id into v_notification_id
    from public.notifications n
    join public.user_notifications un on un.notification_id=n.id
    join public.notification_types nt on nt.id=n.type_id
    where un.user_id=p_user_id and un.deleted_at is null
      and nt.code='FINANCE_CLUB_LIQUIDATED'
      and n.payload_json->>'club_id'=v_payload->>'club_id'
    order by n.id desc limit 1;
  end if;

  if v_notification_id is null then
    insert into public.notifications(type_id,title,message,source,action_url,payload_json)
    values(v_type_id,p_title,p_message,v_source,p_action_url,v_payload)
    returning id into v_notification_id;
  end if;

  insert into public.user_notifications(user_id,notification_id,status)
  select p_user_id,v_notification_id,'unread'
  where not exists(
    select 1 from public.user_notifications un
    where un.user_id=p_user_id and un.notification_id=v_notification_id and un.deleted_at is null
  );
  return v_notification_id;
end;
$function$;

create or replace function public.create_infrastructure_notification(
  p_user_id uuid,
  p_type_code text,
  p_title text,
  p_message text,
  p_action_url text default '#/dashboard/infrastructure',
  p_payload jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_code text;
  v_id text;
begin
  v_code:=public.notification_canonical_type_code_v2(p_type_code);
  if v_code is null then return null; end if;
  v_id:=public.create_user_game_notification_v1(
    p_user_id,v_code,p_title,p_message,p_action_url,p_payload,
    case when v_code='FINANCE_CLUB_LIQUIDATED' and nullif(p_payload->>'club_id','') is not null
      then 'club_liquidated:'||p_user_id::text||':'||(p_payload->>'club_id') else null end,
    null
  );
  return nullif(v_id,'')::bigint;
end;
$function$;

create or replace function public.create_game_notification_for_user_checked(
  p_user_id uuid,
  p_type_code text,
  p_title text,
  p_message text,
  p_action_url text default null,
  p_payload_json jsonb default '{}'::jsonb,
  p_created_by_user_id uuid default null,
  p_expires_at timestamp default null
)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_code text;
  v_id text;
begin
  if p_user_id is null then raise exception 'Target user is required'; end if;
  v_code:=public.notification_canonical_type_code_v2(p_type_code);
  if v_code is null then return null; end if;
  v_id:=public.create_user_game_notification_v1(p_user_id,v_code,p_title,p_message,p_action_url,p_payload_json,null,p_expires_at at time zone 'UTC');
  return nullif(v_id,'')::bigint;
end;
$function$;

-- -----------------------------------------------------------------------------
-- One daily notification can be refreshed in place if the state changes later
-- in the same game day. It is marked unread again only when content changes.
-- -----------------------------------------------------------------------------
create or replace function public.upsert_user_daily_game_notification_v1(
  p_user_id uuid,
  p_type_code text,
  p_title text,
  p_message text,
  p_action_url text,
  p_payload_json jsonb,
  p_event_key text
)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_type_id bigint;
  v_id bigint;
  v_payload jsonb;
  v_changed boolean:=false;
begin
  select id into v_type_id from public.notification_types
  where code=p_type_code and is_active=true limit 1;
  if v_type_id is null then raise exception 'Notification type not found or inactive: %',p_type_code; end if;
  v_payload:=coalesce(p_payload_json,'{}'::jsonb)||jsonb_build_object('event_key',p_event_key,'type_code',p_type_code);

  select n.id into v_id
  from public.notifications n
  join public.user_notifications un on un.notification_id=n.id
  where un.user_id=p_user_id and un.deleted_at is null and n.payload_json->>'event_key'=p_event_key
  order by n.id desc limit 1;

  if v_id is null then
    insert into public.notifications(type_id,title,message,source,action_url,payload_json,created_at)
    values(v_type_id,p_title,p_message,'game',p_action_url,v_payload,now()) returning id into v_id;
    insert into public.user_notifications(user_id,notification_id,status,created_at)
    values(p_user_id,v_id,'unread',now());
  else
    select (n.type_id is distinct from v_type_id or n.title is distinct from p_title or n.message is distinct from p_message
      or n.action_url is distinct from p_action_url or n.payload_json is distinct from v_payload)
    into v_changed from public.notifications n where n.id=v_id;
    if v_changed then
      update public.notifications set type_id=v_type_id,title=p_title,message=p_message,action_url=p_action_url,payload_json=v_payload
      where id=v_id;
      update public.user_notifications set status='unread',read_at=null
      where user_id=p_user_id and notification_id=v_id and deleted_at is null;
    end if;
  end if;
  return v_id;
end;
$function$;

-- -----------------------------------------------------------------------------
-- Race applications: one state summary per game day/user.
-- -----------------------------------------------------------------------------
create or replace function public.process_race_application_daily_update_v1()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_today date:=public.get_current_game_date_date();
  v_open jsonb; v_closing jsonb; v_pending jsonb;
  v_open_count int; v_closing_count int; v_pending_count int;
  v_created int:=0; u record; v_event_key text;
begin
  for u in
    select distinct c.owner_user_id as user_id
    from public.clubs c
    where c.owner_user_id is not null and coalesce(c.club_type,'main')='main' and c.deleted_at is null
  loop
    select count(*)::int,coalesce(jsonb_agg(jsonb_build_object(
      'race_id',r.id,'race_name',r.name,'category',r.category,'start_date',r.start_date::date,
      'applications_close',coalesce(rer.applications_close_game_date,public.make_game_rule_date_v1(rer.applications_close_season_number,rer.applications_close_month_number,rer.applications_close_day_number)),
      'days_until_close',coalesce(rer.applications_close_game_date,public.make_game_rule_date_v1(rer.applications_close_season_number,rer.applications_close_month_number,rer.applications_close_day_number))-v_today
    ) order by coalesce(rer.applications_close_game_date,public.make_game_rule_date_v1(rer.applications_close_season_number,rer.applications_close_month_number,rer.applications_close_day_number)),r.name),'[]'::jsonb)
    into v_open_count,v_open
    from public.races r join public.race_entry_rules rer on rer.race_id=r.id
    where r.status='scheduled' and rer.applications_status='open'
      and coalesce(rer.applications_open_game_date,public.make_game_rule_date_v1(rer.applications_open_season_number,rer.applications_open_month_number,rer.applications_open_day_number))<=v_today
      and coalesce(rer.applications_close_game_date,public.make_game_rule_date_v1(rer.applications_close_season_number,rer.applications_close_month_number,rer.applications_close_day_number))>v_today
      and r.start_date::date>v_today;

    select count(*)::int,coalesce(jsonb_agg(x.item order by x.close_on,x.race_name),'[]'::jsonb)
    into v_closing_count,v_closing
    from (
      select r.name race_name,
        coalesce(rer.applications_close_game_date,public.make_game_rule_date_v1(rer.applications_close_season_number,rer.applications_close_month_number,rer.applications_close_day_number)) close_on,
        jsonb_build_object('race_id',r.id,'race_name',r.name,'category',r.category,'start_date',r.start_date::date,
          'applications_close',coalesce(rer.applications_close_game_date,public.make_game_rule_date_v1(rer.applications_close_season_number,rer.applications_close_month_number,rer.applications_close_day_number)),
          'days_until_close',coalesce(rer.applications_close_game_date,public.make_game_rule_date_v1(rer.applications_close_season_number,rer.applications_close_month_number,rer.applications_close_day_number))-v_today) item
      from public.races r join public.race_entry_rules rer on rer.race_id=r.id
      where r.status='scheduled' and rer.applications_status='open'
        and coalesce(rer.applications_close_game_date,public.make_game_rule_date_v1(rer.applications_close_season_number,rer.applications_close_month_number,rer.applications_close_day_number)) between v_today+1 and v_today+3
    ) x;

    select count(*)::int,coalesce(jsonb_agg(jsonb_build_object('race_id',r.id,'race_name',r.name,'status',e.status,'start_date',r.start_date::date) order by r.start_date,r.name),'[]'::jsonb)
    into v_pending_count,v_pending
    from public.race_team_entries e
    join public.clubs c on c.id=e.club_id
    join public.races r on r.id=e.race_id
    where c.owner_user_id=u.user_id and e.status in ('applied','under_review','provisionally_accepted') and r.start_date::date>v_today;

    if coalesce(v_open_count,0)+coalesce(v_pending_count,0)>0 then
      v_event_key:='race_application_daily:'||u.user_id::text||':'||v_today::text;
      perform public.upsert_user_daily_game_notification_v1(
        u.user_id,'RACE_APPLICATION_DAILY_UPDATE','Race applications update',
        format('%s application window%s open · %s closing within 3 days · %s application%s awaiting a decision.',
          coalesce(v_open_count,0),case when v_open_count=1 then '' else 's' end,coalesce(v_closing_count,0),coalesce(v_pending_count,0),case when v_pending_count=1 then '' else 's' end),
        '/dashboard/calendar',
        jsonb_build_object('game_date',v_today,'opened_or_open_count',v_open_count,'closing_soon_count',v_closing_count,'pending_count',v_pending_count,
          'open_races',v_open,'closing_soon_races',v_closing,'pending_applications',v_pending,
          'image_url','https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Race%20Application%20are%20open.png'),
        v_event_key);
      v_created:=v_created+1;
    end if;
  end loop;
  return jsonb_build_object('success',true,'game_date',v_today,'daily_reports_checked_or_created',v_created);
end;
$function$;

-- Keep the existing Jan-15 rule-change notice, but route normal window traffic to
-- the new single daily report.
create or replace function public.process_race_application_window_notifications_v1()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_current record; v_daily jsonb; u record; v_rule_count int:=0;
begin
  select * into v_current from public.get_current_game_date_parts() limit 1;
  if not found then return jsonb_build_object('success',false,'error','current_game_date_not_found'); end if;
  v_daily:=public.process_race_application_daily_update_v1();
  if v_current.month_number=1 and v_current.day_number=15 then
    for u in select distinct owner_user_id user_id from public.clubs where owner_user_id is not null and coalesce(club_type,'main')='main' and deleted_at is null loop
      perform public.create_user_game_notification_v1(u.user_id,'RACE_APPLICATION_RULE_CHANGE','Race application deadlines are changing',
        'Late-January races now close 3 days before the start. From February onward, applications close 7 days before each race. Review the calendar and apply early.',
        '/dashboard/calendar',jsonb_build_object('season_number',v_current.season_number,'rule','january_16_31_close_d3_february_onward_close_d7','preference_group','raceApplicationResults'),
        format('race_application_rule_change:s%s:jan15:%s',v_current.season_number,u.user_id),null);
      v_rule_count:=v_rule_count+1;
    end loop;
  end if;
  return jsonb_build_object('success',true,'daily_update',v_daily,'rule_change_users',v_rule_count);
end;
$function$;

-- -----------------------------------------------------------------------------
-- Race preparation: one current-state report per game day/user.
-- -----------------------------------------------------------------------------
create or replace function public.process_race_preparation_daily_report_v1()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_today date:=public.get_current_game_date_date();
  u record; v_rows jsonb; v_total int; v_attention int; v_final int; v_open int; v_count int:=0;
begin
  for u in select distinct owner_user_id user_id from public.clubs where owner_user_id is not null and coalesce(club_type,'main')='main' and deleted_at is null loop
    with items as (
      select r.id race_id,r.name race_name,r.category,r.start_date::date start_date,
        coalesce(rp.rider_submission_deadline_on,
          public.make_game_rule_date_v1(nullif(to_jsonb(rer)->>'rider_submission_deadline_season_number','')::int,nullif(to_jsonb(rer)->>'rider_submission_deadline_month_number','')::int,nullif(to_jsonb(rer)->>'rider_submission_deadline_day_number','')::int),
          r.start_date::date-4) deadline,
        coalesce(rp.status,'draft') prep_status,
        case
          when coalesce(rp.status,'')='missed_startlist' then 'attention'
          when coalesce(rp.status,'')='submitted' then 'finalised'
          when coalesce(rp.rider_submission_deadline_on,r.start_date::date-4)<=v_today+2 then 'attention'
          else 'open' end report_state
      from public.race_team_entries e join public.clubs c on c.id=e.club_id join public.races r on r.id=e.race_id
      left join public.race_preparations rp on rp.race_id=r.id and (rp.club_id=e.club_id or rp.participating_club_id=e.club_id)
      left join public.race_entry_rules rer on rer.race_id=r.id
      where c.owner_user_id=u.user_id and e.status='accepted' and r.start_date::date>=v_today
        and v_today>=r.start_date::date-15
    )
    select count(*)::int,count(*) filter(where report_state='attention')::int,count(*) filter(where report_state='finalised')::int,count(*) filter(where report_state='open')::int,
      coalesce(jsonb_agg(jsonb_build_object('race_id',race_id,'race_name',race_name,'category',category,'start_date',start_date,'rider_deadline',deadline,'status',prep_status,'report_state',report_state)
        order by case report_state when 'attention' then 0 when 'open' then 1 else 2 end,start_date,race_name),'[]'::jsonb)
    into v_total,v_attention,v_final,v_open,v_rows from items;

    if coalesce(v_total,0)>0 then
      perform public.upsert_user_daily_game_notification_v1(u.user_id,'RACE_PREPARATION_DAILY_REPORT','Race preparation report',
        format('%s need attention · %s open/in progress · %s finalised.',coalesce(v_attention,0),coalesce(v_open,0),coalesce(v_final,0)),
        '/dashboard/race-preparation?tab=acceptedRaces',
        jsonb_build_object('game_date',v_today,'attention_count',v_attention,'open_count',v_open,'finalised_count',v_final,'races',v_rows,
          'image_url','https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Race%20Plan%20needs%20Antention.png'),
        'race_preparation_daily:'||u.user_id::text||':'||v_today::text);
      v_count:=v_count+1;
    end if;
  end loop;
  return jsonb_build_object('success',true,'game_date',v_today,'daily_reports_checked_or_created',v_count);
end;
$function$;

-- -----------------------------------------------------------------------------
-- Stage planning: open, lock-soon, locked and missing-at-lock in one daily card.
-- -----------------------------------------------------------------------------
create or replace function public.process_stage_planning_daily_report_v1()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_today date:=public.get_current_game_date_date();
  u record; v_rows jsonb; v_total int; v_open int; v_soon int; v_locked int; v_missing int; v_count int:=0;
begin
  for u in select distinct owner_user_id user_id from public.clubs where owner_user_id is not null and coalesce(club_type,'main')='main' and deleted_at is null loop
    with base as (
      select r.id race_id,r.name race_name,r.category,rs.id stage_id,rs.stage_number,rs.name stage_name,rs.stage_date::date stage_date,
        rsp.id plan_id,coalesce(rsp.status,'missing') plan_status,
        coalesce(rsp.opens_on_game_date,rp.rider_submission_deadline_on,r.start_date::date-4) open_on,
        (rs.stage_date::timestamp + make_interval(hours=>coalesce(nullif(to_jsonb(rs)->>'planned_start_hour_number','')::int,r.planned_start_hour_number,9),mins=>coalesce(nullif(to_jsonb(rs)->>'planned_start_minute','')::int,r.planned_start_minute,30))-interval '3 hours') lock_at
      from public.race_team_entries e join public.clubs c on c.id=e.club_id join public.races r on r.id=e.race_id
      join public.race_stages rs on rs.race_id=r.id
      left join public.race_preparations rp on rp.race_id=r.id and (rp.club_id=e.club_id or rp.participating_club_id=e.club_id)
      left join public.race_stage_plans rsp on rsp.race_id=r.id and rsp.stage_id=rs.id and (rp.id is null or rsp.race_preparation_id=rp.id)
      where c.owner_user_id=u.user_id and e.status='accepted' and rs.stage_date::date between v_today-1 and v_today+30
    ), items as (
      select *,case
        when plan_id is null and lock_at::date<=v_today then 'missing_at_lock'
        when plan_status='locked' and (coalesce(locked_date,lock_at::date)>=v_today-1) then 'locked'
        when plan_status<>'locked' and lock_at::date between v_today and v_today+2 then 'lock_soon'
        when plan_status<>'locked' and v_today>=open_on and v_today<lock_at::date then 'open'
        else null end report_state
      from (select b.*, (select rsp2.locked_at::date from public.race_stage_plans rsp2 where rsp2.id=b.plan_id) locked_date from base b) q
    )
    select count(*)::int,count(*) filter(where report_state='open')::int,count(*) filter(where report_state='lock_soon')::int,
      count(*) filter(where report_state='locked')::int,count(*) filter(where report_state='missing_at_lock')::int,
      coalesce(jsonb_agg(jsonb_build_object('race_id',race_id,'race_name',race_name,'category',category,'stage_id',stage_id,'stage_number',stage_number,'stage_name',stage_name,
        'stage_date',stage_date,'plan_status',plan_status,'opens_on',open_on,'lock_at',lock_at,'report_state',report_state)
        order by case report_state when 'missing_at_lock' then 0 when 'lock_soon' then 1 when 'open' then 2 else 3 end,stage_date,race_name,stage_number)
        filter(where report_state is not null),'[]'::jsonb)
    into v_total,v_open,v_soon,v_locked,v_missing,v_rows from items where report_state is not null;

    if coalesce(v_total,0)>0 then
      perform public.upsert_user_daily_game_notification_v1(u.user_id,'STAGE_PLANNING_DAILY_REPORT','Stage planning report',
        format('%s missing at lock · %s lock soon · %s open · %s locked/recent.',coalesce(v_missing,0),coalesce(v_soon,0),coalesce(v_open,0),coalesce(v_locked,0)),
        '/dashboard/race-preparation?tab=stagePlans',
        jsonb_build_object('game_date',v_today,'missing_at_lock_count',v_missing,'lock_soon_count',v_soon,'open_count',v_open,'locked_count',v_locked,'stages',v_rows,
          'image_url','https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Stage%20plan%20open.png'),
        'stage_planning_daily:'||u.user_id::text||':'||v_today::text);
      v_count:=v_count+1;
    end if;
  end loop;
  return jsonb_build_object('success',true,'game_date',v_today,'daily_reports_checked_or_created',v_count);
end;
$function$;

-- -----------------------------------------------------------------------------
-- Rider health transitions are logged immediately but delivered as one daily
-- Team Medical Core report. Paid Team Doctor Advisory stays separate.
-- -----------------------------------------------------------------------------
create or replace function public.notify_rider_status_transition(
  p_rider_id uuid,p_processed_date date,p_old_status text,p_new_status text,p_fatigue integer,p_unavailable_until date,p_unavailable_reason text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid; v_event_code text;
begin
  if coalesce(p_old_status,'')=coalesce(p_new_status,'') then return; end if;
  select c.owner_user_id into v_user_id
  from public.riders r join public.club_riders cr on cr.rider_id=r.id join public.clubs c on c.id=cr.club_id
  where r.id=p_rider_id and c.deleted_at is null and coalesce(c.is_ai,false)=false and c.owner_user_id is not null
  order by case when c.club_type='main' then 0 else 1 end,c.created_at desc limit 1;
  if v_user_id is null then return; end if;

  v_event_code:=case
    when p_new_status='not_fully_fit' then 'rider_not_fully_fit'
    when p_new_status='injured' then 'rider_injured'
    when p_new_status='sick' then 'rider_sick'
    when p_new_status='fit' and p_old_status in ('not_fully_fit','injured','sick') then 'rider_fit_again'
    else null end;
  if v_event_code is null then return; end if;

  insert into public.rider_status_notification_log(rider_id,processed_date,user_id,event_code,created_at)
  values(p_rider_id,p_processed_date,v_user_id,v_event_code,now()) on conflict do nothing;
end;
$function$;

create or replace function public.process_rider_health_daily_report_v1()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_today date:=public.get_current_game_date_date(); u record; v_events jsonb; v_current jsonb;
  v_inj int; v_sick int; v_nff int; v_fit int; v_issues int; v_count int:=0;
begin
  for u in select distinct owner_user_id user_id from public.clubs where owner_user_id is not null and coalesce(club_type,'main')='main' and deleted_at is null loop
    select count(*) filter(where l.event_code='rider_injured')::int,count(*) filter(where l.event_code='rider_sick')::int,
      count(*) filter(where l.event_code='rider_not_fully_fit')::int,count(*) filter(where l.event_code='rider_fit_again')::int,
      coalesce(jsonb_agg(jsonb_build_object('rider_id',l.rider_id,'rider_name',r.display_name,'event',l.event_code) order by l.created_at),'[]'::jsonb)
    into v_inj,v_sick,v_nff,v_fit,v_events
    from public.rider_status_notification_log l join public.riders r on r.id=l.rider_id
    where l.user_id=u.user_id and l.processed_date=v_today;

    select count(*)::int,coalesce(jsonb_agg(jsonb_build_object('rider_id',r.id,'rider_name',r.display_name,'status',r.availability_status,'fatigue',r.fatigue,
      'unavailable_until',r.unavailable_until,'unavailable_reason',r.unavailable_reason) order by r.display_name),'[]'::jsonb)
    into v_issues,v_current
    from public.riders r join public.club_riders cr on cr.rider_id=r.id join public.clubs c on c.id=cr.club_id
    where c.owner_user_id=u.user_id and c.deleted_at is null and coalesce(c.is_ai,false)=false and coalesce(c.club_type,'main')='main'
      and r.availability_status in ('injured','sick','not_fully_fit');

    if coalesce(v_inj,0)+coalesce(v_sick,0)+coalesce(v_nff,0)+coalesce(v_fit,0)+coalesce(v_issues,0)>0 then
      perform public.upsert_user_daily_game_notification_v1(u.user_id,'RIDER_HEALTH_DAILY_REPORT','Team medical report',
        format('%s injured · %s sick · %s not fully fit · %s recovered today. %s rider%s currently need medical/fitness attention.',
          coalesce(v_inj,0),coalesce(v_sick,0),coalesce(v_nff,0),coalesce(v_fit,0),coalesce(v_issues,0),case when v_issues=1 then '' else 's' end),
        '/dashboard/squad',jsonb_build_object('game_date',v_today,'injured_today',v_inj,'sick_today',v_sick,'not_fully_fit_today',v_nff,'recovered_today',v_fit,
          'current_issue_count',v_issues,'changes_today',v_events,'current_health_issues',v_current),
        'rider_health_daily:'||u.user_id::text||':'||v_today::text);
      v_count:=v_count+1;
    end if;
  end loop;
  return jsonb_build_object('success',true,'game_date',v_today,'daily_reports_checked_or_created',v_count);
end;
$function$;

-- Main notification cycle now owns the four consolidated Core daily summaries.
create or replace function public.process_due_game_notifications_v1()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_app jsonb:=null; v_prep jsonb:=null; v_stage jsonb:=null; v_health jsonb:=null; v_startlist jsonb:=null;
  e_app text:=null; e_prep text:=null; e_stage text:=null; e_health text:=null; e_startlist text:=null;
  v_cleanup int:=0;
begin
  begin v_app:=public.process_race_application_window_notifications_v1(); exception when others then e_app:=sqlerrm; end;
  begin v_prep:=public.process_race_preparation_daily_report_v1(); exception when others then e_prep:=sqlerrm; end;
  begin v_stage:=public.process_stage_planning_daily_report_v1(); exception when others then e_stage:=sqlerrm; end;
  begin v_health:=public.process_rider_health_daily_report_v1(); exception when others then e_health:=sqlerrm; end;
  begin v_startlist:=public.process_due_race_startlist_deadlines_v1(); exception when others then e_startlist:=sqlerrm; end;
  begin v_cleanup:=public.cleanup_missed_startlist_race_notifications_v1(); exception when others then v_cleanup:=0; end;
  return jsonb_build_object('status',case when e_app is null and e_prep is null and e_stage is null and e_health is null and e_startlist is null then 'completed' else 'completed_with_errors' end,
    'race_application_daily',v_app,'race_application_error',e_app,'race_preparation_daily',v_prep,'race_preparation_error',e_prep,
    'stage_planning_daily',v_stage,'stage_planning_error',e_stage,'rider_health_daily',v_health,'rider_health_error',e_health,
    'startlist_deadline_processing',v_startlist,'startlist_deadline_error',e_startlist,'missed_startlist_notifications_cleaned_up',v_cleanup,'processed_at',now());
end;
$function$;

-- Grants for scheduler/RPC compatibility.
grant execute on function public.notification_canonical_type_code_v2(text) to public,anon,authenticated,service_role;
grant execute on function public.upsert_user_daily_game_notification_v1(uuid,text,text,text,text,jsonb,text) to public,anon,authenticated,service_role;
grant execute on function public.process_race_application_daily_update_v1() to public,anon,authenticated,service_role;
grant execute on function public.process_race_preparation_daily_report_v1() to public,anon,authenticated,service_role;
grant execute on function public.process_stage_planning_daily_report_v1() to public,anon,authenticated,service_role;
grant execute on function public.process_rider_health_daily_report_v1() to public,anon,authenticated,service_role;
