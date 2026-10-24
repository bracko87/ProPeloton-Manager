-- Repository baseline_15 seeds notification_types with explicit IDs (4..197),
-- leaving notification_types_id_seq at its initial value on fresh databases.
-- The following v2 consolidation inserts new notification types without IDs.
-- Advance the sequence safely without overwriting seeded rows or lowering an
-- existing production sequence that has already progressed further.
select setval(
  'public.notification_types_id_seq'::regclass,
  greatest(
    coalesce((select max(id)::bigint from public.notification_types), 1),
    (select last_value from public.notification_types_id_seq)
  ),
  true
);
