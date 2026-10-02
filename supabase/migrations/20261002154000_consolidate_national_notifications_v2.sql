-- Consolidate National Association / World Nations / National Championship
-- notification families into 16 canonical notification types.
-- Existing historical notifications keep their old type rows for display, but
-- old type codes are inactive aliases for future creation.

insert into public.notification_types(
  code,name,source,icon_name,priority,is_active,preference_group,default_image_url
)
values
  ('NATIONAL_ASSOCIATION_STATUS','National Association Status','game','flag',60,true,'races',null),
  ('NATIONAL_COACH_CANDIDATURE_OPEN','National Coach Candidature Open','game','vote',70,true,'races',null),
  ('NATIONAL_COACH_VOTING_REQUIRED','National Coach Voting Required','game','vote',80,true,'races',null),
  ('NATIONAL_COACH_STATUS_CHANGED','National Coach Status Changed','game','award',80,true,'races',null),
  ('NATIONAL_TEAM_SELECTION_WINDOW','National Team Selection Window','game','users',85,true,'races',null),
  ('NATIONAL_TEAM_CALLUP_REQUIRED','National Team Call-up Required','game','flag',90,true,'races',null),
  ('NATIONAL_TEAM_SQUAD_UPDATE','National Team Squad Update','game','users',75,true,'races',null),
  ('NATIONAL_TEAM_DUTY_UPDATE','National Team Duty Update','game','flag',70,true,'races',null),
  ('NATIONS_DRAW_NEXT_ROUND','World Nations Draw / Next Round','game','trophy',65,true,'races',null),
  ('NATIONS_RACE_UPDATE','World Nations Race Update','game','trophy',70,true,'races',null),
  ('NATIONS_FINAL_INFO','World Nations Final Information','game','flag',65,true,'races',null),
  ('NATIONS_FINAL_RESULT_MERGED','World Nations Final Result','game','trophy',90,true,'races',null),
  ('CHAMPIONSHIP_PARTICIPATION_REQUIRED','Championship Participation Required','game','flag',90,true,'races',null),
  ('CHAMPIONSHIP_QUALIFICATION_UPDATE','Championship Qualification Update','game','trophy',75,true,'races',null),
  ('CHAMPIONSHIP_FINAL_CONFIRMATION_REQUIRED','Championship Final Confirmation Required','game','flag',95,true,'races',null),
  ('CHAMPIONSHIP_RESULT','Championship Result','game','trophy',90,true,'races',null)
on conflict(code) do update
set
  name=excluded.name,
  source=excluded.source,
  icon_name=excluded.icon_name,
  priority=excluded.priority,
  is_active=true,
  preference_group=excluded.preference_group,
  default_image_url=excluded.default_image_url;

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

    -- National Association / National Coach
    when 'NATIONAL_ASSOCIATION_ACTIVATED' then 'NATIONAL_ASSOCIATION_STATUS'
    when 'NATIONAL_COACH_ELECTION_OPEN' then 'NATIONAL_COACH_CANDIDATURE_OPEN'
    when 'NATIONAL_COACH_VOTING_OPEN' then 'NATIONAL_COACH_VOTING_REQUIRED'
    when 'NATIONAL_COACH_RUNOFF_OPEN' then 'NATIONAL_COACH_VOTING_REQUIRED'
    when 'NATIONAL_COACH_ELECTED' then 'NATIONAL_COACH_STATUS_CHANGED'
    when 'NATIONAL_COACH_POSITION_VACANT' then 'NATIONAL_COACH_STATUS_CHANGED'
    when 'NATIONAL_COACH_RESIGNED' then 'NATIONAL_COACH_STATUS_CHANGED'

    -- National Team
    when 'NATIONAL_TEAM_NEW_SELECTION_WINDOW' then 'NATIONAL_TEAM_SELECTION_WINDOW'
    when 'NATIONAL_TEAM_CALLUP_RECEIVED' then 'NATIONAL_TEAM_CALLUP_REQUIRED'
    when 'NATIONAL_TEAM_CALLUP_RESPONSE' then 'NATIONAL_TEAM_SQUAD_UPDATE'
    when 'NATIONAL_TEAM_SQUAD_CONFIRMED' then 'NATIONAL_TEAM_SQUAD_UPDATE'
    when 'NATIONAL_TEAM_DUTY_STARTED' then 'NATIONAL_TEAM_DUTY_UPDATE'
    when 'NATIONAL_TEAM_DUTY_COMPLETED' then 'NATIONAL_TEAM_DUTY_UPDATE'

    -- World Nations
    when 'NATIONS_QUALIFICATION_DRAW' then 'NATIONS_DRAW_NEXT_ROUND'
    when 'NATIONS_RACE_RESULT' then 'NATIONS_RACE_UPDATE'
    when 'NATIONS_ADVANCED' then 'NATIONS_RACE_UPDATE'
    when 'NATIONS_ELIMINATED' then 'NATIONS_RACE_UPDATE'
    when 'NATIONS_WORLD_FINAL_QUALIFIED' then 'NATIONS_RACE_UPDATE'
    when 'NATIONS_HOST_SELECTED' then 'NATIONS_FINAL_INFO'
    when 'NATIONS_FINAL_RESULT' then 'NATIONS_FINAL_RESULT_MERGED'
    when 'NATIONS_CHAMPION' then 'NATIONS_FINAL_RESULT_MERGED'

    -- National Championship + World Road Championship
    when 'NATIONAL_CHAMPIONSHIP_SELECTED' then 'CHAMPIONSHIP_PARTICIPATION_REQUIRED'
    when 'WORLD_ROAD_CHAMPIONSHIP_INVITATION' then 'CHAMPIONSHIP_PARTICIPATION_REQUIRED'
    when 'NATIONAL_CHAMPIONSHIP_QUALIFICATION_RESULT' then 'CHAMPIONSHIP_QUALIFICATION_UPDATE'
    when 'NATIONAL_CHAMPIONSHIP_QUALIFIED' then 'CHAMPIONSHIP_QUALIFICATION_UPDATE'
    when 'NATIONAL_CHAMPIONSHIP_FINAL_CONFIRMATION_REQUIRED' then 'CHAMPIONSHIP_FINAL_CONFIRMATION_REQUIRED'
    when 'WORLD_ROAD_CHAMPIONSHIP_FINAL_CONFIRMATION_REQUIRED' then 'CHAMPIONSHIP_FINAL_CONFIRMATION_REQUIRED'
    when 'NATIONAL_CHAMPIONSHIP_FINAL_RESULT' then 'CHAMPIONSHIP_RESULT'
    when 'NATIONAL_CHAMPION' then 'CHAMPIONSHIP_RESULT'
    when 'WORLD_ROAD_CHAMPIONSHIP_RESULT' then 'CHAMPIONSHIP_RESULT'
    when 'WORLD_ROAD_CHAMPION' then 'CHAMPIONSHIP_RESULT'

    else nullif(btrim(p_type_code),'')
  end;
$function$;

create or replace function public.ppm_create_user_notification_direct_v1(
  p_user_id uuid,
  p_type_code text,
  p_title text,
  p_message text,
  p_action_url text default null::text,
  p_payload_json jsonb default '{}'::jsonb,
  p_event_key text default null::text
)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_source_code text;
  v_code text;
  v_type_id bigint;
  v_source text;
  v_notification_id bigint;
  v_payload jsonb;
begin
  if p_user_id is null then
    raise exception 'ppm_create_user_notification_direct_v1: p_user_id is required';
  end if;

  v_source_code := upper(btrim(coalesce(p_type_code,'')));
  v_code := public.notification_canonical_type_code_v2(p_type_code);
  if v_code is null then return null; end if;

  select nt.id,coalesce(nullif(trim(nt.source),''),'game')
  into v_type_id,v_source
  from public.notification_types nt
  where nt.code=v_code and nt.is_active=true
  limit 1;

  if v_type_id is null then
    raise exception 'Notification type % not found or inactive',v_code;
  end if;

  v_payload := coalesce(p_payload_json,'{}'::jsonb)
    || jsonb_build_object(
      'type_code',v_code,
      'source_type_code',v_source_code
    );

  if nullif(trim(coalesce(p_event_key,'')),'') is not null then
    v_payload := v_payload || jsonb_build_object('event_key',p_event_key);

    select n.id into v_notification_id
    from public.notifications n
    join public.user_notifications un on un.notification_id=n.id
    where un.user_id=p_user_id
      and un.deleted_at is null
      and n.payload_json->>'event_key'=p_event_key
    order by n.id desc
    limit 1;
  end if;

  if v_notification_id is null
     and v_code='FINANCE_CLUB_LIQUIDATED'
     and nullif(v_payload->>'club_id','') is not null then
    select n.id into v_notification_id
    from public.notifications n
    join public.user_notifications un on un.notification_id=n.id
    join public.notification_types nt on nt.id=n.type_id
    where un.user_id=p_user_id
      and un.deleted_at is null
      and nt.code='FINANCE_CLUB_LIQUIDATED'
      and n.payload_json->>'club_id'=v_payload->>'club_id'
    order by n.id desc
    limit 1;
  end if;

  if v_notification_id is null then
    insert into public.notifications(type_id,title,message,source,action_url,payload_json)
    values(v_type_id,p_title,p_message,v_source,p_action_url,v_payload)
    returning id into v_notification_id;
  end if;

  insert into public.user_notifications(user_id,notification_id,status)
  select p_user_id,v_notification_id,'unread'
  where not exists(
    select 1
    from public.user_notifications un
    where un.user_id=p_user_id
      and un.notification_id=v_notification_id
      and un.deleted_at is null
  );

  return v_notification_id;
end;
$function$;

create or replace function public.create_user_game_notification_v1(
  p_user_id uuid,
  p_type_code text,
  p_title text,
  p_message text,
  p_action_url text default null::text,
  p_payload_json jsonb default '{}'::jsonb,
  p_event_key text default null::text,
  p_expires_at timestamp with time zone default null::timestamp with time zone
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_source_code text;
  v_code text;
  v_type_id public.notification_types.id%type;
  v_notification_id public.notifications.id%type;
  v_existing_notification_id public.notifications.id%type;
  v_payload jsonb;
begin
  v_source_code := upper(btrim(coalesce(p_type_code,'')));
  v_code := public.notification_canonical_type_code_v2(p_type_code);
  if v_code is null then return null; end if;

  select nt.id into v_type_id
  from public.notification_types nt
  where nt.code=v_code and nt.is_active=true
  limit 1;

  if v_type_id is null then
    raise exception 'Notification type not found or inactive: %',v_code;
  end if;

  v_payload := coalesce(p_payload_json,'{}'::jsonb)
    || jsonb_build_object(
      'event_key',p_event_key,
      'type_code',v_code,
      'source_type_code',v_source_code
    );

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

  if v_code='FINANCE_CLUB_LIQUIDATED'
     and nullif(v_payload->>'club_id','') is not null then
    select n.id into v_existing_notification_id
    from public.notifications n
    join public.user_notifications un on un.notification_id=n.id
    join public.notification_types nt on nt.id=n.type_id
    where un.user_id=p_user_id
      and un.deleted_at is null
      and nt.code='FINANCE_CLUB_LIQUIDATED'
      and n.payload_json->>'club_id'=v_payload->>'club_id'
    order by n.id desc
    limit 1;

    if v_existing_notification_id is not null then
      return v_existing_notification_id::text;
    end if;
  end if;

  insert into public.notifications(
    type_id,title,message,source,created_by_user_id,action_url,payload_json,expires_at,created_at
  )
  values(
    v_type_id,p_title,p_message,'game',null,p_action_url,v_payload,p_expires_at,now()
  )
  returning id into v_notification_id;

  insert into public.user_notifications(
    user_id,notification_id,status,read_at,deleted_at,created_at
  )
  values(
    p_user_id,v_notification_id,'unread',null,null,now()
  );

  return v_notification_id::text;
end;
$function$;

-- Old runtime codes remain valid aliases through notification_canonical_type_code_v2,
-- but only the 16 consolidated types remain active for this feature family.
update public.notification_types
set is_active=false
where code in (
  'NATIONAL_ASSOCIATION_ACTIVATED',
  'NATIONAL_COACH_ELECTION_OPEN',
  'NATIONAL_COACH_VOTING_OPEN',
  'NATIONAL_COACH_RUNOFF_OPEN',
  'NATIONAL_COACH_ELECTED',
  'NATIONAL_COACH_POSITION_VACANT',
  'NATIONAL_COACH_RESIGNED',
  'NATIONAL_TEAM_NEW_SELECTION_WINDOW',
  'NATIONAL_TEAM_CALLUP_RECEIVED',
  'NATIONAL_TEAM_CALLUP_RESPONSE',
  'NATIONAL_TEAM_SQUAD_CONFIRMED',
  'NATIONAL_TEAM_DUTY_STARTED',
  'NATIONAL_TEAM_DUTY_COMPLETED',
  'NATIONS_QUALIFICATION_DRAW',
  'NATIONS_RACE_RESULT',
  'NATIONS_ADVANCED',
  'NATIONS_ELIMINATED',
  'NATIONS_WORLD_FINAL_QUALIFIED',
  'NATIONS_HOST_SELECTED',
  'NATIONS_FINAL_RESULT',
  'NATIONS_CHAMPION',
  'NATIONAL_CHAMPIONSHIP_SELECTED',
  'NATIONAL_CHAMPIONSHIP_QUALIFICATION_RESULT',
  'NATIONAL_CHAMPIONSHIP_QUALIFIED',
  'NATIONAL_CHAMPIONSHIP_FINAL_CONFIRMATION_REQUIRED',
  'NATIONAL_CHAMPIONSHIP_FINAL_RESULT',
  'NATIONAL_CHAMPION',
  'WORLD_ROAD_CHAMPIONSHIP_INVITATION',
  'WORLD_ROAD_CHAMPIONSHIP_FINAL_CONFIRMATION_REQUIRED',
  'WORLD_ROAD_CHAMPIONSHIP_RESULT',
  'WORLD_ROAD_CHAMPION'
);
