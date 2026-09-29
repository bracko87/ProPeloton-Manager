-- Fresh-database baseline smoke check.
-- Run after applying the complete supabase/migrations chain to an empty database.
do $$
declare
  v_health jsonb;
begin
  if to_regclass('public.races') is null
     or to_regclass('public.riders') is null
     or to_regclass('public.national_associations') is null then
    raise exception 'Baseline smoke failed: required public relations are missing.';
  end if;

  if to_regprocedure('public.process_nations_race_runtime_v2()') is null
     or to_regprocedure('public.check_nations_operations_health_v1()') is null
     or to_regprocedure('public.run_admin_nations_e2e_fixture_v1(integer)') is null then
    raise exception 'Baseline smoke failed: required World Nations routines are missing.';
  end if;

  if (select count(*) from public.game_state) <> 1 then
    raise exception 'Baseline smoke failed: game_state singleton missing.';
  end if;

  if (select count(*) from public.national_association_config) <> 1
     or (select count(*) from public.nations_competition_schedule_config) <> 1 then
    raise exception 'Baseline smoke failed: Nations configuration seed missing.';
  end if;

  if not exists (
    select 1 from public.system_monitor_processes
    where process_key='check:nations_operations' and is_enabled=true
  ) then
    raise exception 'Baseline smoke failed: Nations operations monitor definition missing.';
  end if;

  v_health := public.check_nations_operations_health_v1();
  if coalesce(v_health->>'status','error') <> 'success' then
    raise exception 'Baseline smoke failed: Nations operations health is not successful: %', v_health;
  end if;
end
$$;
