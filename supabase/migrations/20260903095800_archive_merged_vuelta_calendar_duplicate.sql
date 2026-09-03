-- Keep the canonical UI-facing Vuelta del Táchero row and archive the
-- previously merged duplicate so get_race_calendar_entries_v1() cannot render
-- the same tournament twice. This is intentionally idempotent and touches only
-- the duplicate row already marked as merged in metadata.

update public.races
set status = 'archived',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'archived_fix', 'calendar_duplicate_cleanup_20260903'
    )
where id = '1aee0c68-e366-44cf-adff-70fc3b7206fb'
  and status <> 'archived'
  and metadata ->> 'merged_into_race_id' = 'b0e3e61d-6160-45e2-babc-794e4716974f';
