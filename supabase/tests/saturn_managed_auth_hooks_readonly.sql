-- Project Saturn: read-only inventory of application-owned Auth triggers
-- omitted by pg_dump --schema=public/private/... alone.
--
-- Run against production with a read-only connection. This does not query
-- auth.users row data, tokens, email addresses, or other player records.
-- Capture results privately alongside the schema-only archive.
-- Never auto-restore triggers into staging without reviewing whether the
-- production launch/signup locks should remain enabled in the test project.

select
  n.nspname as table_schema,
  c.relname as table_name,
  t.tgname as trigger_name,
  fn.nspname as function_schema,
  proc.proname as function_name,
  pg_get_triggerdef(t.oid, true) as trigger_definition
from pg_trigger t
join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
join pg_proc proc on proc.oid=t.tgfoid
join pg_namespace fn on fn.oid=proc.pronamespace
where n.nspname='auth'
  and c.relname in ('users','sessions')
  and not t.tgisinternal
  and fn.nspname in ('public','private','control_center_private')
order by c.relname,t.tgname;
