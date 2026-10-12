-- ProPeloton production history-retention policy.
-- Keeps official/player-visible outcomes, compacts technical runtime detail,
-- and archives only small aggregate summaries so the database does not grow
-- by multiple gigabytes every season.

create schema if not exists archive;
revoke all on schema archive from public, anon, authenticated;

create table if not exists archive.rider_daily_activity_monthly (
  month_start date not null,
  source text not null,
  activity_type text not null,
  row_count bigint not null default 0,
  participated_count bigint not null default 0,
  fatigue_load_total bigint not null default 0,
  recovery_bonus_total bigint not null default 0,
  first_activity_date date,
  last_activity_date date,
  archived_at timestamptz not null default now(),
  primary key (month_start, source, activity_type)
);

create table if not exists archive.training_accident_decision_monthly (
  month_start date not null,
  outcome text not null,
  severity text not null default '',
  row_count bigint not null default 0,
  first_activity_date date,
  last_activity_date date,
  archived_at timestamptz not null default now(),
  primary key (month_start, outcome, severity)
);

create table if not exists archive.rider_race_development_monthly (
  month_start date not null,
  row_count bigint not null default 0,
  rider_count bigint not null default 0,
  total_progress_points numeric not null default 0,
  first_stage_date date,
  last_stage_date date,
  archived_at timestamptz not null default now(),
  primary key (month_start)
);

create table if not exists archive.race_stage_simulation_summary (
  simulation_run_id uuid primary key,
  race_id uuid,
  stage_id uuid,
  status text,
  engine_version text,
  simulation_mode text,
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  original_input_bytes bigint not null default 0,
  original_result_bytes bigint not null default 0,
  compacted_at timestamptz not null default now()
);

create table if not exists archive.retention_cleanup_runs (
  id bigserial primary key,
  ran_at timestamptz not null default now(),
  game_date date,
  rider_daily_activity_deleted integer not null default 0,
  accident_decisions_deleted integer not null default 0,
  race_development_deleted integer not null default 0,
  monitor_runs_deleted integer not null default 0,
  processor_runs_deleted integer not null default 0,
  cron_runs_deleted integer not null default 0,
  simulation_runs_compacted integer not null default 0
);

CREATE OR REPLACE FUNCTION public.maintenance_compact_history_v1(p_row_batch integer DEFAULT 25000, p_simulation_batch integer DEFAULT 150)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'archive', 'cron'
AS $function$
declare
  v_game_date date;
  v_activity integer := 0;
  v_accidents integer := 0;
  v_development integer := 0;
  v_monitor integer := 0;
  v_processor integer := 0;
  v_cron integer := 0;
  v_sim integer := 0;
begin
  v_game_date := public.get_current_game_date_date();
  if v_game_date is null then
    raise exception 'Could not resolve current game date';
  end if;

  with picked as materialized (
    select ctid as rid, *
    from public.rider_daily_activity
    where activity_date < v_game_date - 30
    order by activity_date
    limit greatest(1000, least(coalesce(p_row_batch,25000),100000))
  ),
  archived as (
    insert into archive.rider_daily_activity_monthly(
      month_start,source,activity_type,row_count,participated_count,
      fatigue_load_total,recovery_bonus_total,first_activity_date,last_activity_date,archived_at
    )
    select
      date_trunc('month',activity_date)::date,
      coalesce(source,''),
      coalesce(activity_type,''),
      count(*)::bigint,
      count(*) filter(where participated)::bigint,
      coalesce(sum(fatigue_load),0)::bigint,
      coalesce(sum(recovery_bonus),0)::bigint,
      min(activity_date),
      max(activity_date),
      now()
    from picked
    group by 1,2,3
    on conflict(month_start,source,activity_type) do update
    set row_count=archive.rider_daily_activity_monthly.row_count+excluded.row_count,
        participated_count=archive.rider_daily_activity_monthly.participated_count+excluded.participated_count,
        fatigue_load_total=archive.rider_daily_activity_monthly.fatigue_load_total+excluded.fatigue_load_total,
        recovery_bonus_total=archive.rider_daily_activity_monthly.recovery_bonus_total+excluded.recovery_bonus_total,
        first_activity_date=least(archive.rider_daily_activity_monthly.first_activity_date,excluded.first_activity_date),
        last_activity_date=greatest(archive.rider_daily_activity_monthly.last_activity_date,excluded.last_activity_date),
        archived_at=now()
    returning 1
  ),
  deleted as (
    delete from public.rider_daily_activity t
    using picked p
    where t.ctid=p.rid
    returning 1
  )
  select count(*) into v_activity from deleted;

  with picked as materialized (
    select ctid as rid, *
    from public.rider_training_accident_decisions_v1
    where activity_date < v_game_date - 30
      and outcome <> 'accident_created'
    order by activity_date
    limit greatest(1000, least(coalesce(p_row_batch,25000),100000))
  ),
  archived as (
    insert into archive.training_accident_decision_monthly(
      month_start,outcome,severity,row_count,first_activity_date,last_activity_date,archived_at
    )
    select
      date_trunc('month',activity_date)::date,
      coalesce(outcome,''),
      coalesce(severity,''),
      count(*)::bigint,
      min(activity_date),
      max(activity_date),
      now()
    from picked
    group by 1,2,3
    on conflict(month_start,outcome,severity) do update
    set row_count=archive.training_accident_decision_monthly.row_count+excluded.row_count,
        first_activity_date=least(archive.training_accident_decision_monthly.first_activity_date,excluded.first_activity_date),
        last_activity_date=greatest(archive.training_accident_decision_monthly.last_activity_date,excluded.last_activity_date),
        archived_at=now()
    returning 1
  ),
  deleted as (
    delete from public.rider_training_accident_decisions_v1 t
    using picked p
    where t.ctid=p.rid
    returning 1
  )
  select count(*) into v_accidents from deleted;

  with picked as materialized (
    select ctid as rid, *
    from public.rider_race_development_events
    where stage_date < v_game_date - 30
      and coalesce(applied_to_progress_bank,false)=true
    order by stage_date
    limit greatest(1000, least(coalesce(p_row_batch,25000),100000))
  ),
  archived as (
    insert into archive.rider_race_development_monthly(
      month_start,row_count,rider_count,total_progress_points,
      first_stage_date,last_stage_date,archived_at
    )
    select
      date_trunc('month',stage_date)::date,
      count(*)::bigint,
      count(distinct rider_id)::bigint,
      coalesce(sum(total_progress_points),0),
      min(stage_date),
      max(stage_date),
      now()
    from picked
    group by 1
    on conflict(month_start) do update
    set row_count=archive.rider_race_development_monthly.row_count+excluded.row_count,
        rider_count=greatest(archive.rider_race_development_monthly.rider_count,excluded.rider_count),
        total_progress_points=archive.rider_race_development_monthly.total_progress_points+excluded.total_progress_points,
        first_stage_date=least(archive.rider_race_development_monthly.first_stage_date,excluded.first_stage_date),
        last_stage_date=greatest(archive.rider_race_development_monthly.last_stage_date,excluded.last_stage_date),
        archived_at=now()
    returning 1
  ),
  deleted as (
    delete from public.rider_race_development_events t
    using picked p
    where t.ctid=p.rid
    returning 1
  )
  select count(*) into v_development from deleted;

  with picked as materialized (
    select id
    from public.system_monitor_runs
    where created_at < now()-interval '7 days'
    order by created_at
    limit greatest(1000, least(coalesce(p_row_batch,25000),100000))
  ),
  deleted as (
    delete from public.system_monitor_runs t
    using picked p
    where t.id=p.id
    returning 1
  )
  select count(*) into v_monitor from deleted;

  with picked as materialized (
    select id
    from public.hourly_game_processor_runs
    where created_at < now()-interval '7 days'
    order by created_at
    limit greatest(1000, least(coalesce(p_row_batch,25000),100000))
  ),
  deleted as (
    delete from public.hourly_game_processor_runs t
    using picked p
    where t.id=p.id
    returning 1
  )
  select count(*) into v_processor from deleted;

  with picked as materialized (
    select runid
    from cron.job_run_details
    where coalesce(end_time,start_time) < now()-interval '3 days'
    order by coalesce(end_time,start_time)
    limit greatest(1000, least(coalesce(p_row_batch,25000),100000))
  ),
  deleted as (
    delete from cron.job_run_details t
    using picked p
    where t.runid=p.runid
    returning 1
  )
  select count(*) into v_cron from deleted;

  with picked as materialized (
    select
      r.id,
      r.race_id,
      r.stage_id,
      r.status,
      r.engine_version,
      r.simulation_mode,
      r.started_at,
      r.completed_at,
      r.failed_at,
      pg_column_size(r.input_snapshot_json)::bigint as input_bytes,
      pg_column_size(r.result_summary_json)::bigint as result_bytes
    from public.race_stage_simulation_runs r
    join public.race_stages s on s.id=r.stage_id
    where
      (
        r.status='failed'
        or (
          r.status='completed'
          and s.stage_date < v_game_date-7
          and exists (
            select 1 from public.race_stage_results rr
            where rr.stage_id=r.stage_id
          )
        )
      )
      and (
        pg_column_size(r.input_snapshot_json) > 2048
        or pg_column_size(r.result_summary_json) > 2048
      )
    order by coalesce(r.completed_at,r.failed_at,r.created_at)
    limit greatest(10, least(coalesce(p_simulation_batch,150),500))
  ),
  archived as (
    insert into archive.race_stage_simulation_summary(
      simulation_run_id,race_id,stage_id,status,engine_version,simulation_mode,
      started_at,completed_at,failed_at,original_input_bytes,original_result_bytes,compacted_at
    )
    select id,race_id,stage_id,status,engine_version,simulation_mode,
           started_at,completed_at,failed_at,input_bytes,result_bytes,now()
    from picked
    on conflict(simulation_run_id) do update
      set status=excluded.status,
          original_input_bytes=greatest(archive.race_stage_simulation_summary.original_input_bytes,excluded.original_input_bytes),
          original_result_bytes=greatest(archive.race_stage_simulation_summary.original_result_bytes,excluded.original_result_bytes),
          compacted_at=now()
    returning 1
  ),
  compacted as (
    update public.race_stage_simulation_runs r
    set
      input_snapshot_json=jsonb_build_object(
        'archived',true,
        'compacted_at',now(),
        'original_bytes',p.input_bytes
      ),
      result_summary_json=jsonb_build_object(
        'archived',true,
        'compacted_at',now(),
        'original_bytes',p.result_bytes,
        'status',r.status
      ),
      updated_at=now()
    from picked p
    where r.id=p.id
    returning 1
  )
  select count(*) into v_sim from compacted;

  insert into archive.retention_cleanup_runs(
    game_date,rider_daily_activity_deleted,accident_decisions_deleted,
    race_development_deleted,monitor_runs_deleted,processor_runs_deleted,
    cron_runs_deleted,simulation_runs_compacted
  )
  values(v_game_date,v_activity,v_accidents,v_development,v_monitor,v_processor,v_cron,v_sim);

  return jsonb_build_object(
    'game_date',v_game_date,
    'rider_daily_activity_deleted',v_activity,
    'accident_decisions_deleted',v_accidents,
    'race_development_deleted',v_development,
    'monitor_runs_deleted',v_monitor,
    'processor_runs_deleted',v_processor,
    'cron_runs_deleted',v_cron,
    'simulation_runs_compacted',v_sim
  );
end;
$function$;

revoke all on function public.maintenance_compact_history_v1(integer,integer)
from public, anon, authenticated;

select cron.unschedule(jobid)
from cron.job
where jobname='propeloton_history_retention_daily';

select cron.schedule(
  'propeloton_history_retention_daily',
  '37 3 * * *',
  $$select public.maintenance_compact_history_v1(50000,250);$$
);
