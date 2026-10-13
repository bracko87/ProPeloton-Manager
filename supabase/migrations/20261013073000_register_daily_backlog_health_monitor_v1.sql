-- Register the daily-backlog monitor before its worker writes a health run.
insert into public.system_monitor_processes
(process_key,label,category,description,source_kind,source_ref,user_sensitive,
 incident_severity,expected_interval_minutes,stale_after_minutes,
 email_alerts_enabled,is_enabled,sort_order)
values
('check:daily_backlog','Deferred daily game processing','gameplay',
 'Tracks the oldest unprocessed daily game date and alerts when processing is more than one game day behind the live clock.',
 'business_check',null,true,'high',10,30,true,true,262)
on conflict (process_key) do update set
 label=excluded.label,
 description=excluded.description,
 expected_interval_minutes=excluded.expected_interval_minutes,
 stale_after_minutes=excluded.stale_after_minutes,
 is_enabled=true,
 updated_at=now();