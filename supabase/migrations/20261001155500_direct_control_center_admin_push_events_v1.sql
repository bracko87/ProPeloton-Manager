-- Direct mobile-push event path for administrator workflow changes.
-- This is intentionally separate from the existing snapshot mirror. The snapshot
-- keeps Control Center data in sync; this row-level trigger emits the actual event
-- immediately so mobile notification delivery does not depend on snapshot diffing.

create or replace function control_center_private.push_admin_change_event(
  p_module_key text,
  p_event_key text,
  p_operation text,
  p_record_id text,
  p_status text,
  p_title text,
  p_body text
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, vault, control_center_private, net
as $$
declare
  v_endpoint text;
  v_token text;
  v_request_id bigint;
begin
  select decrypted_secret into v_endpoint
  from vault.decrypted_secrets
  where name='game_control_center_telemetry_endpoint';

  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name='game_control_center_telemetry_token';

  if v_endpoint is null or v_token is null then
    raise exception 'Game Control Center telemetry secrets are missing';
  end if;

  select net.http_post(
    url := v_endpoint,
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || v_token
    ),
    body := jsonb_build_object(
      'sourceProjectRef','okuravitxocyevkexfgi',
      'adminEvents',jsonb_build_array(
        jsonb_strip_nulls(jsonb_build_object(
          'moduleKey',p_module_key,
          'eventKey',p_event_key,
          'operation',lower(coalesce(p_operation,'changed')),
          'recordId',p_record_id,
          'status',nullif(p_status,''),
          'title',p_title,
          'body',p_body
        ))
      )
    ),
    timeout_milliseconds := 30000
  ) into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function control_center_private.push_admin_change_event(text,text,text,text,text,text,text)
from public, anon, authenticated;

create or replace function control_center_private.notify_admin_change_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, control_center_private
as $$
declare
  v_row jsonb;
  v_module_key text := coalesce(TG_ARGV[0],'admin');
  v_record_id text;
  v_status text;
  v_operation text;
  v_event_key text;
  v_label text;
  v_title text;
  v_body text;
begin
  v_row := case when TG_OP='DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end;
  v_record_id := coalesce(nullif(v_row->>'id',''), md5(v_row::text));
  v_status := coalesce(nullif(v_row->>'status',''), nullif(v_row->>'admin_status',''));

  v_operation := case TG_OP
    when 'INSERT' then 'created'
    when 'UPDATE' then 'updated'
    when 'DELETE' then 'deleted'
    else lower(TG_OP)
  end;

  v_label := case v_module_key
    when 'bug-reports' then 'Bug report'
    when 'player-reviews' then 'Player review'
    when 'contact-messages' then 'Contact message'
    when 'avatar-requests' then 'Avatar request'
    when 'world-nations-hosts' then 'World Nations request'
    else initcap(replace(v_module_key,'-',' '))
  end;

  v_event_key := concat_ws(
    ':',
    v_module_key,
    v_record_id,
    lower(TG_OP),
    to_char(clock_timestamp(),'YYYYMMDDHH24MISSUS')
  );

  v_title := v_label || ' ' || v_operation;
  v_body := v_label || ' was ' || v_operation
    || case when v_status is not null then ' · status: ' || v_status else '' end
    || '. Open Game Control Center for details.';

  begin
    perform control_center_private.push_admin_change_event(
      v_module_key,
      v_event_key,
      v_operation,
      v_record_id,
      v_status,
      v_title,
      v_body
    );
  exception when others then
    -- Never block the game transaction because a Control Center notification failed.
    null;
  end;

  return null;
end;
$$;

revoke all on function control_center_private.notify_admin_change_event()
from public, anon, authenticated;


drop trigger if exists gcc_push_bug_reports on public.bug_reports;
create trigger gcc_push_bug_reports
after insert or update or delete on public.bug_reports
for each row
execute function control_center_private.notify_admin_change_event('bug-reports');


drop trigger if exists gcc_push_player_reviews on public.homepage_player_reviews;
create trigger gcc_push_player_reviews
after insert or update or delete on public.homepage_player_reviews
for each row
execute function control_center_private.notify_admin_change_event('player-reviews');


drop trigger if exists gcc_push_contact_messages on public.contact_messages;
create trigger gcc_push_contact_messages
after insert or update or delete on public.contact_messages
for each row
execute function control_center_private.notify_admin_change_event('contact-messages');


drop trigger if exists gcc_push_world_nations_hosts on public.nations_future_host_applications;
create trigger gcc_push_world_nations_hosts
after insert or update or delete on public.nations_future_host_applications
for each row
execute function control_center_private.notify_admin_change_event('world-nations-hosts');


drop trigger if exists gcc_push_world_nations_routes on public.nations_host_route_requests;
create trigger gcc_push_world_nations_routes
after insert or update or delete on public.nations_host_route_requests
for each row
execute function control_center_private.notify_admin_change_event('world-nations-hosts');

