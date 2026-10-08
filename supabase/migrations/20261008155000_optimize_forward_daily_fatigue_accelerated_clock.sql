-- Keep accelerated 12x daily-backlog processing inside a scoped five-minute budget.
-- The ordinary database default remains unchanged. Also remove the nested
-- table-function startup cost from the per-rider medical-center lookup.

create or replace function public.health_get_medical_center_level_v1(p_club_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((
    select ci.medical_center_level
    from public.club_infrastructure ci
    where ci.club_id = coalesce(
      (
        select coalesce(c.parent_club_id, c.id)
        from public.clubs c
        where c.id = p_club_id
      ),
      p_club_id
    )
    limit 1
  ), 0)::integer;
$function$;

alter function public.process_forward_daily_automation_safe_v2()
  set statement_timeout = '300s';

do $migration$
declare
  v_job_id bigint;
begin
  select jobid
  into v_job_id
  from cron.job
  where jobname = 'forward-daily-automation-every-minute';

  if v_job_id is null then
    raise exception 'forward-daily-automation-every-minute cron job is missing';
  end if;

  perform cron.alter_job(
    v_job_id,
    command := $command$
      set statement_timeout = '300s';
      select public.process_forward_daily_automation_safe_v2();
    $command$
  );
end;
$migration$;