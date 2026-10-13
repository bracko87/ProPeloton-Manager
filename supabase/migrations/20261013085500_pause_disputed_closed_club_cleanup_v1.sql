-- Pause closed-club/retired-entity operational cleanup pending owner review.
-- Many AI and some player-owned clubs have deleted_at populated, including five
-- player-owned records that also have is_active=true. Do not use that flag as
-- sufficient authorization to delete additional club operating data.
do $$
declare v_jobid bigint;
begin
  select jobid into v_jobid from cron.job
  where jobname='propeloton_retired_entity_cleanup_daily' limit 1;
  if v_jobid is not null then
    perform cron.alter_job(v_jobid, active => false);
  end if;
end
$$;
