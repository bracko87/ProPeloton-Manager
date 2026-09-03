create or replace function public.normalize_season_started_race_schedule_notice_v1()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_type_code text;
  v_target_season integer;
  v_target_season_text text;
begin
  select nt.code
  into v_type_code
  from public.notification_types nt
  where nt.id = new.type_id;

  if coalesce(v_type_code, '') <> 'SEASON_STARTED' then
    return new;
  end if;

  v_target_season_text := coalesce(
    nullif(new.payload_json ->> 'target_season', ''),
    nullif(new.payload_json ->> 'season_number', '')
  );

  if v_target_season_text ~ '^[0-9]+$' then
    v_target_season := v_target_season_text::integer;
  else
    v_target_season := null;
  end if;

  new.title := case
    when v_target_season is not null
      then format('Season %s: early January race deadlines', v_target_season)
    else 'Early January race deadlines'
  end;

  new.message := case
    when v_target_season is not null then format(
      'Season %s starts with a compressed January race calendar. For races starting Jan 1–15, applications open on Jan 1 and close 1 in-game day before the race; the team list is announced the same day. Rider/startlist submission stays open until 3 in-game hours before Stage 1. From Jan 16 the 3-hour exception ends; January still uses compressed deadlines, and the standard schedule applies from February. Check Calendar and Race Detail frequently so you do not miss a deadline.',
      v_target_season
    )
    else
      'The season starts with a compressed January race calendar. For races starting Jan 1–15, applications open on Jan 1 and close 1 in-game day before the race; the team list is announced the same day. Rider/startlist submission stays open until 3 in-game hours before Stage 1. From Jan 16 the 3-hour exception ends; January still uses compressed deadlines, and the standard schedule applies from February. Check Calendar and Race Detail frequently so you do not miss a deadline.'
  end;

  new.action_url := '/dashboard/calendar?view=races&month=1';
  new.payload_json := coalesce(new.payload_json, '{}'::jsonb) || jsonb_build_object(
    'season_start_race_deadline_notice_version', 1,
    'early_january_end_day', 15,
    'early_january_applications_close_days_before', 1,
    'early_january_team_list_days_before', 1,
    'early_january_startlist_hours_before_stage1', 3,
    'january_late_applications_close_days_before', 7,
    'january_late_startlist_days_before', 3,
    'standard_applications_open_days_before', 60,
    'standard_applications_close_days_before', 30,
    'standard_startlist_days_before', 3
  );

  return new;
end;
$$;

drop trigger if exists trg_normalize_season_started_race_schedule_notice_v1
on public.notifications;

create trigger trg_normalize_season_started_race_schedule_notice_v1
before insert on public.notifications
for each row
execute function public.normalize_season_started_race_schedule_notice_v1();
