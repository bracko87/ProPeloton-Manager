-- Keep System Health telemetry out of the transaction that logs a business
-- check. Snapshot generation can query the full National Championship lifecycle
-- and previously made unrelated cron jobs exceed their statement timeout.
create or replace function control_center_private.request_admin_module_snapshot(
  p_module_key text, p_min_seconds integer default 15
)
returns bigint
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'control_center_private'
as $function$
declare
  v_claimed text;
  v_request_id bigint;
begin
  insert into control_center_private.admin_module_delivery_state(
    module_key,last_event_at,updated_at
  )
  values (p_module_key,clock_timestamp(),clock_timestamp())
  on conflict (module_key) do update
    set last_event_at=excluded.last_event_at,
        updated_at=excluded.updated_at;

  if p_module_key='system-health' then
    -- The dedicated worker sends the latest snapshot outside this transaction.
    return null;
  end if;

  update control_center_private.admin_module_delivery_state
  set last_sent_at=clock_timestamp(),updated_at=clock_timestamp()
  where module_key=p_module_key
    and (last_sent_at is null or last_sent_at <=
         clock_timestamp()-make_interval(secs=>greatest(0,coalesce(p_min_seconds,15))))
  returning module_key into v_claimed;

  if v_claimed is null then return null; end if;

  begin
    v_request_id:=control_center_private.push_admin_module_snapshot(p_module_key);
    update control_center_private.admin_module_delivery_state
    set last_request_id=v_request_id,updated_at=clock_timestamp()
    where module_key=p_module_key;
    return v_request_id;
  exception when others then
    update control_center_private.admin_module_delivery_state
    set last_sent_at=null,updated_at=clock_timestamp()
    where module_key=p_module_key;
    return null;
  end;
end;
$function$;

create or replace function control_center_private.flush_system_health_snapshot_v1()
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'control_center_private'
set statement_timeout to '300s'
as $function$
declare
  v_event_at timestamptz;
  v_sent_at timestamptz;
  v_request_id bigint;
begin
  if not pg_try_advisory_xact_lock(
    hashtext('control_center_private.flush_system_health_snapshot_v1')::bigint
  ) then
    return jsonb_build_object('status','already_running');
  end if;

  select last_event_at,last_sent_at into v_event_at,v_sent_at
  from control_center_private.admin_module_delivery_state
  where module_key='system-health';

  if v_event_at is null or v_event_at <= coalesce(v_sent_at,'-infinity'::timestamptz) then
    return jsonb_build_object('status','up_to_date');
  end if;

  begin
    v_request_id:=control_center_private.push_admin_module_snapshot('system-health');
  exception when others then
    return jsonb_build_object('status','retry_pending','error',sqlerrm);
  end;

  update control_center_private.admin_module_delivery_state
  set last_sent_at=greatest(coalesce(last_sent_at,'-infinity'::timestamptz),v_event_at),
      last_request_id=v_request_id,
      updated_at=clock_timestamp()
  where module_key='system-health';

  return jsonb_build_object('status','sent','request_id',v_request_id);
end;
$function$;

do $$
begin
  if not exists (
    select 1 from cron.job where jobname='control-center-system-health-snapshot-v1'
  ) then
    perform cron.schedule(
      'control-center-system-health-snapshot-v1',
      '* * * * *',
      'select control_center_private.flush_system_health_snapshot_v1();'
    );
  end if;
end;
$$;
