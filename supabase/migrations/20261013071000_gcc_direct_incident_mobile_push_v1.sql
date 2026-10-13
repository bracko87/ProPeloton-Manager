
-- Deliver direct mobile push for newly opened and escalated administrator incidents.
-- Existing snapshot telemetry remains responsible for the dashboard badge/list.
create or replace function control_center_private.notify_incident_mobile_push_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, control_center_private
as $body$
declare
  v_opened boolean := false;
  v_escalated boolean := false;
  v_module text;
  v_status text;
  v_title text;
  v_message text;
  v_rank_old integer;
  v_rank_new integer;
  v_operation text;
  v_event_key text;
begin
  if TG_TABLE_NAME='system_incidents' then
    v_opened := NEW.status in ('open','acknowledged','investigating')
      and (TG_OP='INSERT' or OLD.status not in ('open','acknowledged','investigating'));
    if TG_OP='UPDATE' then
      v_rank_old := case lower(coalesce(OLD.severity,'')) when 'critical' then 3 when 'high' then 3 when 'error' then 3 when 'warning' then 2 when 'medium' then 2 else 1 end;
      v_rank_new := case lower(coalesce(NEW.severity,'')) when 'critical' then 3 when 'high' then 3 when 'error' then 3 when 'warning' then 2 when 'medium' then 2 else 1 end;
      v_escalated := NEW.status in ('open','acknowledged','investigating')
        and v_rank_new > v_rank_old;
    end if;
    v_module := 'system-health';
    v_status := NEW.status;
    v_title := case when v_escalated and not v_opened then 'System Health issue escalated' else 'New System Health issue' end;
    v_message := left(coalesce(nullif(NEW.title,''),'System Health issue')
       || ' · ' || coalesce(nullif(NEW.message,''),'Open Control Center for details'), 450);
  elsif TG_TABLE_NAME='race_operations_incidents_v1' then
    v_opened := NEW.resolved_at is null
       and (TG_OP='INSERT' or OLD.resolved_at is not null);
    if TG_OP='UPDATE' then
      v_rank_old := case lower(coalesce(OLD.severity,'')) when 'critical' then 3 when 'high' then 3 when 'error' then 3 when 'warning' then 2 else 1 end;
      v_rank_new := case lower(coalesce(NEW.severity,'')) when 'critical' then 3 when 'high' then 3 when 'error' then 3 when 'warning' then 2 else 1 end;
      v_escalated := NEW.resolved_at is null and v_rank_new > v_rank_old;
    end if;
    v_module := 'race-operations';
    v_status := case when NEW.resolved_at is null then 'open' else 'resolved' end;
    v_title := case when v_escalated and not v_opened then 'Race Operations issue escalated' else 'New Race Operations issue' end;
    v_message := left(coalesce(nullif(NEW.race_name,''),'Race')
       || ' · ' || coalesce(nullif(NEW.issue_key,''),'stage issue')
       || ' · ' || coalesce(nullif(NEW.message,''),'Open Control Center for details'),450);
  else
    return null;
  end if;

  -- Ignore repeated watchdog "last seen" writes, resolutions and acknowledgments.
  if not (v_opened or v_escalated) then return null; end if;
  v_operation := case when v_escalated and not v_opened then 'escalated' else 'created' end;
  v_event_key := concat_ws(':','incident',v_module,NEW.id::text,v_operation,
                       to_char(clock_timestamp(),'YYYYMMDDHH24MISSUS'));
  begin
    perform control_center_private.push_admin_change_event(
      v_module,v_event_key,v_operation,NEW.id::text,v_status,v_title,v_message);
  exception when others then
    -- Push must never abort race or health processing.
    raise warning 'Control Center incident push unavailable for %: %',NEW.id,SQLERRM;
  end;
  return null;
end;
$body$;
revoke all on function control_center_private.notify_incident_mobile_push_v1()
from public,anon,authenticated;

drop trigger if exists gcc_direct_system_incident_push_v1 on public.system_incidents;
create trigger gcc_direct_system_incident_push_v1
after insert or update of status,severity on public.system_incidents
for each row execute function control_center_private.notify_incident_mobile_push_v1();

drop trigger if exists gcc_direct_race_incident_push_v1 on public.race_operations_incidents_v1;
create trigger gcc_direct_race_incident_push_v1
after insert or update of severity,resolved_at on public.race_operations_incidents_v1
for each row execute function control_center_private.notify_incident_mobile_push_v1();
