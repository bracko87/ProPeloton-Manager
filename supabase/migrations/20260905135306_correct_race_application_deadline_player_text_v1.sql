create or replace function public.normalize_season_started_race_schedule_notice_v1()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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
      'Season %s starts with a compressed January race calendar. For races starting Jan 1–15, applications open on Jan 1 and close 1 in-game day before the race; the team list is announced the same day. Rider/startlist submission stays open until 3 in-game hours before Stage 1. For Jan 16–31, applications close 3 in-game days before the race and rider submission closes 1 in-game day before. From February onward, applications open 60 in-game days before each race and close 7 in-game days before; rider submission closes 3 in-game days before. Check Calendar and Race Detail frequently so you do not miss a deadline.',
      v_target_season
    )
    else
      'The season starts with a compressed January race calendar. For races starting Jan 1–15, applications open on Jan 1 and close 1 in-game day before the race; the team list is announced the same day. Rider/startlist submission stays open until 3 in-game hours before Stage 1. For Jan 16–31, applications close 3 in-game days before the race and rider submission closes 1 in-game day before. From February onward, applications open 60 in-game days before each race and close 7 in-game days before; rider submission closes 3 in-game days before. Check Calendar and Race Detail frequently so you do not miss a deadline.'
  end;

  new.action_url := '/dashboard/calendar?view=races&month=1';
  new.payload_json := coalesce(new.payload_json, '{}'::jsonb) || jsonb_build_object(
    'season_start_race_deadline_notice_version', 2,
    'early_january_end_day', 15,
    'early_january_applications_close_days_before', 1,
    'early_january_team_list_days_before', 1,
    'early_january_startlist_hours_before_stage1', 3,
    'january_late_applications_close_days_before', 3,
    'january_late_startlist_days_before', 1,
    'standard_applications_open_days_before', 60,
    'standard_applications_close_days_before', 7,
    'standard_startlist_days_before', 3
  );

  return new;
end;
$function$;

create or replace function public.get_race_application_preview_v1(p_race_id uuid, p_club_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_score integer;
  v_existing_status text;
  v_payload jsonb;
begin
  v_score := public.get_or_create_club_race_commitment_score_v1(p_club_id);

  perform *
  from public.recalculate_race_entry_deadlines_v1(p_race_id);

  select rte.status
  into v_existing_status
  from public.race_team_entries rte
  where rte.race_id = p_race_id
    and rte.club_id = p_club_id
  limit 1;

  select jsonb_build_object(
    'race_id', r.id,
    'race_name', r.name,
    'race_class_code', r.category,
    'race_start_display', public.game_date_display_v1(
      extract(year from r.start_date)::integer - 1999,
      extract(month from r.start_date)::integer,
      extract(day from r.start_date)::integer
    ),
    'race_end_display', public.game_date_display_v1(
      extract(year from coalesce(r.end_date, r.start_date))::integer - 1999,
      extract(month from coalesce(r.end_date, r.start_date))::integer,
      extract(day from coalesce(r.end_date, r.start_date))::integer
    ),
    'applications_close_display', public.game_date_display_v1(
      rer.applications_close_season_number,
      rer.applications_close_month_number,
      rer.applications_close_day_number
    ),
    'team_list_announcement_display', public.game_date_display_v1(
      rer.team_list_announcement_season_number,
      rer.team_list_announcement_month_number,
      rer.team_list_announcement_day_number
    ),
    'rider_submission_deadline_display', public.game_date_display_v1(
      rer.rider_submission_deadline_season_number,
      rer.rider_submission_deadline_month_number,
      rer.rider_submission_deadline_day_number
    ),
    'deadline_policy', rer.application_deadline_policy,
    'january_exception_note',
      case
        when rer.application_deadline_policy = 'january_early_extended'
          then 'January exception: because this race is close to the season start, applications close 1 day before the race and rider/startlist submission remains open until 3 in-game hours before Stage 1.'
        when rer.application_deadline_policy = 'january_late_3day'
          then 'January compressed schedule: applications close 3 days before the race and rider submission closes 1 day before the race.'
        else null
      end,
    'target_teams', rer.target_teams,
    'max_teams', rer.max_teams,
    'min_riders_per_team', rer.min_riders_per_team,
    'max_riders_per_team', rer.max_riders_per_team,
    'existing_application_status', v_existing_status,
    'race_commitment_score', v_score,
    'estimated_acceptance_chance',
      case
        when v_score >= 80 then 'Excellent'
        when v_score >= 50 then 'Good'
        when v_score >= 30 then 'Fair'
        else 'Low'
      end,
    'warning', 'Applying does not guarantee entry. If accepted, you must assign enough riders before the rider submission deadline. Late withdrawal or missed rider submission will reduce your Race Commitment Score and may create a fine.'
  )
  into v_payload
  from public.races r
  join public.race_entry_rules rer
    on rer.race_id = r.id
  where r.id = p_race_id
  limit 1;

  return coalesce(
    v_payload,
    jsonb_build_object(
      'error', 'race_not_found',
      'race_id', p_race_id
    )
  );
end;
$function$;

update public.notifications
set
  message = case
    when coalesce(payload_json->>'target_season', payload_json->>'season_number') ~ '^[0-9]+$'
      then format(
        'Season %s starts with a compressed January race calendar. For races starting Jan 1–15, applications open on Jan 1 and close 1 in-game day before the race; the team list is announced the same day. Rider/startlist submission stays open until 3 in-game hours before Stage 1. For Jan 16–31, applications close 3 in-game days before the race and rider submission closes 1 in-game day before. From February onward, applications open 60 in-game days before each race and close 7 in-game days before; rider submission closes 3 in-game days before. Check Calendar and Race Detail frequently so you do not miss a deadline.',
        coalesce(payload_json->>'target_season', payload_json->>'season_number')
      )
    else
      'The season starts with a compressed January race calendar. For races starting Jan 1–15, applications open on Jan 1 and close 1 in-game day before the race; the team list is announced the same day. Rider/startlist submission stays open until 3 in-game hours before Stage 1. For Jan 16–31, applications close 3 in-game days before the race and rider submission closes 1 in-game day before. From February onward, applications open 60 in-game days before each race and close 7 in-game days before; rider submission closes 3 in-game days before. Check Calendar and Race Detail frequently so you do not miss a deadline.'
  end,
  payload_json = coalesce(payload_json, '{}'::jsonb)
    || jsonb_build_object(
      'season_start_race_deadline_notice_version', 2,
      'january_late_applications_close_days_before', 3,
      'january_late_startlist_days_before', 1,
      'standard_applications_open_days_before', 60,
      'standard_applications_close_days_before', 7,
      'standard_startlist_days_before', 3
    )
where title ilike '%January race deadlines%'
  and payload_json ? 'standard_applications_close_days_before';
