create or replace function public.notification_daily_summary_message_v1(
  p_type_code text,
  p_payload jsonb,
  p_fallback text
)
returns text
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_code text := upper(coalesce(p_type_code,''));
  v_open int := coalesce(nullif(p_payload->>'opened_or_open_count','')::int, nullif(p_payload->>'open_count','')::int, 0);
  v_closing int := coalesce(nullif(p_payload->>'closing_soon_count','')::int, 0);
  v_pending int := coalesce(nullif(p_payload->>'pending_count','')::int, 0);
  v_attention int := coalesce(nullif(p_payload->>'attention_count','')::int, 0);
  v_finalised int := coalesce(nullif(p_payload->>'finalised_count','')::int, 0);
  v_missing int := coalesce(nullif(p_payload->>'missing_at_lock_count','')::int, 0);
  v_soon int := coalesce(nullif(p_payload->>'lock_soon_count','')::int, 0);
  v_locked int := coalesce(nullif(p_payload->>'locked_count','')::int, 0);
  v_injured int := coalesce(nullif(p_payload->>'injured_today','')::int, 0);
  v_sick int := coalesce(nullif(p_payload->>'sick_today','')::int, 0);
  v_nff int := coalesce(nullif(p_payload->>'not_fully_fit_today','')::int, 0);
  v_recovered int := coalesce(nullif(p_payload->>'recovered_today','')::int, 0);
  v_issues int := coalesce(nullif(p_payload->>'current_issue_count','')::int, 0);
  v_names text;
  v_attention_names text;
begin
  if v_code='RACE_APPLICATION_DAILY_UPDATE' then
    select string_agg(x.race_name, ', ')
      into v_names
    from (
      select nullif(trim(e->>'race_name'),'') as race_name
      from jsonb_array_elements(coalesce(p_payload->'closing_soon_races','[]'::jsonb)) e
      where nullif(trim(e->>'race_name'),'') is not null
      limit 5
    ) x;

    return format(
      '%s application window%s %s open. %s %s within 3 days%s. %s',
      v_open,
      case when v_open=1 then '' else 's' end,
      case when v_open=1 then 'is' else 'are' end,
      v_closing,
      case when v_closing=1 then 'closes' else 'close' end,
      case when coalesce(v_names,'')<>'' then ': '||v_names else '' end,
      case
        when v_pending=0 then 'No applications are awaiting a decision.'
        when v_pending=1 then '1 application is awaiting a decision.'
        else v_pending||' applications are awaiting a decision.'
      end
    );
  end if;

  if v_code='RACE_PREPARATION_DAILY_REPORT' then
    select string_agg(x.race_name, ', ')
      into v_attention_names
    from (
      select nullif(trim(e->>'race_name'),'') as race_name
      from jsonb_array_elements(coalesce(p_payload->'races','[]'::jsonb)) e
      where e->>'report_state'='attention'
        and nullif(trim(e->>'race_name'),'') is not null
      limit 4
    ) x;

    return format(
      '%s race%s %s attention%s. %s open/in progress. %s finalised.',
      v_attention,
      case when v_attention=1 then '' else 's' end,
      case when v_attention=1 then 'needs' else 'need' end,
      case when coalesce(v_attention_names,'')<>'' then ': '||v_attention_names else '' end,
      v_open,
      v_finalised
    );
  end if;

  if v_code='STAGE_PLANNING_DAILY_REPORT' then
    return format(
      '%s missing at lock. %s %s soon. %s open. %s locked/recent.',
      v_missing,
      v_soon,
      case when v_soon=1 then 'locks' else 'lock' end,
      v_open,
      v_locked
    );
  end if;

  if v_code='RIDER_HEALTH_DAILY_REPORT' then
    if v_injured+v_sick+v_nff+v_recovered+v_issues=0 then
      return 'No rider health or fitness issues require attention today.';
    end if;

    return format(
      '%s injured. %s sick. %s not fully fit. %s recovered today. %s rider%s currently need medical/fitness attention.',
      v_injured,
      v_sick,
      v_nff,
      v_recovered,
      v_issues,
      case when v_issues=1 then '' else 's' end
    );
  end if;

  return p_fallback;
end;
$function$;

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
  v_message text;
  v_changed boolean:=false;
begin
  select id into v_type_id from public.notification_types
  where code=p_type_code and is_active=true limit 1;
  if v_type_id is null then raise exception 'Notification type not found or inactive: %',p_type_code; end if;

  v_payload:=coalesce(p_payload_json,'{}'::jsonb)||jsonb_build_object('event_key',p_event_key,'type_code',p_type_code);
  v_message:=public.notification_daily_summary_message_v1(p_type_code,v_payload,p_message);

  select n.id into v_id
  from public.notifications n
  join public.user_notifications un on un.notification_id=n.id
  where un.user_id=p_user_id and un.deleted_at is null and n.payload_json->>'event_key'=p_event_key
  order by n.id desc limit 1;

  if v_id is null then
    insert into public.notifications(type_id,title,message,source,action_url,payload_json,created_at)
    values(v_type_id,p_title,v_message,'game',p_action_url,v_payload,now()) returning id into v_id;
    insert into public.user_notifications(user_id,notification_id,status,created_at)
    values(p_user_id,v_id,'unread',now());
  else
    select (n.type_id is distinct from v_type_id or n.title is distinct from p_title or n.message is distinct from v_message
      or n.action_url is distinct from p_action_url or n.payload_json is distinct from v_payload)
    into v_changed from public.notifications n where n.id=v_id;
    if v_changed then
      update public.notifications set type_id=v_type_id,title=p_title,message=v_message,action_url=p_action_url,payload_json=v_payload
      where id=v_id;
      update public.user_notifications set status='unread',read_at=null
      where user_id=p_user_id and notification_id=v_id and deleted_at is null;
    end if;
  end if;
  return v_id;
end;
$function$;

update public.notifications n
set message=public.notification_daily_summary_message_v1(nt.code,n.payload_json,n.message)
from public.notification_types nt
where nt.id=n.type_id
  and nt.code in (
    'RACE_APPLICATION_DAILY_UPDATE',
    'RACE_PREPARATION_DAILY_REPORT',
    'STAGE_PLANNING_DAILY_REPORT',
    'RIDER_HEALTH_DAILY_REPORT'
  );
