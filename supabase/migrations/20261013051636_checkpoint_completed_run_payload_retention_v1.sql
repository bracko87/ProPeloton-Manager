-- Automatic removal of completed/failed race checkpoint transfer buffers.
create schema if not exists archive;
create table if not exists archive.race_checkpoint_chunk_cleanup_runs (
 id bigserial primary key,
 ran_at timestamptz not null default now(),
 rows_deleted integer not null,
 approx_payload_bytes bigint not null default 0
);
CREATE OR REPLACE FUNCTION control_center_private.cleanup_completed_race_transfer_chunks_v1(p_batch integer DEFAULT 400)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'archive', 'control_center_private'
AS $function$
declare
  v_count integer;
  v_bytes bigint;
begin
  with candidates as materialized (
    select c.ctid as row_id,octet_length(c.chunk_text) as payload_bytes
    from public.race_safe_checkpoint_transfer_chunks_v1 c
    join public.race_stage_simulation_runs r on r.id=c.simulation_run_id and r.stage_id=c.stage_id
    where r.status in ('failed','completed')
      and exists (
        select 1 from public.race_stage_simulation_runs success
        where success.stage_id=c.stage_id and success.status='completed'
        and success.completed_at<now()-interval '30 minutes'
      )
      and exists (select 1 from public.race_stage_results rr where rr.stage_id=c.stage_id)
      and not exists (
        select 1 from public.race_stage_safe_calculation_v1 active
        where active.stage_id=c.stage_id and active.status='running'
      )
      and not exists (
        select 1 from public.race_operations_incidents_v1 i
        where i.stage_id=c.stage_id and i.resolved_at is null
      )
    order by c.created_at
    limit greatest(1,least(coalesce(p_batch,400),1500))
    for update of c skip locked
  ),
  deleted as (
    delete from public.race_safe_checkpoint_transfer_chunks_v1 c
    using candidates x
    where c.ctid=x.row_id
    returning octet_length(c.chunk_text) as payload_bytes
  )
  select count(*)::integer,coalesce(sum(payload_bytes),0)::bigint
    into v_count,v_bytes
  from deleted;

  if v_count>0 then
    insert into archive.race_checkpoint_chunk_cleanup_runs(rows_deleted,approx_payload_bytes)
    values(v_count,v_bytes);
  end if;
  return jsonb_build_object('deleted',v_count,'approx_payload_bytes',v_bytes);
end;
$function$;
revoke all on function control_center_private.cleanup_completed_race_transfer_chunks_v1(integer) from public,anon,authenticated;
select cron.schedule('propeloton_checkpoint_transfer_cleanup_15m','*/15 * * * *',$$select control_center_private.cleanup_completed_race_transfer_chunks_v1(500);$$);
