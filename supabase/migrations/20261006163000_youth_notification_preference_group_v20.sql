-- Group every Youth Academy notification under one in-game preference category.
-- The frontend uses preference_group as the authoritative category when available.

update public.notification_types
set preference_group='youthAcademy'
where code like 'YOUTH_%';

-- Historical delivered rows resolve their category through notification_types,
-- so no notification-row rewrite is required.
