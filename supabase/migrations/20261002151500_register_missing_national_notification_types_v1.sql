-- Register National Association notification types that are already emitted
-- by the live runtime, so they can be delivered and localized like the rest of
-- the National Association / World Nations notification family.

insert into public.notification_types(
  code,
  name,
  source,
  icon_name,
  priority,
  is_active,
  preference_group,
  default_image_url
)
values
  (
    'NATIONAL_COACH_POSITION_VACANT',
    'National Coach Position Vacant',
    'game',
    'vote',
    85,
    true,
    'races',
    null
  ),
  (
    'NATIONAL_COACH_RESIGNED',
    'National Coach Resigned',
    'game',
    'vote',
    80,
    true,
    'races',
    null
  ),
  (
    'NATIONAL_TEAM_NEW_SELECTION_WINDOW',
    'National Team New Selection Window',
    'game',
    'users',
    85,
    true,
    'races',
    null
  )
on conflict(code) do update
set
  name=excluded.name,
  source=excluded.source,
  icon_name=excluded.icon_name,
  priority=excluded.priority,
  is_active=true,
  preference_group=excluded.preference_group,
  default_image_url=excluded.default_image_url;
