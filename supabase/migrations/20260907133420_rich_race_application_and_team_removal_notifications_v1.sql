update public.notification_types
set default_image_url = case code
  when 'RACE_TEAM_DISQUALIFIED_JERSEYS' then 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Team%20removed%20from%20race.png'
  when 'RACE_APPLICATION_CLOSING_SOON' then 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Race%20aplication%20close%20in%203%20days.png'
  when 'RACE_APPLICATION_WINDOW_OPEN' then 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Race%20Application%20are%20open.png'
  when 'RACE_APPLICATION_RULE_CHANGE' then 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Race%20apploicaiton%20deadline.png'
  else default_image_url
end
where code in (
  'RACE_TEAM_DISQUALIFIED_JERSEYS',
  'RACE_APPLICATION_CLOSING_SOON',
  'RACE_APPLICATION_WINDOW_OPEN',
  'RACE_APPLICATION_RULE_CHANGE'
);

create or replace function public.enrich_race_application_and_jersey_notification_v1()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_code text;
  v_payload jsonb := coalesce(new.payload_json, '{}'::jsonb);
  v_race_id uuid;
  v_race_name text;
  v_team_id uuid;
  v_team_name text;
  v_opened_count integer;
  v_required integer;
  v_available integer;
  v_missing integer;
begin
  select nt.code
  into v_code
  from public.notification_types nt
  where nt.id = new.type_id;

  if v_code not in (
    'RACE_TEAM_DISQUALIFIED_JERSEYS',
    'RACE_APPLICATION_CLOSING_SOON',
    'RACE_APPLICATION_WINDOW_OPEN',
    'RACE_APPLICATION_RULE_CHANGE'
  ) then
    return new;
  end if;

  if v_code = 'RACE_TEAM_DISQUALIFIED_JERSEYS' then
    begin
      v_race_id := nullif(v_payload->>'race_id', '')::uuid;
    exception when invalid_text_representation then
      v_race_id := null;
    end;

    begin
      v_team_id := nullif(v_payload->>'team_id', '')::uuid;
    exception when invalid_text_representation then
      v_team_id := null;
    end;

    if v_race_id is not null then
      select r.name into v_race_name
      from public.races r
      where r.id = v_race_id;
    end if;

    if v_team_id is not null then
      select c.name into v_team_name
      from public.clubs c
      where c.id = v_team_id;
    end if;

    v_required := greatest(0, coalesce(nullif(v_payload->>'required_jersey_units', '')::integer, 0));
    v_available := greatest(0, coalesce(nullif(v_payload->>'available_jersey_units', '')::integer, 0));
    v_missing := greatest(v_required - v_available, 0);

    new.action_url := '/dashboard/equipment';
    new.payload_json := v_payload || jsonb_build_object(
      'image_url', 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Team%20removed%20from%20race.png',
      'equipment_path', '/dashboard/equipment',
      'race_name', coalesce(v_race_name, v_payload->>'race_name'),
      'team_name', coalesce(v_team_name, v_payload->>'team_name'),
      'missing_jersey_units', v_missing,
      'required_jersey_units', v_required,
      'available_jersey_units', v_available
    );

  elsif v_code = 'RACE_APPLICATION_WINDOW_OPEN' then
    v_opened_count := coalesce(nullif(v_payload->>'opened_count', '')::integer, 0);
    v_race_name := nullif(coalesce(v_payload->>'race_name', v_payload->>'sample_races'), '');

    begin
      v_race_id := nullif(v_payload->>'race_id', '')::uuid;
    exception when invalid_text_representation then
      v_race_id := null;
    end;

    if v_opened_count = 1 and v_race_id is null and v_race_name is not null then
      select r.id, r.name
      into v_race_id, v_race_name
      from public.races r
      where r.name = v_race_name
        and coalesce(r.status, '') <> 'archived'
      order by case when r.status = 'scheduled' then 0 else 1 end, r.created_at desc
      limit 1;
    end if;

    new.action_url := case
      when v_opened_count = 1 and v_race_id is not null
        then '/dashboard/races/' || v_race_id::text
      else '/dashboard/calendar'
    end;

    new.payload_json := v_payload || jsonb_build_object(
      'image_url', 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Race%20Application%20are%20open.png',
      'calendar_path', '/dashboard/calendar'
    ) || case
      when v_opened_count = 1 and v_race_id is not null then jsonb_build_object(
        'race_id', v_race_id,
        'race_name', v_race_name,
        'race_path', '/dashboard/races/' || v_race_id::text
      )
      else '{}'::jsonb
    end;

  elsif v_code = 'RACE_APPLICATION_CLOSING_SOON' then
    new.action_url := '/dashboard/calendar';
    new.payload_json := v_payload || jsonb_build_object(
      'image_url', 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Race%20aplication%20close%20in%203%20days.png',
      'calendar_path', '/dashboard/calendar',
      'days_until_close', 3
    );

  elsif v_code = 'RACE_APPLICATION_RULE_CHANGE' then
    new.action_url := '/dashboard/calendar';
    new.payload_json := v_payload || jsonb_build_object(
      'image_url', 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Race%20apploicaiton%20deadline.png',
      'calendar_path', '/dashboard/calendar',
      'late_january_close_days', 3,
      'february_onward_close_days', 7
    );
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_enrich_race_application_and_jersey_notification_v1 on public.notifications;
create trigger trg_enrich_race_application_and_jersey_notification_v1
before insert or update of type_id, action_url, payload_json, title, message
on public.notifications
for each row
execute function public.enrich_race_application_and_jersey_notification_v1();

update public.notifications n
set payload_json = coalesce(n.payload_json, '{}'::jsonb)
from public.notification_types nt
where nt.id = n.type_id
  and nt.code in (
    'RACE_TEAM_DISQUALIFIED_JERSEYS',
    'RACE_APPLICATION_CLOSING_SOON',
    'RACE_APPLICATION_WINDOW_OPEN',
    'RACE_APPLICATION_RULE_CHANGE'
  );
