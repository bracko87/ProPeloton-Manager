create or replace function public.normalize_sport_director_notification_display_context_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_type_code text;
  v_report_code text;
  v_data jsonb;
  v_prep_status text;
  v_startlist_status text;
begin
  select nt.code into v_type_code
  from public.notification_types nt
  where nt.id = new.type_id;

  if v_type_code <> 'ADVISOR_SPORT_DIRECTOR_REPORT' then
    return new;
  end if;

  v_report_code := coalesce(new.payload_json ->> 'report_code', '');
  v_data := coalesce(new.payload_json -> 'data', '{}'::jsonb);

  v_prep_status := nullif(v_data ->> 'race_preparation_status', '');
  if v_prep_status = 'submitted' then
    v_data := v_data || jsonb_build_object(
      'race_preparation_status_raw', 'submitted',
      'preparation_status_raw', coalesce(nullif(v_data ->> 'preparation_status', ''), 'submitted'),
      'race_preparation_status', 'ready',
      'preparation_status', 'ready'
    );
  end if;

  v_startlist_status := nullif(v_data ->> 'startlist_status', '');
  if v_startlist_status = 'submitted' then
    v_data := v_data || jsonb_build_object(
      'startlist_status_raw', 'submitted',
      'startlist_status', 'ready'
    );
  end if;

  if nullif(v_data ->> 'next_future_race_id', '') is null then
    v_data := v_data || jsonb_build_object(
      'next_future_race_name', 'None scheduled',
      'next_future_race_start_date', 'Not scheduled'
    );
  end if;

  if v_report_code = 'sd_race_programme_gap'
     and nullif(v_data ->> 'race_id', '') is null then
    v_data := v_data || jsonb_build_object(
      'race_name', 'No accepted race',
      'race_start_date', 'Not scheduled',
      'race_end_date', 'Not scheduled',
      'race_location', 'Not scheduled',
      'rider_submission_deadline_on', 'Not scheduled',
      'stage_date', 'Not applicable'
    );
  end if;

  new.payload_json := jsonb_set(
    coalesce(new.payload_json, '{}'::jsonb),
    '{data}',
    v_data,
    true
  );

  return new;
end;
$$;

drop trigger if exists trg_zz_normalize_sport_director_notification_display_context_v1 on public.notifications;
create trigger trg_zz_normalize_sport_director_notification_display_context_v1
before insert or update of payload_json on public.notifications
for each row execute function public.normalize_sport_director_notification_display_context_v1();

update public.notifications n
set payload_json = n.payload_json
from public.notification_types nt
where nt.id = n.type_id
  and nt.code = 'ADVISOR_SPORT_DIRECTOR_REPORT';

update public.staff_advisory_reports ar
set report_json = n.payload_json,
    summary = n.message
from public.notifications n
where ar.notification_id = n.id
  and n.payload_json ->> 'advisor_role' = 'sport_director';