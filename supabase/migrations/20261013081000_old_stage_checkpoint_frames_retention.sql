
create or replace function control_center_private.cleanup_old_race_checkpoint_frames_v1(p_batch integer default 800)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,control_center_private
as $body$
declare v_frames integer:=0;v_shards integer:=0;
begin
  -- The shard reader only serves an active stage calculation lease.
  -- Remove finished-stage technical checkpoints after seven game days.
  with candidate_stages as materialized (
    select stage.id
    from public.race_stages stage
    where stage.stage_date<public.get_current_game_date_date()-7
      and exists (select 1 from public.race_stage_results rr where rr.stage_id=stage.id)
      and exists (select 1 from public.race_stage_simulation_runs r
                  where r.stage_id=stage.id and r.status='completed')
      and not exists (select 1 from public.race_stage_safe_calculation_v1 calc
                      where calc.stage_id=stage.id and calc.status='running')
      and not exists (select 1 from public.race_operations_incidents_v1 i
                      where i.stage_id=stage.id and i.resolved_at is null)
  ),
  victims as materialized (
    select f.stage_id,f.frame_index from public.race_safe_checkpoint_frames_v1 f
    join candidate_stages c on c.id=f.stage_id
    order by f.stage_id,f.frame_index
    limit greatest(1,least(coalesce(p_batch,800),2000))
  ),
  gone as (
    delete from public.race_safe_checkpoint_frames_v1 f
    using victims v where f.stage_id=v.stage_id and f.frame_index=v.frame_index
    returning 1
  )
  select count(*)::integer into v_frames from gone;

  with candidate_stages as materialized (
    select stage.id
    from public.race_stages stage
    where stage.stage_date<public.get_current_game_date_date()-7
      and exists(select 1 from public.race_stage_results rr where rr.stage_id=stage.id)
      and exists(select 1 from public.race_stage_simulation_runs r where r.stage_id=stage.id and r.status='completed')
      and not exists(select 1 from public.race_stage_safe_calculation_v1 calc where calc.stage_id=stage.id and calc.status='running')
      and not exists(select 1 from public.race_operations_incidents_v1 i where i.stage_id=stage.id and i.resolved_at is null)
  ),
  gone as (
    delete from public.race_safe_checkpoint_shards_v1 sh
    using candidate_stages c
    where sh.stage_id=c.id and not exists(
      select 1 from public.race_safe_checkpoint_frames_v1 f where f.stage_id=sh.stage_id)
    returning 1
  )
  select count(*)::integer into v_shards from gone;
  return jsonb_build_object('checkpoint_frames_deleted',v_frames,'checkpoint_shards_deleted',v_shards);
end;
$body$;
revoke all on function control_center_private.cleanup_old_race_checkpoint_frames_v1(integer)
from public,anon,authenticated;
select cron.schedule('propeloton_checkpoint_frame_cleanup_daily','47 5 * * *',
$$select control_center_private.cleanup_old_race_checkpoint_frames_v1(1600);$$);
