-- ProPeloton Control Center snapshot liveness in a verified prelaunch hold.
-- The independent mobile sentinel expects an authoritative System Health
-- snapshot at least every 15 minutes. The original deferred snapshot worker
-- sent only on state changes; during a paused game there may be none for days.
-- Send a read-only heartbeat after at least 5 minutes *only while* the hold is
-- verified. Regular snapshots and postlaunch behavior are unchanged.
-- This source was applied and tested in production on 2026-11-19.
-- Does not activate jobs or advance game time.

CREATE OR REPLACE FUNCTION control_center_private.flush_system_health_snapshot_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'control_center_private'
 SET statement_timeout TO '300s'
AS $function$
declare
  v_event_at timestamptz;
  v_sent_at timestamptz;
  v_request_id bigint;
  v_hold boolean;
  v_heartbeat_due boolean;
begin
  if not pg_try_advisory_xact_lock(
    hashtext('control_center_private.flush_system_health_snapshot_v1')::bigint
  ) then
    return jsonb_build_object('status','already_running');
  end if;

  select last_event_at,last_sent_at into v_event_at,v_sent_at
  from control_center_private.admin_module_delivery_state
  where module_key='system-health';

  v_hold:=private.ppm_control_center_verified_launch_hold_v1();
  v_heartbeat_due:=v_hold and (
     v_sent_at is null or v_sent_at<clock_timestamp()-interval '5 minutes'
  );

  if not v_heartbeat_due and (
     v_event_at is null or v_event_at<=coalesce(v_sent_at,'-infinity'::timestamptz)
  ) then
    return jsonb_build_object('status','up_to_date');
  end if;

  begin
    v_request_id:=control_center_private.push_admin_module_snapshot('system-health');
  exception when others then
    return jsonb_build_object('status','retry_pending','error',sqlerrm);
  end;

  update control_center_private.admin_module_delivery_state
  set last_sent_at=case
       when v_heartbeat_due then clock_timestamp()
       else greatest(coalesce(last_sent_at,'-infinity'::timestamptz),v_event_at)
     end,
      last_request_id=v_request_id,
      updated_at=clock_timestamp()
  where module_key='system-health';

  return jsonb_build_object(
    'status',case when v_heartbeat_due then 'maintenance_heartbeat_sent' else 'sent' end,
    'request_id',v_request_id,
    'prelaunch_hold',v_hold
  );
end
$function$


revoke all on function control_center_private.flush_system_health_snapshot_v1()
 from public,anon,authenticated;
