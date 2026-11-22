-- SAT-09 EMERGENCY ROLLBACK ONLY — do not add to regular migration runner.
-- Restores the nine public view SQL bodies captured immediately before
-- 20261122211500_saturn_privileged_view_private_field_masking.sql.
-- WARNING: Restoring removes privacy masking and REOPENS sensitive data
-- exposure. Use only to recover from a verified production outage, ideally
-- behind access restrictions, then deploy a corrected protection promptly.
--
-- This does not drop the backup table or change owner/member permissions.
begin;
do $do$
declare v_item record;
begin
  if to_regclass('private.saturn_sensitive_view_originals_20261122') is null then
    raise exception 'Missing SAT-09 backup, cannot safely roll back';
  end if;

  if (select count(*) from private.saturn_sensitive_view_originals_20261122) <> 9 then
    raise exception 'Expected exactly nine SAT-09 view backups';
  end if;

  for v_item in
    select view_name, original_select_sql, original_options
    from private.saturn_sensitive_view_originals_20261122
    order by view_name
  loop
    execute format('CREATE OR REPLACE VIEW public.%I AS %s',
      v_item.view_name, v_item.original_select_sql);
    if not ('security_barrier=true' = any(coalesce(v_item.original_options, '{}'))) then
      execute format('ALTER VIEW public.%I RESET (security_barrier)',v_item.view_name);
    end if;
  end loop;
end;
$do$;
commit;
