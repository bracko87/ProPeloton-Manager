-- Group every Youth Academy notification under one in-game preference category.
-- The frontend uses preference_group as the authoritative category when available.

insert into public.notification_preference_groups(
  code,label,description,sort_order,is_active
)
values(
  'youthAcademy',
  'Youth Academy',
  'Show Youth Academy activation, race reports, delegated staff decisions and handovers, monthly recruitment and development summaries, and Academy budget warnings.',
  10,
  true
)
on conflict(code) do update
set label=excluded.label,
    description=excluded.description,
    sort_order=excluded.sort_order,
    is_active=true;

update public.notification_types
set preference_group='youthAcademy'
where code like 'YOUTH_%';

-- Historical delivered rows resolve their category through notification_types,
-- so no notification-row rewrite is required.
