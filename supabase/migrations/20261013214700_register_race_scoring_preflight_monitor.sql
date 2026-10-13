-- Register the preflight business check before it can open deduplicated incidents.
insert into public.system_monitor_processes (
  process_key,label,category,description,source_kind,source_ref,
  user_sensitive,incident_severity,expected_interval_minutes,stale_after_minutes,
  email_alerts_enabled,is_enabled,sort_order
) values (
  'check:race_stage_scoring_profiles','Future stage scoring/profile integrity',
  'Race Engine',
  'Check future and recently due race stages for sprint/KOM profile conflicts before calculation.',
  'business_check',null,true,'high',15,45,true,true,404
)
on conflict (process_key) do update set
  label=excluded.label,description=excluded.description,
  expected_interval_minutes=excluded.expected_interval_minutes,
  stale_after_minutes=excluded.stale_after_minutes,
  is_enabled=true,updated_at=clock_timestamp();
